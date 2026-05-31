'use strict';

/**
 * commander-gateway.js - P11.0 Commander Gateway
 *
 * 职责: 接收任务请求，创建 Mission，完整流程编排
 *
 * API:
 *   POST /commander/mission                     → 创建 mission
 *   GET  /commander/mission/:mission_id/status  → 查询状态
 *   POST /commander/mission/:mission_id/approve → 审批
 *   GET  /commander/mission/:mission_id/artifacts → 获取 artifacts
 *
 * 流程:
 *   request → route → create mission → generate graph
 *   → capability check → heartbeat check → autonomous loop
 *   → artifacts → report
 */

var missionRouter = require('./mission-router');
var commanderReport = require('./commander-report');
var missionStore = require('../mission/mission-store');
var graphStore = require('../mission/task-graph-store');
var graphEngine = require('../mission/task-graph-engine');
var graphRunner = require('../mission/task-graph-runner');
var autonomousEngine = require('../mission/autonomous-loop-engine');
var autonomousReport = require('../mission/autonomous-loop-report');
var capabilityRegistry = require('../agent-governance/capability-registry');
var heartbeatStore = require('../mission/agent-heartbeat-store');
var artifactStore = require('../artifacts/artifact-store');
var workbuddyJobStore = require('../execution/workbuddy-job-store');

// ─── 计数器 ───────────────────────────────────────────────

var missionCounter = 0;

function generateMissionId() {
  missionCounter++;
  return 'cmd_' + Date.now().toString(36) + '_' + missionCounter;
}

function generateGraphId(missionId) {
  return 'graph_' + missionId;
}

// ─── 辅助 ──────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

function validateMissionId(id) {
  if (!id || typeof id !== 'string') return false;
  if (id.length > 128) return false;
  // 只允许 alphanumeric + _ + -
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function validateOperator(op) {
  if (!op || typeof op !== 'string') return false;
  if (op.length > 64) return false;
  return /^[a-zA-Z0-9_\u4e00-\u9fff-]+$/.test(op);
}

// ─── POST /commander/mission ──────────────────────────────

/**
 * 创建 Commander Mission
 *
 * Body: { source, text, operator, room?, autoRun? }
 */
function handleCreateMission(req, res) {
  var body = req._commanderBody || {};

  // 验证必填字段
  var text = (body.text || '').trim();
  var operator = (body.operator || '').trim();

  if (!text) {
    return res.status(400).json({
      success: false,
      error: '缺少必填字段: text'
    });
  }
  if (!operator) {
    return res.status(400).json({
      success: false,
      error: '缺少必填字段: operator'
    });
  }
  if (!validateOperator(operator)) {
    return res.status(400).json({
      success: false,
      error: 'operator 包含非法字符'
    });
  }
  if (text.length > 2000) {
    return res.status(400).json({
      success: false,
      error: 'text 超过 2000 字符限制'
    });
  }

  try {
    // Step 1: 路由
    var routeResult = missionRouter.route(text, {
      source: (body.source || 'commander').trim(),
      operator: operator,
      room: (body.room || '').trim()
    });

    if (!routeResult.success) {
      return res.status(400).json({
        success: false,
        error: routeResult.error
      });
    }

    // Step 2: 生成 ID
    var missionId = generateMissionId();
    var graphId = generateGraphId(missionId);

    // Step 3: 创建 Mission Task（复用 P10.0 mission-store）
    var missionTask = null;
    try {
      missionTask = missionStore.createMissionTask({
        id: missionId,
        source: routeResult.mission.source,
        text: routeResult.mission.text,
        operator: routeResult.mission.operator,
        status: 'created',
        mission_type: routeResult.mission.mission_type,
        tags: routeResult.mission.tags
      });
    } catch (e) {
      // mission-store 可能不支持直接创建
      missionTask = {
        id: missionId,
        source: routeResult.mission.source,
        text: routeResult.mission.text,
        operator: routeResult.mission.operator,
        status: 'created',
        mission_type: routeResult.mission.mission_type,
        tags: routeResult.mission.tags,
        created_at: now()
      };
    }

    // Step 4: 生成 Task Graph（仅做结构校验，capability 由运行时 policy engine 处理）
    var graphDef = {
      graph_id: graphId,
      mission_id: missionId,
      nodes: routeResult.task_graph.nodes
    };

    // 结构校验（不校验 capability）
    var structValidation = autonomousEngine._validateGraphStructure
      ? autonomousEngine._validateGraphStructure(graphDef)
      : graphEngine.validateGraph(graphDef);

    if (!structValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Graph 结构校验失败',
        graph_errors: structValidation.errors
      });
    }

    // 直接创建 graph（绕过 capability forbid 检查）
    var graph = null;
    try {
      graph = graphStore.createGraph(graphDef);
    } catch (e) {
      // fallback: 手动构造
      graph = {
        graph_id: graphDef.graph_id,
        mission_id: graphDef.mission_id,
        status: 'created',
        nodes: graphDef.nodes.map(function(n) {
          return Object.assign({}, n, { status: 'pending', created_at: now() });
        }),
        created_at: now()
      };
    }

    // Step 5: Capability Check
    var dispatchResults = [];
    var allAllowed = true;
    var requiresApproval = routeResult.approval_requirements.requires_approval;

    if (routeResult.agent_requirements && routeResult.agent_requirements.agents) {
      for (var ai = 0; ai < routeResult.agent_requirements.agents.length; ai++) {
        var ag = routeResult.agent_requirements.agents[ai];
        var capResult = capabilityRegistry.validateDispatch(ag.agent, ag.capability);
        dispatchResults.push({
          agent: ag.agent,
          capability: ag.capability,
          allowed: capResult.allowed,
          requiresApproval: capResult.requiresApproval,
          reason: capResult.reason
        });
        if (!capResult.allowed) allAllowed = false;
        if (capResult.requiresApproval) requiresApproval = true;
      }
    }

    // Step 6: Heartbeat Check
    var heartbeatResults = [];
    if (routeResult.agent_requirements && routeResult.agent_requirements.agents) {
      for (var hi = 0; hi < routeResult.agent_requirements.agents.length; hi++) {
        var hAgent = routeResult.agent_requirements.agents[hi];
        var health = heartbeatStore.getAgentHealth(hAgent.agent);
        heartbeatResults.push({
          agent: hAgent.agent,
          status: health.status,
          last_seen: health.last_seen
        });
      }
    }

    // Step 7: 写入 Dispatch Artifact
    commanderReport.writeDispatchReport(missionId, dispatchResults);

    // Step 8: 写入 Commander Report
    commanderReport.writeCommanderReport(missionId, routeResult.mission, graph, null);

    // Step 8.5: 为 WorkBuddy 代理节点创建 WorkBuddy Jobs (P11.2)
    var workbuddyJobs = [];
    if (graph && graph.nodes) {
      for (var gi = 0; gi < graph.nodes.length; gi++) {
        var node = graph.nodes[gi];
        if (node.agent === 'workbuddy') {
          var wbResult = workbuddyJobStore.createWorkBuddyJob({
            mission_id: missionId,
            graph_id: graphId,
            node_id: node.id,
            action: node.capability || 'general.execute',
            agent: 'workbuddy',
            status: requiresApproval ? 'waiting_approval' : 'created',
            requiresApproval: requiresApproval,
            payload: { node: node.id, mission_type: routeResult.mission.mission_type }
          });
          if (wbResult.success) {
            workbuddyJobs.push(wbResult.job);
          }
        }
      }
    }

    // Step 9: 如果需要审批，写入初始审批日志
    if (requiresApproval) {
      commanderReport.writeApprovalLog(missionId, 'pending', {
        operator: operator,
        reason: 'Mission requires approval for: ' +
          routeResult.agent_requirements.agents
            .filter(function(a) {
              return ['deploy.production', 'pm2.restart', 'git.merge', 'server.write', 'devops.manage']
                .indexOf(a.capability) !== -1;
            })
            .map(function(a) { return a.capability; })
            .join(', '),
        capabilities: routeResult.agent_requirements.agents.map(function(a) { return a.capability; }),
        previous_status: 'created'
      });
    }

    // Step 10: 可选自动运行 autonomous loop
    var loopResult = null;
    var autoRun = body.autoRun !== false; // 默认自动运行
    if (autoRun && allAllowed && !requiresApproval) {
      try {
        loopResult = autonomousEngine.runAutonomousLoop(graphId, { maxSteps: 50 });
        // 更新 report
        commanderReport.writeCommanderReport(missionId, routeResult.mission, graph, loopResult);
      } catch (e) {
        // autonomous loop 失败不影响创建流程
        loopResult = { success: false, error: e.message };
      }
    }

    // 响应
    res.status(201).json({
      success: true,
      mission_id: missionId,
      graph_id: graphId,
      mission_type: routeResult.mission.mission_type,
      status: requiresApproval ? 'awaiting_approval' : (loopResult ? loopResult.status : 'created'),
      stage: 'planning',
      capabilities: {
        all_allowed: allAllowed,
        requires_approval: requiresApproval,
        dispatch: dispatchResults,
        heartbeat: heartbeatResults
      },
      loop: loopResult ? {
        status: loopResult.status,
        steps: loopResult.total_steps || 0
      } : null,
      workbuddy_jobs: workbuddyJobs.length > 0 ? workbuddyJobs.map(function(j) {
        return { job_id: j.job_id, action: j.action, status: j.status };
      }) : [],
      timestamp: now()
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: 'Mission 创建失败: ' + e.message,
      timestamp: now()
    });
  }
}

// ─── GET /commander/mission/:mission_id/status ────────────

/**
 * 查询 Commander Mission 状态
 */
function handleMissionStatus(req, res) {
  var missionId = req.params.mission_id;

  if (!validateMissionId(missionId)) {
    return res.status(400).json({
      success: false,
      error: '无效的 mission_id'
    });
  }

  try {
    // 查找 graph
    var graphId = generateGraphId(missionId);
    var graph = graphStore.getGraph(graphId);

    // 查找 mission task
    var task = null;
    try {
      task = missionStore.getMissionTask(missionId);
    } catch (e) {
      task = null;
    }

    // 查找 approval log
    var approvalLog = null;
    var approvalResult = artifactStore.readArtifact(missionId, 'approval-log.json');
    if (approvalResult.success && approvalResult.content) {
      try {
        approvalLog = JSON.parse(approvalResult.content);
      } catch (e) {
        approvalLog = null;
      }
    }

    // 构建 status 摘要
    var mission = {
      source: task ? task.source : 'unknown',
      operator: task ? task.operator : 'unknown',
      room: task ? task.room : '',
      mission_type: task ? task.mission_type : 'unknown',
      text: task ? task.text : ''
    };

    var summary = commanderReport.generateStatusSummary(missionId, mission, graph, approvalLog);

    // 获取 loop report
    var loopReport = null;
    try {
      var lr = autonomousReport.generateLoopReport(graphId);
      if (lr.success) loopReport = lr.report;
    } catch (e) {
      // 忽略
    }

    // 列出 artifacts
    var artifactsList = artifactStore.listArtifacts(missionId);

    res.json({
      success: true,
      mission_id: missionId,
      status: summary,
      graph: graph ? {
        graph_id: graph.graph_id,
        status: graph.status,
        node_count: (graph.nodes || []).length
      } : null,
      loop_report: loopReport,
      approval: approvalLog,
      artifacts: artifactsList.success ? artifactsList.artifacts : [],
      artifact_count: artifactsList.success ? artifactsList.artifacts.length : 0,
      timestamp: now()
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: 'Status 查询失败: ' + e.message,
      timestamp: now()
    });
  }
}

// ─── POST /commander/mission/:mission_id/approve ──────────

/**
 * 审批 Commander Mission
 *
 * Body: { action: "approve"|"reject", reason?, operator? }
 */
function handleApprove(req, res) {
  var missionId = req.params.mission_id;
  var body = req._commanderBody || {};

  if (!validateMissionId(missionId)) {
    return res.status(400).json({
      success: false,
      error: '无效的 mission_id'
    });
  }

  var action = (body.action || '').trim().toLowerCase();
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({
      success: false,
      error: 'action 必须是 approve 或 reject'
    });
  }

  try {
    // 写入审批日志
    var logResult = commanderReport.appendApprovalLog(missionId, action, {
      operator: (body.operator || 'unknown').trim(),
      reason: (body.reason || '').trim(),
      previous_status: 'awaiting_approval'
    });

    if (!logResult.success) {
      return res.status(500).json({
        success: false,
        error: '审批日志写入失败: ' + logResult.error
      });
    }

    // 创建 agent event
    try {
      missionStore.createAgentEvent({
        mission_task_id: missionId,
        event_type: action === 'approve' ? 'APPROVED' : 'REJECTED',
        stage: 'approval',
        payload: {
          operator: body.operator || 'unknown',
          reason: body.reason || '',
          timestamp: now()
        }
      });
    } catch (e) {
      // 忽略 event 写入失败
    }

    // 如果 approve，尝试运行 autonomous loop
    var loopResult = null;
    if (action === 'approve') {
      var graphId = generateGraphId(missionId);
      try {
        loopResult = autonomousEngine.runAutonomousLoop(graphId, { maxSteps: 50 });
      } catch (e) {
        loopResult = { success: false, error: e.message };
      }
    }

    // 更新 dispatch artifact 中的审批状态
    try {
      var dispatchResult = artifactStore.readArtifact(missionId, 'dispatch.json');
      if (dispatchResult.success) {
        var dispatch = JSON.parse(dispatchResult.content);
        dispatch.approval = {
          action: action,
          operator: body.operator || 'unknown',
          reason: body.reason || '',
          timestamp: now()
        };
        commanderReport.safeWriteArtifact(missionId, 'dispatch.json', 'commander', dispatch);
      }
    } catch (e) {
      // 忽略 dispatch 更新失败
    }

    res.json({
      success: true,
      mission_id: missionId,
      action: action,
      approval_log: logResult.log,
      loop_result: loopResult ? {
        status: loopResult.status,
        steps: loopResult.total_steps || 0
      } : null,
      timestamp: now()
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: '审批处理失败: ' + e.message,
      timestamp: now()
    });
  }
}

// ─── GET /commander/mission/:mission_id/artifacts ─────────

/**
 * 获取 Commander Mission 的 artifacts
 */
function handleMissionArtifacts(req, res) {
  var missionId = req.params.mission_id;

  if (!validateMissionId(missionId)) {
    return res.status(400).json({
      success: false,
      error: '无效的 mission_id'
    });
  }

  try {
    var result = artifactStore.listArtifacts(missionId);

    if (result.success) {
      // 读取关键 artifact 内容
      var artifactsContent = {};
      var keyFiles = ['dispatch.json', 'approval-log.json', 'commander-report.json', 'loop-report.json'];
      for (var fi = 0; fi < keyFiles.length; fi++) {
        var fn = keyFiles[fi];
        var artResult = artifactStore.readArtifact(missionId, fn);
        if (artResult.success) {
          try {
            artifactsContent[fn] = JSON.parse(artResult.content);
          } catch (e) {
            artifactsContent[fn] = artResult.content;
          }
        }
      }

      res.json({
        success: true,
        mission_id: missionId,
        artifacts: result.artifacts,
        count: result.artifacts.length,
        content: artifactsContent,
        timestamp: now()
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        timestamp: now()
      });
    }
  } catch (e) {
    res.status(500).json({
      success: false,
      error: 'Artifacts 查询失败: ' + e.message,
      timestamp: now()
    });
  }
}

// ─── Body Parser ──────────────────────────────────────────

var MAX_BODY_SIZE = 16 * 1024;

function parseCommanderBody(req, res, next) {
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
      req._commanderBody = JSON.parse(raw);
    } catch (e) {
      res.status(400).json({ success: false, error: 'JSON 解析失败: ' + e.message });
      return;
    }
    next();
  });

  req.on('error', function() {});
}

// ─── 路由注册 ──────────────────────────────────────────────

/**
 * 在 Express app 上注册 /commander/* 路由
 *
 * @param {object} app - Express app 实例
 */
function registerCommanderRoutes(app) {
  app.use('/commander/', function(req, res, next) {
    if (req.method === 'POST') {
      return parseCommanderBody(req, res, next);
    }
    next();
  });

  // POST /commander/mission
  app.post('/commander/mission', handleCreateMission);

  // GET  /commander/mission/:mission_id/artifacts (必须在 /:mission_id/status 之前)
  app.get('/commander/mission/:mission_id/artifacts', handleMissionArtifacts);

  // GET  /commander/mission/:mission_id/status
  app.get('/commander/mission/:mission_id/status', handleMissionStatus);

  // POST /commander/mission/:mission_id/approve
  app.post('/commander/mission/:mission_id/approve', handleApprove);
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  registerCommanderRoutes: registerCommanderRoutes,
  // 导出 handlers 供测试
  _handleCreateMission: handleCreateMission,
  _handleMissionStatus: handleMissionStatus,
  _handleApprove: handleApprove,
  _handleMissionArtifacts: handleMissionArtifacts
};
