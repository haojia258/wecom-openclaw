'use strict';

/**
 * ai-runtime-rbac.js - AI Agent 运行时权限检查核心 (P7.2.1)
 *
 * 在现有企业微信 RBAC（user/role 级）之上叠加 Agent 运行时权限层。
 *
 * 调用时机:
 *   agent-dispatcher.js → dispatch() 内，在 WeCom RBAC 通过之后、
 *   codexExecute / workbuddyExecute / deepseekExecute 之前执行检查。
 *
 * 检查规则:
 *   1. agent 必须存在于权限矩阵
 *   2. 请求的 action 不能在 deny 列表中（deny 优先）
 *   3. 请求的 action 必须在 allow 列表中（最小权限原则）
 *
 * 拒绝处理:
 *   - 返回 { allowed: false, reason, agent, action, denyReason }
 *   - 调用方负责写入 task-store 并回复企业微信
 */

const { getAgentPermission, getConfirmMapping } = require('./agent-permission-matrix');

/**
 * 检查指定 agent 是否被允许执行某个 action
 *
 * @param {string} agentName   - agent 名称 (codex/workbuddy/deepseek/doubao)
 * @param {string} action      - 操作分类 (如 'draft-pr', 'readonly-audit')
 * @returns {{ allowed: boolean, reason?: string, agent: string, action: string, denyReason?: string }}
 */
function checkAgentAction(agentName, action) {
  var normalizedAgent = (agentName || '').toLowerCase();
  var normalizedAction = (action || '').toLowerCase();

  var perm = getAgentPermission(normalizedAgent);

  if (!perm) {
    return {
      allowed: false,
      agent: normalizedAgent,
      action: normalizedAction,
      denyReason: 'unknown-agent',
      reason: '[AI-RBAC] 未知 Agent: "' + normalizedAgent + '"，无对应权限矩阵'
    };
  }

  // deny 优先：只要 action 在 deny 列表，直接拒绝
  if (perm.deny.indexOf(normalizedAction) !== -1) {
    return {
      allowed: false,
      agent: normalizedAgent,
      action: normalizedAction,
      denyReason: 'explicit-deny',
      reason: '[AI-RBAC] ' + normalizedAgent + ' 被明确禁止执行操作: ' + normalizedAction
    };
  }

  // allow 检查：action 必须在 allow 列表（最小权限原则）
  if (perm.allow.indexOf(normalizedAction) === -1) {
    return {
      allowed: false,
      agent: normalizedAgent,
      action: normalizedAction,
      denyReason: 'not-in-allow-list',
      reason: '[AI-RBAC] ' + normalizedAgent + ' 无权执行操作: ' + normalizedAction +
              '（该操作不在 allow 列表中）'
    };
  }

  return {
    allowed: true,
    agent: normalizedAgent,
    action: normalizedAction
  };
}

/**
 * 检查 confirm: 操作是否被 agent 运行时权限允许
 *
 * 自动从 CONFIRM_ACTION_MAP 解析 agent+action，然后调用 checkAgentAction。
 *
 * @param {string} agentName      - agent 名称 (codex/workbuddy/deepseek)
 * @param {string} confirmAction  - confirm 操作 (confirm:create-pr / confirm:audit / confirm:review)
 * @returns {{ allowed: boolean, reason?: string, agent: string, action: string, denyReason?: string }}
 */
function checkConfirmPermission(agentName, confirmAction) {
  var normalizedAgent = (agentName || '').toLowerCase();
  var normalizedConfirm = (confirmAction || '').toLowerCase();

  var mapping = getConfirmMapping(normalizedConfirm);

  if (!mapping) {
    return {
      allowed: false,
      agent: normalizedAgent,
      action: normalizedConfirm,
      denyReason: 'unknown-confirm',
      reason: '[AI-RBAC] 未知的 confirm 操作: "' + normalizedConfirm + '"'
    };
  }

  // 验证 agent 与 confirm 的对应关系
  if (mapping.agent !== normalizedAgent) {
    return {
      allowed: false,
      agent: normalizedAgent,
      action: normalizedConfirm,
      denyReason: 'agent-mismatch',
      reason: '[AI-RBAC] confirm 操作与 Agent 不匹配: ' +
              normalizedConfirm + ' 需要 ' + mapping.agent + ' 执行，而非 ' + normalizedAgent
    };
  }

  return checkAgentAction(normalizedAgent, mapping.action);
}

/**
 * 生成拒绝时发送到企业微信的消息
 *
 * @param {Object} checkResult - checkAgentAction / checkConfirmPermission 的返回结果
 * @param {string} taskId      - 任务 ID（可选，用于消息溯源）
 * @returns {string}
 */
function buildDenyMessage(checkResult, taskId) {
  var lines = [
    '🚫 AI Runtime 权限拒绝',
    '',
    '【Agent】' + checkResult.agent,
    '【操作】' + checkResult.action,
    '【原因】' + (checkResult.reason || '权限不足'),
  ];
  if (taskId) {
    lines.push('【任务ID】' + taskId);
  }
  return lines.join('\n');
}

module.exports = {
  checkAgentAction,
  checkConfirmPermission,
  buildDenyMessage
};
