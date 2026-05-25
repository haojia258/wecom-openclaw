'use strict';

/**
 * commander-policy.js - 安全策略引擎 (v2)
 *
 * 七大安全策略:
 * 1. 默认 plan-only 模式
 * 2. 禁止自动 merge
 * 3. 禁止自动 deploy
 * 4. 禁止输出 API Key
 * 5. WorkBuddy 白名单命令 (confirm:audit 允许绕过白名单内容校验)
 * 6. 所有任务写 logs/tasks/*.jsonl
 * 7. 每个任务生成 task_id
 */

const crypto = require('crypto');

// WorkBuddy 白名单命令
const WORKBUDDY_WHITELIST = [
  'read_file',
  'search_code',
  'analyze_code',
  'generate_plan',
  'generate_report',
  'run_test',
  'check_status'
];

// API Key 敏感模式
const API_KEY_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/gi,
  /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi,
  /secret\s*[:=]\s*['"][^'"]+['"]/gi,
  /token\s*[:=]\s*['"][^'"]+['"]/gi,
  /Bearer\s+[a-zA-Z0-9_-]{20,}/gi
];

function generateTaskId() {
  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  return 'task_' + ts + '_' + rand;
}

function sanitizeOutput(text) {
  let sanitized = text;
  for (let i = 0; i < API_KEY_PATTERNS.length; i++) {
    sanitized = sanitized.replace(API_KEY_PATTERNS[i], '[REDACTED]');
  }
  return sanitized;
}

function isPlanOnly() {
  return true;
}

function checkForbiddenAction(action) {
  const forbiddenActions = {
    'merge': '禁止自动 merge',
    'deploy': '禁止自动 deploy',
    'auto_merge': '禁止自动 merge',
    'auto_deploy': '禁止自动 deploy',
    'git merge': '禁止自动 merge',
    'git push --force': '禁止自动 deploy',
    'pm2 restart': '禁止自动 deploy',
  };

  const actionLower = (action || '').toLowerCase();
  const keys = Object.keys(forbiddenActions);
  for (let i = 0; i < keys.length; i++) {
    if (actionLower.includes(keys[i].toLowerCase())) {
      return { allowed: false, reason: forbiddenActions[keys[i]] };
    }
  }

  return { allowed: true };
}

function validateWorkbuddyCommand(content) {
  if (!content) {
    return { allowed: false, reason: 'WorkBuddy 命令不能为空' };
  }

  const contentLower = content.toLowerCase();
  const matched = WORKBUDDY_WHITELIST.filter(function(c) {
    return contentLower.includes(c.toLowerCase());
  });

  if (matched.length === 0) {
    return {
      allowed: false,
      reason: 'WorkBuddy 内容未匹配白名单关键词。白名单: ' + WORKBUDDY_WHITELIST.join(', ')
    };
  }

  return { allowed: true, matched: matched };
}

function securityCheck(context) {
  const violations = [];
  const warnings = [];

  const forbidden = checkForbiddenAction(context.content || '');
  if (!forbidden.allowed) {
    violations.push(forbidden.reason);
  }

  // P6.2: workbuddy + confirm:audit 允许绕过白名单内容校验
  // (实际命令执行由 safe-command-runner.js 的白名单+黑名单双重保护)
  if (context.agent === 'workbuddy') {
    const isAuditAuthorized = context.content &&
      context.content.toLowerCase().indexOf('confirm:audit') !== -1;

    if (!isAuditAuthorized) {
      const wbCheck = validateWorkbuddyCommand(context.content);
      if (!wbCheck.allowed) {
        violations.push(wbCheck.reason);
      }
    }
  }

  warnings.push('默认 plan-only 模式: 仅返回执行计划，不执行实际操作');
  warnings.push('任务将记录到 logs/tasks/*.jsonl');

  return {
    passed: violations.length === 0,
    violations: violations,
    warnings: warnings
  };
}

function getPolicySummary() {
  return [
    '1. 默认 plan-only 模式',
    '2. 禁止自动 merge',
    '3. 禁止自动 deploy',
    '4. 禁止输出 API Key',
    '5. WorkBuddy 仅允许白名单命令 (confirm:audit 例外)',
    '6. 所有任务写 logs/tasks/*.jsonl',
    '7. 每个任务生成 task_id'
  ];
}

module.exports = {
  generateTaskId: generateTaskId,
  sanitizeOutput: sanitizeOutput,
  isPlanOnly: isPlanOnly,
  checkForbiddenAction: checkForbiddenAction,
  validateWorkbuddyCommand: validateWorkbuddyCommand,
  securityCheck: securityCheck,
  getPolicySummary: getPolicySummary
};
