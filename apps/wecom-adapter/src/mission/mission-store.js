'use strict';

/**
 * mission-store.js - AI Mission Control 数据访问层 (P10.0)
 *
 * 管理 mission_tasks 和 agent_events 两张表的 CRUD。
 * 复用 task-db.js 的 getDb / isAvailable 基础设施。
 */

var taskDb = require('../storage/task-db');

// ─── 时间工具 ─────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

// ─── JSON 辅助 ────────────────────────────────────────────

function safeJsonParse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch (_) { return str; }
}

function safeJsonStringify(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj === 'string') return obj;
  try { return JSON.stringify(obj); } catch (_) { return null; }
}

// ─── Row → Object ─────────────────────────────────────────

function rowToMissionTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    owner_agent: row.owner_agent,
    github_pr: row.github_pr || null,
    current_stage: row.current_stage || null,
    last_event_at: row.last_event_at || null,
    // P10.2: Retry & Recovery Engine 字段
    retry_count: typeof row.retry_count === 'number' ? row.retry_count : 0,
    last_failure_type: row.last_failure_type || '',
    recovery_status: row.recovery_status || '',
    rollback_state: row.rollback_state || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function rowToAgentEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    mission_task_id: row.mission_task_id,
    event_type: row.event_type,
    stage: row.stage || null,
    payload: safeJsonParse(row.payload),
    created_at: row.created_at
  };
}

// ─── Mission Tasks CRUD ───────────────────────────────────

/**
 * 创建 Mission Task
 * @param {{ id, title?, description?, status?, owner_agent?, github_pr?, current_stage? }} params
 * @returns {object} 创建的 mission task
 */
function createMissionTask(params) {
  if (!params || !params.id) {
    throw new Error('mission task 缺少必填字段: id');
  }

  var task = {
    id: params.id,
    title: params.title || '',
    description: params.description || '',
    status: params.status || 'pending',
    owner_agent: params.owner_agent || 'unknown',
    github_pr: params.github_pr || null,
    current_stage: params.current_stage || null,
    last_event_at: null,
    created_at: now(),
    updated_at: now()
  };

  if (!taskDb.isAvailable()) {
    throw new Error('SQLite 不可用');
  }

  var db = taskDb.getDb();
  var stmt = db.prepare(
    'INSERT INTO mission_tasks (id, title, description, status, owner_agent, github_pr, current_stage, last_event_at, created_at, updated_at) ' +
    'VALUES (@id, @title, @description, @status, @owner_agent, @github_pr, @current_stage, @last_event_at, @created_at, @updated_at)'
  );

  try {
    stmt.run(task);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      throw new Error('Duplicate mission_task id: ' + params.id);
    }
    throw err;
  }

  return task;
}

/**
 * 获取单个 Mission Task
 * @param {string} id
 * @returns {object|null}
 */
function getMissionTask(id) {
  if (!taskDb.isAvailable()) return null;

  var db = taskDb.getDb();
  var row = db.prepare('SELECT * FROM mission_tasks WHERE id = ?').get(id);
  return rowToMissionTask(row);
}

/**
 * 列出 Mission Tasks
 * @param {{ status?, owner_agent? }} filter
 * @returns {object[]}
 */
function listMissionTasks(filter) {
  filter = filter || {};

  if (!taskDb.isAvailable()) return [];

  var db = taskDb.getDb();
  var sql = 'SELECT * FROM mission_tasks';
  var conditions = [];
  var params = {};

  if (filter.status) {
    conditions.push('status = @status');
    params.status = filter.status;
  }
  if (filter.owner_agent) {
    conditions.push('owner_agent = @owner_agent');
    params.owner_agent = filter.owner_agent;
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC';

  var rows = db.prepare(sql).all(params);
  return rows.map(rowToMissionTask);
}

/**
 * 更新 Mission Task
 * @param {string} id
 * @param {object} updates
 * @returns {object|null}
 */
function updateMissionTask(id, updates) {
  updates = updates || {};

  if (!taskDb.isAvailable()) return null;

  var db = taskDb.getDb();
  var dbUpdates = {};
  var keys = Object.keys(updates);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    dbUpdates[k] = updates[k];
  }
  dbUpdates.updated_at = now();

  var setClauses = [];
  var bindParams = { id: id };
  var updateKeys = Object.keys(dbUpdates);
  for (var j = 0; j < updateKeys.length; j++) {
    var uk = updateKeys[j];
    setClauses.push(uk + ' = @' + uk);
    bindParams[uk] = dbUpdates[uk];
  }

  var stmt = db.prepare(
    'UPDATE mission_tasks SET ' + setClauses.join(', ') + ' WHERE id = @id'
  );
  var result = stmt.run(bindParams);

  if (result.changes === 0) return null;
  return getMissionTask(id);
}

// ─── Agent Events CRUD ────────────────────────────────────

/**
 * 创建 Agent Event 并更新 mission_task 的 last_event_at
 * @param {{ mission_task_id, event_type, stage?, payload? }} params
 * @returns {object} 创建的 agent event
 */
function createAgentEvent(params) {
  if (!params || !params.mission_task_id || !params.event_type) {
    throw new Error('agent event 缺少必填字段: mission_task_id, event_type');
  }

  var event = {
    mission_task_id: params.mission_task_id,
    event_type: params.event_type,
    stage: params.stage || null,
    payload: safeJsonStringify(params.payload || null),
    created_at: now()
  };

  if (!taskDb.isAvailable()) {
    throw new Error('SQLite 不可用');
  }

  var db = taskDb.getDb();

  // 事务：写入 event + 更新 mission_task.last_event_at
  var insertEvent = db.transaction(function(eventData) {
    var stmt = db.prepare(
      'INSERT INTO agent_events (mission_task_id, event_type, stage, payload, created_at) ' +
      'VALUES (@mission_task_id, @event_type, @stage, @payload, @created_at)'
    );
    var result = stmt.run(eventData);

    // 更新 mission_task 的 last_event_at
    var updateStmt = db.prepare(
      'UPDATE mission_tasks SET last_event_at = @created_at, updated_at = @created_at WHERE id = @mission_task_id'
    );
    updateStmt.run({
      mission_task_id: eventData.mission_task_id,
      created_at: eventData.created_at
    });

    return result.lastInsertRowid;
  });

  try {
    var newId = insertEvent(event);
    event.id = newId;
    return rowToAgentEvent(event);
  } catch (err) {
    throw err;
  }
}

/**
 * 获取某个 Mission Task 的所有事件
 * @param {string} missionTaskId
 * @param {{ limit?, offset? }} opts
 * @returns {object[]}
 */
function listAgentEvents(missionTaskId, opts) {
  opts = opts || {};
  var limit = opts.limit || 100;
  var offset = opts.offset || 0;

  if (!taskDb.isAvailable()) return [];

  var db = taskDb.getDb();
  var sql = 'SELECT * FROM agent_events WHERE mission_task_id = @mission_task_id ORDER BY created_at DESC';
  if (limit > 0) {
    sql += ' LIMIT @limit OFFSET @offset';
  }

  var rows = db.prepare(sql).all({
    mission_task_id: missionTaskId,
    limit: limit,
    offset: offset
  });

  return rows.map(rowToAgentEvent);
}

/**
 * 获取所有 agent_events（支持分页）
 * @param {{ limit?, offset?, mission_task_id? }} opts
 * @returns {object[]}
 */
function listAllAgentEvents(opts) {
  opts = opts || {};
  var limit = opts.limit || 200;
  var offset = opts.offset || 0;

  if (!taskDb.isAvailable()) return [];

  var db = taskDb.getDb();
  var sql = 'SELECT * FROM agent_events';
  var params = { limit: limit, offset: offset };

  if (opts.mission_task_id) {
    sql += ' WHERE mission_task_id = @mission_task_id';
    params.mission_task_id = opts.mission_task_id;
  }

  sql += ' ORDER BY created_at DESC LIMIT @limit OFFSET @offset';

  var rows = db.prepare(sql).all(params);
  return rows.map(rowToAgentEvent);
}

/**
 * 获取 Mission Task 统计
 * @returns {{ total: number, by_status: object }}
 */
function getMissionStats() {
  if (!taskDb.isAvailable()) {
    return { total: 0, by_status: {} };
  }

  var db = taskDb.getDb();
  var rows = db.prepare('SELECT status, COUNT(*) as count FROM mission_tasks GROUP BY status').all();

  var byStatus = {};
  var total = 0;
  for (var i = 0; i < rows.length; i++) {
    byStatus[rows[i].status] = rows[i].count;
    total += rows[i].count;
  }

  return { total: total, by_status: byStatus };
}

// ─── 导出 ─────────────────────────────────────────────────

module.exports = {
  // Mission Tasks
  createMissionTask: createMissionTask,
  getMissionTask: getMissionTask,
  listMissionTasks: listMissionTasks,
  updateMissionTask: updateMissionTask,
  getMissionStats: getMissionStats,

  // Agent Events
  createAgentEvent: createAgentEvent,
  listAgentEvents: listAgentEvents,
  listAllAgentEvents: listAllAgentEvents,

  // 辅助
  _now: now,
};
