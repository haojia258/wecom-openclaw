'use strict';

/**
 * retry-policy.js — 重试策略引擎 (P9.1)
 *
 * 实现：
 *   - exponential backoff（指数退避）
 *   - maxRetry 上限
 *   - retryable classifier（基于 failure type）
 *   - 默认策略配置
 *   - context-aware 策略覆盖
 *
 * 默认策略：
 *   TRANSIENT_FAILURE:  retry=3, baseDelay=500ms
 *   TIMEOUT:            retry=2, baseDelay=1000ms
 *   POLICY_BLOCKED:     retry=0 (never retry)
 *   EXECUTOR_ERROR:     retry=0 (触发 recovery 而非 retry)
 *   INFRA_ERROR:        retry=0 (触发 recovery 而非 retry)
 */

var { ResultType, isRetryable } = require('./execution-result-classifier');

// ─── 默认策略 ────────────────────────────────────────────────

var DEFAULT_POLICIES = {};

// TRANSIENT_FAILURE: 瞬时故障 → 3 次重试 + 指数退避
DEFAULT_POLICIES[ResultType.TRANSIENT_FAILURE] = {
  maxRetry: 3,
  baseDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
  retryableStatuses: ['TRANSIENT_FAILURE']
};

// TIMEOUT: 超时 → 2 次重试 + 加倍延迟
DEFAULT_POLICIES[ResultType.TIMEOUT] = {
  maxRetry: 2,
  baseDelayMs: 1000,
  maxDelayMs: 15000,
  backoffMultiplier: 2,
  jitter: true,
  retryableStatuses: ['TIMEOUT']
};

// POLICY_BLOCKED: 策略阻断 → 永不重试
DEFAULT_POLICIES[ResultType.POLICY_BLOCKED] = {
  maxRetry: 0,
  baseDelayMs: 0,
  maxDelayMs: 0,
  backoffMultiplier: 1,
  jitter: false,
  retryableStatuses: []
};

// EXECUTOR_ERROR: 执行器错误 → 不重试（走 recovery）
DEFAULT_POLICIES[ResultType.EXECUTOR_ERROR] = {
  maxRetry: 0,
  baseDelayMs: 0,
  maxDelayMs: 0,
  backoffMultiplier: 1,
  jitter: false,
  retryableStatuses: []
};

// INFRA_ERROR: 基础设施错误 → 不重试（走 recovery）
DEFAULT_POLICIES[ResultType.INFRA_ERROR] = {
  maxRetry: 0,
  baseDelayMs: 0,
  maxDelayMs: 0,
  backoffMultiplier: 1,
  jitter: false,
  retryableStatuses: []
};

// UNKNOWN: 未知错误 → 1 次保守重试
DEFAULT_POLICIES[ResultType.UNKNOWN] = {
  maxRetry: 1,
  baseDelayMs: 1000,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitter: true,
  retryableStatuses: ['UNKNOWN']
};

// ─── 自定义策略注册表 ────────────────────────────────────────

var customPolicies = {};

// ─── 核心 API ────────────────────────────────────────────────

/**
 * 获取指定 failureType 的重试策略
 *
 * @param {string} failureType  - 故障类型（ResultType 值）
 * @param {string} [executor]   - 可选的执行器名称（用于 context-aware 覆盖）
 * @returns {{ maxRetry: number, baseDelayMs: number, maxDelayMs: number, backoffMultiplier: number, jitter: boolean, retryableStatuses: string[] }}
 */
function getPolicy(failureType, executor) {
  // 1. 检查 context-aware 自定义策略
  if (executor && customPolicies[executor] && customPolicies[executor][failureType]) {
    return customPolicies[executor][failureType];
  }

  // 2. 检查全局自定义策略
  if (customPolicies['*'] && customPolicies['*'][failureType]) {
    return customPolicies['*'][failureType];
  }

  // 3. 返回默认策略
  return DEFAULT_POLICIES[failureType] || {
    maxRetry: 0,
    baseDelayMs: 0,
    maxDelayMs: 0,
    backoffMultiplier: 1,
    jitter: false,
    retryableStatuses: []
  };
}

/**
 * 判断是否应该重试
 *
 * @param {string} failureType   - 故障类型
 * @param {number} currentRetry  - 当前重试次数（0-based）
 * @param {string} [executor]    - 执行器名称
 * @returns {{ shouldRetry: boolean, delayMs: number, remaining: number }}
 */
function shouldRetry(failureType, currentRetry, executor) {
  var policy = getPolicy(failureType, executor);

  if (policy.maxRetry <= 0 || currentRetry >= policy.maxRetry) {
    return { shouldRetry: false, delayMs: 0, remaining: 0 };
  }

  // 指数退避: baseDelay * (backoffMultiplier ^ currentRetry)
  var delayMs = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, currentRetry);

  // 上限
  if (delayMs > policy.maxDelayMs) {
    delayMs = policy.maxDelayMs;
  }

  // Jitter: +/- 25% 随机偏差
  if (policy.jitter && delayMs > 0) {
    var jitterRange = Math.floor(delayMs * 0.25);
    var jitter = Math.floor(Math.random() * (jitterRange * 2 + 1)) - jitterRange;
    delayMs = delayMs + jitter;
    if (delayMs < 0) delayMs = 0;
  }

  var remaining = policy.maxRetry - currentRetry;

  return {
    shouldRetry: true,
    delayMs: delayMs,
    remaining: remaining
  };
}

/**
 * 计算当前 retry attempt 的退避延迟
 *
 * @param {string} failureType
 * @param {number} attempt - 第几次重试 (0-based)
 * @param {string} [executor]
 * @returns {number} 毫秒
 */
function getBackoffDelay(failureType, attempt, executor) {
  var result = shouldRetry(failureType, attempt, executor);
  return result.delayMs;
}

/**
 * 判断指定 failureType 是否可重试
 *
 * @param {string} failureType
 * @returns {boolean}
 */
function isFailureRetryable(failureType) {
  return isRetryable(failureType);
}

/**
 * 注册自定义策略
 *
 * @param {string} executor     - 执行器名称（'*' 表示全局）
 * @param {Object} overrides    - { failureType: { maxRetry, baseDelayMs, ... } }
 */
function registerCustomPolicy(executor, overrides) {
  if (!customPolicies[executor]) {
    customPolicies[executor] = {};
  }

  var keys = Object.keys(overrides);
  for (var i = 0; i < keys.length; i++) {
    var failureType = keys[i];
    var override = overrides[failureType];
    var base = getPolicy(failureType);
    customPolicies[executor][failureType] = {
      maxRetry: override.maxRetry !== undefined ? override.maxRetry : base.maxRetry,
      baseDelayMs: override.baseDelayMs !== undefined ? override.baseDelayMs : base.baseDelayMs,
      maxDelayMs: override.maxDelayMs !== undefined ? override.maxDelayMs : base.maxDelayMs,
      backoffMultiplier: override.backoffMultiplier !== undefined ? override.backoffMultiplier : base.backoffMultiplier,
      jitter: override.jitter !== undefined ? override.jitter : base.jitter,
      retryableStatuses: override.retryableStatuses || base.retryableStatuses
    };
  }
}

/**
 * 重置自定义策略（测试用）
 */
function resetCustomPolicies() {
  customPolicies = {};
}

/**
 * 获取所有策略摘要（用于状态报告）
 *
 * @returns {Object}
 */
function getPolicySummary() {
  var summary = {};
  var types = Object.keys(ResultType);
  for (var i = 0; i < types.length; i++) {
    var type = ResultType[types[i]];
    if (typeof type !== 'string') continue;
    var policy = DEFAULT_POLICIES[type];
    summary[type] = policy ? {
      maxRetry: policy.maxRetry,
      baseDelayMs: policy.baseDelayMs,
      retryable: isFailureRetryable(type)
    } : { maxRetry: 0, retryable: false };
  }
  return summary;
}

// ─── 重试执行器 ──────────────────────────────────────────────

/**
 * 带重试的执行包装器
 *
 * 执行 fn，如果失败，根据分类结果自动重试（遵循 retry-policy）。
 *
 * @param {Object} params
 * @param {Function} params.fn            - 要执行的异步函数，返回 { success, error, output }
 * @param {string} params.protocol        - 协议: 'http' | 'pm2' | 'npm-test' | 'executor-throw'
 * @param {string} [params.executorName]  - 执行器名称（用于 context-aware 策略）
 * @param {string} [params.correlationId] - 关联 ID（用于审计）
 * @param {Function} [params.onRetry]     - 重试回调: fn(attempt, delayMs, classification)
 * @returns {Promise<Object>} { success, result, retries, history }
 */
async function executeWithRetry(params) {
  var fn = params.fn;
  var protocol = params.protocol || 'generic';
  var executorName = params.executorName;
  var correlationId = params.correlationId || ('corr_' + Date.now());
  var onRetry = params.onRetry;

  var { classify } = require('./execution-result-classifier');

  var history = [];
  var attempt = 0;

  while (true) {
    var result;

    // 执行
    try {
      result = await fn();
    } catch (err) {
      result = { success: false, error: err.message, throwError: err };
    }

    // 分类结果
    var classification = classify({
      protocol: protocol,
      success: result ? result.success : false,
      error: result ? (result.error || '') : '',
      output: result ? (result.output || '') : '',
      statusCode: result ? result.statusCode : undefined,
      durationMs: result ? result.durationMs : undefined
    });

    // 记录历史
    history.push({
      attempt: attempt,
      success: result ? result.success : false,
      classification: classification,
      timestamp: new Date().toISOString()
    });

    // 成功 → 退出
    if (classification.type === ResultType.SUCCESS) {
      return {
        success: true,
        result: result,
        retries: attempt,
        history: history,
        correlationId: correlationId
      };
    }

    // 检查是否应该重试
    var retryResult = shouldRetry(classification.type, attempt, executorName);

    if (!retryResult.shouldRetry) {
      // 不可重试或已达上限
      return {
        success: false,
        result: result,
        retries: attempt,
        exhausted: attempt > 0 && retryResult.remaining === 0,
        failureType: classification.type,
        history: history,
        correlationId: correlationId,
        needsRecovery: classification.type === ResultType.EXECUTOR_ERROR ||
                       classification.type === ResultType.INFRA_ERROR
      };
    }

    // 重试
    attempt++;
    if (onRetry) {
      onRetry(attempt, retryResult.delayMs, classification);
    }

    await sleep(retryResult.delayMs);
  }
}

/**
 * sleep helper
 */
function sleep(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

// ─── 导出 ────────────────────────────────────────────────────

module.exports = {
  // 策略查询
  getPolicy: getPolicy,
  shouldRetry: shouldRetry,
  getBackoffDelay: getBackoffDelay,
  isFailureRetryable: isFailureRetryable,
  getPolicySummary: getPolicySummary,

  // 策略管理
  registerCustomPolicy: registerCustomPolicy,
  resetCustomPolicies: resetCustomPolicies,

  // 默认策略（只读）
  DEFAULT_POLICIES: DEFAULT_POLICIES,

  // 重试执行器
  executeWithRetry: executeWithRetry,
  sleep: sleep
};
