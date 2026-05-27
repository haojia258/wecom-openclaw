'use strict';

/**
 * task-db.js - SQLite 连接管理层 (P6.6.1 Task Store v2)
 *
 * 职责:
 * - 管理 better-sqlite3 数据库连接
 * - 建表 (tasks + events) 和索引
 * - 提供 getDb / isAvailable / close / migrateFromJSONL
 * - better-sqlite3 不可用时优雅降级
 */

const fs = require('fs');
const path = require('path');

// ─── 模块级状态 ────────────────────────────────────────────

var _db = null;
var _available = null; // null = 未检测, true = 可用, false = 不可用

// 数据库路径: apps/wecom-adapter/data/tasks.db
var DB_PATH = process.env.TASK_DB_PATH || path.resolve(__dirname, '../../data/tasks.db');

// ─── better-sqlite3 加载 ───────────────────────────────────

var Database = null;

try {
  Database = require('better-sqlite3');
} catch (_e) {
  // better-sqlite3 未安装或编译失败
  Database = null;
}

// ─── 表 DDL ───────────────────────────────────────────────

var CREATE_TASKS_TABLE = [
  'CREATE TABLE IF NOT EXISTS tasks (',
  '  task_id    TEXT PRIMARY KEY,',
  '  agent      TEXT NOT NULL DEFAULT \'unknown\',',
  '  type       TEXT NOT NULL DEFAULT \'general\',',
  '  content    TEXT NOT NULL DEFAULT \'\',',
  '  status     TEXT NOT NULL DEFAULT \'pending\',',
  '  priority   TEXT NOT NULL DEFAULT \'normal\',',
  '  result     TEXT,',
  '  error      TEXT,',
  '  created_at TEXT NOT NULL,',
  '  updated_at TEXT NOT NULL',
  ');'
].join('\n');

var CREATE_EVENTS_TABLE = [
  'CREATE TABLE IF NOT EXISTS events (',
  '  id         INTEGER PRIMARY KEY AUTOINCREMENT,',
  '  task_id    TEXT NOT NULL,',
  '  event_type TEXT NOT NULL,',
  '  payload    TEXT,',
  '  created_at TEXT NOT NULL',
  ');'
].join('\n');

// ─── P10.0: AI Mission Control Dashboard v0.1 表 ──────────

var CREATE_MISSION_TASKS_TABLE = [
  'CREATE TABLE IF NOT EXISTS mission_tasks (',
  '  id           TEXT PRIMARY KEY,',
  '  title        TEXT NOT NULL DEFAULT \'\',',
  '  description  TEXT DEFAULT \'\',',
  '  status       TEXT NOT NULL DEFAULT \'pending\',',
  '  owner_agent  TEXT NOT NULL DEFAULT \'unknown\',',
  '  github_pr    TEXT,',
  '  current_stage TEXT,',
  '  last_event_at TEXT,',
  '  created_at   TEXT NOT NULL,',
  '  updated_at   TEXT NOT NULL',
  ');'
].join('\n');

var CREATE_AGENT_EVENTS_TABLE = [
  'CREATE TABLE IF NOT EXISTS agent_events (',
  '  id               INTEGER PRIMARY KEY AUTOINCREMENT,',
  '  mission_task_id  TEXT NOT NULL,',
  '  event_type       TEXT NOT NULL,',
  '  stage            TEXT,',
  '  payload          TEXT,',
  '  created_at       TEXT NOT NULL,',
  '  FOREIGN KEY (mission_task_id) REFERENCES mission_tasks(id) ON DELETE CASCADE',
  ');'
].join('\n');

var INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);',
  'CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent);',
  'CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id);',
  // P10.0: mission 索引
  'CREATE INDEX IF NOT EXISTS idx_mission_tasks_status ON mission_tasks(status);',
  'CREATE INDEX IF NOT EXISTS idx_mission_tasks_owner_agent ON mission_tasks(owner_agent);',
  'CREATE INDEX IF NOT EXISTS idx_agent_events_mission_task_id ON agent_events(mission_task_id);',
  'CREATE INDEX IF NOT EXISTS idx_agent_events_created_at ON agent_events(created_at);'
];

// ─── 初始化 ───────────────────────────────────────────────

function ensureDataDir() {
  var dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function initTables(db) {
  db.exec(CREATE_TASKS_TABLE);
  db.exec(CREATE_EVENTS_TABLE);
  // P10.0: AI Mission Control Dashboard 表
  db.exec(CREATE_MISSION_TASKS_TABLE);
  db.exec(CREATE_AGENT_EVENTS_TABLE);
  for (var i = 0; i < INDEXES.length; i++) {
    db.exec(INDEXES[i]);
  }
}

function createDb() {
  if (Database === null) {
    _available = false;
    return null;
  }

  try {
    ensureDataDir();
    var db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables(db);
    _available = true;
    return db;
  } catch (_e) {
    _available = false;
    return null;
  }
}

// ─── 公共接口 ─────────────────────────────────────────────

/**
 * 获取数据库实例（延迟初始化）
 * @returns {object|null} Database 实例或 null（不可用时）
 */
function getDb() {
  if (_available === null) {
    _db = createDb();
  }
  return _db;
}

/**
 * SQLite 是否可用
 * @returns {boolean}
 */
function isAvailable() {
  if (_available === null) {
    getDb(); // 触发检测
  }
  return _available === true;
}

/**
 * 关闭数据库连接（测试用）
 */
function close() {
  if (_db) {
    try { _db.close(); } catch (_) {}
    _db = null;
    _available = null;
  }
}

// ─── 数据迁移 ─────────────────────────────────────────────

/**
 * 从 JSONL 日志迁移到 SQLite（默认不自动调用）
 * @param {string} logDir - JSONL 日志目录
 * @returns {{ imported: number, skipped: number, errors: string[] }}
 */
function migrateFromJSONL(logDir) {
  var result = { imported: 0, skipped: 0, errors: [] };

  if (!isAvailable()) {
    result.errors.push('SQLite 不可用，无法迁移');
    return result;
  }

  if (!fs.existsSync(logDir)) {
    result.errors.push('日志目录不存在: ' + logDir);
    return result;
  }

  var db = getDb();
  var files = fs.readdirSync(logDir).filter(function(f) {
    return f.endsWith('.jsonl');
  });

  var insertStmt = null;
  try {
    insertStmt = db.prepare([
      'INSERT OR IGNORE INTO tasks',
      '(task_id, agent, type, content, status, priority, result, error, created_at, updated_at)',
      'VALUES (@task_id, @agent, @type, @content, @status, @priority, @result, @error, @created_at, @updated_at)'
    ].join(' '));
  } catch (e) {
    result.errors.push('准备 INSERT 语句失败: ' + e.message);
    return result;
  }

  for (var i = 0; i < files.length; i++) {
    var filePath = path.join(logDir, files[i]);
    var content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      result.errors.push('读取文件失败 ' + files[i] + ': ' + e.message);
      continue;
    }

    var lines = content.trim().split('\n');
    for (var j = 0; j < lines.length; j++) {
      var line = lines[j].trim();
      if (!line) continue;

      var record;
      try {
        record = JSON.parse(line);
      } catch (_) {
        result.skipped++;
        continue;
      }

      // 确保有 priority 和 error 字段
      if (!record.priority) record.priority = 'normal';
      if (!record.error) record.error = null;

      try {
        insertStmt.run(record);
        result.imported++;
      } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
          result.skipped++;
        } else {
          result.errors.push('导入失败: ' + e.message);
        }
      }
    }
  }

  return result;
}

// ─── 导出 ─────────────────────────────────────────────────

module.exports = {
  getDb: getDb,
  isAvailable: isAvailable,
  close: close,
  migrateFromJSONL: migrateFromJSONL,
  // 导出路径供测试
  _DB_PATH: DB_PATH,
};
