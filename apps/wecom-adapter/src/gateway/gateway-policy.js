'use strict';

/**
 * gateway-policy.js - Gateway 策略层 (P8.0.3)
 *
 * 定义 Gateway 安全策略：
 * - command allowlist（仅允许安全命令）
 * - mode allowlist（默认仅 plan-only）
 * - agent allowlist（可选，限制哪些 agent 可被调用）
 */

// ─── 策略常量 ────────────────────────────────────────────

/**
 * 允许通过 Gateway 执行的命令白名单
 * 不允许直接 confirm:* 命令通过 Gateway
 */
var GATEWAY_COMMAND_ALLOWLIST = [
  '/总控', '/commander', '/总控台',
  '/目标', '/帮助', '/状态', '/进度', '/任务列表'
];

/**
 * 允许的模式白名单
 * v1 仅允许 plan-only
 */
var GATEWAY_MODE_ALLOWLIST = [
  'plan-only'
];

/**
 * 允许的 agent 白名单
 * 可选启用，默认不限制 agent
 */
var GATEWAY_AGENT_ALLOWLIST = [
  'codex', 'workbuddy', 'deepseek', 'doubao'
];

// ─── 危险命令模式 ────────────────────────────────────────

/**
 * 禁止通过 Gateway 执行的命令模式
 * 这些命令涉及确认操作、部署等危险行为
 */
var BLOCKED_COMMAND_PATTERNS = [
  /^confirm:/i,       // 所有 confirm: 命令
  /^\/deploy/i,       // 部署
  /^\/merge/i,        // 合并
  /^\/restart/i       // 重启
];

// ─── 检查函数 ────────────────────────────────────────────

/**
 * 检查命令是否在 allowlist 中
 *
 * @param {string} command
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkCommandAllowed(command) {
  if (!command || typeof command !== 'string') {
    return { allowed: false, reason: '命令为空' };
  }

  // 检查是否匹配阻断模式
  for (var i = 0; i < BLOCKED_COMMAND_PATTERNS.length; i++) {
    if (BLOCKED_COMMAND_PATTERNS[i].test(command.trim())) {
      return {
        allowed: false,
        reason: '命令 "' + command.split(' ')[0] + '" 不允许通过 Gateway（危险操作）'
      };
    }
  }

  // 提取命令前缀（去掉参数）
  var cmdPrefix = command.trim().split(' ')[0];

  // 检查是否在 allowlist
  for (var j = 0; j < GATEWAY_COMMAND_ALLOWLIST.length; j++) {
    if (cmdPrefix === GATEWAY_COMMAND_ALLOWLIST[j]) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: '命令 "' + cmdPrefix + '" 不在 Gateway 白名单中'
  };
}

/**
 * 检查 mode 是否在 allowlist 中
 *
 * @param {string} mode
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkModeAllowed(mode) {
  if (!mode || typeof mode !== 'string') {
    return { allowed: false, reason: 'mode 为空' };
  }

  for (var i = 0; i < GATEWAY_MODE_ALLOWLIST.length; i++) {
    if (mode === GATEWAY_MODE_ALLOWLIST[i]) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: 'mode "' + mode + '" 不在 Gateway 白名单中（当前仅允许 plan-only）'
  };
}

/**
 * 检查 agent 是否在 allowlist 中
 *
 * @param {string} agent
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkAgentAllowed(agent) {
  // agent 检查是可选的：如果请求中不包含 agent 字段，允许通过
  if (!agent) {
    return { allowed: true };
  }

  if (typeof agent !== 'string') {
    return { allowed: false, reason: 'agent 字段格式错误' };
  }

  for (var i = 0; i < GATEWAY_AGENT_ALLOWLIST.length; i++) {
    if (agent === GATEWAY_AGENT_ALLOWLIST[i]) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: 'agent "' + agent + '" 不在 Gateway 白名单中'
  };
}

/**
 * 完整策略检查
 * 依次检查 command、mode、agent
 *
 * @param {object} params
 * @param {string} params.command
 * @param {string} params.mode
 * @param {string} [params.agent]
 * @returns {{ allowed: boolean, reason?: string }}
 */
function enforcePolicy(params) {
  if (!params || typeof params !== 'object') {
    return { allowed: false, reason: '策略参数为空' };
  }

  // 1. 检查 command
  var cmdCheck = checkCommandAllowed(params.command);
  if (!cmdCheck.allowed) {
    return cmdCheck;
  }

  // 2. 检查 mode
  var modeCheck = checkModeAllowed(params.mode);
  if (!modeCheck.allowed) {
    return modeCheck;
  }

  // 3. 检查 agent（可选）
  var agentCheck = checkAgentAllowed(params.agent);
  if (!agentCheck.allowed) {
    return agentCheck;
  }

  return { allowed: true };
}

module.exports = {
  GATEWAY_COMMAND_ALLOWLIST,
  GATEWAY_MODE_ALLOWLIST,
  GATEWAY_AGENT_ALLOWLIST,
  checkCommandAllowed,
  checkModeAllowed,
  checkAgentAllowed,
  enforcePolicy
};
