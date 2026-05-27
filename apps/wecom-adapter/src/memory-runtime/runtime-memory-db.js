'use strict';

/**
 * runtime-memory-db.js — SQLite Runtime Memory 存储 (P9.2)
 *
 * 提供结构化的记忆查询能力，与 JSONL 互补。
 *
 * 表:
 *   - incidents              故障记录
 *   - recoveries             恢复记录
 *   - executions             执行记录
 *   - strategies             策略记录
 *   - organization_memory    组织聚合记忆
 *
 * 特性:
 *   - WAL mode
 *   - 索引: correlationId, timestamp, type
 *   - better-sqlite3 不可用时优雅降级
 */

var fs = require('fs');
var path = require('path');

// ─── 模块状态 ────────────────────────────────────────────────

var _db = null;
var _available = null; // null = 未检测, true = 可用, false = 不可用

// 数据库路径
var DB_PATH = process.env.RUNTIME_MEMORY_DB_PATH
  || path.resolve(__dirname, '..', '..', 'data', 'runtime-memory.db');

// ─── better-sqlite3 加载 ───────────────────────────────────

var Database = null;

try {
  Database = require('better-sqlite3');
} catch (_e) {
  Database = null;
}

// ─── DDL ────────────────────────────────────────────────────

var CREATE_INCIDENTS_TABLE = [
  'CREATE TABLE IF NOT EXISTS incidents (',
  '  id              TEXT PRIMARY KEY,',
  '  timestamp       TEXT NOT NULL,',
  '  correlationId   TEXT NOT NULL,',
  '  agent           TEXT NOT NULL DEFAULT \'unknown\',',
  '  type            TEXT NOT NULL DEFAULT \'UNKNOWN\',',
  '  status          TEXT NOT NULL DEFAULT \'open\',',
  '  summary         TEXT DEFAULT \'\',',
  '  metadata_json   TEXT DEFAULT \'{}\'',
  ');'
].join('\n');

var CREATE_RECOVERIES_TABLE = [
  'CREATE TABLE IF NOT EXISTS recoveries (',
  '  id              TEXT PRIMARY KEY,',
  '  timestamp       TEXT NOT NULL,',
  '  correlationId   TEXT NOT NULL,',
  '  agent           TEXT NOT NULL DEFAULT \'unknown\',',
  '  type            TEXT NOT NULL DEFAULT \'UNKNOWN\',',
  '  status          TEXT NOT NULL DEFAULT \'pending\',',
  '  summary         TEXT DEFAULT \'\',',
  '  metadata_json   TEXT DEFAULT \'{}\'',
  ');'
].join('\n');

var CREATE_EXECUTIONS_TABLE = [
  'CREATE TABLE IF NOT EXISTS executions (',
  '  id              TEXT PRIMARY KEY,',
  '  timestamp       TEXT NOT NULL,',
  '  correlationId   TEXT NOT NULL,',
  '  agent           TEXT NOT NULL DEFAULT \'unknown\',',
  '  type            TEXT NOT NULL DEFAULT \'execution\',',
  '  status          TEXT NOT NULL DEFAULT \'unknown\',',
  '  summary         TEXT DEFAULT \'\',',
  '  metadata_json   TEXT DEFAULT \'{}\'',
  ');'
].join('\n');

var CREATE_STRATEGIES_TABLE = [
  'CREATE TABLE IF NOT EXISTS strategies (',
  '  id              TEXT PRIMARY KEY,',
  '  timestamp       TEXT NOT NULL,',
  '  correlationId   TEXT NOT NULL,',
  '  agent           TEXT NOT NULL DEFAULT \'unknown\',',
  '  type            TEXT NOT NULL DEFAULT \'general\',',
  '  status          TEXT NOT NULL DEFAULT \'active\',',
  '  summary         TEXT DEFAULT \'\',',
  '  metadata_json   TEXT DEFAULT \'{}\'',
  ');'
].join('\n');

var CREATE_ORGANIZATION_MEMORY_TABLE = [
  'CREATE TABLE IF NOT EXISTS organization_memory (',
  '  id              TEXT PRIMARY KEY,',
  '  timestamp       TEXT NOT NULL,',
  '  correlationId   TEXT NOT NULL,',
  '  agent           TEXT NOT NULL DEFAULT \'unknown\',',
  '  type            TEXT NOT NULL DEFAULT \'general\',',
  '  status          TEXT NOT NULL DEFAULT \'active\',',
  '  summary         TEXT DEFAULT \'\',',
  '  metadata_json   TEXT DEFAULT \'{}\'',
  ');'
].join('\n');

// ─── WAL 模式 ──────────────────────────────────────────────

var PRAGMA_WAL = 'PRAGMA journal_mode=WAL;';
var PRAGMA_SYNC_NORMAL = 'PRAGMA synchronous=NORMAL;';

// ─── 索引 ──────────────────────────────────────────────────

var INDEXES = [
  // incidents
  'CREATE INDEX IF NOT EXISTS idx_incidents_correlationId ON incidents(correlationId);',
  'CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp);',
  'CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(type);',
  'CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);',
  // recoveries
  'CREATE INDEX IF NOT EXISTS idx_recoveries_correlationId ON recoveries(correlationId);',
  'CREATE INDEX IF NOT EXISTS idx_recoveries_timestamp ON recoveries(timestamp);',
  'CREATE INDEX IF NOT EXISTS idx_recoveries_type ON recoveries(type);',
  // executions
  'CREATE INDEX IF NOT EXISTS idx_executions_correlationId ON executions(correlationId);',
  'CREATE INDEX IF NOT EXISTS idx_executions_timestamp ON executions(timestamp);',
  'CREATE INDEX IF NOT EXISTS idx_executions_type ON executions(type);',
  'CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);',
  // strategies
  'CREATE INDEX IF NOT EXISTS idx_strategies_correlationId ON strategies(correlationId);',
  'CREATE INDEX IF NOT EXISTS idx_strategies_timestamp ON strategies(timestamp);',
  'CREATE INDEX IF NOT EXISTS idx_strategies_type ON strategies(type);',
  // organization_memory
  'CREATE INDEX IF NOT EXISTS idx_orgmem_correlationId ON organization_memory(correlationId);',
  'CREATE INDEX IF NOT EXISTS idx_orgmem_timestamp ON organization_memory(timestamp);',
  'CREATE INDEX IF NOT EXISTS idx_orgmem_type ON organization_memory(type);'
];

// ─── 初始化 ────────────────────────────────────────────────

/**
 * 确保数据库目录存在
 */
function _ensureDbDir() {
  var dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 初始化数据库（建表 + 索引 + WAL）
 *
 * @returns {boolean}
 */
function initialize() {
  if (!Database) {
    _available = false;
    return false;
  }

  try {
    _ensureDbDir();
    _db = new Database(DB_PATH);

    // WAL mode
    _db.pragma('journal_mode=WAL');
    _db.pragma('synchronous=NORMAL');

    // 建表
    _db.exec(CREATE_INCIDENTS_TABLE);
    _db.exec(CREATE_RECOVERIES_TABLE);
    _db.exec(CREATE_EXECUTIONS_TABLE);
    _db.exec(CREATE_STRATEGIES_TABLE);
    _db.exec(CREATE_ORGANIZATION_MEMORY_TABLE);

    // 建索引
    for (var i = 0; i < INDEXES.length; i++) {
      _db.exec(INDEXES[i]);
    }

    _available = true;
    return true;
  } catch (err) {
    console.error('[runtime-memory-db] 初始化失败:', err.message);
    _available = false;
    _db = null;
    return false;
  }
}

/**
 * 获取数据库实例（懒初始化）
 *
 * @returns {Object|null}
 */
function getDb() {
  if (_available === null) {
    initialize();
  }
  return _available ? _db : null;
}

/**
 * SQLite 是否可用
 *
 * @returns {boolean}
 */
function isAvailable() {
  if (_available === null) {
    initialize();
  }
  return _available === true;
}

// ─── 写入 API ────────────────────────────────────────────────

/**
 * 通用插入
 *
 * @param {string} table  - 表名
 * @param {Object} record - 记录
 * @returns {boolean}
 */
function _insert(table, record) {
  var db = getDb();
  if (!db) return false;

  try {
    var stmt = db.prepare(
      'INSERT OR REPLACE INTO ' + table + ' (id, timestamp, correlationId, agent, type, status, summary, metadata_json) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );

    stmt.run(
      record.id || ('mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)),
      record.timestamp || new Date().toISOString(),
      record.correlationId || 'unknown',
      record.agent || 'unknown',
      record.type || 'general',
      record.status || 'active',
      (record.summary || '').substring(0, 1000),
      JSON.stringify(record.metadata || {})
    );
    return true;
  } catch (err) {
    console.error('[runtime-memory-db] 写入 ' + table + ' 失败:', err.message);
    return false;
  }
}

/**
 * insertIncident — 写入故障记录
 */
function insertIncident(record) {
  return _insert('incidents', {
    id: record.id,
    timestamp: record.timestamp,
    correlationId: record.correlationId,
    agent: record.agent || 'unknown',
    type: record.incidentType || record.type || 'UNKNOWN',
    status: record.status || 'open',
    summary: record.summary || (record.incidentType || 'INCIDENT') + ': ' + (record.error || '').substring(0, 100),
    metadata: {
      executor: record.executor,
      command: record.command,
      error: record.error,
      retryCount: record.retryCount,
      recoveryResult: record.recoveryResult,
      protocol: record.protocol,
      ...(record.metadata || {})
    }
  });
}

/**
 * insertRecovery — 写入恢复记录
 */
function insertRecovery(record) {
  return _insert('recoveries', {
    id: record.id,
    timestamp: record.timestamp,
    correlationId: record.correlationId,
    agent: record.agent || 'unknown',
    type: record.recoveryType || record.type || 'UNKNOWN',
    status: record.recovered ? 'resolved' : 'failed',
    summary: record.summary || (record.recoveryType || 'RECOVERY') + ': ' + (record.description || '').substring(0, 100),
    metadata: {
      recoveryType: record.recoveryType,
      recovered: record.recovered,
      executor: record.executor,
      recoveryPlanId: record.recoveryPlanId,
      totalSteps: record.totalSteps,
      description: record.description,
      ...(record.metadata || {})
    }
  });
}

/**
 * insertExecution — 写入执行记录
 */
function insertExecution(record) {
  return _insert('executions', {
    id: record.id,
    timestamp: record.timestamp,
    correlationId: record.correlationId,
    agent: record.agent || 'unknown',
    type: 'execution',
    status: record.success ? 'success' : 'failed',
    summary: (record.command || '').substring(0, 200),
    metadata: {
      executor: record.executor,
      command: record.command,
      success: record.success,
      durationMs: record.durationMs,
      output: record.output,
      error: record.error,
      ...(record.metadata || {})
    }
  });
}

/**
 * insertStrategy — 写入策略记录
 */
function insertStrategy(record) {
  return _insert('strategies', {
    id: record.id,
    timestamp: record.timestamp,
    correlationId: record.correlationId,
    agent: record.agent || 'unknown',
    type: record.strategyType || record.type || 'general',
    status: 'active',
    summary: (record.strategyType || 'STRATEGY') + ': ' + (record.strategyName || ''),
    metadata: {
      strategyName: record.strategyName,
      strategyType: record.strategyType,
      strategyConfig: record.strategyConfig,
      description: record.description,
      ...(record.metadata || {})
    }
  });
}

/**
 * insertOrganizationMemory — 写入组织聚合记忆
 */
function insertOrganizationMemory(record) {
  return _insert('organization_memory', record);
}

// ─── 查询 API ────────────────────────────────────────────────

/**
 * 通用查询
 *
 * @param {string} table
 * @param {Object} [options]
 * @param {string} [options.correlationId]
 * @param {string} [options.type]
 * @param {string} [options.status]
 * @param {string} [options.agent]
 * @param {string} [options.since]
 * @param {number} [options.limit=20]
 * @returns {Array<Object>}
 */
function _query(table, options) {
  var db = getDb();
  if (!db) return [];

  options = options || {};
  var limit = options.limit || 20;

  try {
    var conditions = [];
    var params = [];

    if (options.correlationId) {
      conditions.push('correlationId = ?');
      params.push(options.correlationId);
    }
    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.agent) {
      conditions.push('agent = ?');
      params.push(options.agent);
    }
    if (options.since) {
      conditions.push('timestamp >= ?');
      params.push(options.since);
    }

    var sql = 'SELECT * FROM ' + table;
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    var rows = db.prepare(sql).all.apply(db.prepare(sql), params);

    return rows.map(function(row) {
      var result = {
        id: row.id,
        timestamp: row.timestamp,
        correlationId: row.correlationId,
        agent: row.agent,
        type: row.type,
        status: row.status,
        summary: row.summary
      };
      try {
        result.metadata = JSON.parse(row.metadata_json || '{}');
      } catch (_) {
        result.metadata = {};
      }
      return result;
    });
  } catch (err) {
    console.error('[runtime-memory-db] 查询 ' + table + ' 失败:', err.message);
    return [];
  }
}

function queryIncidents(options) {
  return _query('incidents', options);
}

function queryRecoveries(options) {
  return _query('recoveries', options);
}

function queryExecutions(options) {
  return _query('executions', options);
}

function queryStrategies(options) {
  return _query('strategies', options);
}

function queryOrganizationMemory(options) {
  return _query('organization_memory', options);
}

/**
 * 跨表按 correlationId 查询
 *
 * @param {string} correlationId
 * @returns {{ incidents: Array, recoveries: Array, executions: Array, strategies: Array }}
 */
function queryAllByCorrelationId(correlationId) {
  return {
    incidents: _query('incidents', { correlationId: correlationId, limit: 100 }),
    recoveries: _query('recoveries', { correlationId: correlationId, limit: 100 }),
    executions: _query('executions', { correlationId: correlationId, limit: 100 }),
    strategies: _query('strategies', { correlationId: correlationId, limit: 100 })
  };
}

// ─── 统计 API ────────────────────────────────────────────────

/**
 * 通用计数
 */
function _count(table, where) {
  var db = getDb();
  if (!db) return 0;

  try {
    var sql = 'SELECT COUNT(*) as cnt FROM ' + table;
    var params = [];
    if (where) {
      var conditions = [];
      Object.keys(where).forEach(function(k) {
        conditions.push(k + ' = ?');
        params.push(where[k]);
      });
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    return db.prepare(sql).get.apply(db.prepare(sql), params).cnt;
  } catch (err) {
    console.error('[runtime-memory-db] 统计 ' + table + ' 失败:', err.message);
    return 0;
  }
}

function countIncidents(status) {
  return _count('incidents', status ? { status: status } : null);
}

function countRecoveries() {
  return _count('recoveries');
}

function countExecutions() {
  return _count('executions');
}

function countStrategies() {
  return _count('strategies');
}

// ─── 维护 API ────────────────────────────────────────────────

/**
 * 关闭数据库连接
 */
function close() {
  if (_db) {
    try {
      _db.close();
    } catch (_) {}
    _db = null;
    _available = null;
  }
}

/**
 * 清除所有数据（测试用）
 */
function clearAll() {
  var db = getDb();
  if (!db) return false;

  try {
    db.exec('DELETE FROM incidents;');
    db.exec('DELETE FROM recoveries;');
    db.exec('DELETE FROM executions;');
    db.exec('DELETE FROM strategies;');
    db.exec('DELETE FROM organization_memory;');
    return true;
  } catch (err) {
    console.error('[runtime-memory-db] 清除数据失败:', err.message);
    return false;
  }
}

/**
 * 获取数据库文件信息
 *
 * @returns {{ exists: boolean, size: number, path: string }}
 */
function getDbInfo() {
  var exists = fs.existsSync(DB_PATH);
  var size = exists ? fs.statSync(DB_PATH).size : 0;
  return { exists: exists, size: size, path: DB_PATH };
}

module.exports = {
  // 生命周期
  initialize: initialize,
  getDb: getDb,
  isAvailable: isAvailable,
  close: close,

  // 写入
  insertIncident: insertIncident,
  insertRecovery: insertRecovery,
  insertExecution: insertExecution,
  insertStrategy: insertStrategy,
  insertOrganizationMemory: insertOrganizationMemory,

  // 查询
  queryIncidents: queryIncidents,
  queryRecoveries: queryRecoveries,
  queryExecutions: queryExecutions,
  queryStrategies: queryStrategies,
  queryOrganizationMemory: queryOrganizationMemory,
  queryAllByCorrelationId: queryAllByCorrelationId,

  // 统计
  countIncidents: countIncidents,
  countRecoveries: countRecoveries,
  countExecutions: countExecutions,
  countStrategies: countStrategies,

  // 维护
  clearAll: clearAll,
  getDbInfo: getDbInfo
};
