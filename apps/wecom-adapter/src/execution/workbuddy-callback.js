'use strict';

/**
 * workbuddy-callback.js - P11.2 Callback handler and response formatting
 * 
 * Handles formatting of callback results for WeCom progress reporting.
 * Thin wrapper that delegates actual job updates to workbuddy-adapter.
 */

var jobStore = require('./workbuddy-job-store');

// ─── Callback response formatter ───────────────────────────

/**
 * Format a callback result for WeCom message display.
 */
function formatWorkBuddyResult(job, event) {
  var status = job.status;
  var statusEmoji = {
    'completed': '✅',
    'failed': '❌',
    'running': '🔄',
    'waiting_approval': '⏸️',
    'dispatched': '📤',
    'cancelled': '🚫'
  };

  var emoji = statusEmoji[status] || '📋';
  var lines = [];

  lines.push(emoji + ' **WorkBuddy Execution Result**');
  lines.push('');
  lines.push('| 字段 | 值 |');
  lines.push('|------|-----|');
  lines.push('| Job | `' + (job.job_id || '?') + '` |');
  lines.push('| Mission | `' + (job.mission_id || '?') + '` |');
  lines.push('| Action | `' + (job.action || '?') + '` |');
  lines.push('| Status | ' + status + ' |');

  if (job.result) {
    if (job.result.pr) {
      lines.push('| PR | #' + job.result.pr + ' |');
    }
    if (job.result.commit) {
      lines.push('| Commit | `' + job.result.commit + '` |');
    }
    if (job.result.tests) {
      lines.push('| Tests | ' + job.result.tests + ' |');
    }
    if (job.result.message) {
      lines.push('| Message | ' + job.result.message + ' |');
    }
  }

  if (event && event.message) {
    lines.push('');
    lines.push('> ' + event.message);
  }

  return lines.join('\n');
}

/**
 * Format a job dispatch notification for WeCom.
 */
function formatDispatchNotification(job) {
  var lines = [];
  lines.push('📤 **WorkBuddy Job Dispatched**');
  lines.push('');
  lines.push('| 字段 | 值 |');
  lines.push('|------|-----|');
  lines.push('| Job | `' + job.job_id + '` |');
  lines.push('| Mission | `' + job.mission_id + '` |');
  lines.push('| Action | `' + job.action + '` |');
  lines.push('| Queue | `' + (job.queue_path || 'N/A') + '` |');

  return lines.join('\n');
}

/**
 * Format a job approval required notification.
 */
function formatApprovalRequired(job) {
  var lines = [];
  lines.push('⏸️ **WorkBuddy Job Requires Approval**');
  lines.push('');
  lines.push('| 字段 | 值 |');
  lines.push('|------|-----|');
  lines.push('| Job | `' + job.job_id + '` |');
  lines.push('| Mission | `' + job.mission_id + '` |');
  lines.push('| Action | `' + job.action + '` |');
  lines.push('');
  lines.push('请使用 `/审批 ' + job.job_id + '` 或 `/拒绝 ' + job.job_id + '` 处理。');

  return lines.join('\n');
}

// ─── Sanitize (markdown safety) ────────────────────────────

function sanitize(text) {
  if (!text) return text;
  var t = String(text);
  // Break markdown link injection: ]( → ] (
  t = t.replace(/\]\s*\(/g, '] (');
  // Limit length
  if (t.length > 2000) t = t.substring(0, 2000) + '...';
  return t;
}

// ─── Export ────────────────────────────────────────────────

module.exports = {
  formatWorkBuddyResult: formatWorkBuddyResult,
  formatDispatchNotification: formatDispatchNotification,
  formatApprovalRequired: formatApprovalRequired,
  sanitize: sanitize
};
