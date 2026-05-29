'use strict';

/**
 * mission-routes.js - AI Mission Control API Routes (P10.0)
 *
 * 提供 5 个 API 端点:
 *   GET  /mission/tasks               → 列出所有 mission tasks
 *   GET  /mission/tasks/:id/events    → 获取某 task 的事件时间线
 *   POST /mission/events              → 创建 agent event（含自动流转）
 *   POST /mission/tasks/:id/transition → 显式触发 workflow 状态流转 (P10.1)
 *   POST /mission/recovery            → 触发自动恢复流程 (P10.2)
 *
 * 复用 Express app 注册模式（与 ai-gateway.js 一致）。
 * 无需额外的 auth token（内部使用，非公网暴露）。
 */

var missionStore = require('./mission-store');
var transitionEngine = require('./workflow-transition-engine');
var recoveryEngine = require('./recovery-engine');
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

    // P10.1: 如果事件类型可触发状态流转，自动执行流转
    var transitionResult = null;
    if (transitionEngine.isTransitionTrigger(eventType)) {
      transitionResult = transitionEngine.attemptTransition(
        missionTaskId,
        eventType,
        body.payload || {}
      );
    }

    res.status(201).json({
      success: true,
      event: event,
      transition: transitionResult,
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

/**
 * POST /mission/tasks/:id/transition (P10.1)
 * Body: { event_type: "TEST_PASSED", payload?: {...} }
 *
 * 通过事件驱动方式触发 Mission Task 的 workflow stage 变化。
 * 自动验证状态流转合法性，拒绝非法跳转。
 */
function handleTransitionTask(req, res) {
  var body = req._missionBody || {};
  var taskId = req.params.id;
  var eventType = (body.event_type || '').trim();

  if (!eventType) {
    return res.status(400).json({
      success: false,
      error: '缺少必填字段: event_type'
    });
  }

  try {
    var result = transitionEngine.attemptTransition(taskId, eventType, body.payload || {});

    if (result.success) {
      res.json({
        success: true,
        from_stage: result.from_stage,
        to_stage: result.to_stage,
        event: result.event,
        timestamp: new Date().toISOString()
      });
    } else if (result.error && result.error.indexOf('not found') !== -1) {
      res.status(404).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    } else {
      // 转换非法 → 409 Conflict
      res.status(409).json({
        success: false,
        error: result.error || 'Transition failed',
        reason: result.reason || 'Invalid transition',
        from_stage: result.from_stage,
        to_stage: result.to_stage,
        timestamp: new Date().toISOString()
      });
    }
  } catch (e) {
    res.status(500).json({
      success: false,
      error: '转换失败: ' + e.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * POST /mission/recovery (P10.2)
 * Body: { mission_task_id, event_type?, error_message?, exit_code? }
 *
 * 触发 AI Runtime 自动恢复流程：
 *   failure → classify → retry? → rollback? → recovery result
 */
function handleRecovery(req, res) {
  var body = req._missionBody || {};

  var missionTaskId = (body.mission_task_id || '').trim();

  if (!missionTaskId) {
    return res.status(400).json({
      success: false,
      error: '缺少必填字段: mission_task_id'
    });
  }

  try {
    // 验证任务存在
    var task = missionStore.getMissionTask(missionTaskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Mission task 不存在: ' + missionTaskId
      });
    }

    // 构建失败事件
    var failureEvent = {
      event_type: body.event_type || 'FAILED',
      error_message: body.error_message || '',
      exit_code: body.exit_code !== undefined ? body.exit_code : null
    };

    // 调用恢复引擎
    recoveryEngine.handleFailure(task, failureEvent).then(function(recoveryResult) {
      res.json({
        success: recoveryResult.success,
        action_taken: recoveryResult.action_taken,
        failure_type: recoveryResult.failure_type,
        recovery_status: recoveryResult.recovery_status,
        retry_count: recoveryResult.retry_count,
        error: recoveryResult.error || null,
        timestamp: new Date().toISOString()
      });
    }).catch(function(e) {
      res.status(500).json({
        success: false,
        error: '恢复流程异常: ' + e.message,
        timestamp: new Date().toISOString()
      });
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: '恢复触发失败: ' + e.message,
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
  // Body parser for POST endpoints
  app.use('/mission/events', parseMissionBody);
  app.use('/mission/tasks', parseMissionBody);
  app.use('/mission/recovery', parseMissionBody);

  // GET /mission/tasks
  app.get('/mission/tasks', handleListMissionTasks);

  // GET /mission/tasks/:id/events
  app.get('/mission/tasks/:id/events', handleGetTaskEvents);

  // POST /mission/events
  app.post('/mission/events', handleCreateAgentEvent);

  // POST /mission/tasks/:id/transition (P10.1)
  app.post('/mission/tasks/:id/transition', handleTransitionTask);

  // POST /mission/recovery (P10.2)
  app.post('/mission/recovery', handleRecovery);
}

module.exports = {
  registerMissionRoutes: registerMissionRoutes,
  // 导出 handlers 供测试
  _handleListMissionTasks: handleListMissionTasks,
  _handleGetTaskEvents: handleGetTaskEvents,
  _handleCreateAgentEvent: handleCreateAgentEvent,
  _handleTransitionTask: handleTransitionTask,
  _handleRecovery: handleRecovery,
};
