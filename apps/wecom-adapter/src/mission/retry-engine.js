'use strict';

/**
 * retry-engine.js - P10.2 重试执行引擎
 *
 * 职责:
 * - 管理重试尝试计数器
 * - cooldown 调度 (setTimeout)
 * - 自动重试执行
 * - 重试耗尽处理
 * - 写入 agent_events 事件
 * - 通过 attemptTransition 驱动状态机
 *
 * 新增事件:
 *   RETRY_SCHEDULED  - 重试已排期 { retry_count, next_retry_delay_ms, stage }
 *   RETRY_STARTED    - 重试开始执行 { retry_count, stage }
 *   RETRY_SUCCESS    - 重试成功 { retry_count, stage }
 *   RETRY_EXHAUSTED  - 重试次数耗尽 { retry_count, max_retries, stage }
 */

var missionStore = require('./mission-store');
var policyEngine = require('./retry-policy-engine');
var transitionEngine = require('./workflow-transition-engine');

// ─── 事件发射 ──────────────────────────────────────────────

/**
 * 写入 agent_events 并更新任务 last_event_at
 * @param {string} missionTaskId
 * @param {string} eventType
 * @param {object} payload
 */
function emitEvent(missionTaskId, eventType, payload) {
  try {
    missionStore.createAgentEvent({
      mission_task_id: missionTaskId,
      event_type: eventType,
      stage: null,
      payload: payload || {}
    });
  } catch (e) {
    console.error('[retry-engine] Failed to emit event ' + eventType + ':', e.message);
  }
}

// ─── 重试调度 ──────────────────────────────────────────────

/**
 * 排期重试：递增计数器、写入事件、设置 cooldown、延迟后执行
 *
 * @param {object} task   - mission_tasks 行对象
 * @param {object} policy - retry policy 对象
 * @returns {Promise<{ action: string, result: object }>}
 */
function scheduleRetry(task, policy) {
  var currentCount = (task.retry_count || 0) + 1;
  var stage = task.current_stage || 'queued';
  var maxRetries = policy.retries || policyEngine.getMaxRetries(stage);

  // 1. 更新 retry_count
  missionStore.updateMissionTask(task.id, {
    retry_count: currentCount,
    recovery_status: 'retrying'
  });

  // 2. 计算延迟并发射 RETRY_SCHEDULED
  var delay = policyEngine.calculateDelay(policy, currentCount);
  emitEvent(task.id, 'RETRY_SCHEDULED', {
    retry_count: currentCount,
    next_retry_delay_ms: delay,
    max_retries: maxRetries,
    stage: stage
  });

  // 3. 异步等待 cooldown 后执行重试
  //    测试模式 (RETRY_TEST_FAST=1) 跳过 cooldown，立即执行
  var actualDelay = process.env.RETRY_TEST_FAST === '1' ? 0 : delay;

  return new Promise(function(resolve) {
    setTimeout(function() {
      var result = executeRetry(task, currentCount, maxRetries);
      resolve({
        action: result.success ? 'retry_success' : 'retry_failed',
        result: result
      });
    }, actualDelay);
  });
}

/**
 * 执行实际重试：通过 RE_RUN 触发状态转换
 *
 * @param {object} task        - 任务对象 (含 id 和 current_stage)
 * @param {number} retryCount  - 当前重试计数
 * @param {number} maxRetries  - 最大重试次数
 * @returns {{ success: boolean, retry_count: number, exhausted: boolean }}
 */
function executeRetry(task, retryCount, maxRetries) {
  var stage = task.current_stage || 'queued';

  // 发射 RETRY_STARTED
  emitEvent(task.id, 'RETRY_STARTED', {
    retry_count: retryCount,
    max_retries: maxRetries,
    stage: stage
  });

  // 通过 RE_RUN 事件驱动状态转换: failed/rollback → running
  var transitionResult = transitionEngine.attemptTransition(task.id, 'RE_RUN', {
    source: 'retry-engine',
    retry_count: retryCount
  });

  if (transitionResult && transitionResult.success) {
    // 重试成功 - reset counter
    missionStore.updateMissionTask(task.id, {
      retry_count: 0,
      recovery_status: 'recovered',
      last_failure_type: ''
    });

    emitEvent(task.id, 'RETRY_SUCCESS', {
      retry_count: retryCount,
      from_stage: transitionResult.from_stage,
      to_stage: transitionResult.to_stage
    });

    return {
      success: true,
      retry_count: retryCount,
      exhausted: false,
      transition: transitionResult
    };
  }

  // 重试失败 - 检查是否耗尽
  if (retryCount >= maxRetries) {
    missionStore.updateMissionTask(task.id, {
      recovery_status: 'retry_exhausted'
    });

    emitEvent(task.id, 'RETRY_EXHAUSTED', {
      retry_count: retryCount,
      max_retries: maxRetries,
      stage: stage
    });

    return {
      success: false,
      retry_count: retryCount,
      exhausted: true,
      error: (transitionResult && transitionResult.error) || 'Transition failed'
    };
  }

  // 还有重试次数
  return {
    success: false,
    retry_count: retryCount,
    exhausted: false,
    error: (transitionResult && transitionResult.error) || 'Transition failed'
  };
}

// ─── 重试状态查询 ──────────────────────────────────────────

/**
 * 判断是否已耗尽重试次数
 *
 * @param {object} task  - 任务对象
 * @param {string} stage - 阶段名称
 * @returns {boolean}
 */
function isRetryExhausted(task, stage) {
  var count = task.retry_count || 0;
  var max = policyEngine.getMaxRetries(stage);
  return count >= max;
}

/**
 * 获取剩余重试次数
 *
 * @param {object} task
 * @param {string} stage
 * @returns {number}
 */
function getRemainingRetries(task, stage) {
  var max = policyEngine.getMaxRetries(stage);
  var count = task.retry_count || 0;
  return Math.max(0, max - count);
}

// ─── 导出 ─────────────────────────────────────────────────

module.exports = {
  scheduleRetry: scheduleRetry,
  executeRetry: executeRetry,
  isRetryExhausted: isRetryExhausted,
  getRemainingRetries: getRemainingRetries,
  emitEvent: emitEvent
};
