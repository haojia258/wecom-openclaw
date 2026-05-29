'use strict';

/**
 * orchestration-engine.js - P10.8 Autonomous Execution Loop
 *
 * 核心 DAG 执行引擎。编排完整的 mission graph 执行流程：
 *   - 能力检查 (capabilityRegistry.validateDispatch)
 *   - Agent 健康检查 (heartbeatStore.getAgentHealth)
 *   - 节点执行（模拟）
 *   - Artifact 持久化 (artifactStore.saveArtifact)
 *   - 恢复集成 (recoveryEngine.handleFailure)
 *
 * @module orchestration-engine
 */

var graphStore = require('./task-graph-store');
var graphEngine = require('./task-graph-engine');
var capabilityRegistry = require('../agent-governance/capability-registry');
var artifactStore = require('../artifacts/artifact-store');
var recoveryEngine = require('./recovery-engine');
var heartbeatStore = require('./agent-heartbeat-store');
var missionStore = require('./mission-store');

// ─── 常量 ──────────────────────────────────────────────────

var DEFAULT_MAX_STEPS = 50;

// ─── 辅助 ──────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

/**
 * 写入 artifact（非致命：失败不中断执行）
 *
 * @param {string} missionId  - mission ID
 * @param {string} filename   - artifact 文件名
 * @param {string} agent      - 写入者
 * @param {string|object} content - 内容
 */
function _writeArtifact(missionId, filename, agent, content) {
  try {
    var result = artifactStore.saveArtifact({
      mission_id: missionId,
      filename: filename,
      agent: agent || 'orchestration-engine',
      content: typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    });
    return result;
  } catch (e) {
    // 非致命：记录但不中断执行
    console.error('[orchestration-engine] Artifact write failed (' + filename + '):', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * 添加 graph event（非致命）
 *
 * @param {string} graphId
 * @param {object} event - { type, node_id?, detail? }
 */
function _addEvent(graphId, event) {
  try {
    return graphStore.addGraphEvent(graphId, event);
  } catch (e) {
    console.error('[orchestration-engine] Failed to add event:', e.message);
    return null;
  }
}

/**
 * 直接更新节点状态（绕过状态机校验，用于强制跳转）
 *
 * @param {object} graph
 * @param {string} nodeId
 * @param {string} newStatus
 * @returns {boolean} 是否成功
 */
function _forceNodeStatus(graph, nodeId, newStatus) {
  for (var i = 0; i < graph.nodes.length; i++) {
    if (graph.nodes[i].id === nodeId) {
      graph.nodes[i].status = newStatus;
      graph.nodes[i].updated_at = now();
      return true;
    }
  }
  return false;
}

/**
 * 获取 graph 中的所有 node 状态统计
 *
 * @param {object} graph
 * @returns {{ total: number, pending: number, running: number, completed: number, failed: number, blocked: number, skipped: number }}
 */
function _countNodeStatuses(graph) {
  var counts = { total: 0, pending: 0, running: 0, completed: 0, failed: 0, blocked: 0, skipped: 0 };
  if (!graph || !Array.isArray(graph.nodes)) return counts;

  for (var i = 0; i < graph.nodes.length; i++) {
    counts.total++;
    var status = graph.nodes[i].status || 'pending';
    if (counts[status] !== undefined) {
      counts[status]++;
    }
  }
  return counts;
}

/**
 * 计算 graph 最终状态
 *
 * @param {object} graph
 * @returns {string} 终态
 */
function _computeFinalStatus(graph) {
  var counts = _countNodeStatuses(graph);

  // 有失败节点 → FAILED
  if (counts.failed > 0) {
    return 'failed';
  }

  // 有 blocked 且无 pending/running → BLOCKED
  if (counts.blocked > 0 && counts.pending === 0 && counts.running === 0) {
    return 'blocked';
  }

  // 全部 completed/skipped → COMPLETED
  if (counts.completed + counts.skipped === counts.total) {
    return 'completed';
  }

  // 还有 pending/running → keep current
  return graph.status;
}

// ═══════════════════════════════════════════════════════════
// 主函数: executeGraphLoop
// ═══════════════════════════════════════════════════════════

/**
 * 执行完整的 graph 执行循环。
 *
 * 算法：
 *   1. 加载 graph
 *   2. 写入初始 artifact (status=running)
 *   3. 添加 GRAPH_STARTED 事件
 *   4. 主循环 (maxSteps 次迭代)：
 *      a. 重新从 store 获取 graph（同步状态）
 *      b. 若 status 为 completed/failed/blocked → 退出
 *      c. 通过 graphEngine.getReadyNodes 获取就绪节点
 *      d. 无就绪节点但有运行中节点 → 等待（退出循环）
 *      e. 无就绪节点且无运行中节点 → 收尾
 *      f. 对每个就绪节点：能力检查 → 健康检查 → 标记运行 → 执行（模拟）→ 标记完成
 *      g. 递增步数
 *   5. 计算终态
 *   6. 写入最终 artifact
 *   7. 返回结果
 *
 * @async
 * @param {string} graphId - Graph ID
 * @param {object} [options] - 选项
 * @param {number} [options.maxSteps=50] - 最大步数
 * @param {boolean} [options.verifyHealth=true] - 是否验证 agent 健康
 * @param {boolean} [options.verbose=false] - 详细输出
 * @returns {Promise<{
 *   success: boolean,
 *   final_status: string,
 *   steps: number,
 *   nodes_processed: number,
 *   nodes_failed: number,
 *   nodes_recovered: number,
 *   stages: Array,
 *   artifacts: Array,
 *   error?: string
 * }>}
 */
async function executeGraphLoop(graphId, options) {
  var opts = options || {};
  var maxSteps = (typeof opts.maxSteps === 'number' && opts.maxSteps > 0) ? opts.maxSteps : DEFAULT_MAX_STEPS;
  var verifyHealth = opts.verifyHealth !== false; // 默认 true
  var verbose = !!opts.verbose;

  // ─── 结果追踪 ──────────────────────────────────────────
  var stats = {
    steps: 0,
    nodes_processed: 0,
    nodes_failed: 0,
    nodes_recovered: 0,
    stages: [],
    artifacts: []
  };

  // ─── 1. 加载 graph ────────────────────────────────────
  var graph = graphStore.getGraph(graphId);

  // ─── 2. 校验: graph 不存在 → 返回错误 ─────────────────
  if (!graph) {
    return {
      success: false,
      final_status: 'error',
      steps: 0,
      nodes_processed: 0,
      nodes_failed: 0,
      nodes_recovered: 0,
      stages: [],
      artifacts: [],
      error: 'Graph 不存在: ' + graphId
    };
  }

  var missionId = graph.mission_id;

  // ─── 3. 验证 graph ────────────────────────────────────
  var validation = graphEngine.validateGraph(graph);
  if (!validation.valid) {
    return {
      success: false,
      final_status: 'invalid',
      steps: 0,
      nodes_processed: 0,
      nodes_failed: 0,
      nodes_recovered: 0,
      stages: [],
      artifacts: [],
      error: 'Graph 验证失败: ' + validation.errors.join('; ')
    };
  }

  // ─── 4. 写入初始 artifact: graph.json (status=running) ──
  _writeArtifact(missionId, 'graph.json', 'orchestration-engine', {
    graph_id: graphId,
    mission_id: missionId,
    status: 'running',
    nodes: graph.nodes,
    started_at: now(),
    updated_at: now()
  });
  stats.artifacts.push('graph.json');

  // ─── 5. 添加 GRAPH_STARTED 事件 ───────────────────────
  _addEvent(graphId, { type: 'GRAPH_STARTED', detail: { graph_id: graphId, mission_id: missionId } });

  // ─── 6. 标记 graph 为 running ─────────────────────────
  graphStore.updateGraph(graphId, { status: 'running' });

  var graphActive = true;

  // ─── 7. 主循环 ────────────────────────────────────────
  for (var step = 0; step < maxSteps; step++) {
    stats.steps = step + 1;

    // a. 重新从 store 获取 graph（同步状态）
    graph = graphStore.getGraph(graphId);
    if (!graph) {
      // graph 被删除了
      stats.stages.push({ step: step + 1, action: 'graph_deleted', detail: 'Graph was deleted during execution' });
      break;
    }

    // b. 若 graph 处于终态 → 退出
    if (graph.status === 'completed' || graph.status === 'failed' || graph.status === 'blocked') {
      if (verbose) {
        console.log('[orchestration-engine] Graph already in terminal state:', graph.status);
      }
      break;
    }

    // c. 获取就绪节点
    var readyNodes = graphEngine.getReadyNodes(graph);

    if (verbose) {
      console.log('[orchestration-engine] Step ' + (step + 1) + ': ' + readyNodes.length + ' ready nodes');
    }

    // d. 无就绪节点但有运行中节点 → 等待（退出循环）
    if (readyNodes.length === 0) {
      var counts = _countNodeStatuses(graph);

      if (counts.running > 0) {
        stats.stages.push({
          step: step + 1,
          action: 'wait',
          detail: 'Nodes still running (' + counts.running + ' running, ' + counts.pending + ' pending)'
        });
        if (verbose) {
          console.log('[orchestration-engine] Waiting for running nodes...');
        }
        break;
      }

      // e. 无就绪节点且无运行中节点 → 收尾
      stats.stages.push({
        step: step + 1,
        action: 'no_more_ready',
        detail: 'No ready nodes and no running nodes'
      });
      graphActive = false;
      break;
    }

    // f. 处理每个就绪节点
    var stageResult = {
      step: step + 1,
      action: 'process_nodes',
      nodes: []
    };
    var recoveryQueue = []; // 收集需要恢复的失败节点

    for (var r = 0; r < readyNodes.length; r++) {
      var node = readyNodes[r];

      // 重新获取 graph 状态，检查是否已被标记为 failed
      graph = graphStore.getGraph(graphId);
      if (!graph) break;
      if (graph.status === 'failed') {
        // graph 已失败 → 跳过剩余节点
        stageResult.nodes.push({ node_id: node.id, action: 'skipped', reason: 'Graph already failed' });
        continue;
      }

      var nodeResult = { node_id: node.id };

      // ── Step 1: 能力检查 ────────────────────────────
      if (node.agent && node.capability) {
        var capCheck = capabilityRegistry.validateDispatch(node.agent, node.capability);

        // Forbidden → 标记失败
        if (!capCheck.allowed && capCheck.reason.indexOf('禁止') !== -1) {
          _forceNodeStatus(graph, node.id, 'failed');
          graphStore.updateGraph(graphId, { nodes: graph.nodes });
          _addEvent(graphId, { type: 'NODE_FORBIDDEN', node_id: node.id, detail: { reason: capCheck.reason, checked_at: capCheck.checked_at } });
          stats.nodes_failed++;
          nodeResult.action = 'forbidden';
          nodeResult.reason = capCheck.reason;
          stageResult.nodes.push(nodeResult);
          recoveryQueue.push({ nodeId: node.id, reason: capCheck.reason });
          continue;
        }

        // requiresApproval → 标记 blocked
        if (capCheck.requiresApproval) {
          _forceNodeStatus(graph, node.id, 'blocked');
          graphStore.updateGraph(graphId, { nodes: graph.nodes });
          _addEvent(graphId, { type: 'NODE_AWAITING_APPROVAL', node_id: node.id, detail: { reason: capCheck.reason, checked_at: capCheck.checked_at } });
          nodeResult.action = 'awaiting_approval';
          nodeResult.reason = capCheck.reason;
          stageResult.nodes.push(nodeResult);
          continue;
        }

        // 不具备能力 → 标记失败
        if (!capCheck.allowed) {
          _forceNodeStatus(graph, node.id, 'failed');
          graphStore.updateGraph(graphId, { nodes: graph.nodes });
          _addEvent(graphId, { type: 'NODE_CAPABILITY_MISSING', node_id: node.id, detail: { reason: capCheck.reason, checked_at: capCheck.checked_at } });
          stats.nodes_failed++;
          nodeResult.action = 'capability_missing';
          nodeResult.reason = capCheck.reason;
          stageResult.nodes.push(nodeResult);
          recoveryQueue.push({ nodeId: node.id, reason: capCheck.reason });
          continue;
        }
      }

      // ── Step 2: Agent 健康检查 ───────────────────────
      if (verifyHealth && node.agent) {
        var healthResult = heartbeatStore.getAgentHealth(node.agent);

        if (healthResult.success && healthResult.health) {
          var health = healthResult.health;

          // 无法调度 → 标记失败
          if (!health.can_dispatch) {
            _forceNodeStatus(graph, node.id, 'failed');
            graphStore.updateGraph(graphId, { nodes: graph.nodes });
            _addEvent(graphId, { type: 'NODE_AGENT_UNAVAILABLE', node_id: node.id, detail: { agent: node.agent, health_status: health.status, warnings: health.warnings } });
            stats.nodes_failed++;
            nodeResult.action = 'agent_unavailable';
            nodeResult.reason = 'Agent ' + node.agent + ' 不可调度 (status: ' + health.status + ')';
            stageResult.nodes.push(nodeResult);
            recoveryQueue.push({ nodeId: node.id, reason: 'Agent unavailable: ' + node.agent });
            continue;
          }

          // 降级 → 仍执行但添加警告事件
          if (health.status === 'degraded') {
            _addEvent(graphId, { type: 'NODE_AGENT_DEGRADED', node_id: node.id, detail: { agent: node.agent, warnings: health.warnings } });
            if (verbose) {
              console.log('[orchestration-engine] Agent ' + node.agent + ' is degraded, executing with caution');
            }
          }
        } else {
          // Agent 不存在
          _forceNodeStatus(graph, node.id, 'failed');
          graphStore.updateGraph(graphId, { nodes: graph.nodes });
          _addEvent(graphId, { type: 'NODE_AGENT_UNAVAILABLE', node_id: node.id, detail: { agent: node.agent, error: healthResult.error } });
          stats.nodes_failed++;
          nodeResult.action = 'agent_not_found';
          nodeResult.reason = healthResult.error || 'Agent ' + node.agent + ' 不存在';
          stageResult.nodes.push(nodeResult);
          recoveryQueue.push({ nodeId: node.id, reason: 'Agent not found: ' + node.agent });
          continue;
        }
      }

      // ── Step 3: 标记 RUNNING ─────────────────────────
      var markRunning = graphEngine.updateNodeStatus(graphId, node.id, 'running');
      if (!markRunning.success && markRunning.error && markRunning.error.indexOf('非法状态跳转') === -1) {
        // 如果不是因为状态跳转问题失败，记录并跳过
        _addEvent(graphId, { type: 'NODE_ERROR', node_id: node.id, detail: { error: markRunning.error } });
        nodeResult.action = 'error';
        nodeResult.reason = markRunning.error;
        stageResult.nodes.push(nodeResult);
        stats.nodes_failed++;
        continue;
      }

      // ── Step 4: 执行节点（模拟） ─────────────────────
      var executionTime = now();
      var outputContent = {
        node_id: node.id,
        status: 'completed',
        agent: node.agent || null,
        capability: node.capability || null,
        timestamp: executionTime,
        result: {
          simulated: true,
          output: 'Node execution simulated by orchestration-engine',
          duration_ms: Math.floor(Math.random() * 100),
          node_type: node.type || 'unknown',
          skill: node.skill || null
        }
      };

      _writeArtifact(
        missionId,
        'node-' + node.id + '-output.json',
        node.agent || 'orchestration-engine',
        outputContent
      );
      stats.artifacts.push('node-' + node.id + '-output.json');

      _addEvent(graphId, {
        type: 'NODE_EXECUTED',
        node_id: node.id,
        detail: {
          agent: node.agent,
          capability: node.capability,
          timestamp: executionTime,
          simulated: true
        }
      });

      // ── Step 5: 标记 COMPLETED ───────────────────────
      graphEngine.updateNodeStatus(graphId, node.id, 'completed');

      stats.nodes_processed++;
      nodeResult.action = 'executed';
      nodeResult.agent = node.agent;
      nodeResult.capability = node.capability;
      stageResult.nodes.push(nodeResult);

      // ── Step 6: 写入 graph.json artifact ─────────────
      var currentGraph = graphStore.getGraph(graphId);
      if (currentGraph) {
        _writeArtifact(missionId, 'graph.json', 'orchestration-engine', {
          graph_id: graphId,
          mission_id: missionId,
          status: currentGraph.status,
          nodes: currentGraph.nodes,
          updated_at: now()
        });
      }
    }

    // 记录阶段
    stats.stages.push(stageResult);

    // ── Step 7: 恢复检查 ──────────────────────────────
    for (var rc = 0; rc < recoveryQueue.length; rc++) {
      var entry = recoveryQueue[rc];
      var task = missionStore.getMissionTask(missionId);
      if (!task) continue;

      var failureEvent = {
        event_type: 'NODE_FAILED',
        error_message: 'Node [' + entry.nodeId + '] failed: ' + entry.reason,
        exit_code: 1
      };

      try {
        var recoveryResult = await recoveryEngine.handleFailure(task, failureEvent);

        if (recoveryResult.success && recoveryResult.action_taken === 'retry') {
          // 恢复成功，重置节点为 pending
          graph = graphStore.getGraph(graphId);
          if (graph) {
            _forceNodeStatus(graph, entry.nodeId, 'pending');
            graphStore.updateGraph(graphId, { nodes: graph.nodes });
            stats.nodes_recovered++;
            _addEvent(graphId, { type: 'NODE_RECOVERED', node_id: entry.nodeId, detail: { action: 'retry' } });
          }
        } else if (recoveryResult.action_taken === 'retry_scheduled') {
          // 重试已安排，重置节点为 pending
          graph = graphStore.getGraph(graphId);
          if (graph) {
            _forceNodeStatus(graph, entry.nodeId, 'pending');
            graphStore.updateGraph(graphId, { nodes: graph.nodes });
            stats.nodes_recovered++;
            _addEvent(graphId, { type: 'NODE_RETRY_SCHEDULED', node_id: entry.nodeId, detail: { recovery_status: recoveryResult.recovery_status } });
          }
        } else if (recoveryResult.action_taken === 'rollback') {
          // 回滚 → 标记 graph 为 failed，停止循环
          graphStore.updateGraph(graphId, { status: 'failed' });
          _addEvent(graphId, { type: 'GRAPH_ROLLBACK', detail: { reason: recoveryResult.failure_type || 'recovery rollback' } });
          graphActive = false;
          break;
        }
        // recoveryResult.action_taken === 'none' 或 'rollback_failed' → 保持失败状态
      } catch (recoveryError) {
        console.error('[orchestration-engine] Recovery error for node ' + entry.nodeId + ':', recoveryError.message);
      }
    }

    // 如果 recovery 触发了 rollback → 退出循环
    if (!graphActive) break;

    // g. 递增步数由循环自动处理
  }

  // ─── 8. 计算最终 graph 状态 ───────────────────────────
  graph = graphStore.getGraph(graphId);
  if (graph) {
    var finalStatus = _computeFinalStatus(graph);
    graphStore.updateGraph(graphId, { status: finalStatus });

    if (finalStatus === 'completed') {
      _addEvent(graphId, { type: 'GRAPH_COMPLETED', detail: { total_steps: stats.steps } });
    } else if (finalStatus === 'failed') {
      _addEvent(graphId, { type: 'GRAPH_FAILED', detail: { nodes_failed: stats.nodes_failed } });
    } else if (finalStatus === 'blocked') {
      _addEvent(graphId, { type: 'GRAPH_BLOCKED', detail: { reason: 'Nodes blocked and cannot proceed' } });
    }

    // ─── 9. 写入最终 artifacts ─────────────────────────
    _writeArtifact(missionId, 'graph.json', 'orchestration-engine', {
      graph_id: graphId,
      mission_id: missionId,
      status: finalStatus,
      nodes: graph.nodes,
      steps: stats.steps,
      nodes_processed: stats.nodes_processed,
      nodes_failed: stats.nodes_failed,
      nodes_recovered: stats.nodes_recovered,
      completed_at: now()
    });

    _writeArtifact(missionId, 'graph-events.json', 'orchestration-engine', {
      graph_id: graphId,
      mission_id: missionId,
      events: graphStore.getGraphEvents(graphId),
      generated_at: now()
    });

    stats.artifacts = []; // 清空临时 artifact 列表（已在上面输出最终版）

    return {
      success: finalStatus === 'completed' || finalStatus === 'running',
      final_status: finalStatus,
      steps: stats.steps,
      nodes_processed: stats.nodes_processed,
      nodes_failed: stats.nodes_failed,
      nodes_recovered: stats.nodes_recovered,
      stages: stats.stages,
      artifacts: stats.artifacts
    };
  }

  return {
    success: false,
    final_status: 'error',
    steps: stats.steps,
    nodes_processed: stats.nodes_processed,
    nodes_failed: stats.nodes_failed,
    nodes_recovered: stats.nodes_recovered,
    stages: stats.stages,
    artifacts: stats.artifacts,
    error: 'Graph was deleted during execution'
  };
}

// ═══════════════════════════════════════════════════════════
// executeSingleNode
// ═══════════════════════════════════════════════════════════

/**
 * 执行 graph 中的单个节点。
 * 用于单节点 API 端点。
 *
 * @param {string} graphId - Graph ID
 * @param {string} nodeId  - 节点 ID
 * @param {object} [options] - 选项
 * @param {boolean} [options.verifyHealth=true] - 是否检查 agent 健康
 * @returns {{
 *   success: boolean,
 *   node_status?: string,
 *   node_id?: string,
 *   stage?: string,
 *   error?: string
 * }}
 */
function executeSingleNode(graphId, nodeId, options) {
  var opts = options || {};
  var verifyHealth = opts.verifyHealth !== false;

  // 加载 graph
  var graph = graphStore.getGraph(graphId);
  if (!graph) {
    return { success: false, error: 'Graph 不存在: ' + graphId };
  }

  // 查找节点
  var targetNode = null;
  for (var i = 0; i < graph.nodes.length; i++) {
    if (graph.nodes[i].id === nodeId) {
      targetNode = graph.nodes[i];
      break;
    }
  }
  if (!targetNode) {
    return { success: false, error: '节点不存在: ' + nodeId };
  }

  // 检查节点状态
  if (targetNode.status !== 'pending') {
    return {
      success: false,
      node_status: targetNode.status,
      node_id: nodeId,
      stage: 'skipped',
      error: '节点状态非 pending: ' + targetNode.status
    };
  }

  var missionId = graph.mission_id;

  // Step 1: 能力检查
  if (targetNode.agent && targetNode.capability) {
    var capCheck = capabilityRegistry.validateDispatch(targetNode.agent, targetNode.capability);

    if (!capCheck.allowed) {
      _forceNodeStatus(graph, nodeId, 'failed');
      graphStore.updateGraph(graphId, { nodes: graph.nodes });
      _addEvent(graphId, { type: 'NODE_FORBIDDEN', node_id: nodeId, detail: { reason: capCheck.reason } });

      return {
        success: false,
        node_status: 'failed',
        node_id: nodeId,
        stage: 'capability_check',
        error: capCheck.reason
      };
    }

    if (capCheck.requiresApproval) {
      _forceNodeStatus(graph, nodeId, 'blocked');
      graphStore.updateGraph(graphId, { nodes: graph.nodes });
      _addEvent(graphId, { type: 'NODE_AWAITING_APPROVAL', node_id: nodeId, detail: { reason: capCheck.reason } });

      return {
        success: false,
        node_status: 'blocked',
        node_id: nodeId,
        stage: 'awaiting_approval',
        error: capCheck.reason
      };
    }
  }

  // Step 2: Agent 健康检查
  if (verifyHealth && targetNode.agent) {
    var healthResult = heartbeatStore.getAgentHealth(targetNode.agent);

    if (healthResult.success && healthResult.health) {
      if (!healthResult.health.can_dispatch) {
        _forceNodeStatus(graph, nodeId, 'failed');
        graphStore.updateGraph(graphId, { nodes: graph.nodes });
        _addEvent(graphId, { type: 'NODE_AGENT_UNAVAILABLE', node_id: nodeId, detail: { agent: targetNode.agent, health_status: healthResult.health.status } });

        return {
          success: false,
          node_status: 'failed',
          node_id: nodeId,
          stage: 'health_check',
          error: 'Agent ' + targetNode.agent + ' 不可调度'
        };
      }
    } else {
      _forceNodeStatus(graph, nodeId, 'failed');
      graphStore.updateGraph(graphId, { nodes: graph.nodes });
      _addEvent(graphId, { type: 'NODE_AGENT_UNAVAILABLE', node_id: nodeId, detail: { agent: targetNode.agent, error: healthResult.error } });

      return {
        success: false,
        node_status: 'failed',
        node_id: nodeId,
        stage: 'health_check',
        error: healthResult.error || 'Agent 健康检查失败'
      };
    }
  }

  // Step 3: 标记 RUNNING
  graphEngine.updateNodeStatus(graphId, nodeId, 'running');

  // Step 4: 执行节点（模拟）
  var executionTime = now();
  var outputContent = {
    node_id: nodeId,
    status: 'completed',
    agent: targetNode.agent || null,
    capability: targetNode.capability || null,
    timestamp: executionTime,
    result: {
      simulated: true,
      output: 'Node execution simulated by orchestration-engine (single node)',
      duration_ms: Math.floor(Math.random() * 100)
    }
  };

  _writeArtifact(missionId, 'node-' + nodeId + '-output.json', targetNode.agent || 'orchestration-engine', outputContent);
  _addEvent(graphId, { type: 'NODE_EXECUTED', node_id: nodeId, detail: { agent: targetNode.agent, capability: targetNode.capability, timestamp: executionTime, simulated: true } });

  // Step 5: 标记 COMPLETED
  graphEngine.updateNodeStatus(graphId, nodeId, 'completed');

  // 更新 graph artifact
  var updatedGraph = graphStore.getGraph(graphId);
  if (updatedGraph) {
    _writeArtifact(missionId, 'graph.json', 'orchestration-engine', {
      graph_id: graphId,
      mission_id: missionId,
      status: _computeFinalStatus(updatedGraph),
      nodes: updatedGraph.nodes,
      updated_at: now()
    });
  }

  return {
    success: true,
    node_status: 'completed',
    node_id: nodeId,
    stage: 'executed'
  };
}

// ═══════════════════════════════════════════════════════════
// getGraphExecutionStatus
// ═══════════════════════════════════════════════════════════

/**
 * 获取 graph 执行状态快照。
 * 轻量级状态查询，用于 Dashboard。
 *
 * @param {string} graphId - Graph ID
 * @returns {{
 *   graph_id: string,
 *   status: string,
 *   nodes: object,
 *   events_count: number,
 *   steps: number,
 *   artifacts: Array
 * }|null}
 */
function getGraphExecutionStatus(graphId) {
  var graph = graphStore.getGraph(graphId);
  if (!graph) return null;

  var events = graphStore.getGraphEvents(graphId);
  var counts = _countNodeStatuses(graph);

  return {
    graph_id: graphId,
    status: graph.status,
    nodes: counts,
    events_count: events.length,
    steps: 0, // 轻量查询不追踪步数
    artifacts: [] // 轻量查询不追踪 artifacts
  };
}

// ═══════════════════════════════════════════════════════════
// getAllGraphEvents
// ═══════════════════════════════════════════════════════════

/**
 * 获取 graph 的所有事件。
 *
 * @param {string} graphId - Graph ID
 * @returns {Array} 事件数组
 */
function getAllGraphEvents(graphId) {
  return graphStore.getGraphEvents(graphId);
}

// ═══════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════

module.exports = {
  executeGraphLoop: executeGraphLoop,
  executeSingleNode: executeSingleNode,
  getGraphExecutionStatus: getGraphExecutionStatus,
  getAllGraphEvents: getAllGraphEvents,

  // 内部函数导出供测试
  _writeArtifact: _writeArtifact,
  _addEvent: _addEvent,
  _forceNodeStatus: _forceNodeStatus,
  _countNodeStatuses: _countNodeStatuses,
  _computeFinalStatus: _computeFinalStatus
};
