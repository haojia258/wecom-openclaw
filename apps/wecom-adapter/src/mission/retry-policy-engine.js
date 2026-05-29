'use strict';

/**
 * retry-policy-engine.js - P10.2 重试策略引擎
 *
 * 职责:
 * - 定义各 stage 的重试策略 (retries, strategy, cooldown)
 * - 计算第 N 次重试的等待时间 (fixed / linear / exponential)
 * - 提供策略查询接口
 */

// ─── 默认重试策略 ──────────────────────────────────────────

var DEFAULT_RETRY_POLICIES = {
  staging_deploy: {
    retries: 3,
    strategy: 'exponential',
    cooldown_ms: 30000
  },
  production_deploy: {
    retries: 2,
    strategy: 'linear',
    cooldown_ms: 60000
  },
  default: {
    retries: 3,
    strategy: 'exponential',
    cooldown_ms: 30000
  }
};

// ─── 支持的策略类型 ────────────────────────────────────────

var VALID_STRATEGIES = ['fixed', 'linear', 'exponential'];

// ─── 策略查询 ──────────────────────────────────────────────

/**
 * 获取指定 stage 的重试策略
 * @param {string} stage - 阶段名称 (如 'staging_deploy', 'production_deploy')
 * @returns {{ retries: number, strategy: string, cooldown_ms: number }}
 */
function getRetryPolicy(stage) {
  if (stage && DEFAULT_RETRY_POLICIES[stage]) {
    return DEFAULT_RETRY_POLICIES[stage];
  }
  return DEFAULT_RETRY_POLICIES.default;
}

/**
 * 获取所有已定义的策略
 * @returns {object}
 */
function getAllPolicies() {
  return DEFAULT_RETRY_POLICIES;
}

// ─── 延迟计算 ──────────────────────────────────────────────

/**
 * 计算第 N 次重试的等待时间 (ms)
 *
 * 策略:
 *   fixed:       return policy.cooldown_ms
 *   linear:      return policy.cooldown_ms * attempt
 *   exponential: return policy.cooldown_ms * 2^(attempt - 1)
 *
 * @param {{ strategy: string, cooldown_ms: number }} policy - 重试策略
 * @param {number} attempt - 当前重试次数 (1-indexed)
 * @returns {number} 延迟毫秒数
 */
function calculateDelay(policy, attempt) {
  if (!policy || !policy.cooldown_ms || attempt < 1) {
    return 0;
  }

  var base = policy.cooldown_ms;
  var strategy = policy.strategy || 'fixed';

  switch (strategy) {
    case 'fixed':
      return base;
    case 'linear':
      return base * attempt;
    case 'exponential':
      // 2^(attempt-1) * base, 上限 5 分钟避免无限等待
      return Math.min(base * Math.pow(2, attempt - 1), 300000);
    default:
      return base;
  }
}

// ─── 重试上限 ──────────────────────────────────────────────

/**
 * 获取指定 stage 的最大重试次数
 * @param {string} stage - 阶段名称
 * @returns {number}
 */
function getMaxRetries(stage) {
  var policy = getRetryPolicy(stage);
  return policy ? policy.retries : 3;
}

/**
 * 判断是否已达到最大重试次数
 * @param {string} stage - 阶段名称
 * @param {number} currentRetries - 当前已重试次数
 * @returns {boolean}
 */
function isMaxRetriesReached(stage, currentRetries) {
  return currentRetries >= getMaxRetries(stage);
}

/**
 * 验证策略格式是否合法
 * @param {{ retries: number, strategy: string, cooldown_ms: number }} policy
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object') {
    return { valid: false, error: 'policy is required' };
  }
  if (typeof policy.retries !== 'number' || policy.retries < 1) {
    return { valid: false, error: 'retries must be a positive number' };
  }
  if (VALID_STRATEGIES.indexOf(policy.strategy) === -1) {
    return { valid: false, error: 'strategy must be one of: ' + VALID_STRATEGIES.join(', ') };
  }
  if (typeof policy.cooldown_ms !== 'number' || policy.cooldown_ms < 0) {
    return { valid: false, error: 'cooldown_ms must be a non-negative number' };
  }
  return { valid: true };
}

// ─── 导出 ─────────────────────────────────────────────────

module.exports = {
  getRetryPolicy: getRetryPolicy,
  getAllPolicies: getAllPolicies,
  calculateDelay: calculateDelay,
  getMaxRetries: getMaxRetries,
  isMaxRetriesReached: isMaxRetriesReached,
  validatePolicy: validatePolicy,
  VALID_STRATEGIES: VALID_STRATEGIES,
  DEFAULT_RETRY_POLICIES: DEFAULT_RETRY_POLICIES
};
