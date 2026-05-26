'use strict';

/**
 * DAG Parallel Scheduler — 基于 Kahn 算法的 DAG 并行调度器
 *
 * 将 Commander Runtime 中的线性队列升级为支持并行 stage 分组
 * 的 DAG Runtime 结构（仍 plan-only）。
 */

var { DAGNode } = require('./dag-node');

/**
 * 从队列项构建 DAG 结构
 * @param {object[]} queueItems - 队列项，需包含 dependsOn 字段
 * @returns {{ nodes: DAGNode[], edges: {from:string,to:string}[], nodeMap: object, adjacency: object, inDegree: object }}
 */
function buildDAG(queueItems) {
  var nodes = [];
  var edges = [];
  var nodeMap = {};
  var seen = {};

  // 第一步：创建所有节点
  for (var i = 0; i < queueItems.length; i++) {
    var item = queueItems[i];
    // 使用 command 作为唯一 ID（处理 OPTIMIZE_WECOM 中 codex 出现两次的场景）
    var nodeId = item.command || (item.agent + '_' + item.seq);
    if (seen[nodeId]) {
      // 重复 ID：添加后缀
      nodeId = nodeId + '_' + i;
    }
    seen[nodeId] = true;
    var node = DAGNode.fromQueueItem(item);
    node.id = nodeId;
    nodes.push(node);
    nodeMap[nodeId] = node;
  }

  // 第二步：创建边（解析 dependsOn）
  for (var i2 = 0; i2 < nodes.length; i2++) {
    var node2 = nodes[i2];
    if (node2.dependsOn && node2.dependsOn.length > 0) {
      for (var j = 0; j < node2.dependsOn.length; j++) {
        var depId = node2.dependsOn[j];
        if (nodeMap[depId]) {
          edges.push({ from: depId, to: node2.id });
        }
      }
    }
  }

  // 第三步：构建邻接表和入度表
  var adjacency = {};
  var inDegree = {};

  for (var k = 0; k < nodes.length; k++) {
    var nk = nodes[k];
    adjacency[nk.id] = [];
    inDegree[nk.id] = 0;
  }

  for (var e = 0; e < edges.length; e++) {
    var edge = edges[e];
    if (adjacency[edge.from]) {
      adjacency[edge.from].push(edge.to);
    }
    if (typeof inDegree[edge.to] === 'number') {
      inDegree[edge.to]++;
    }
  }

  return { nodes: nodes, edges: edges, nodeMap: nodeMap, adjacency: adjacency, inDegree: inDegree };
}

/**
 * Kahn 算法拓扑排序 → 按阶段分组
 * blocked 节点会被跳过，不进入任何 stage
 * @param {object} dag - buildDAG 返回值
 * @returns {{ stages: object[][], totalStages: number }}
 */
function topologicalSort(dag) {
  var nodes = dag.nodes;
  var inDegree = {};
  var adjacency = {};

  // 深拷贝入度表和邻接表
  for (var i = 0; i < nodes.length; i++) {
    var nid = nodes[i].id;
    inDegree[nid] = dag.inDegree[nid] || 0;
    adjacency[nid] = (dag.adjacency[nid] || []).slice();
  }

  var stages = [];
  var processed = {};

  // 先处理 blocked 节点：将它们从入度计算中移除
  // blocked 节点的后继节点入度减 1
  for (var b = 0; b < nodes.length; b++) {
    if (nodes[b].blocked) {
      processed[nodes[b].id] = true;
      var bNeighbors = adjacency[nodes[b].id] || [];
      for (var bn = 0; bn < bNeighbors.length; bn++) {
        if (typeof inDegree[bNeighbors[bn]] === 'number') {
          inDegree[bNeighbors[bn]]--;
        }
      }
    }
  }

  // Kahn 算法主循环
  while (true) {
    var currentStage = [];

    // 找出所有入度为 0 且未被处理的节点
    for (var j = 0; j < nodes.length; j++) {
      var nid2 = nodes[j].id;
      if (inDegree[nid2] === 0 && !processed[nid2]) {
        currentStage.push(nodes[j]);
        processed[nid2] = true;
      }
    }

    if (currentStage.length === 0) break;

    stages.push(currentStage);

    // 移除当前阶段节点，减少后继节点的入度
    for (var k = 0; k < currentStage.length; k++) {
      var cn = currentStage[k];
      var neighbors = adjacency[cn.id] || [];
      for (var m = 0; m < neighbors.length; m++) {
        var neighbor = neighbors[m];
        if (typeof inDegree[neighbor] === 'number') {
          inDegree[neighbor]--;
        }
      }
    }
  }

  return { stages: stages, totalStages: stages.length };
}

/**
 * 调度：构建 DAG → 拓扑排序 → 阶段分组
 * @param {object[]} queueItems - 队列项
 * @returns {{ success: boolean, dag: object, stages: object[][], totalStages: number, totalNodes: number }}
 */
function schedule(queueItems) {
  if (!queueItems || queueItems.length === 0) {
    return { success: false, error: '队列为空', dag: null, stages: [], totalStages: 0, totalNodes: 0 };
  }

  var dag = buildDAG(queueItems);
  var sortResult = topologicalSort(dag);

  return {
    success: true,
    dag: dag,
    stages: sortResult.stages,
    totalStages: sortResult.totalStages,
    totalNodes: dag.nodes.length,
  };
}

/**
 * 获取阶段信息
 * @param {object} scheduleResult - schedule() 返回值
 * @returns {{ stages: object[][], totalStages: number }}
 */
function getStages(scheduleResult) {
  return {
    stages: scheduleResult.stages || [],
    totalStages: scheduleResult.totalStages || 0,
  };
}

/**
 * 循环检测（基于 Kahn 算法：未处理完的节点 = 存在循环）
 * @param {object} dag - buildDAG 返回值
 * @returns {{ hasCycle: boolean, cycleNodes: string[] }}
 */
function detectCycles(dag) {
  var nodes = dag.nodes;
  var inDegree = {};
  var adjacency = {};

  for (var i = 0; i < nodes.length; i++) {
    var nid = nodes[i].id;
    inDegree[nid] = dag.inDegree[nid] || 0;
    adjacency[nid] = (dag.adjacency[nid] || []).slice();
  }

  // Kahn 算法
  var queue = [];
  for (var j = 0; j < nodes.length; j++) {
    if (inDegree[nodes[j].id] === 0) {
      queue.push(nodes[j].id);
    }
  }

  var processedCount = 0;
  var processed = {};

  while (queue.length > 0) {
    var current = queue.shift();
    processed[current] = true;
    processedCount++;

    var neighbors = adjacency[current] || [];
    for (var k = 0; k < neighbors.length; k++) {
      var neighbor = neighbors[k];
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  var hasCycle = processedCount < nodes.length;
  var cycleNodes = [];

  if (hasCycle) {
    for (var m = 0; m < nodes.length; m++) {
      if (!processed[nodes[m].id]) {
        cycleNodes.push(nodes[m].id);
      }
    }
  }

  return { hasCycle: hasCycle, cycleNodes: cycleNodes };
}

/**
 * Blocked 节点向下游传播
 * 使用 BFS：从 blocked 节点出发，标记所有直接和间接后继节点
 * @param {object} dag - buildDAG 返回值
 * @param {string[]} blockedNodeIds - 被 RBAC 拒绝的节点 ID
 * @returns {string[]} - 所有被标记为 blocked 的节点 ID（含原始 blocked 和传播的）
 */
function propagateBlocked(dag, blockedNodeIds) {
  if (!blockedNodeIds || blockedNodeIds.length === 0) return [];

  var allBlocked = {};
  var queue = [];

  // 初始化：标记原始 blocked 节点
  for (var i = 0; i < blockedNodeIds.length; i++) {
    var bid = blockedNodeIds[i];
    allBlocked[bid] = true;
    queue.push(bid);
    if (dag.nodeMap[bid]) {
      dag.nodeMap[bid].setBlocked('RBAC deny');
    }
  }

  // BFS 传播
  while (queue.length > 0) {
    var current = queue.shift();
    var neighbors = dag.adjacency[current] || [];
    for (var j = 0; j < neighbors.length; j++) {
      var neighbor = neighbors[j];
      if (!allBlocked[neighbor]) {
        allBlocked[neighbor] = true;
        queue.push(neighbor);
        if (dag.nodeMap[neighbor]) {
          dag.nodeMap[neighbor].setBlocked('Propagated: upstream node blocked');
        }
      }
    }
  }

  return Object.keys(allBlocked);
}

/**
 * 应用 Runtime RBAC 结果到 DAG
 * 对于被拒绝的节点：标记为 blocked 并向下游传播
 * @param {object} dag - buildDAG 返回值
 * @param {object[]} rbacResults - checkAgentAction 结果数组
 * @returns {{ blockedNodes: string[], totalBlocked: number, originalDenied: number, dag: object }}
 */
function applyRBAC(dag, rbacResults) {
  var deniedNodeIds = [];

  if (!rbacResults || rbacResults.length === 0) {
    return { blockedNodes: [], totalBlocked: 0, originalDenied: 0, dag: dag };
  }

  // 找出所有被拒绝的节点
  for (var i = 0; i < rbacResults.length; i++) {
    var result = rbacResults[i];
    if (!result.allowed) {
      // 通过 command 匹配节点 ID
      var nodeId = result.command || (result.agent + '_' + i);
      if (dag.nodeMap[nodeId]) {
        deniedNodeIds.push(nodeId);
      }
    }
  }

  // 传播 blocked
  var allBlocked = propagateBlocked(dag, deniedNodeIds);

  return {
    blockedNodes: allBlocked,
    totalBlocked: allBlocked.length,
    originalDenied: deniedNodeIds.length,
    dag: dag,
  };
}

module.exports = {
  buildDAG: buildDAG,
  topologicalSort: topologicalSort,
  schedule: schedule,
  getStages: getStages,
  detectCycles: detectCycles,
  propagateBlocked: propagateBlocked,
  applyRBAC: applyRBAC,
};
