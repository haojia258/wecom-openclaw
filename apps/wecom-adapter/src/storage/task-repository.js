'use strict';

/**
 * task-repository.js - 任务仓库层 (P6.6.1 Task Store v2)
 *
 * 主存储: SQLite (via task-db.js)
 * 审计备份: JSONL (logs/tasks/YYYY-MM-DD.jsonl)
 *
 * 6 个公开函数完全向后兼容 task-store.js
 */

const fs = require('fs');
const path = require('path');
const taskDb = require('./task-db');
const sm = require('../orchestrator/v2/task-state-machine');

// ─── JSONL 辅助（与旧 task-store.js 逻辑一致）────────────

/**
 * 获取日志目录（支持 TASK_LOG_DIR 环境变量隔离测试）
 * 生产环境: logs/tasks/
 * 测试环境: 可设置为临时目录避免污染生产日志
 */
function getLogDir() {
  return process.env.TASK_LOG_DIR || path.resolve(__dirname, '../../logs/tasks');
}

function ensureLogDir() {
  var dir = getLogDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getLogFilePath() {
  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1).padStart(2, '0');
  var dd = String(today.getDate()).padStart(2, '0');
  return path.join(getLogDir(), yyyy + '-' + mm + '-' + dd + '.jsonl');
}

function appendJSONL(record) {
  ensureLogDir();
  var filePath = getLogFilePath();
  var line = JSON.stringify(record) + '\n';
  fs.appendFileSync(filePath, line, 'utf-8');
}

// ─── JSONL-Only 回退（better-sqlite3 不可用时）──────────

function readTodayLogs() {
  ensureLogDir();
  var filePath = getLogFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  var content = fs.readFileSync(filePath, 'utf-8');
  return content
    .trim()
    .split('\n')
    .filter(function(line) { return line.trim(); })
    .map(function(line) {
      try { return JSON.parse(line); }
      catch (_) { return null; }
    })
    .filter(Boolean);
}

// ─── SQLite 实现 ─────────────────────────────────────────

/**
 * 获取当前时间戳
 */
function now() {
  return new Date().toISOString();
}

/**
 * 将 SQLite row 转为标准 task 对象
 */
function rowToTask(row) {
  if (!row) return null;
  var task = {
    task_id: row.task_id,
    type: row.type,
    agent: row.agent,
    content: row.content,
    status: row.status,
    priority: row.priority,
    result: row.result ? tryParseJSON(row.result) : null,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
  // P6.6.2: 标准化旧状态为统一大写状态
  sm.normalizeTask(task);
  return task;
}

function tryParseJSON(str) {
  try { return JSON.parse(str); } catch (_) { return str; }
}

// ─── 公共 API ────────────────────────────────────────────

/**
 * 创建任务
 * @param {{ taskId, type?, agent?, content?, priority? }} params
 * @returns {object} 创建的 task 对象
 */
function createTask(params) {
  var taskId = params.taskId;
  var type = params.type || 'general';
  var agent = params.agent || 'unknown';
  var content = params.content || '';
  var priority = params.priority || 'normal';

  var task = {
    task_id: taskId,
    type: type,
    agent: agent,
    content: content,
    status: sm.STATES.PENDING,
    priority: priority,
    result: null,
    error: null,
    created_at: now(),
    updated_at: now()
  };

  // 主存储: SQLite
  if (taskDb.isAvailable()) {
    var db = taskDb.getDb();
    try {
      var stmt = db.prepare(
        'INSERT INTO tasks (task_id, agent, type, content, status, priority, result, error, created_at, updated_at) ' +
        'VALUES (@task_id, @agent, @type, @content, @status, @priority, @result, @error, @created_at, @updated_at)'
      );
      stmt.run(task);
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        throw new Error('Duplicate task_id: ' + taskId);
      }
      // 其他 SQLite 错误: 降级到 JSONL
      appendJSONL(task);
      return task;
    }
  } else {
    // 纯 JSONL 模式
    appendJSONL(task);
    return task;
  }

  // 审计备份: JSONL（fire-and-forget）
  try { appendJSONL(task); } catch (_) {}

  return task;
}

/**
 * 更新任务
 * @param {string} taskId
 * @param {object} updates - 部分字段
 * @returns {object|null} 更新后的 task 或 null
 */
function updateTask(taskId, updates) {
  updates = updates || {};

  // P6.6.2: 状态字段验证
  if (updates.status !== undefined) {
    sm.validateStatus(updates.status);
  }

  if (taskDb.isAvailable()) {
    var db = taskDb.getDb();

    // 序列化 result 为 JSON 字符串（如果是对象）
    var dbUpdates = {};
    var keys = Object.keys(updates);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = updates[k];
      if (k === 'result' && v !== null && typeof v === 'object') {
        dbUpdates[k] = JSON.stringify(v);
      } else {
        dbUpdates[k] = v;
      }
    }
    dbUpdates.updated_at = now();

    // 构建 SET 子句
    var setClauses = [];
    var bindParams = { task_id: taskId };
    var updateKeys = Object.keys(dbUpdates);
    for (var j = 0; j < updateKeys.length; j++) {
      var uk = updateKeys[j];
      setClauses.push(uk + ' = @' + uk);
      bindParams[uk] = dbUpdates[uk];
    }

    try {
      var stmt = db.prepare(
        'UPDATE tasks SET ' + setClauses.join(', ') + ' WHERE task_id = @task_id'
      );
      var result = stmt.run(bindParams);
      if (result.changes === 0) {
        return null;
      }
    } catch (_e) {
      // SQLite 写失败：回退 JSONL
      return jsonlUpdateTask(taskId, updates);
    }
  } else {
    return jsonlUpdateTask(taskId, updates);
  }

  // 获取更新后的完整对象
  var updated = getTask(taskId);

  // 审计备份: JSONL
  if (updated) {
    try { appendJSONL(updated); } catch (_) {}
  }

  return updated;
}

// JSONL 回退 update（旧 task-store.js 逻辑）
function jsonlUpdateTask(taskId, updates) {
  var tasks = readTodayLogs();
  var idx = -1;
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].task_id === taskId) {
      idx = i;
      break;
    }
  }

  if (idx === -1) return null;

  var merged = {};
  var taskKeys = Object.keys(tasks[idx]);
  for (var j = 0; j < taskKeys.length; j++) {
    merged[taskKeys[j]] = tasks[idx][taskKeys[j]];
  }
  var updateKeys = Object.keys(updates);
  for (var k = 0; k < updateKeys.length; k++) {
    merged[updateKeys[k]] = updates[updateKeys[k]];
  }
  merged.updated_at = now();

  // 重写整个文件
  var filePath = getLogFilePath();
  fs.writeFileSync(filePath, '', 'utf-8');
  for (var m = 0; m < tasks.length; m++) {
    var record = (tasks[m].task_id === taskId) ? merged : tasks[m];
    appendJSONL(record);
  }

  return merged;
}

/**
 * 获取单个任务
 * @param {string} taskId
 * @returns {object|null}
 */
function getTask(taskId) {
  if (taskDb.isAvailable()) {
    var db = taskDb.getDb();
    try {
      var row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId);
      return rowToTask(row);
    } catch (_e) {
      // 降级 JSONL
    }
  }

  // JSONL fallback
  var tasks = readTodayLogs();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].task_id === taskId) return tasks[i];
  }
  return null;
}

/**
 * 列出任务
 * @param {{ status?, agent? }} filter
 * @returns {object[]}
 */
function listTasks(filter) {
  filter = filter || {};

  if (taskDb.isAvailable()) {
    var db = taskDb.getDb();
    try {
      var sql = 'SELECT * FROM tasks';
      var conditions = [];
      var params = {};

      if (filter.status) {
        // P6.6.2: 同时匹配新旧状态以兼容历史数据
        var normalizedStatus = sm.normalizeState(filter.status);
        if (filter.status !== normalizedStatus) {
          // 旧小写 filter → 同时查询大写和小写
          conditions.push('(status = @status OR status = @status_old)');
          params.status = normalizedStatus;
          params.status_old = filter.status;
        } else {
          // 已经是标准状态 → 同时查询大写和小写（兼容历史数据）
          conditions.push('(status = @status OR status = @status_old)');
          params.status = normalizedStatus;
          // 生成对应的旧小写版本
          var oldKeys = Object.keys(sm.STATE_NORMALIZE_MAP);
          var oldStatus = null;
          for (var oi = 0; oi < oldKeys.length; oi++) {
            if (sm.STATE_NORMALIZE_MAP[oldKeys[oi]] === normalizedStatus) {
              oldStatus = oldKeys[oi];
              break;
            }
          }
          params.status_old = oldStatus || normalizedStatus;
        }
      }
      if (filter.agent) {
        conditions.push('agent = @agent');
        params.agent = filter.agent;
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY created_at DESC';

      var rows = db.prepare(sql).all(params);
      return rows.map(rowToTask);
    } catch (_e) {
      // 降级 JSONL
    }
  }

  // JSONL fallback
  var tasks = readTodayLogs();
  if (filter.status) {
    tasks = tasks.filter(function(t) { return t.status === filter.status; });
  }
  if (filter.agent) {
    tasks = tasks.filter(function(t) { return t.agent === filter.agent; });
  }
  return tasks;
}

/**
 * 获取阻断项（status === 'blocked' 的任务）
 * @returns {object[]}
 */
function getBlockers() {
  return listTasks({ status: sm.STATES.BLOCKED });
}

/**
 * 获取统计信息
 * @returns {{ total: number, pending: number, in_progress: number, completed: number, blocked: number, failed: number, PENDING: number, PLANNING: number, RUNNING: number, REVIEWING: number, COMPLETED: number, FAILED: number, BLOCKED: number }}
 */
function getStats() {
  if (taskDb.isAvailable()) {
    var db = taskDb.getDb();
    try {
      var rows = db.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status').all();
      var counts = {};
      var total = 0;
      for (var i = 0; i < rows.length; i++) {
        counts[rows[i].status] = rows[i].count;
        total += rows[i].count;
      }
      // P6.6.2: 聚合新旧状态计数
      return {
        total: total,
        // 旧小写 key（向后兼容现有消费者）
        pending: (counts.pending || 0) + (counts.PENDING || 0),
        in_progress: (counts.in_progress || 0) + (counts.RUNNING || 0),
        completed: (counts.completed || 0) + (counts.COMPLETED || 0),
        blocked: (counts.blocked || 0) + (counts.BLOCKED || 0),
        failed: (counts.failed || 0) + (counts.FAILED || 0),
        // 新大写 key（P6.6.2 新增）
        PENDING: (counts.pending || 0) + (counts.PENDING || 0),
        PLANNING: counts.PLANNING || 0,
        RUNNING: (counts.in_progress || 0) + (counts.RUNNING || 0),
        REVIEWING: counts.REVIEWING || 0,
        COMPLETED: (counts.completed || 0) + (counts.COMPLETED || 0),
        FAILED: (counts.failed || 0) + (counts.FAILED || 0),
        BLOCKED: (counts.blocked || 0) + (counts.BLOCKED || 0)
      };
    } catch (_e) {
      // 降级 JSONL
    }
  }

  // JSONL fallback
  var tasks = readTodayLogs();
  var total2 = tasks.length;
  var byStatus = {};
  for (var j2 = 0; j2 < tasks.length; j2++) {
    // P6.6.2: 标准化状态后再计数
    var s = sm.normalizeState(tasks[j2].status);
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  return {
    total: total2,
    // 旧小写 key（向后兼容）
    pending: (byStatus.PENDING || 0),
    in_progress: (byStatus.RUNNING || 0),
    completed: (byStatus.COMPLETED || 0),
    blocked: (byStatus.BLOCKED || 0),
    failed: (byStatus.FAILED || 0),
    // 新大写 key（P6.6.2）
    PENDING: (byStatus.PENDING || 0),
    PLANNING: (byStatus.PLANNING || 0),
    RUNNING: (byStatus.RUNNING || 0),
    REVIEWING: (byStatus.REVIEWING || 0),
    COMPLETED: (byStatus.COMPLETED || 0),
    FAILED: (byStatus.FAILED || 0),
    BLOCKED: (byStatus.BLOCKED || 0)
  };
}

// ─── 导出 ─────────────────────────────────────────────────

module.exports = {
  createTask: createTask,
  updateTask: updateTask,
  getTask: getTask,
  listTasks: listTasks,
  getBlockers: getBlockers,
  getStats: getStats,
  // 导出辅助函数供测试
  _getLogFilePath: getLogFilePath,
  _getLogDir: getLogDir,
  // P6.6.2: 暴露状态机供验证
  _sm: sm,
};
