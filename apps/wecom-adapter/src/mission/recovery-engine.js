'use strict';

/**
 * recovery-engine.js - P10.2 统一恢复引擎
 *
 * 职责:
 * - 统一恢复入口: handleFailure(task, event)
 * - 编排 classify → retry → rollback 全流程
 * - 发射 RECOVERY_SUCCESS / RECOVERY_FAILED 事件
 *
 * 流程:
 *   failure_event
 *     → classify (failure-classifier)
 *     → [recoverable + retries remain] → retry (retry-engine)
 *     → [unrecoverable OR retry exhausted] → rollback? (rollback-engine)
 *     → emit RECOVERY_SUCCESS / RECOVERY_FAILED
 *
 * 新增事件:
 *   RECOVERY_SUCCESS - 恢复成功 { failure_type, action_taken, retry_count }
 *   RECOVERY_FAILED  - 恢复失败 { failure_type, reason }
 */

var missionStore = require('./mission-store');
var classifier = require('./failure-classifier');
var policyEngine = require('./retry-policy-engine');
var retryEngine = require('./retry-engine');
var rollbackEngine = require('./rollback-engine');

// ─── 事件发射 ──────────────────────────────────────────────

function emitEvent(missionTaskId, eventType, payload) {
  try {
    missionStore.createAgentEvent({
      mission_task_id: missionTaskId,
      event_type: eventType,
      stage: null,
      payload: payload || {}
    });
  } catch (e) {
    console.error('[recovery-engine] Failed to emit event ' + eventType + ':', e.message);
  }
}

// ─── 统一恢复入口 ──────────────────────────────────────────

/**
 * 处理失败事件，执行自动恢复流程
 *
 * @param {object} task  - mission_tasks 行对象 (需包含 id, current_stage, retry_count 等)
 * @param {object} event - 失败事件信息
 * @param {string} event.event_type    - 触发事件类型
 * @param {string} event.error_message - 错误消息
 * @param {number} event.exit_code     - 退出码
 * @returns {Promise<{
 *   success: boolean,
 *   action_taken: string,
 *   failure_type: string,
 *   recovery_status: string,
 *   retry_count?: number,
 *   next_retry_delay_ms?: number
 * }>}
 */
function handleFailure(task, event) {
  var eventType = (event && event.event_type) || 'FAILED';
  var errorMessage = (event && event.error_message) || (event && event.error) || '';
  var exitCode = (event && event.exit_code !== undefined) ? event.exit_code : null;
  var stage = task.current_stage || 'unknown';

  // ─── Step 1: 分类失败 ──────────────────────────────────
  var classification = classifier.classifyFailure(eventType, errorMessage, exitCode);

  // ─── Step 2: 更新任务 - 记录失败 ────────────────────────
  missionStore.updateMissionTask(task.id, {
    last_failure_type: classification.failure_type,
    recovery_status: 'analyzing'
  });

  // ─── Step 3: 判断恢复路径 ───────────────────────────────

  // 路径 A: 可恢复 + 有重试配额 → 重试
  if (classification.recoverable && !retryEngine.isRetryExhausted(task, stage)) {
    var policy = policyEngine.getRetryPolicy(stage);

    missionStore.updateMissionTask(task.id, {
      recovery_status: 'retrying'
    });

    return retryEngine.scheduleRetry(task, policy).then(function(retryResult) {
      if (retryResult.result && retryResult.result.success) {
        // 重试成功
        emitEvent(task.id, 'RECOVERY_SUCCESS', {
          failure_type: classification.failure_type,
          action_taken: 'retry',
          retry_count: task.retry_count || 0,
          matched_rule: classification.matched_rule
        });

        return {
          success: true,
          action_taken: 'retry',
          failure_type: classification.failure_type,
          recovery_status: 'recovered',
          retry_count: task.retry_count || 0
        };
      }

      if (retryResult.result && retryResult.result.exhausted) {
        // 重试耗尽 → 尝试回滚
        return attemptRollback(task, classification);
      }

      // 重试失败但未耗尽
      return {
        success: false,
        action_taken: 'retry_scheduled',
        failure_type: classification.failure_type,
        recovery_status: 'retrying'
      };
    });
  }

  // 路径 B: 不可恢复 或 重试耗尽 → 回滚
  return Promise.resolve(attemptRollback(task, classification));
}

/**
 * 尝试回滚（同步）
 * @param {object} task
 * @param {object} classification
 * @returns {{ success, action_taken, failure_type, recovery_status, error? }}
 */
function attemptRollback(task, classification) {
  if (rollbackEngine.canRollback(task.current_stage)) {
    var rollbackResult = rollbackEngine.triggerRollback(task, classification.failure_type);

    if (rollbackResult.success) {
      emitEvent(task.id, 'RECOVERY_SUCCESS', {
        failure_type: classification.failure_type,
        action_taken: 'rollback',
        rollback_state: rollbackResult.rollback_state,
        matched_rule: classification.matched_rule
      });

      return {
        success: true,
        action_taken: 'rollback',
        failure_type: classification.failure_type,
        recovery_status: 'rolled_back'
      };
    }

    // 回滚失败
    emitEvent(task.id, 'RECOVERY_FAILED', {
      failure_type: classification.failure_type,
      action_taken: 'rollback',
      reason: rollbackResult.error || 'Rollback transition failed'
    });

    return {
      success: false,
      action_taken: 'rollback_failed',
      failure_type: classification.failure_type,
      recovery_status: 'rollback_failed',
      error: rollbackResult.error
    };
  }

  // 路径 C: 不可恢复 + 无法回滚
  missionStore.updateMissionTask(task.id, {
    recovery_status: 'unrecoverable'
  });

  emitEvent(task.id, 'RECOVERY_FAILED', {
    failure_type: classification.failure_type,
    action_taken: 'none',
    reason: 'Unrecoverable failure: ' + classification.failure_type
  });

  return {
    success: false,
    action_taken: 'none',
    failure_type: classification.failure_type,
    recovery_status: 'unrecoverable',
    error: 'Unrecoverable failure type: ' + classification.failure_type
  };
}

// ─── 恢复状态查询 ──────────────────────────────────────────

/**
 * 获取任务的恢复状态快照
 *
 * @param {string} taskId
 * @returns {{ recovery_status: string, retry_count: number, last_failure_type: string, rollback_state: string }|null}
 */
function getRecoveryResult(taskId) {
  var task = missionStore.getMissionTask(taskId);
  if (!task) return null;

  return {
    recovery_status: task.recovery_status || '',
    retry_count: task.retry_count || 0,
    last_failure_type: task.last_failure_type || '',
    rollback_state: task.rollback_state || '',
    current_stage: task.current_stage || '',
    max_retries: policyEngine.getMaxRetries(task.current_stage)
  };
}

// ─── 导出 ─────────────────────────────────────────────────

module.exports = {
  handleFailure: handleFailure,
  getRecoveryResult: getRecoveryResult,
  attemptRollback: attemptRollback
};
