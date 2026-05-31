'use strict';

/**
 * wecom-mission-format.js - P11.1 WeCom Mission Format
 *
 * 职责: 将 Commander Mission 状态格式化为企业微信 Markdown 消息
 */

// ─── 格式化函数 ────────────────────────────────────────────

/**
 * 任务创建成功
 */
function formatMissionCreated(missionId, graphId, missionType, status) {
  var lines = [];
  lines.push('## 🚀 Mission Created');
  lines.push('');
  lines.push('| 字段 | 值 |');
  lines.push('|------|-----|');
  lines.push('| Mission | `' + sanitize(missionId) + '` |');
  lines.push('| Graph | `' + sanitize(graphId) + '` |');
  if (missionType) lines.push('| Type | ' + sanitize(missionType) + ' |');
  lines.push('| Status | ' + sanitize(status || 'created') + ' |');
  lines.push('| Stage | planning |');
  return lines.join('\n');
}

/**
 * 任务进行中
 */
function formatMissionRunning(missionId, progress, currentNode, agent) {
  var lines = [];
  lines.push('## 🟡 Mission Running');
  lines.push('');
  lines.push('| 字段 | 值 |');
  lines.push('|------|-----|');
  lines.push('| Mission | `' + sanitize(missionId) + '` |');
  lines.push('| Progress | ' + (progress || 0) + '% |');
  if (currentNode) lines.push('| Current Node | ' + sanitize(currentNode) + ' |');
  if (agent) lines.push('| Agent | ' + sanitize(agent) + ' |');
  return lines.join('\n');
}

/**
 * 任务完成
 */
function formatMissionCompleted(missionId, artifactCount, testsStatus, risk) {
  var lines = [];
  lines.push('## ✅ Mission Completed');
  lines.push('');
  lines.push('| 字段 | 值 |');
  lines.push('|------|-----|');
  lines.push('| Mission | `' + sanitize(missionId) + '` |');
  if (artifactCount !== undefined) lines.push('| Artifacts | ' + artifactCount + ' |');
  if (testsStatus) lines.push('| Tests | ' + sanitize(testsStatus) + ' |');
  if (risk) lines.push('| Risk | ' + sanitize(risk) + ' |');
  return lines.join('\n');
}

/**
 * 任务失败
 */
function formatMissionFailed(missionId, error, failedNode) {
  var lines = [];
  lines.push('## ❌ Mission Failed');
  lines.push('');
  lines.push('| 字段 | 值 |');
  lines.push('|------|-----|');
  lines.push('| Mission | `' + sanitize(missionId) + '` |');
  if (failedNode) lines.push('| Failed Node | ' + sanitize(failedNode) + ' |');
  if (error) lines.push('| Error | ' + sanitize(error.substring(0, 200)) + ' |');
  return lines.join('\n');
}

/**
 * 任务阻塞（需要审批）
 */
function formatMissionBlocked(missionId, reason) {
  var lines = [];
  lines.push('## ⚠️ Mission Blocked');
  lines.push('');
  lines.push('Reason: ' + sanitize(reason || 'requiresApproval'));
  lines.push('');
  lines.push('Action: 请发送 `/审批 ' + sanitize(missionId) + '`');
  return lines.join('\n');
}

/**
 * 任务状态详情
 */
function formatMissionDetail(missionId, status, graph) {
  var lines = [];
  lines.push('## 📋 Mission Detail');
  lines.push('');
  lines.push('**Mission:** `' + sanitize(missionId) + '`');
  lines.push('');
  lines.push('| 字段 | 值 |');
  lines.push('|------|-----|');
  lines.push('| Status | ' + sanitize(status.stage || 'unknown') + ' |');
  lines.push('| Progress | ' + (status.progress || 0) + '% |');
  lines.push('| Type | ' + sanitize(status.mission_type || 'unknown') + ' |');
  lines.push('| Approval | ' + sanitize(status.approval_status || 'not_required') + ' |');
  if (graph) {
    lines.push('| Graph | ' + sanitize(graph.status || 'unknown') + ' |');
    lines.push('| Nodes | ' + (graph.node_count || 0) + ' |');
  }
  return lines.join('\n');
}

/**
 * 审批结果
 */
function formatApprovalResult(missionId, action, operator) {
  var lines = [];
  if (action === 'approve') {
    lines.push('## ✅ Approved');
  } else {
    lines.push('## ❌ Rejected');
  }
  lines.push('');
  lines.push('Mission: `' + sanitize(missionId) + '`');
  lines.push('Operator: ' + sanitize(operator || 'unknown'));
  return lines.join('\n');
}

/**
 * Artifacts 列表
 */
function formatArtifactsList(missionId, artifacts, count) {
  var lines = [];
  lines.push('## 📦 Artifacts');
  lines.push('');
  lines.push('Mission: `' + sanitize(missionId) + '`');
  lines.push('Count: ' + (count || 0));
  lines.push('');
  if (artifacts && artifacts.length > 0) {
    for (var i = 0; i < Math.min(artifacts.length, 10); i++) {
      var a = artifacts[i];
      var fileName = typeof a === 'string' ? a : (a.filename || a.name || 'unknown');
      lines.push('- ' + sanitize(fileName));
    }
    if (artifacts.length > 10) {
      lines.push('... and ' + (artifacts.length - 10) + ' more');
    }
  }
  return lines.join('\n');
}

/**
 * 错误消息
 */
function formatError(error) {
  return '## ❌ Error\n\n' + sanitize(error || 'Unknown error');
}

/**
 * 帮助信息
 */
function formatHelp() {
  var lines = [];
  lines.push('## 🤖 Commander Help');
  lines.push('');
  lines.push('**Commands:**');
  lines.push('');
  lines.push('| Command | Description |');
  lines.push('|---------|-------------|');
  lines.push('| `/任务 状态 <id>` | 查询任务状态 |');
  lines.push('| `/任务 详情 <id>` | 查看任务详情 |');
  lines.push('| `/任务 artifacts <id>` | 查看 artifacts |');
  lines.push('| `/审批 <id>` | 审批任务 |');
  lines.push('| `/拒绝 <id>` | 拒绝任务 |');
  lines.push('');
  lines.push('**直接发送任务描述**即可创建 Mission');
  return lines.join('\n');
}

// ─── 指令解析 ──────────────────────────────────────────────

/**
 * 解析企业微信指令
 *
 * @param {string} content - 消息内容
 * @returns {object|null} { command, subcommand, missionId } or null
 */
function parseCommand(content) {
  if (!content || typeof content !== 'string') return null;

  var trimmed = content.trim();

  // /审批 <mission_id>
  var approveMatch = trimmed.match(/^\/审批\s+([a-zA-Z0-9_-]+)\s*$/);
  if (approveMatch) {
    return { command: 'approve', mission_id: approveMatch[1] };
  }

  // /拒绝 <mission_id>
  var rejectMatch = trimmed.match(/^\/拒绝\s+([a-zA-Z0-9_-]+)\s*$/);
  if (rejectMatch) {
    return { command: 'reject', mission_id: rejectMatch[1] };
  }

  // /任务 状态 <mission_id>
  var statusMatch = trimmed.match(/^\/任务\s+状态\s+([a-zA-Z0-9_-]+)\s*$/);
  if (statusMatch) {
    return { command: 'status', mission_id: statusMatch[1] };
  }

  // /任务 详情 <mission_id>
  var detailMatch = trimmed.match(/^\/任务\s+详情\s+([a-zA-Z0-9_-]+)\s*$/);
  if (detailMatch) {
    return { command: 'detail', mission_id: detailMatch[1] };
  }

  // /任务 artifacts <mission_id>
  var artMatch = trimmed.match(/^\/任务\s+artifacts\s+([a-zA-Z0-9_-]+)\s*$/);
  if (artMatch) {
    return { command: 'artifacts', mission_id: artMatch[1] };
  }

  // /help or /任务 help
  if (trimmed === '/help' || trimmed === '/帮助' || trimmed === '/任务 help') {
    return { command: 'help', mission_id: null };
  }

  return null; // 不是指令，是任务描述
}

// ─── 安全过滤 ──────────────────────────────────────────────

/**
 * 安全过滤输出内容，防止 Markdown 注入
 */
function sanitize(text) {
  if (!text) return '';
  var t = String(text);
  // 限制长度
  if (t.length > 500) t = t.substring(0, 497) + '...';
  // 移除去控制字符
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  // 防止 Markdown 链接注入：将 ]( 替换为 ] ( 打破语法
  t = t.replace(/\]\s*\(/g, '] (');
  // 限制长度
  return t;
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  formatMissionCreated: formatMissionCreated,
  formatMissionRunning: formatMissionRunning,
  formatMissionCompleted: formatMissionCompleted,
  formatMissionFailed: formatMissionFailed,
  formatMissionBlocked: formatMissionBlocked,
  formatMissionDetail: formatMissionDetail,
  formatApprovalResult: formatApprovalResult,
  formatArtifactsList: formatArtifactsList,
  formatError: formatError,
  formatHelp: formatHelp,
  parseCommand: parseCommand,
  sanitize: sanitize
};
