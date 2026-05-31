'use strict';

/**
 * task-graph-runner.js - P10.5 Task Graph Runner (编排层)
 *
 * 职责:
 *   - 验证 + 创建 graph
 *   - 逐个 step 推进直到 graph 完成或失败
 *   - 失败节点重试
 *   - 恢复 graph (从 failed 到 running)
 */

var graphStore = require('./task-graph-store');
var graphEngine = require('./task-graph-engine');
var capabilityRegistry = require('../agent-governance/capability-registry');

/**
 * 创建 task graph (含验证)
 *
 * @param {object} graphDef
 * @returns {{ success: boolean, graph?: object, errors?: Array }}
 */
function createAndValidate(graphDef) {
  // 验证
  var validation = graphEngine.validateGraph(graphDef);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  // 存储
  var graph = graphStore.createGraph(graphDef);

  // 初始化所有节点为 pending
  for (var i = 0; i < graph.nodes.length; i++) {
    if (!graph.nodes[i].status) {
      graph.nodes[i].status = 'pending';
    }
  }

  graphStore.updateGraph(graph.graph_id, { nodes: graph.nodes });

  return { success: true, graph: graph };
}

/**
 * 推进 graph 直到完成或失败
 *
 * @param {string} graphId
 * @param {number} maxSteps - 最大步数 (默认 100)
 * @returns {{ success: boolean, final_status: string, steps: number, graph: object }}
 */
function runGraph(graphId, maxSteps) {
  maxSteps = maxSteps || 100;

  var steps = 0;
  var graph = graphStore.getGraph(graphId);

  if (!graph) {
    return { success: false, error: 'Graph 不存在: ' + graphId };
  }

  while (steps < maxSteps) {
    var result = graphEngine.runGraphStep(graphId);

    if (!result.success) {
      return { success: false, error: result.error, steps: steps };
    }

    steps++;

    var sr = result.step_result;
    if (sr.action === 'graph_completed') {
      graph = graphStore.getGraph(graphId);
      return { success: true, final_status: 'completed', steps: steps, graph: graph };
    }

    if (sr.action === 'no_ready') {
      graph = graphStore.getGraph(graphId);
      if (graph.status === 'blocked') {
        return { success: true, final_status: 'blocked', steps: steps, graph: graph };
      }
      if (graph.status === 'failed') {
        return { success: false, final_status: 'failed', steps: steps, graph: graph };
      }
    }

    // 检查是否有节点失败
    graph = graphStore.getGraph(graphId);
    if (graph.status === 'failed') {
      return { success: false, final_status: 'failed', steps: steps, graph: graph };
    }
  }

  graph = graphStore.getGraph(graphId);
  return { success: false, error: '达到最大步数限制', steps: steps, graph: graph };
}

/**
 * 重试失败节点
 *
 * @param {string} graphId
 * @param {string} nodeId
 * @returns {{ success: boolean, node?: object, error?: string }}
 */
function retryFailedNode(graphId, nodeId) {
  var graph = graphStore.getGraph(graphId);
  if (!graph) {
    return { success: false, error: 'Graph 不存在: ' + graphId };
  }

  // 找节点
  var node = null;
  for (var i = 0; i < graph.nodes.length; i++) {
    if (graph.nodes[i].id === nodeId) {
      node = graph.nodes[i];
      break;
    }
  }
  if (!node) {
    return { success: false, error: '节点不存在: ' + nodeId };
  }

  if (node.status !== 'failed') {
    return { success: false, error: '节点不在 failed 状态: ' + node.status };
  }

  // failed → pending
  var result = graphEngine.updateNodeStatus(graphId, nodeId, 'pending');
  if (!result.success) {
    return { success: false, error: result.error };
  }

  // 更新 graph 状态（从 failed → running）
  graphStore.updateGraph(graphId, { status: 'running' });

  return { success: true, node: nodeId, from: 'failed', to: 'pending' };
}

/**
 * 恢复整个 graph (从 failed → running，重置失败节点)
 *
 * @param {string} graphId
 * @returns {{ success: boolean, recovered_nodes?: Array, error?: string }}
 */
function recoverGraph(graphId) {
  var graph = graphStore.getGraph(graphId);
  if (!graph) {
    return { success: false, error: 'Graph 不存在: ' + graphId };
  }

  if (graph.status !== 'failed') {
    return { success: false, error: 'Graph 不在 failed 状态: ' + graph.status };
  }

  var recovered = [];
  for (var i = 0; i < graph.nodes.length; i++) {
    if (graph.nodes[i].status === 'failed') {
      graph.nodes[i].status = 'pending';
      recovered.push(graph.nodes[i].id);
    }
  }

  graphStore.updateGraph(graphId, { nodes: graph.nodes, status: 'running' });

  graphStore.addGraphEvent(graphId, {
    type: 'GRAPH_RECOVERED',
    detail: { recovered_nodes: recovered }
  });

  return { success: true, recovered_nodes: recovered };
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  createAndValidate: createAndValidate,
  runGraph: runGraph,
  retryFailedNode: retryFailedNode,
  recoverGraph: recoverGraph
};
