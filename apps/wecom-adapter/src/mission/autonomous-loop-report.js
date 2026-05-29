'use strict';

/**
 * autonomous-loop-report.js - P10.8 自治执行报告生成器
 *
 * 职责:
 *   - generateLoopReport(graphId) - 生成 loop 执行报告
 *   - 汇总图执行状态、节点统计、artifacts、events
 *
 * 依赖:
 *   - task-graph-store (P10.5)
 *   - artifact-store (P10.3)
 */

var graphStore = require('./task-graph-store');
var artifactStore = require('../artifacts/artifact-store');

// ─── 辅助 ──────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

/**
 * 安全计数，避免 undefined
 */
function _count(n) {
  return typeof n === 'number' ? n : 0;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * 生成 loop 执行报告
 *
 * @param {string} graphId
 * @returns {{ success: boolean, report?: object, error?: string }}
 */
function generateLoopReport(graphId) {
  if (!graphId || typeof graphId !== 'string' || graphId.trim() === '') {
    return { success: false, error: '缺少必填参数: graphId' };
  }

  var graph = graphStore.getGraph(graphId);
  if (!graph) {
    return { success: false, error: 'Graph 不存在: ' + graphId };
  }

  var nodes = graph.nodes || [];
  var events = graphStore.getGraphEvents(graphId) || [];

  // 统计节点状态
  var completedNodes = 0;
  var failedNodes = 0;
  var blockedNodes = 0;
  var runningNodes = 0;
  var pendingNodes = 0;
  var skippedNodes = 0;

  for (var i = 0; i < nodes.length; i++) {
    var s = nodes[i].status || 'pending';
    if (s === 'completed') completedNodes++;
    else if (s === 'failed') failedNodes++;
    else if (s === 'blocked') blockedNodes++;
    else if (s === 'running') runningNodes++;
    else if (s === 'skipped') skippedNodes++;
    else pendingNodes++;
  }

  // 收集 artifact 信息
  var artifacts = [];
  try {
    var artifactList = artifactStore.listArtifacts(graph.mission_id);
    if (artifactList && artifactList.success && artifactList.artifacts) {
      artifacts = artifactList.artifacts;
    }
  } catch (e) {
    // artifact 读取失败不阻断报告生成
  }

  // 构建摘要
  var status = graph.status || 'unknown';
  var summary = _buildSummary(status, completedNodes, failedNodes, blockedNodes, runningNodes, pendingNodes, skippedNodes, events);

  var report = {
    graph_id: graphId,
    mission_id: graph.mission_id,
    status: status,
    completed_nodes: completedNodes,
    failed_nodes: failedNodes,
    blocked_nodes: blockedNodes,
    running_nodes: runningNodes,
    pending_nodes: pendingNodes,
    skipped_nodes: skippedNodes,
    total_nodes: nodes.length,
    artifacts: artifacts,
    events: events,
    summary: summary,
    generated_at: now()
  };

  // 持久化 report
  try {
    artifactStore.saveArtifact({
      mission_id: graph.mission_id,
      filename: 'loop-report.json',
      agent: 'autonomous-loop-report',
      content: JSON.stringify(report, null, 2)
    });
  } catch (e) {
    // artifact 写入失败不阻断
  }

  return { success: true, report: report };
}

/**
 * 生成事件日志并持久化
 *
 * @param {string} graphId
 * @param {Array} loopEvents
 * @returns {{ success: boolean, events?: Array, error?: string }}
 */
function saveLoopEvents(graphId, loopEvents) {
  if (!graphId) {
    return { success: false, error: '缺少必填参数: graphId' };
  }

  var graph = graphStore.getGraph(graphId);
  if (!graph) {
    return { success: false, error: 'Graph 不存在: ' + graphId };
  }

  var events = loopEvents || [];
  var payload = {
    graph_id: graphId,
    mission_id: graph.mission_id,
    loop_events: events,
    total_events: events.length,
    updated_at: now()
  };

  try {
    artifactStore.saveArtifact({
      mission_id: graph.mission_id,
      filename: 'loop-events.json',
      agent: 'autonomous-loop-report',
      content: JSON.stringify(payload, null, 2)
    });
    return { success: true, events: events };
  } catch (e) {
    return { success: false, error: 'Failed to save loop events: ' + e.message };
  }
}

/**
 * 保存 recovery log
 *
 * @param {string} missionId
 * @param {object} recoveryData
 * @returns {{ success: boolean, error?: string }}
 */
function saveRecoveryLog(missionId, recoveryData) {
  if (!missionId || !recoveryData) {
    return { success: false, error: '缺少必填参数' };
  }

  try {
    artifactStore.saveArtifact({
      mission_id: missionId,
      filename: 'recovery-log.json',
      agent: 'autonomous-loop-engine',
      content: JSON.stringify(recoveryData, null, 2)
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Failed to save recovery log: ' + e.message };
  }
}

/**
 * 保存 dispatch artifact
 *
 * @param {string} missionId
 * @param {object} dispatchData
 * @returns {{ success: boolean, error?: string }}
 */
function saveDispatchArtifact(missionId, dispatchData) {
  if (!missionId || !dispatchData) {
    return { success: false, error: '缺少必填参数' };
  }

  try {
    artifactStore.saveArtifact({
      mission_id: missionId,
      filename: 'dispatch.json',
      agent: 'autonomous-loop-policy',
      content: JSON.stringify(dispatchData, null, 2)
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Failed to save dispatch artifact: ' + e.message };
  }
}

// ─── Internal ───────────────────────────────────────────────

function _buildSummary(status, completed, failed, blocked, running, pending, skipped, events) {
  var parts = [];

  if (status === 'completed') {
    parts.push('All ' + completed + ' nodes completed successfully.');
  } else if (status === 'failed') {
    parts.push(failed + ' node(s) failed');
    if (completed > 0) parts.push(completed + ' completed');
    if (blocked > 0) parts.push(blocked + ' blocked');
    parts.push('Execution halted due to failure.');
  } else if (status === 'blocked') {
    parts.push(blocked + ' node(s) blocked');
    if (completed > 0) parts.push(completed + ' completed');
    if (running > 0) parts.push(running + ' running');
    parts.push('Execution blocked pending approval or agent recovery.');
  } else if (status === 'running') {
    parts.push(running + ' node(s) running');
    if (completed > 0) parts.push(completed + ' completed');
    if (pending > 0) parts.push(pending + ' pending');
    parts.push('Execution in progress.');
  } else {
    parts.push('Graph is in ' + status + ' state.');
    if (completed > 0) parts.push(completed + ' completed');
    if (pending > 0) parts.push(pending + ' pending');
  }

  if (events.length > 0) {
    parts.push(events.length + ' total events recorded.');
  }

  return parts.join(' ');
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  generateLoopReport: generateLoopReport,
  saveLoopEvents: saveLoopEvents,
  saveRecoveryLog: saveRecoveryLog,
  saveDispatchArtifact: saveDispatchArtifact,

  // 内部导出供测试
  _buildSummary: _buildSummary
};
