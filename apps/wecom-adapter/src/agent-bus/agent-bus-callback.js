'use strict';

/**
 * agent-bus-callback.js - P11.3 Agent Bus Callback Formatter
 * 
 * Formats agent callback results for WeCom notifications.
 */

var AGENT_EMOJI = {
  'workbuddy': '\uD83D\uDCBB',
  'codex': '\uD83E\uDD16',
  'deepseek': '\uD83D\uDD0D',
  'doubao': '\uD83D\uDCE2',
  'openclaw-runtime': '\uD83E\uDD16'
};

function formatAgentResult(job) {
  var emoji = AGENT_EMOJI[job.agent_type] || '\uD83D\uDCE6';
  var lines = [];
  lines.push(emoji + ' **Agent Bus Result: ' + job.agent_type + '**');
  lines.push('');
  lines.push('| 字段 | 值 |');
  lines.push('|------|-----|');
  lines.push('| Job | `' + (job.job_id || '?') + '` |');
  lines.push('| Agent | ' + job.agent_type + ' |');
  lines.push('| Action | `' + (job.action || '?') + '` |');
  lines.push('| Status | ' + (job.status || '?') + ' |');

  if (job.result) {
    if (job.result.tests) lines.push('| Tests | ' + job.result.tests + ' |');
    if (job.result.pr) lines.push('| PR | #' + job.result.pr + ' |');
    if (job.result.message) lines.push('| Message | ' + job.result.message + ' |');
  }

  return lines.join('\n');
}

function formatAgentList(agents) {
  var lines = ['\uD83D\uDCCB **Agent Bus Registry**', ''];
  lines.push('| Agent | Type | Status |');
  lines.push('|-------|------|--------|');
  agents.forEach(function(a) {
    var statusIcon = a.status === 'online' ? '\u2705' : a.status === 'offline' ? '\u274C' : '\u26A0';
    lines.push('| `' + (a.agent_id || '?') + '` | ' + (a.agent_type || '?') + ' | ' + statusIcon + ' ' + a.status + ' |');
  });
  return lines.join('\n');
}

function sanitize(text) {
  if (!text) return text;
  var t = String(text).replace(/\]\s*\(/g, '] (');
  if (t.length > 2000) t = t.substring(0, 2000) + '...';
  return t;
}

module.exports = {
  formatAgentResult: formatAgentResult,
  formatAgentList: formatAgentList,
  sanitize: sanitize
};
