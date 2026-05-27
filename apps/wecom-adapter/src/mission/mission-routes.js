'use strict';

/**
 * mission-routes.js - AI Mission Control API Routes (P10.0)
 *
 * 提供 3 个 API 端点:
 *   GET  /mission/tasks         → 列出所有 mission tasks
 *   GET  /mission/tasks/:id/events → 获取某 task 的事件时间线
 *   POST /mission/events         → 创建 agent event
 *
 * 复用 Express app 注册模式（与 ai-gateway.js 一致）。
 * 无需额外的 auth token（内部使用，非公网暴露）。
 */

var missionStore = require('./mission-store');
var path = require('path');

// ─── JSON Body Parser for /mission/events ─────────────────

var MAX_BODY_SIZE = 16 * 1024; // 16KB

function parseMissionBody(req, res, next) {
  if (req.method !== 'POST') return next();

  var chunks = [];
  var totalSize = 0;

  req.on('data', function(chunk) {
    totalSize += chunk.length;
    if (totalSize > MAX_BODY_SIZE) {
      res.status(413).json({ success: false, error: '请求体超过 16KB 限制' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', function() {
    var raw = Buffer.concat(chunks).toString('utf-8');
    try {
      req._missionBody = JSON.parse(raw);
    } catch (e) {
      res.status(400).json({ success: false, error: 'JSON 解析失败: ' + e.message });
      return;
    }
    next();
  });

  req.on('error', function() {
    // 客户端断开
  });
}

// ─── Route Handlers ───────────────────────────────────────

/**
 * GET /mission/tasks
 * Query params:
 *   - status (optional): 按状态过滤
 *   - owner_agent (optional): 按 agent 过滤
 */
function handleListMissionTasks(req, res) {
  var filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.owner_agent) filter.owner_agent = req.query.owner_agent;

  try {
    var tasks = missionStore.listMissionTasks(filter);
    var stats = missionStore.getMissionStats();

    res.json({
      success: true,
      data: tasks,
      stats: stats,
      count: tasks.length,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: '查询失败: ' + e.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * GET /mission/tasks/:id/events
 * Query params:
 *   - limit (optional, default 100)
 *   - offset (optional, default 0)
 */
function handleGetTaskEvents(req, res) {
  var taskId = req.params.id;
  var limit = parseInt(req.query.limit, 10) || 100;
  var offset = parseInt(req.query.offset, 10) || 0;

  try {
    var task = missionStore.getMissionTask(taskId);
    var events = missionStore.listAgentEvents(taskId, { limit: limit, offset: offset });

    res.json({
      success: true,
      task: task,
      events: events,
      event_count: events.length,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: '查询失败: ' + e.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * POST /mission/events
 * Body: { mission_task_id, event_type, stage?, payload? }
 */
function handleCreateAgentEvent(req, res) {
  var body = req._missionBody || {};

  var missionTaskId = (body.mission_task_id || '').trim();
  var eventType = (body.event_type || '').trim();

  if (!missionTaskId) {
    return res.status(400).json({
      success: false,
      error: '缺少必填字段: mission_task_id'
    });
  }
  if (!eventType) {
    return res.status(400).json({
      success: false,
      error: '缺少必填字段: event_type'
    });
  }

  try {
    // 验证 mission_task 是否存在
    var task = missionStore.getMissionTask(missionTaskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Mission task 不存在: ' + missionTaskId
      });
    }

    var event = missionStore.createAgentEvent({
      mission_task_id: missionTaskId,
      event_type: eventType,
      stage: body.stage || null,
      payload: body.payload || null
    });

    res.status(201).json({
      success: true,
      event: event,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: '创建事件失败: ' + e.message,
      timestamp: new Date().toISOString()
    });
  }
}

// ─── Express 路由注册 ────────────────────────────────────

/**
 * 在 Express app 上注册 /mission/* 路由
 *
 * @param {object} app - Express app 实例
 */
function registerMissionRoutes(app) {
  // Body parser for POST /mission/events
  app.use('/mission/events', parseMissionBody);

  // GET /mission/tasks
  app.get('/mission/tasks', handleListMissionTasks);

  // GET /mission/tasks/:id/events
  app.get('/mission/tasks/:id/events', handleGetTaskEvents);

  // POST /mission/events
  app.post('/mission/events', handleCreateAgentEvent);
}

module.exports = {
  registerMissionRoutes: registerMissionRoutes,
  // 导出 handlers 供测试
  _handleListMissionTasks: handleListMissionTasks,
  _handleGetTaskEvents: handleGetTaskEvents,
  _handleCreateAgentEvent: handleCreateAgentEvent,
};
