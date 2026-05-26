'use strict';

/**
 * workbuddy-agent.js - Read-only audit agent for server health/security checks
 *
 * Mirrors the codex-agent export pattern:
 * - Default: plan-only mode (returns audit plan, zero side effects)
 * - confirm:audit: executes real read-only commands and returns report
 *
 * Security:
 * - All commands go through safe-command-runner.js (whitelist + blocklist)
 * - Output sanitization handled by agent-dispatcher (sanitizeOutput)
 * - Results logged to logs/tasks/*.jsonl via task-store
 *
 * P7.2.1: AI Runtime RBAC 权限由 agent-dispatcher 在调用前统一检查
 *         允许: readonly-audit, staging-audit
 *         拒绝: deploy-production, modify-env, modify-nginx, rm, kill, sudo
 */

const { executeCommand } = require('./safe-command-runner');
const { updateTask } = require('../orchestrator/v2/task-store');

var AUDIT_KEYWORD = 'confirm:audit';

var AUDIT_COMMANDS = [
  'pm2 status',
  'df -h',
  'free -m',
  'uptime',
  'ss -lntp',
  'docker ps',
  'node -v',
  'npm -v',
];

function isAuditRequest(content) {
  if (!content || typeof content !== 'string') return false;
  return content.toLowerCase().indexOf(AUDIT_KEYWORD.toLowerCase()) !== -1;
}

function stripConfirmKeyword(content) {
  if (!content) return content;
  var regex = new RegExp(AUDIT_KEYWORD, 'gi');
  return content.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
}

function generateAuditPlan(content) {
  var timestamp = new Date().toISOString();
  var steps = AUDIT_COMMANDS.map(function(cmd, i) {
    return (i + 1) + '. `' + cmd + '`';
  }).join('\n');

  return [
    '=== WorkBuddy Audit Plan ===',
    'Time: ' + timestamp,
    'Task: ' + content,
    '',
    'Commands to execute:',
    steps,
    '',
    'Security Constraints:',
    '- Read-only commands only',
    '- No sudo, no rm, no kill, no restart',
    '- No git push/merge, no .env changes, no deploy',
    '- All output sanitized (API keys redacted)',
    '',
    'To execute, append: ' + AUDIT_KEYWORD,
  ].join('\n');
}

function mockPlanOnly(content) {
  return {
    plan: [
      '[WorkBuddy] Audit Plan: "' + content + '"',
      '[WorkBuddy] 白名单命令就绪',
      '[WorkBuddy] plan-only 模式: 仅返回审计计划，等待确认',
      '[WorkBuddy] 添加 \'confirm:audit\' 以执行审计',
    ].join('\n'),
    estimatedTime: '~2 分钟'
  };
}

async function execute(params) {
  var content = params.content;
  var taskId = params.taskId;
  var command = params.command;
  var auditContent = stripConfirmKeyword(content || '');

  if (isAuditRequest(content)) {
    var results = [];
    var errors = [];

    for (var i = 0; i < AUDIT_COMMANDS.length; i++) {
      var cmd = AUDIT_COMMANDS[i];
      try {
        var result = await executeCommand(cmd);
        results.push({ cmd: cmd, success: result.success, stdout: result.stdout, stderr: result.stderr, duration: result.duration });
      } catch (err) {
        errors.push({ cmd: cmd, error: err.message });
      }
    }

    var reportSections = [];
    reportSections.push('=== WorkBuddy Audit Report ===');
    reportSections.push('Task ID: ' + taskId);
    reportSections.push('Time: ' + new Date().toISOString());
    reportSections.push('Command: ' + (auditContent || content));
    reportSections.push('');

    var succeeded = results.filter(function(r) { return r.success; });
    var failed = results.filter(function(r) { return !r.success; });

    if (succeeded.length > 0) {
      reportSections.push('--- Results (' + succeeded.length + '/' + AUDIT_COMMANDS.length + ') ---');
      for (var s = 0; s < succeeded.length; s++) {
        var r = succeeded[s];
        reportSections.push('[' + r.cmd + '] (' + r.duration + 'ms)');
        reportSections.push(r.stdout.trim());
        reportSections.push('');
      }
    }

    if (failed.length > 0) {
      reportSections.push('--- Failed (' + failed.length + ') ---');
      for (var f = 0; f < failed.length; f++) {
        var fr = failed[f];
        reportSections.push('[' + fr.cmd + '] FAILED: ' + fr.stderr.trim());
        reportSections.push('');
      }
    }

    if (errors.length > 0) {
      reportSections.push('--- Errors (' + errors.length + ') ---');
      for (var e = 0; e < errors.length; e++) {
        var er = errors[e];
        reportSections.push('[' + er.cmd + '] ERROR: ' + er.error);
        reportSections.push('');
      }
    }

    var totalDuration = succeeded.reduce(function(sum, r) { return sum + r.duration; }, 0);
    reportSections.push('=== Summary ===');
    reportSections.push('Total commands: ' + AUDIT_COMMANDS.length);
    reportSections.push('Succeeded: ' + succeeded.length);
    reportSections.push('Failed: ' + failed.length);
    reportSections.push('Errors: ' + errors.length);

    var report = reportSections.join('\n');

    try {
      updateTask(taskId, {
        status: 'completed',
        result: JSON.stringify({ report: report, succeeded: succeeded.length, failed: failed.length, errors: errors.length }),
      });
    } catch (_) {}

    return {
      success: true,
      task_id: taskId,
      result: {
        plan: report,
        estimatedTime: totalDuration + 'ms',
        mode: 'audit-executed',
      },
    };
  } else {
    var plan = generateAuditPlan(content);
    return {
      success: true,
      task_id: taskId,
      result: {
        plan: plan,
        estimatedTime: '~2 分钟',
        mode: 'plan-only',
      },
    };
  }
}

module.exports = {
  execute: execute,
  isAuditRequest: isAuditRequest,
  stripConfirmKeyword: stripConfirmKeyword,
  generateAuditPlan: generateAuditPlan,
  mockPlanOnly: mockPlanOnly,
  AUDIT_KEYWORD: AUDIT_KEYWORD,
};
