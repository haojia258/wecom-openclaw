'use strict';

/**
 * autonomous-loop-engine.js - P10.8 自治执行闭环引擎
 *
 * 职责:
 *   - runAutonomousLoop(graphId, options) - 自治循环主入口
 *   - runAutonomousNode(graphId, nodeId, options) - 单节点自治执行
 *   - 集成: policy check, heartbeat check, capability dispatch, recovery
 *
 * 流程:
 *   load graph → validate → get ready nodes
 *   → policy check → heartbeat check → run node
 *   → write artifact → handle failure → repeat
 *
 * 依赖:
 *   - task-graph-store (P10.5)
 *   - task-graph-engine (P10.5)
 *   - autonomous-loop-policy (P10.8)
 *   - autonomous-loop-report (P10.8)
 *   - capability-registry (P10.4)
 *   - agent-heartbeat-store (P10.7)
 *   - recovery-engine (P10.2)
 *   - artifact-store (P10.3)
 *   - mission-store (P10.0)
 */

var graphStore = require('./task-graph-store');
var graphEngine = require('./task-graph-engine');
var loopPolicy = require('./autonomous-loop-policy');
var loopReport = require('./autonomous-loop-report');
var capabilityRegistry = require('../agent-governance/capability-registry');
var heartbeatStore = require('./agent-heartbeat-store');
var recoveryEngine = require('./recovery-engine');
var artifactStore = require('../artifacts/artifact-store');
var missionStore = require('./mission-store');

// ─── 常量 ──────────────────────────────────────────────────

var DEFAULT_MAX_STEPS = 50;

// ─── 辅助 ──────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

/**
 * 写入 agent_events
 */
function _writeAgentEvent(missionId, eventType, payload) {
  try {
    missionStore.createAgentEvent({
      mission_task_id: missionId,
      event_type: eventType,
      stage: 'autonomous_loop',
      payload: payload || null
    });
  } catch (e) {
    // ignore - event write should not block
  }
}

/**
 * 写入 graph event
 */
function _writeGraphEvent(graphId, eventType, nodeId, detail) {
  try {
    graphStore.addGraphEvent(graphId, {
      type: eventType,
      node_id: nodeId || null,
      detail: detail || null
    });
  } catch (e) {
    // ignore
  }
}

// ═══════════════════════════════════════════════════════════
// 1. runAutonomousLoop(graphId, options)
// ═══════════════════════════════════════════════════════════

/**
 * 自治循环主入口
 *
 * @param {string} graphId
 * @param {object} [options]
 *   @prop {number} [maxSteps=50] - 最大步数防止死循环
 *   @prop {boolean} [verbose=false]
 * @returns {{ success: boolean, status?: string, steps?: Array, loop_events?: Array, error?: string }}
 */
function runAutonomousLoop(graphId, options) {
  var opts = options || {};
  var maxSteps = (typeof opts.maxSteps === 'number' && opts.maxSteps > 0) ? opts.maxSteps : DEFAULT_MAX_STEPS;
  var verbose = opts.verbose === true;

  if (!graphId || typeof graphId !== 'string' || graphId.trim() === '') {
    return { success: false, error: '缺少必填参数: graphId' };
  }

  // 1. Load graph
  var graph = graphStore.getGraph(graphId);
  if (!graph) {
    return { success: false, error: 'Graph 不存在: ' + graphId };
  }

  // 2. Validate graph structure (skip capability checks — handled by policy at runtime)
  var structValidation = _validateGraphStructure(graph);
  if (!structValidation.valid) {
    return {
      success: false,
      error: 'Graph validation failed: ' + (structValidation.errors || []).join(', '),
      validation_errors: structValidation.errors
    };
  }

  // 3. Check if graph is already terminal
  if (graph.status === 'completed' || graph.status === 'failed') {
    return {
      success: true,
      status: graph.status,
      steps: [],
      loop_events: [],
      graph: graph,
      message: 'Graph is already in terminal state: ' + graph.status
    };
  }

  // 4. Set graph to running
  if (graph.status !== 'running') {
    graphStore.updateGraph(graphId, { status: 'running' });
    _writeGraphEvent(graphId, 'GRAPH_STATUS_CHANGED', null, { from: graph.status, to: 'running' });
    _writeAgentEvent(graph.mission_id, 'LOOP_STARTED', {
      graph_id: graphId,
      initial_status: graph.status
    });
  }

  // 5. Main loop
  var steps = [];
  var loopEvents = [];
  var stepCount = 0;

  while (stepCount < maxSteps) {
    stepCount++;

    // Reload graph
    graph = graphStore.getGraph(graphId);
    if (!graph) break;

    // Check terminal states
    if (graph.status === 'completed' || graph.status === 'failed') {
      break;
    }

    // Get ready nodes
    var readyNodes = graphEngine.getReadyNodes(graph);

    if (readyNodes.length === 0) {
      // Check if truly completed or just blocked
      var allDone = _checkAllNodesDone(graph);
      if (allDone.completed) {
        graphStore.updateGraph(graphId, { status: 'completed' });
        _writeGraphEvent(graphId, 'GRAPH_COMPLETED', null, { completed_nodes: allDone.completedCount });
        _writeAgentEvent(graph.mission_id, 'LOOP_COMPLETED', {
          graph_id: graphId, total_steps: stepCount
        });
        break;
      } else if (allDone.blocked) {
        // blocked nodes with no ready nodes means graph is blocked
        if (graph.status !== 'blocked') {
          graphStore.updateGraph(graphId, { status: 'blocked' });
          _writeGraphEvent(graphId, 'GRAPH_BLOCKED', null, {
            blocked_nodes: allDone.blockedNodes,
            failed_nodes: allDone.failedNodes
          });
          _writeAgentEvent(graph.mission_id, 'LOOP_BLOCKED', {
            graph_id: graphId, reason: 'All remaining nodes are blocked'
          });
        }
        break;
      } else {
        // pending but none ready → blocked
        if (graph.status !== 'blocked') {
          graphStore.updateGraph(graphId, { status: 'blocked' });
          _writeGraphEvent(graphId, 'GRAPH_BLOCKED', null, {
            reason: 'No ready nodes but pending nodes exist - possible dependency cycle'
          });
        }
        break;
      }
    }

    // Process each ready node
    var anyNodeProcessed = false;
    for (var i = 0; i < readyNodes.length; i++) {
      var node = readyNodes[i];

      // Pre-check: policy evaluation
      var policyCtx = { graphId: graphId, graph: graph };
      var policyResult = loopPolicy.evaluateAutonomousPolicy(node, policyCtx);

      if (policyResult.result === loopPolicy.POLICY_RESULT_FAILED) {
        // Forbidden → mark node as failed
        graphEngine.updateNodeStatus(graphId, node.id, 'failed', { skipAutoStatus: true });
        _writeGraphEvent(graphId, 'NODE_FAILED', node.id, {
          reason: policyResult.reason,
          details: policyResult.details
        });

        // Write dispatch artifact for failed (forbidden) nodes
        try {
          loopReport.saveDispatchArtifact(graph.mission_id, {
            graph_id: graphId,
            node_id: node.id,
            agent: node.agent,
            capability: node.capability,
            policy_result: policyResult.result,
            reason: policyResult.reason,
            details: policyResult.details,
            timestamp: now()
          });
        } catch (e) { /* ignore */ }

        loopEvents.push({
          step: stepCount,
          node_id: node.id,
          action: 'blocked_forbidden',
          reason: policyResult.reason,
          timestamp: now()
        });
        anyNodeProcessed = true;
        continue;
      }

      if (policyResult.result === loopPolicy.POLICY_RESULT_BLOCKED) {
        // Blocked → mark node as blocked
        graphEngine.updateNodeStatus(graphId, node.id, 'blocked', { skipAutoStatus: true });
        _writeGraphEvent(graphId, 'NODE_BLOCKED', node.id, {
          reason: policyResult.reason,
          details: policyResult.details
        });

        // Write dispatch artifact for blocked nodes
        try {
          loopReport.saveDispatchArtifact(graph.mission_id, {
            graph_id: graphId,
            node_id: node.id,
            agent: node.agent,
            capability: node.capability,
            policy_result: policyResult.result,
            reason: policyResult.reason,
            details: policyResult.details,
            timestamp: now()
          });
        } catch (e) { /* ignore */ }

        loopEvents.push({
          step: stepCount,
          node_id: node.id,
          action: 'blocked',
          reason: policyResult.reason,
          timestamp: now()
        });
        anyNodeProcessed = true;
        continue;
      }

  // Allowed or Warning → execute node
  try {
    // Transition through proper states: pending → ready → running
    graphEngine.updateNodeStatus(graphId, node.id, 'ready', { skipAutoStatus: true });
    graphEngine.updateNodeStatus(graphId, node.id, 'running', { skipAutoStatus: true });
    _writeGraphEvent(graphId, 'NODE_RUNNING', node.id, { agent: node.agent, capability: node.capability });

    var execResult = _executeNode(graphId, node, graph, policyResult, loopEvents, stepCount, verbose);
    anyNodeProcessed = true;

        if (!execResult.success) {
          steps.push({
            step: stepCount,
            node_id: node.id,
            action: 'failed',
            reason: execResult.error,
            timestamp: now()
          });
          // Node failure → attempt recovery
          var recoveryResult = _attemptRecovery(graph, node, execResult.error);
          if (!recoveryResult.success) {
            // Recovery failed, check if we should continue
            graph = graphStore.getGraph(graphId);
            if (graph && graph.status === 'failed') {
              break; // graph is now failed, exit loop
            }
          }
        } else {
          steps.push({
            step: stepCount,
            node_id: node.id,
            action: 'executed',
            policy: policyResult.result,
            timestamp: now()
          });
        }
      } catch (execErr) {
        // Unexpected execution error
        steps.push({
          step: stepCount,
          node_id: node.id,
          action: 'error',
          reason: execErr.message,
          timestamp: now()
        });
      }
    }

    if (!anyNodeProcessed) {
      break;
    }

    // Check terminal again
    graph = graphStore.getGraph(graphId);
    if (!graph || graph.status === 'completed' || graph.status === 'failed') {
      break;
    }
  }

  // 6. Check for max steps exceeded
  if (stepCount >= maxSteps && graph) {
    var currentStatus = graph.status;
    if (currentStatus !== 'completed' && currentStatus !== 'failed') {
      loopEvents.push({
        step: stepCount,
        node_id: null,
        action: 'max_steps_reached',
        reason: 'Max steps (' + maxSteps + ') exceeded - loop aborted to prevent infinite execution',
        timestamp: now()
      });
    }
  }

  // 7. Final graph state
  graph = graphStore.getGraph(graphId);

  // 8. Write loop report
  loopReport.generateLoopReport(graphId);

  // 9. Write loop events
  loopReport.saveLoopEvents(graphId, loopEvents);

  _writeAgentEvent(graph ? graph.mission_id : 'unknown', 'LOOP_FINISHED', {
    graph_id: graphId,
    total_steps: steps.length,
    status: graph ? graph.status : 'unknown'
  });

  return {
    success: true,
    status: graph ? graph.status : 'unknown',
    steps: steps,
    loop_events: loopEvents,
    graph: graph,
    total_steps: steps.length
  };
}

// ═══════════════════════════════════════════════════════════
// 2. runAutonomousNode(graphId, nodeId, options)
// ═══════════════════════════════════════════════════════════

/**
 * 单节点自治执行
 *
 * @param {string} graphId
 * @param {string} nodeId
 * @param {object} [options]
 * @returns {{ success: boolean, node?: object, policy?: object, error?: string }}
 */
function runAutonomousNode(graphId, nodeId, options) {
  var opts = options || {};

  if (!graphId || typeof graphId !== 'string') {
    return { success: false, error: '缺少必填参数: graphId' };
  }
  if (!nodeId || typeof nodeId !== 'string') {
    return { success: false, error: '缺少必填参数: nodeId' };
  }

  // 1. Load graph
  var graph = graphStore.getGraph(graphId);
  if (!graph) {
    return { success: false, error: 'Graph 不存在: ' + graphId };
  }

  // 2. Find node
  var node = null;
  var nodes = graph.nodes || [];
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].id === nodeId) {
      node = nodes[i];
      break;
    }
  }

  if (!node) {
    return { success: false, error: 'Node 不存在: ' + nodeId };
  }

  // 3. Capability check
  if (node.agent && node.capability) {
    var dispatchResult = capabilityRegistry.validateDispatch(node.agent, node.capability);
    if (!dispatchResult.allowed) {
      // Write dispatch artifact
      _writeDispatchBlock(graph.mission_id, graphId, node, dispatchResult);

      return {
        success: false,
        error: 'Forbidden capability: ' + dispatchResult.reason,
        dispatch: dispatchResult,
        blocked: true
      };
    }
    if (dispatchResult.requiresApproval) {
      _writeDispatchBlock(graph.mission_id, graphId, node, dispatchResult);

      return {
        success: false,
        error: 'Requires approval: ' + dispatchResult.reason,
        dispatch: dispatchResult,
        blocked: true,
        requiresApproval: true
      };
    }
  }

  // 4. Heartbeat check
  if (node.agent) {
    var health = heartbeatStore.getAgentHealth(node.agent);

    if (health.success && health.health && health.health.status === 'offline') {
      return {
        success: false,
        error: 'Agent is offline: ' + node.agent,
        blocked: true,
        agent_health: health.health
      };
    }

    if (!health.success) {
      return {
        success: false,
        error: 'Agent not found: ' + node.agent,
        blocked: true
      };
    }
  }

  // 5. Policy check
  var policyCtx = { graphId: graphId, graph: graph };
  var policyResult = loopPolicy.evaluateAutonomousPolicy(node, policyCtx);

  if (policyResult.result === loopPolicy.POLICY_RESULT_FAILED) {
    // Forbidden → don't execute
    _writeDispatchBlock(graph.mission_id, graphId, node, {
      allowed: false,
      reason: policyResult.reason
    });
    return {
      success: false,
      error: policyResult.reason,
      blocked: true,
      policy: policyResult
    };
  }

  if (policyResult.result === loopPolicy.POLICY_RESULT_BLOCKED) {
    // Blocked → don't execute
    _writeDispatchBlock(graph.mission_id, graphId, node, {
      requiresApproval: true,
      reason: policyResult.reason
    });
    return {
      success: false,
      error: policyResult.reason,
      blocked: true,
      requiresApproval: true,
      policy: policyResult
    };
  }

  // 6. Check node status transitions
  if (node.status !== 'pending' && node.status !== 'ready' && node.status !== 'failed') {
    return {
      success: false,
      error: 'Cannot execute node in status: ' + node.status,
      node_status: node.status
    };
  }

  // 7. Node status transition: pending → ready → running
  graphEngine.updateNodeStatus(graphId, nodeId, 'ready', { skipAutoStatus: true });
  graphEngine.updateNodeStatus(graphId, nodeId, 'running', { skipAutoStatus: true });
  _writeGraphEvent(graphId, 'NODE_RUNNING', nodeId, {
    agent: node.agent,
    capability: node.capability,
    skill: node.skill
  });
  _writeAgentEvent(graph.mission_id, 'NODE_EXECUTION_STARTED', {
    graph_id: graphId,
    node_id: nodeId,
    agent: node.agent,
    capability: node.capability
  });

  // 8. Execute node
  var execResult = _executeNode(graphId, node, graph, policyResult, [], 0, opts.verbose === true);

  if (execResult.success) {
    // 9. Write artifact
    _writeArtifactForNode(graph, node, execResult);

    return {
      success: true,
      node: graphStore.getGraph(graphId),
      policy: policyResult,
      execution: execResult
    };
  } else {
    // Failure: attempt recovery
    _attemptRecovery(graph, node, execResult.error);

    return {
      success: false,
      error: execResult.error,
      execution: execResult
    };
  }
}

// ═══════════════════════════════════════════════════════════
// Internal Functions
// ═══════════════════════════════════════════════════════════

/**
 * 执行单个节点
 */
function _executeNode(graphId, node, graph, policyResult, loopEvents, stepCount, verbose) {
  // Simulate node execution based on node type
  var nodeType = node.type || 'skill';

  if (nodeType === 'noop' || nodeType === 'pass') {
    // No-op nodes pass through
    graphEngine.updateNodeStatus(graphId, node.id, 'completed', { skipAutoStatus: true });
    _writeGraphEvent(graphId, 'NODE_COMPLETED', node.id, {
      agent: node.agent,
      capability: node.capability,
      skill: node.skill
    });
    _writeAgentEvent(graph.mission_id, 'NODE_EXECUTION_COMPLETED', {
      graph_id: graphId,
      node_id: node.id,
      agent: node.agent
    });
    return { success: true, node_id: node.id, type: nodeType };
  }

  if (nodeType === 'fail' || nodeType === 'error_test') {
    // Test nodes that always fail
    var failMsg = 'Simulated node failure for testing';
    graphEngine.updateNodeStatus(graphId, node.id, 'failed', { skipAutoStatus: true });
    _writeGraphEvent(graphId, 'NODE_FAILED', node.id, {
      reason: failMsg,
      agent: node.agent,
      capability: node.capability
    });
    _writeAgentEvent(graph.mission_id, 'NODE_EXECUTION_FAILED', {
      graph_id: graphId,
      node_id: node.id,
      error: failMsg
    });

    loopEvents.push({
      step: stepCount,
      node_id: node.id,
      action: 'failed',
      reason: failMsg,
      timestamp: now()
    });

    return { success: false, error: failMsg, node_id: node.id, type: nodeType };
  }

  // Standard execution: mark as completed
  graphEngine.updateNodeStatus(graphId, node.id, 'completed', { skipAutoStatus: true });
  _writeGraphEvent(graphId, 'NODE_COMPLETED', node.id, {
    agent: node.agent,
    capability: node.capability,
    skill: node.skill
  });
  _writeAgentEvent(graph.mission_id, 'NODE_EXECUTION_COMPLETED', {
    graph_id: graphId,
    node_id: node.id,
    agent: node.agent,
    capability: node.capability
  });

  loopEvents.push({
    step: stepCount,
    node_id: node.id,
    action: 'completed',
    policy: policyResult.result,
    timestamp: now()
  });

  return { success: true, node_id: node.id, type: nodeType };
}

/**
 * 写入节点 artifact
 */
function _writeArtifactForNode(graph, node, execResult) {
  try {
    artifactStore.saveArtifact({
      mission_id: graph.mission_id,
      filename: 'node-' + node.id + '-artifact.json',
      agent: node.agent || 'autonomous-loop',
      content: JSON.stringify({
        graph_id: graph.graph_id,
        node_id: node.id,
        agent: node.agent,
        capability: node.capability,
        skill: node.skill,
        execution_result: execResult,
        timestamp: now()
      }, null, 2)
    });
  } catch (e) {
    // artifact 写入失败不阻断
  }
}

/**
 * 尝试恢复失败节点
 * 注意: 恢复日志同步写入，确保测试和调用方可即时读取
 */
function _attemptRecovery(graph, node, errorMessage) {
  // 同步写入 recovery log（确保测试可验证）
  try {
    loopReport.saveRecoveryLog(graph.mission_id, {
      graph_id: graph.graph_id,
      node_id: node.id,
      error: errorMessage,
      timestamp: now()
    });
  } catch (e2) { /* ignore */ }

  // 异步调用下游恢复引擎
  try {
    var task = {
      id: graph.mission_id,
      task_id: graph.mission_id,
      status: 'running',
      stage: 'task_graph',
      current_stage: 'task_graph',
      retry_count: 0,
      max_retries: 3
    };

    var failureEvent = {
      event_type: 'FAILED',
      error_message: errorMessage || 'Autonomous node execution failed',
      exit_code: 1
    };

    // Fire-and-forget: 不阻塞主循环
    recoveryEngine.handleFailure(task, failureEvent).then(function(recoveryResult) {
      // 更新 recovery log 追加恢复结果
      if (recoveryResult) {
        try {
          loopReport.saveRecoveryLog(graph.mission_id, {
            graph_id: graph.graph_id,
            node_id: node.id,
            error: errorMessage,
            recovery_result: recoveryResult,
            timestamp: now()
          });
        } catch (e) { /* ignore */ }
      }
      return recoveryResult;
    }).catch(function(e) {
      try {
        loopReport.saveRecoveryLog(graph.mission_id, {
          graph_id: graph.graph_id,
          node_id: node.id,
          error: errorMessage,
          recovery_error: e.message,
          timestamp: now()
        });
      } catch (e2) { /* ignore */ }
    });

    return { success: true, recovery_scheduled: true };
  } catch (e) {
    // 同步异常
    try {
      loopReport.saveRecoveryLog(graph.mission_id, {
        graph_id: graph.graph_id,
        node_id: node.id,
        error: errorMessage,
        recovery_error: e.message,
        timestamp: now()
      });
    } catch (e2) { /* ignore */ }
    return { success: false, error: e.message };
  }
}

/**
 * 写入 dispatch 阻断记录
 */
function _writeDispatchBlock(missionId, graphId, node, dispatchResult) {
  try {
    loopReport.saveDispatchArtifact(missionId, {
      graph_id: graphId,
      node_id: node.id,
      agent: node.agent,
      capability: node.capability,
      allowed: dispatchResult.allowed !== undefined ? dispatchResult.allowed : false,
      requiresApproval: dispatchResult.requiresApproval || false,
      reason: dispatchResult.reason || 'Blocked by policy',
      timestamp: now()
    });
  } catch (e) { /* ignore */ }
}

/**
 * 检查所有节点是否完成/阻塞
 */
function _checkAllNodesDone(graph) {
  var nodes = graph.nodes || [];
  var completedCount = 0;
  var failedCount = 0;
  var blockedCount = 0;
  var blockedNodes = [];
  var failedNodes = [];

  for (var i = 0; i < nodes.length; i++) {
    var s = nodes[i].status || 'pending';
    if (s === 'completed') completedCount++;
    else if (s === 'failed') { failedCount++; failedNodes.push(nodes[i].id); }
    else if (s === 'blocked') { blockedCount++; blockedNodes.push(nodes[i].id); }
  }

  var total = nodes.length;
  var completed = completedCount + failedCount + blockedCount >= total;
  var blocked = !completed && failedCount + blockedCount > 0;

  return {
    completed: completed,
    blocked: blocked,
    completedCount: completedCount,
    failedCount: failedCount,
    blockedCount: blockedCount,
    failedNodes: failedNodes,
    blockedNodes: blockedNodes
  };
}

/**
 * 轻量级 graph 结构校验（不检查 capability forbid，由运行时 policy engine 处理）
 */
function _validateGraphStructure(graph) {
  var errors = [];

  if (!graph) {
    return { valid: false, errors: ['graph 为空'] };
  }

  // graph_id 必填
  if (!graph.graph_id || typeof graph.graph_id !== 'string' || graph.graph_id.trim() === '') {
    errors.push('graph_id 必填');
  }

  // mission_id 必填
  if (!graph.mission_id || typeof graph.mission_id !== 'string' || graph.mission_id.trim() === '') {
    errors.push('mission_id 必填');
  }

  // nodes 非空
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    errors.push('nodes 必须是非空数组');
    return { valid: false, errors: errors };
  }

  // node.id 唯一性
  var nodeIds = {};
  var nodeMap = {};
  for (var i = 0; i < graph.nodes.length; i++) {
    var node = graph.nodes[i];
    if (!node.id || typeof node.id !== 'string') {
      errors.push('节点 ' + i + ' 缺少 id');
    } else if (nodeIds[node.id]) {
      errors.push('节点 id 重复: ' + node.id);
    } else {
      nodeIds[node.id] = true;
      nodeMap[node.id] = node;
    }
  }

  // 验证依赖引用有效性和环路检测（简单的 DAG 检测）
  for (var j = 0; j < graph.nodes.length; j++) {
    var nd = graph.nodes[j];
    if (Array.isArray(nd.dependsOn) || Array.isArray(nd.depends_on)) {
      var deps = nd.dependsOn || nd.depends_on || [];
      for (var k = 0; k < deps.length; k++) {
        if (!nodeIds[deps[k]]) {
          errors.push('节点 [' + nd.id + '] 引用了不存在的依赖: ' + deps[k]);
        }
      }
    }
  }

  // 简单环路检测: 检查自依赖
  for (var m = 0; m < graph.nodes.length; m++) {
    var nd2 = graph.nodes[m];
    var deps2 = nd2.dependsOn || nd2.depends_on || [];
    if (deps2.indexOf(nd2.id) !== -1) {
      errors.push('节点 [' + nd2.id + '] 不能依赖自身');
    }
  }

  return { valid: errors.length === 0, errors: errors };
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  runAutonomousLoop: runAutonomousLoop,
  runAutonomousNode: runAutonomousNode,

  // 内部导出供测试
  _executeNode: _executeNode,
  _checkAllNodesDone: _checkAllNodesDone,
  _validateGraphStructure: _validateGraphStructure,
  _writeAgentEvent: _writeAgentEvent,
  _writeGraphEvent: _writeGraphEvent,
  DEFAULT_MAX_STEPS: DEFAULT_MAX_STEPS
};
