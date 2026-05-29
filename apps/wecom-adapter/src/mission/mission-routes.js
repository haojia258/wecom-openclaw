'use strict';

/**
 * mission-routes.js - AI Mission Control API Routes (P10.0 - P10.5)
 *
 * API 端点:
 *   GET  /mission/tasks               → 列出所有 mission tasks
 *   GET  /mission/tasks/:id/events    → 获取某 task 的事件时间线
 *   POST /mission/events              → 创建 agent event（含自动流转）
 *   POST /mission/tasks/:id/transition → 显式触发 workflow 状态流转 (P10.1)
 *   POST /mission/recovery            → 触发自动恢复流程 (P10.2)
 *   GET  /mission/:id/artifacts       → 列出 mission artifacts (P10.3)
 *   POST /mission/:id/artifacts       → 保存 artifact (P10.3)
 *   GET  /mission/:id/artifacts/:fn   → 获取 artifact 内容 (P10.3)
 *   POST /mission/capability/check    → 验证 dispatch (P10.4)
 *   GET  /mission/capability/agents   → 列出所有 agent (P10.4)
 *   GET  /mission/capability/agents/:agent → 获取 agent 能力 (P10.4)
 *   POST /mission/graphs              → 创建 task graph (P10.5)
 *   GET  /mission/graphs/:graph_id    → 获取 graph (P10.5)
 *   POST /mission/graphs/:graph_id/run-step → 推进一个 step (P10.5)
 *   POST /mission/graphs/:graph_id/nodes/:node_id/status → 更新节点状态 (P10.5)
 *   GET  /mission/graphs/:graph_id/ready → 获取就绪节点 (P10.5)
 *
 * 复用 Express app 注册模式（与 ai-gateway.js 一致）。
 * 无需额外的 auth token（内部使用，非公网暴露）。
 */

var missionStore = require('./mission-store');
var transitionEngine = require('./workflow-transition-engine');
var recoveryEngine = require('./recovery-engine');
var artifactStore = require('../artifacts/artifact-store');
var artifactIndex = require('../artifacts/artifact-index');
var capabilityRegistry = require('../agent-governance/capability-registry');
var graphStore = require('./task-graph-store');
var graphEngine = require('./task-graph-engine');
var graphRunner = require('./task-graph-runner');
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

// ─── P10.2 Recovery Handler ─────────────────────────────────

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

// ─── P10.3 Artifact Workspace Handlers ─────────────────────

/**
 * GET /mission/:id/artifacts
 * 列出指定 mission 的所有 artifacts
 */
function handleListArtifacts(req, res) {
  var missionId = req.params.id;

  if (!missionId) {
    return res.status(400).json({ success: false, error: '缺少 mission_id' });
  }

  var result = artifactStore.listArtifacts(missionId);

  if (result.success) {
    // 同时获取索引统计
    var indexStats = artifactIndex.getIndexStats();
    res.json({
      success: true,
      mission_id: missionId,
      artifacts: result.artifacts,
      count: result.artifacts.length,
      index_stats: indexStats,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * POST /mission/:id/artifacts
 * Body: { filename, agent?, content }
 */
function handleSaveArtifact(req, res) {
  var missionId = req.params.id;
  var body = req._missionBody || {};

  var filename = (body.filename || '').trim();
  var agent = (body.agent || 'unknown').trim();
  var content = body.content;

  if (!missionId) {
    return res.status(400).json({ success: false, error: '缺少 mission_id' });
  }
  if (!filename) {
    return res.status(400).json({ success: false, error: '缺少必填字段: filename' });
  }
  if (content === undefined || content === null) {
    return res.status(400).json({ success: false, error: '缺少必填字段: content' });
  }

  // JSON content 需要序列化
  if (typeof content === 'object') {
    content = JSON.stringify(content, null, 2);
  }

  var result = artifactStore.saveArtifact({
    mission_id: missionId,
    filename: filename,
    agent: agent,
    content: content
  });

  if (result.success) {
    // 注册到全局索引
    artifactIndex.indexArtifact(result.metadata);

    res.status(201).json({
      success: true,
      metadata: result.metadata,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * GET /mission/:id/artifacts/:filename
 * 获取指定 artifact 的内容
 */
function handleGetArtifact(req, res) {
  var missionId = req.params.id;
  var filename = req.params.filename;

  if (!missionId || !filename) {
    return res.status(400).json({ success: false, error: '缺少 mission_id 或 filename' });
  }

  var result = artifactStore.readArtifact(missionId, filename);

  if (result.success) {
    res.json({
      success: true,
      mission_id: missionId,
      filename: filename,
      content: result.content,
      metadata: result.metadata,
      timestamp: new Date().toISOString()
    });
  } else {
    var statusCode = result.error.indexOf('不存在') !== -1 ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: result.error,
      timestamp: new Date().toISOString()
    });
  }
}

// ─── P10.4 Capability Registry Handlers ────────────────────

/**
 * POST /mission/capability/check
 * Body: { agent, capability, mission_id? }
 *
 * 执行 dispatch 验证，同时联动 P10.3 生成 dispatch artifact
 */
function handleCapabilityCheck(req, res) {
  var body = req._missionBody || {};
  var agent = (body.agent || '').trim();
  var capability = (body.capability || '').trim();
  var missionId = (body.mission_id || '').trim();

  if (!agent) {
    return res.status(400).json({ success: false, error: '缺少必填字段: agent' });
  }
  if (!capability) {
    return res.status(400).json({ success: false, error: '缺少必填字段: capability' });
  }

  var result = capabilityRegistry.validateDispatch(agent, capability);

  // P10.3 + P10.4 联动: 生成 dispatch artifact
  if (missionId) {
    try {
      var dispatchRecord = {
        mission_id: missionId,
        agent: agent,
        capability: capability,
        allowed: result.allowed,
        requiresApproval: result.requiresApproval,
        reason: result.reason,
        checked_at: result.checked_at
      };

      var saveResult = artifactStore.saveArtifact({
        mission_id: missionId,
        filename: 'dispatch.json',
        agent: agent,
        content: JSON.stringify(dispatchRecord, null, 2)
      });

      if (saveResult.success) {
        artifactIndex.indexArtifact(saveResult.metadata);
      }
    } catch (e) {
      // dispatch artifact 保存失败不影响主流程
    }
  }

  res.json({
    success: true,
    allowed: result.allowed,
    requiresApproval: result.requiresApproval,
    reason: result.reason,
    checked_at: result.checked_at,
    timestamp: new Date().toISOString()
  });
}

/**
 * GET /mission/capability/agents
 * 列出所有已注册 agent
 */
function handleListAgents(req, res) {
  var agents = capabilityRegistry.listAllAgents();

  res.json({
    success: true,
    agents: agents,
    count: agents.length,
    timestamp: new Date().toISOString()
  });
}

/**
 * GET /mission/capability/agents/:agent
 * 获取指定 agent 的能力配置
 */
function handleGetAgent(req, res) {
  var agentName = req.params.agent;

  if (!agentName) {
    return res.status(400).json({ success: false, error: '缺少 agent 名称' });
  }

  var result = capabilityRegistry.getAgentCapabilities(agentName);

  if (result.success) {
    res.json({
      success: true,
      agent: result.agent,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(404).json({
      success: false,
      error: result.error,
      timestamp: new Date().toISOString()
    });
  }
}

// ─── P10.5 Task Graph Engine Handlers ──────────────────

/**
 * POST /mission/graphs
 * Body: { graph_id, mission_id, nodes }
 *
 * 创建 task graph（含全量校验）
 */
function handleCreateGraph(req, res) {
  var body = req._missionBody || {};

  // 规范化 nodes: snake_case → camelCase (depends_on → dependsOn)
  var rawNodes = body.nodes || [];
  var nodes = [];
  for (var ni = 0; ni < rawNodes.length; ni++) {
    var rn = rawNodes[ni];
    var nn = {};
    var rnKeys = Object.keys(rn);
    for (var ki = 0; ki < rnKeys.length; ki++) {
      var key = rnKeys[ki];
      if (key === 'depends_on') {
        nn.dependsOn = rn.depends_on;
      } else {
        nn[key] = rn[key];
      }
    }
    nodes.push(nn);
  }

  var graphDef = {
    graph_id: (body.graph_id || '').trim(),
    mission_id: (body.mission_id || '').trim(),
    nodes: nodes
  };

  if (!graphDef.graph_id) {
    return res.status(400).json({ success: false, error: '缺少必填字段: graph_id' });
  }
  if (!graphDef.mission_id) {
    return res.status(400).json({ success: false, error: '缺少必填字段: mission_id' });
  }
  if (!Array.isArray(graphDef.nodes) || graphDef.nodes.length === 0) {
    return res.status(400).json({ success: false, error: 'nodes 必须是非空数组' });
  }

  var result = graphRunner.createAndValidate(graphDef);

  if (result.success) {
    res.status(201).json({
      success: true,
      graph: result.graph,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(400).json({
      success: false,
      errors: result.errors,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * GET /mission/graphs/:graph_id
 * 获取单个 graph
 */
function handleGetGraph(req, res) {
  var graphId = req.params.graph_id;

  if (!graphId) {
    return res.status(400).json({ success: false, error: '缺少 graph_id' });
  }

  var graph = graphStore.getGraph(graphId);
  if (!graph) {
    return res.status(404).json({
      success: false,
      error: 'Graph 不存在: ' + graphId,
      timestamp: new Date().toISOString()
    });
  }

  var events = graphStore.getGraphEvents(graphId);

  res.json({
    success: true,
    graph: graph,
    events: events,
    event_count: events.length,
    timestamp: new Date().toISOString()
  });
}

/**
 * POST /mission/graphs/:graph_id/run-step
 * 推进一个 step
 */
function handleRunGraphStep(req, res) {
  var graphId = req.params.graph_id;

  if (!graphId) {
    return res.status(400).json({ success: false, error: '缺少 graph_id' });
  }

  var result = graphEngine.runGraphStep(graphId);

  if (result.success) {
    // 同时获取更新后的 graph
    var graph = graphStore.getGraph(graphId);
    res.json({
      success: true,
      step_result: result.step_result,
      graph_status: graph ? graph.status : 'unknown',
      timestamp: new Date().toISOString()
    });
  } else {
    var statusCode = result.error.indexOf('不存在') !== -1 ? 404 : 409;
    res.status(statusCode).json({
      success: false,
      error: result.error,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * POST /mission/graphs/:graph_id/nodes/:node_id/status
 * Body: { status }
 *
 * 更新节点状态（含 DAG 合法性校验 + 状态跳转校验）
 */
function handleUpdateNodeStatus(req, res) {
  var graphId = req.params.graph_id;
  var nodeId = req.params.node_id;
  var body = req._missionBody || {};
  var newStatus = (body.status || '').trim();

  if (!graphId) {
    return res.status(400).json({ success: false, error: '缺少 graph_id' });
  }
  if (!nodeId) {
    return res.status(400).json({ success: false, error: '缺少 node_id' });
  }
  if (!newStatus) {
    return res.status(400).json({ success: false, error: '缺少必填字段: status' });
  }

  var result = graphEngine.updateNodeStatus(graphId, nodeId, newStatus);

  if (result.success) {
    var graph = graphStore.getGraph(graphId);
    res.json({
      success: true,
      from: result.from,
      to: result.to,
      graph_status: graph ? graph.status : 'unknown',
      timestamp: new Date().toISOString()
    });
  } else {
    // 非法跳转 → 409
    var statusCode = result.error.indexOf('非法状态跳转') !== -1 ? 409 : 400;
    res.status(statusCode).json({
      success: false,
      error: result.error,
      from: result.from || null,
      to: result.to || null,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * GET /mission/graphs/:graph_id/ready
 * 获取所有就绪节点
 */
function handleGetReadyNodes(req, res) {
  var graphId = req.params.graph_id;

  if (!graphId) {
    return res.status(400).json({ success: false, error: '缺少 graph_id' });
  }

  var graph = graphStore.getGraph(graphId);
  if (!graph) {
    return res.status(404).json({
      success: false,
      error: 'Graph 不存在: ' + graphId,
      timestamp: new Date().toISOString()
    });
  }

  var readyNodes = graphEngine.getReadyNodes(graph);

  res.json({
    success: true,
    graph_id: graphId,
    ready_nodes: readyNodes,
    ready_count: readyNodes.length,
    timestamp: new Date().toISOString()
  });
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
  // P10.3 + P10.4: body parser for artifact and capability endpoints
  app.use('/mission/', function(req, res, next) {
    if (req.method === 'POST' && (req.path.includes('/artifacts') || req.path.includes('/capability') || req.path.includes('/graphs'))) {
      return parseMissionBody(req, res, next);
    }
    next();
  });

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

  // ─── P10.3 Artifact Routes ─────────────────────────
  // GET  /mission/:id/artifacts
  app.get('/mission/:id/artifacts', handleListArtifacts);

  // GET  /mission/:id/artifacts/:filename
  // NOTE: must be registered BEFORE POST /mission/:id/artifacts
  // because Express matches routes in order
  app.get('/mission/:id/artifacts/:filename', handleGetArtifact);

  // POST /mission/:id/artifacts
  app.post('/mission/:id/artifacts', handleSaveArtifact);

  // ─── P10.4 Capability Routes ───────────────────────
  // POST /mission/capability/check
  app.post('/mission/capability/check', handleCapabilityCheck);

  // GET  /mission/capability/agents/:agent
  app.get('/mission/capability/agents/:agent', handleGetAgent);

  // GET  /mission/capability/agents
  app.get('/mission/capability/agents', handleListAgents);

  // ─── P10.5 Task Graph Routes ────────────────────────
  // POST /mission/graphs
  app.post('/mission/graphs', handleCreateGraph);

  // GET  /mission/graphs/:graph_id/ready
  // NOTE: must be registered BEFORE /mission/graphs/:graph_id
  app.get('/mission/graphs/:graph_id/ready', handleGetReadyNodes);

  // POST /mission/graphs/:graph_id/run-step
  app.post('/mission/graphs/:graph_id/run-step', handleRunGraphStep);

  // POST /mission/graphs/:graph_id/nodes/:node_id/status
  app.post('/mission/graphs/:graph_id/nodes/:node_id/status', handleUpdateNodeStatus);

  // ─── P10.8 Autonomous Loop Routes ──────────────────
  // MUST be registered BEFORE GET /mission/graphs/:graph_id
  var autonomousLoop = require('./autonomous-loop');
  autonomousLoop.registerAutonomousLoopRoutes(app);

  // GET  /mission/graphs/:graph_id
  app.get('/mission/graphs/:graph_id', handleGetGraph);

  // ─── P10.7 Agent Heartbeat Routes ────────────────────
  var heartbeatRoutes = require('./agent-heartbeat-routes');
  heartbeatRoutes.registerAgentHeartbeatRoutes(app);
}

module.exports = {
  registerMissionRoutes: registerMissionRoutes,
  // 导出 handlers 供测试
  _handleListMissionTasks: handleListMissionTasks,
  _handleGetTaskEvents: handleGetTaskEvents,
  _handleCreateAgentEvent: handleCreateAgentEvent,
  _handleTransitionTask: handleTransitionTask,
  _handleRecovery: handleRecovery,
  _handleListArtifacts: handleListArtifacts,
  _handleSaveArtifact: handleSaveArtifact,
  _handleGetArtifact: handleGetArtifact,
  _handleCapabilityCheck: handleCapabilityCheck,
  _handleListAgents: handleListAgents,
  _handleGetAgent: handleGetAgent,
  // P10.5
  _handleCreateGraph: handleCreateGraph,
  _handleGetGraph: handleGetGraph,
  _handleRunGraphStep: handleRunGraphStep,
  _handleUpdateNodeStatus: handleUpdateNodeStatus,
  _handleGetReadyNodes: handleGetReadyNodes,
};
