'use strict';

/**
 * commander-report.js - P11.0 Commander Report Generator
 *
 * 职责: 为 Commander Gateway 生成标准化的报告 artifacts
 *   - dispatch.json
 *   - approval-log.json
 *   - commander-report.json
 */

var artifactStore = require('../artifacts/artifact-store');
var artifactIndex = require('../artifacts/artifact-index');

// ─── 辅助 ──────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

/**
 * 安全写入 artifact
 */
function safeWriteArtifact(missionId, filename, agent, content) {
  try {
    var result = artifactStore.saveArtifact({
      mission_id: missionId,
      filename: filename,
      agent: agent,
      content: typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content)
    });

    if (result.success) {
      artifactIndex.indexArtifact(result.metadata);
    }
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Dispatch Report ──────────────────────────────────────

/**
 * 生成 dispatch artifact
 *
 * @param {string} missionId
 * @param {array}  dispatchResults - capability check 结果列表
 * @returns {object}
 */
function writeDispatchReport(missionId, dispatchResults) {
  var report = {
    mission_id: missionId,
    generated_at: now(),
    dispatches: dispatchResults || [],
    total: (dispatchResults || []).length,
    allowed: 0,
    blocked: 0,
    failed: 0
  };

  if (dispatchResults) {
    for (var di = 0; di < dispatchResults.length; di++) {
      var d = dispatchResults[di];
      if (d.allowed) report.allowed++;
      else if (d.blocked) report.blocked++;
      else report.failed++;
    }
  }

  var result = safeWriteArtifact(missionId, 'dispatch.json', 'commander', report);

  return {
    success: result.success,
    report: report,
    path: result.path || null,
    error: result.error || null
  };
}

// ─── Approval Log ─────────────────────────────────────────

/**
 * 写入审批日志
 *
 * @param {string} missionId
 * @param {string} action   - 'approve' | 'reject'
 * @param {object} details  - 审批详情
 * @returns {object}
 */
function writeApprovalLog(missionId, action, details) {
  if (!details) details = {};

  var log = {
    mission_id: missionId,
    action: action,
    operator: details.operator || 'unknown',
    timestamp: now(),
    reason: details.reason || '',
    capabilities: details.capabilities || [],
    previous_status: details.previous_status || '',
    new_status: action === 'approve' ? 'approved' : 'rejected'
  };

  var result = safeWriteArtifact(missionId, 'approval-log.json', 'commander', {
    entries: [log],
    last_action: action,
    created_at: now()
  });

  return {
    success: result.success,
    log: log,
    path: result.path || null,
    error: result.error || null
  };
}

/**
 * 追加审批日志到已有文件
 *
 * @param {string} missionId
 * @param {string} action
 * @param {object} details
 * @returns {object}
 */
function appendApprovalLog(missionId, action, details) {
  if (!details) details = {};

  var existing = artifactStore.readArtifact(missionId, 'approval-log.json');
  var log = {
    mission_id: missionId,
    action: action,
    operator: details.operator || 'unknown',
    timestamp: now(),
    reason: details.reason || '',
    capabilities: details.capabilities || [],
    previous_status: details.previous_status || '',
    new_status: action === 'approve' ? 'approved' : 'rejected'
  };

  var entries = [];
  if (existing.success && existing.content) {
    try {
      var parsed = JSON.parse(existing.content);
      entries = parsed.entries || [];
    } catch (e) {
      entries = [];
    }
  }
  entries.push(log);

  var result = safeWriteArtifact(missionId, 'approval-log.json', 'commander', {
    entries: entries,
    last_action: action,
    updated_at: now()
  });

  return {
    success: result.success,
    log: log,
    path: result.path || null,
    error: result.error || null
  };
}

// ─── Commander Report ─────────────────────────────────────

/**
 * 生成 Commander 整体报告
 *
 * @param {string} missionId
 * @param {object} mission    - mission 蓝图
 * @param {object} graph      - task graph
 * @param {object} loopResult - autonomous loop 结果
 * @returns {object}
 */
function writeCommanderReport(missionId, mission, graph, loopResult) {
  var report = {
    mission_id: missionId,
    generated_at: now(),
    source: mission.source || 'unknown',
    operator: mission.operator || 'unknown',
    room: mission.room || '',
    text: mission.text || '',
    mission_type: mission.mission_type || 'general',
    status: loopResult ? loopResult.status : 'created',
    graph_id: graph ? graph.graph_id : null,
    graph_status: graph ? graph.status : 'unknown',
    loop_steps: loopResult ? loopResult.total_steps : 0,
    message: loopResult ? (loopResult.message || '') : ''
  };

  var result = safeWriteArtifact(missionId, 'commander-report.json', 'commander', report);

  return {
    success: result.success,
    report: report,
    path: result.path || null,
    error: result.error || null
  };
}

// ─── Status Summary ───────────────────────────────────────

/**
 * 生成 Commander Mission 状态摘要
 *
 * @param {string} missionId
 * @param {object} mission
 * @param {object} graph
 * @param {object} approvalLog
 * @returns {object}
 */
function generateStatusSummary(missionId, mission, graph, approvalLog) {
  // 确定 stage
  var stage = 'created';
  if (graph) {
    if (graph.status === 'completed' || graph.status === 'success') {
      stage = 'completed';
    } else if (graph.status === 'failed') {
      stage = 'failed';
    } else if (graph.status === 'running') {
      stage = 'running';
    } else if (graph.status === 'blocked') {
      stage = 'blocked';
    } else {
      stage = 'planning';
    }
  }

  // 计算进度
  var progress = 0;
  if (graph && graph.nodes) {
    var done = 0;
    for (var ni = 0; ni < graph.nodes.length; ni++) {
      if (graph.nodes[ni].status === 'completed' || graph.nodes[ni].status === 'success') {
        done++;
      }
    }
    progress = graph.nodes.length > 0 ? Math.round((done / graph.nodes.length) * 100) : 0;
  }

  // 审批状态
  var approvalStatus = 'not_required';
  if (approvalLog) {
    if (approvalLog.last_action === 'approve') approvalStatus = 'approved';
    else if (approvalLog.last_action === 'reject') approvalStatus = 'rejected';
    else approvalStatus = 'pending';
  }

  return {
    mission_id: missionId,
    source: mission.source || 'unknown',
    operator: mission.operator || 'unknown',
    room: mission.room || '',
    mission_type: mission.mission_type || 'general',
    stage: stage,
    progress: progress,
    graph_status: graph ? graph.status : 'unknown',
    approval_status: approvalStatus,
    requires_approval: approvalLog ? true : false,
    updated_at: now()
  };
}

// ─── WorkBuddy Artifact ────────────────────────────────────

/**
 * P11.2: Write a generic artifact for a mission (used by WorkBuddy adapter).
 * @param {string} missionId
 * @param {string} filename - e.g. "workbuddy-result.json"
 * @param {string} content - string content to write
 * @returns {{ success: boolean, path?: string, error?: string }}
 */
function writeMissionArtifact(missionId, filename, content) {
  return safeWriteArtifact(missionId, filename, content);
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  writeDispatchReport: writeDispatchReport,
  writeApprovalLog: writeApprovalLog,
  appendApprovalLog: appendApprovalLog,
  writeCommanderReport: writeCommanderReport,
  generateStatusSummary: generateStatusSummary,
  safeWriteArtifact: safeWriteArtifact,
  writeMissionArtifact: writeMissionArtifact
};
