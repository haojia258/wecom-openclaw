'use strict';

/**
 * task-graph-engine.js - P10.5 Task Graph Engine (核心 DAG 引擎)
 *
 * 职责:
 *   - validateGraph(graph) - 全量校验 DAG
 *   - getReadyNodes(graph) - 找就绪节点
 *   - updateNodeStatus(graphId, nodeId, status) - 状态跳转
 *   - runGraphStep(graphId) - 单步推进
 *   - 与 P10.2 recovery engine 集成
 *   - 与 P10.4 capability registry 集成
 *   - 与 P10.3 artifact workspace 集成
 */

var graphStore = require('./task-graph-store');
var capabilityRegistry = require('../agent-governance/capability-registry');
var missionStore = require('./mission-store');
var recoveryEngine = require('./recovery-engine');

// ─── 常量 ──────────────────────────────────────────────────

var GRAPH_STATUSES = ['pending', 'running', 'completed', 'failed', 'blocked'];

var NODE_STATUSES = ['pending', 'ready', 'running', 'completed', 'failed', 'blocked', 'skipped'];

// 合法状态跳转表
var VALID_TRANSITIONS = {
  'pending':   ['ready'],
  'ready':     ['running'],
  'running':   ['completed', 'failed'],
  'failed':    ['pending'],      // retry
  'blocked':   ['pending'],      // unblock → retry
  'completed': [],
  'skipped':   []
};

// ─── 辅助 ──────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

// ═══════════════════════════════════════════════════════════
// 1. validateGraph(graph)
// ═══════════════════════════════════════════════════════════

/**
 * 全量校验 task graph
 *
 * @param {object} graph
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
function validateGraph(graph) {
  var errors = [];

  if (!graph) {
    return { valid: false, errors: ['graph 为空'] };
  }

  // 1. graph_id 必填
  if (!graph.graph_id || typeof graph.graph_id !== 'string' || graph.graph_id.trim() === '') {
    errors.push('graph_id 必填');
  }

  // 2. mission_id 必填
  if (!graph.mission_id || typeof graph.mission_id !== 'string' || graph.mission_id.trim() === '') {
    errors.push('mission_id 必填');
  }

  // 3. nodes 非空
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    errors.push('nodes 必须是非空数组');
    return { valid: false, errors: errors };
  }

  // 4. node.id 唯一性
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

  // 5. dependsOn 指向存在 node
  for (var j = 0; j < graph.nodes.length; j++) {
    var n = graph.nodes[j];
    if (Array.isArray(n.dependsOn)) {
      for (var k = 0; k < n.dependsOn.length; k++) {
        var dep = n.dependsOn[k];
        if (!nodeMap[dep]) {
          errors.push('节点 [' + n.id + '] 的 dependsOn 指向不存在的节点: ' + dep);
        }
      }
    }
  }

  // 6. 不允许循环依赖
  if (errors.length === 0) {
    var cycleError = _detectCycle(graph.nodes, nodeMap);
    if (cycleError) {
      errors.push(cycleError);
    }
  }

  // 7. capability 必须可由 agent 执行
  for (var m = 0; m < graph.nodes.length; m++) {
    var nd = graph.nodes[m];
    if (nd.agent && nd.capability) {
      if (!capabilityRegistry.canAgentPerform(nd.agent, nd.capability)) {
        errors.push('Agent [' + nd.agent + '] 不能执行能力 [' + nd.capability + '] (节点: ' + nd.id + ')');
      }
    }
  }

  // 8. forbidden capability 必须阻断
  for (var p = 0; p < graph.nodes.length; p++) {
    var nd2 = graph.nodes[p];
    if (nd2.agent && nd2.capability) {
      if (capabilityRegistry.isForbidden(nd2.agent, nd2.capability)) {
        errors.push('节点 [' + nd2.id + '] 的能力 [' + nd2.capability + '] 被 Agent [' + nd2.agent + '] 禁止');
      }
    }
  }

  // 9. 不允许路径穿越 artifact 文件名
  for (var q = 0; q < graph.nodes.length; q++) {
    var nd3 = graph.nodes[q];
    if (nd3.artifact_file) {
      var fn = nd3.artifact_file;
      if (fn.includes('..') || fn.includes('/') || fn.includes('\\')) {
        errors.push('节点 [' + nd3.id + '] 的 artifact_file 包含路径穿越: ' + fn);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * 循环依赖检测 (DFS)
 * @param {Array} nodes
 * @param {object} nodeMap
 * @returns {string|null} 错误消息或 null
 */
function _detectCycle(nodes, nodeMap) {
  var WHITE = 0, GRAY = 1, BLACK = 2;
  var color = {};
  var ids = Object.keys(nodeMap);
  for (var i = 0; i < ids.length; i++) {
    color[ids[i]] = WHITE;
  }

  function dfs(nodeId, path) {
    color[nodeId] = GRAY;
    var node = nodeMap[nodeId];
    var deps = node.dependsOn || [];
    for (var j = 0; j < deps.length; j++) {
      var dep = deps[j];
      if (color[dep] === GRAY) {
        var cyclePath = path.concat([dep]).join(' → ');
        return '检测到循环依赖: ' + cyclePath;
      }
      if (color[dep] === WHITE) {
        var result = dfs(dep, path.concat([dep]));
        if (result) return result;
      }
    }
    color[nodeId] = BLACK;
    return null;
  }

  for (var k = 0; k < ids.length; k++) {
    if (color[ids[k]] === WHITE) {
      var result = dfs(ids[k], [ids[k]]);
      if (result) return result;
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════
// 2. getReadyNodes(graph)
// ═══════════════════════════════════════════════════════════

/**
 * 获取所有 ready 节点 (pending 且所有依赖已 completed)
 *
 * @param {object} graph
 * @returns {Array<object>}
 */
function getReadyNodes(graph) {
  if (!graph || !Array.isArray(graph.nodes)) return [];

  var nodeMap = {};
  for (var i = 0; i < graph.nodes.length; i++) {
    nodeMap[graph.nodes[i].id] = graph.nodes[i];
  }

  var ready = [];
  for (var j = 0; j < graph.nodes.length; j++) {
    var node = graph.nodes[j];

    // 只检查 pending 节点
    if (node.status !== 'pending') continue;

    // 检查所有依赖是否已完成
    var deps = node.dependsOn || [];
    var allDepsDone = true;
    for (var k = 0; k < deps.length; k++) {
      var dep = nodeMap[deps[k]];
      if (!dep || dep.status !== 'completed') {
        allDepsDone = false;
        break;
      }
    }

    if (allDepsDone) {
      ready.push(node);
    }
  }

  return ready;
}

// ═══════════════════════════════════════════════════════════
// 3. updateNodeStatus(graphId, nodeId, status)
// ═══════════════════════════════════════════════════════════

/**
 * 更新节点状态（含合法性校验）
 *
 * @param {string} graphId
 * @param {string} nodeId
 * @param {string} newStatus
 * @returns {{ success: boolean, error?: string, from?: string, to?: string }}
 */
function updateNodeStatus(graphId, nodeId, newStatus) {
  var graph = graphStore.getGraph(graphId);
  if (!graph) {
    return { success: false, error: 'Graph 不存在: ' + graphId };
  }

  // 验证 status 合法
  if (NODE_STATUSES.indexOf(newStatus) === -1) {
    return { success: false, error: '非法状态: ' + newStatus };
  }

  // 找节点
  var nodeIndex = -1;
  for (var i = 0; i < graph.nodes.length; i++) {
    if (graph.nodes[i].id === nodeId) {
      nodeIndex = i;
      break;
    }
  }
  if (nodeIndex === -1) {
    return { success: false, error: '节点不存在: ' + nodeId };
  }

  var node = graph.nodes[nodeIndex];
  var fromStatus = node.status;

  // 合法跳转检查
  var allowed = VALID_TRANSITIONS[fromStatus] || [];
  if (allowed.indexOf(newStatus) === -1) {
    return {
      success: false,
      error: '非法状态跳转: ' + fromStatus + ' → ' + newStatus,
      from: fromStatus,
      to: newStatus,
      allowed: allowed
    };
  }

  // 执行跳转
  node.status = newStatus;
  graph.updated_at = now();

  // 持久化
  graphStore.updateGraph(graphId, { nodes: graph.nodes, status: graph.status });

  // 写入 event
  graphStore.addGraphEvent(graphId, {
    type: 'NODE_STATUS_CHANGED',
    node_id: nodeId,
    detail: { from: fromStatus, to: newStatus }
  });

  // 写入 agent_events
  try {
    missionStore.createAgentEvent({
      mission_task_id: graph.mission_id,
      event_type: 'GRAPH_NODE_' + newStatus.toUpperCase(),
      stage: 'task_graph',
      payload: { graph_id: graphId, node_id: nodeId, from: fromStatus, to: newStatus }
    });
  } catch (e) { /* ignore */ }

  // 自动触发 graph status 检查
  _updateGraphStatus(graphId, graph);

  return { success: true, from: fromStatus, to: newStatus };
}

// ═══════════════════════════════════════════════════════════
// 4. runGraphStep(graphId)
// ═══════════════════════════════════════════════════════════

/**
 * 推进一个 step:
 *   找 ready nodes → capability check → allowed → running/completed mock
 *   requiresApproval → blocked
 *   forbidden → failed
 *
 * @param {string} graphId
 * @returns {{ success: boolean, step_result?: object, error?: string }}
 */
function runGraphStep(graphId) {
  var graph = graphStore.getGraph(graphId);
  if (!graph) {
    return { success: false, error: 'Graph 不存在: ' + graphId };
  }

  if (graph.status === 'completed' || graph.status === 'failed' || graph.status === 'blocked') {
    return { success: false, error: 'Graph 已处于终态: ' + graph.status };
  }

  // 标记为 running
  if (graph.status === 'pending') {
    graphStore.updateGraph(graphId, { status: 'running' });
    graph.status = 'running';
  }

  // 找 ready 节点: pending 且依赖全部 completed
  var readyNodes = getReadyNodes(graph);

  // 没有 ready 节点但有 pending 节点 = 被阻塞
  if (readyNodes.length === 0) {
    var hasPending = false;
    var hasRunning = false;
    for (var i = 0; i < graph.nodes.length; i++) {
      if (graph.nodes[i].status === 'pending') hasPending = true;
      if (graph.nodes[i].status === 'running') hasRunning = true;
    }
    if (hasPending) {
      if (!hasRunning) {
        // 所有 pending 都被阻塞了 → graph blocked
        graphStore.updateGraph(graphId, { status: 'blocked' });
        graphStore.addGraphEvent(graphId, {
          type: 'GRAPH_BLOCKED',
          detail: { reason: 'All pending nodes are blocked' }
        });
      }
      return {
        success: true,
        step_result: { action: 'no_ready', reason: 'All pending nodes have unsatisfied dependencies or are blocked', ready_count: 0 }
      };
    }
    // 全部已完成
    graphStore.updateGraph(graphId, { status: 'completed' });
    graphStore.addGraphEvent(graphId, {
      type: 'GRAPH_COMPLETED',
      detail: {}
    });
    return {
      success: true,
      step_result: { action: 'graph_completed', reason: 'All nodes completed' }
    };
  }

  // 处理每个 ready 节点
  var stepResults = [];
  for (var r = 0; r < readyNodes.length; r++) {
    var node = readyNodes[r];
    var result = _processNode(graph, node);

    // 如果是 requiresApproval，标记为 blocked（不自动执行）
    if (result.action === 'blocked_approval') {
      node.status = 'blocked';
      graphStore.updateGraph(graphId, { nodes: graph.nodes });
      graphStore.addGraphEvent(graphId, {
        type: 'NODE_BLOCKED',
        node_id: node.id,
        detail: { reason: 'requiresApproval' }
      });
      stepResults.push({ node_id: node.id, action: 'blocked', reason: result.reason });
      continue;
    }

    // forbidden → failed
    if (result.action === 'failed_forbidden') {
      node.status = 'failed';
      graphStore.updateGraph(graphId, { nodes: graph.nodes });
      graphStore.addGraphEvent(graphId, {
        type: 'NODE_FAILED',
        node_id: node.id,
        detail: { reason: result.reason }
      });

      // P10.2 recovery 集成
      _attemptNodeRecovery(graph, node, result.reason);

      stepResults.push({ node_id: node.id, action: 'failed', reason: result.reason });
      continue;
    }

    // allowed → mock execution: pending → running → completed
    if (result.action === 'allowed') {
      node.status = 'running';
      graphStore.updateGraph(graphId, { nodes: graph.nodes });
      graphStore.addGraphEvent(graphId, {
        type: 'NODE_RUNNING',
        node_id: node.id,
        detail: { agent: node.agent, capability: node.capability }
      });

      // mock complete
      node.status = 'completed';
      graphStore.updateGraph(graphId, { nodes: graph.nodes });
      graphStore.addGraphEvent(graphId, {
        type: 'NODE_COMPLETED',
        node_id: node.id,
        detail: { agent: node.agent, capability: node.capability }
      });

      // 写入 agent_events
      try {
        missionStore.createAgentEvent({
          mission_task_id: graph.mission_id,
          event_type: 'GRAPH_NODE_COMPLETED',
          stage: 'task_graph',
          payload: { graph_id: graphId, node_id: node.id, agent: node.agent, capability: node.capability }
        });
      } catch (e) { /* ignore */ }

      stepResults.push({ node_id: node.id, action: 'completed', agent: node.agent, capability: node.capability });
      continue;
    }

    // not allowed (capability doesn't match)
    if (result.action === 'failed_capability') {
      node.status = 'failed';
      graphStore.updateGraph(graphId, { nodes: graph.nodes });
      graphStore.addGraphEvent(graphId, {
        type: 'NODE_FAILED',
        node_id: node.id,
        detail: { reason: result.reason }
      });

      _attemptNodeRecovery(graph, node, result.reason);

      stepResults.push({ node_id: node.id, action: 'failed', reason: result.reason });
      continue;
    }
  }

  // 更新 graph 状态
  _updateGraphStatus(graphId, graph);

  // 持久化到 artifact
  graphStore.updateGraph(graphId, { nodes: graph.nodes });

  return {
    success: true,
    step_result: {
      action: 'step_executed',
      processed: stepResults,
      processed_count: stepResults.length
    }
  };
}

/**
 * 处理单个节点的能力检查
 * @param {object} graph
 * @param {object} node
 * @returns {{ action: string, reason?: string }}
 */
function _processNode(graph, node) {
  if (!node.agent || !node.capability) {
    return { action: 'failed_capability', reason: '节点缺少 agent 或 capability' };
  }

  var validation = capabilityRegistry.validateDispatch(node.agent, node.capability);

  if (!validation.allowed) {
    return { action: 'failed_forbidden', reason: validation.reason };
  }

  if (validation.requiresApproval) {
    return { action: 'blocked_approval', reason: validation.reason };
  }

  return { action: 'allowed', reason: validation.reason };
}

/**
 * 尝试节点恢复 (P10.2 integration)
 * @param {object} graph
 * @param {object} node
 * @param {string} reason
 */
function _attemptNodeRecovery(graph, node, reason) {
  try {
    var task = missionStore.getMissionTask(graph.mission_id);
    if (!task) return;

    var failureEvent = {
      event_type: 'GRAPH_NODE_FAILED',
      error_message: 'Node [' + node.id + '] failed: ' + reason,
      exit_code: 1
    };

    recoveryEngine.handleFailure(task, failureEvent).then(function(recoveryResult) {
      if (recoveryResult.success && recoveryResult.action_taken === 'retry') {
        // 重试成功 → 重置为 pending
        updateNodeStatus(graph.graph_id, node.id, 'pending');
      }
    }).catch(function(e) {
      // recovery attempt failed silently
    });
  } catch (e) {
    // 恢复触发失败不影响主流程
  }
}

/**
 * 根据节点状态更新 graph 整体状态
 */
function _updateGraphStatus(graphId, graph) {
  var allCompleted = true;
  var anyFailed = false;
  var anyBlocked = false;
  var anyRunning = false;
  var anyPending = false;

  for (var i = 0; i < graph.nodes.length; i++) {
    var s = graph.nodes[i].status;
    if (s === 'failed') anyFailed = true;
    if (s === 'blocked') anyBlocked = true;
    if (s === 'running') anyRunning = true;
    if (s === 'pending' || s === 'ready') anyPending = true;
    if (s !== 'completed' && s !== 'skipped') allCompleted = false;
  }

  var newStatus;
  if (allCompleted) {
    newStatus = 'completed';
  } else if (anyFailed) {
    newStatus = 'failed';
  } else if (anyBlocked && !anyRunning && !anyPending) {
    newStatus = 'blocked';
  } else if (anyRunning || anyPending) {
    newStatus = 'running';
  } else {
    newStatus = graph.status;
  }

  if (newStatus !== graph.status) {
    graphStore.updateGraph(graphId, { status: newStatus });
    graphStore.addGraphEvent(graphId, {
      type: 'GRAPH_STATUS_CHANGED',
      detail: { from: graph.status, to: newStatus }
    });
  }
}

// ═══════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════

module.exports = {
  validateGraph: validateGraph,
  getReadyNodes: getReadyNodes,
  updateNodeStatus: updateNodeStatus,
  runGraphStep: runGraphStep,

  // 常量
  GRAPH_STATUSES: GRAPH_STATUSES,
  NODE_STATUSES: NODE_STATUSES,
  VALID_TRANSITIONS: VALID_TRANSITIONS,

  // 内部函数导出供测试
  _detectCycle: _detectCycle,
  _processNode: _processNode,
  _updateGraphStatus: _updateGraphStatus,
  _attemptNodeRecovery: _attemptNodeRecovery
};
