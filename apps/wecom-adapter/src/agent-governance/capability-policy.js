'use strict';

/**
 * capability-policy.js - Agent 能力策略引擎 (P10.4)
 *
 * 提供策略评估函数，确保:
 *   1. forbidden 优先级 > capabilities 优先级
 *   2. 对敏感操作强制执行 requiresApproval
 *   3. 策略可扩展（未来可对接动态策略源）
 */

// ─── 敏感操作分类 ──────────────────────────────────────────

/**
 * 高危操作列表 —— 任何 agent 在任何情况下都禁止的
 */
var CRITICAL_FORBIDDEN = [
  'root.access',
  'system.destroy',
  'data.purge'
];

/**
 * 必须审批的操作（全局覆盖，不受 agent 注册表影响）
 */
var ALWAYS_REQUIRE_APPROVAL = [
  'deploy.production',
  'pm2.restart',
  'nginx.modify',
  'secrets.write'
];

// ─── 策略评估 ──────────────────────────────────────────────

/**
 * 全局策略检查: 操作是否在任何情况下都被禁止
 * @param {string} capability
 * @returns {boolean}
 */
function isGloballyForbidden(capability) {
  return CRITICAL_FORBIDDEN.indexOf(capability) !== -1;
}

/**
 * 全局策略检查: 操作是否始终需要审批
 * @param {string} capability
 * @returns {boolean}
 */
function isAlwaysRequireApproval(capability) {
  return ALWAYS_REQUIRE_APPROVAL.indexOf(capability) !== -1;
}

/**
 * 策略优先级判定
 * 返回 { action: 'allow'|'deny'|'require_approval', reason: string }
 *
 * @param {string} agentName
 * @param {string} capability
 * @param {object} agentDef - agent 的能力定义
 * @returns {object}
 */
function evaluatePolicy(agentName, capability, agentDef) {
  // Layer 1: 全局禁止项
  if (isGloballyForbidden(capability)) {
    return {
      action: 'deny',
      priority: 'critical',
      reason: '全局禁止操作: ' + capability
    };
  }

  // Layer 2: Agent 级禁止项（最高优先级）
  if (agentDef.forbidden.indexOf(capability) !== -1) {
    return {
      action: 'deny',
      priority: 'agent_forbidden',
      reason: 'Agent [' + agentName + '] 禁止执行: ' + capability
    };
  }

  // Layer 3: 能力检查
  if (agentDef.capabilities.indexOf(capability) === -1) {
    return {
      action: 'deny',
      priority: 'no_capability',
      reason: 'Agent [' + agentName + '] 不具备能力: ' + capability
    };
  }

  // Layer 4: 全局审批要求
  if (isAlwaysRequireApproval(capability)) {
    return {
      action: 'require_approval',
      priority: 'global_approval',
      reason: '操作 [' + capability + '] 始终需要审批'
    };
  }

  // Layer 5: Agent 级审批要求
  if (agentDef.requiresApproval.indexOf(capability) !== -1) {
    return {
      action: 'require_approval',
      priority: 'agent_approval',
      reason: 'Agent [' + agentName + '] 执行 [' + capability + '] 需要审批'
    };
  }

  // Layer 6: 允许
  return {
    action: 'allow',
    priority: 'normal',
    reason: 'Agent [' + agentName + '] 可执行: ' + capability
  };
}

/**
 * 检查 capability 是否在给定的能力列表中
 * @param {string} capability
 * @param {Array<string>} capabilities
 * @returns {boolean}
 */
function hasCapability(capability, capabilities) {
  return capabilities.indexOf(capability) !== -1;
}

/**
 * 获取两个 capability 列表的交集
 * @param {Array<string>} listA
 * @param {Array<string>} listB
 * @returns {Array<string>}
 */
function intersectCapabilities(listA, listB) {
  var result = [];
  for (var i = 0; i < listA.length; i++) {
    if (listB.indexOf(listA[i]) !== -1) {
      result.push(listA[i]);
    }
  }
  return result;
}

/**
 * 获取 capability 列表的差集 (A - B)
 * @param {Array<string>} listA
 * @param {Array<string>} listB
 * @returns {Array<string>}
 */
function subtractCapabilities(listA, listB) {
  var result = [];
  for (var i = 0; i < listA.length; i++) {
    if (listB.indexOf(listA[i]) === -1) {
      result.push(listA[i]);
    }
  }
  return result;
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  CRITICAL_FORBIDDEN: CRITICAL_FORBIDDEN,
  ALWAYS_REQUIRE_APPROVAL: ALWAYS_REQUIRE_APPROVAL,

  isGloballyForbidden: isGloballyForbidden,
  isAlwaysRequireApproval: isAlwaysRequireApproval,
  evaluatePolicy: evaluatePolicy,
  hasCapability: hasCapability,
  intersectCapabilities: intersectCapabilities,
  subtractCapabilities: subtractCapabilities,
};
