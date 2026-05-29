'use strict';

/**
 * rollback-engine.js - P10.2 回滚引擎
 *
 * 职责:
 * - 触发回滚
 * - 回滚状态转换 (通过 ROLLBACK_INITIATED 事件驱动)
 * - 回滚完成 / 失败处理
 * - 写入 agent_events 事件
 *
 * 新增事件:
 *   ROLLBACK_TRIGGERED - 回滚已触发 { reason, from_stage, rollback_state }
 *   ROLLBACK_COMPLETED - 回滚完成   { from_stage, to_stage, rollback_state }
 *   ROLLBACK_FAILED    - 回滚失败   { error, from_stage, rollback_state }
 *
 * 支持路径:
 *   staging    → rollback
 *   production → rollback
 */

var missionStore = require('./mission-store');
var transitionEngine = require('./workflow-transition-engine');

// ─── 回滚阶段白名单 ────────────────────────────────────────

var ROLLBACKABLE_STAGES = ['staging', 'production'];

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
    console.error('[rollback-engine] Failed to emit event ' + eventType + ':', e.message);
  }
}

// ─── 回滚触发 ──────────────────────────────────────────────

/**
 * 发起回滚：发射 ROLLBACK_TRIGGERED → 执行状态转换 → 完成/失败
 *
 * @param {object} task   - mission_tasks 行对象
 * @param {string} reason - 回滚原因 (failure_type)
 * @returns {{
 *   success: boolean,
 *   rollback_state: string,
 *   event?: object,
 *   error?: string
 * }}
 */
function triggerRollback(task, reason) {
  var fromStage = task.current_stage || 'unknown';

  // 1. 检查是否可回滚
  if (!canRollback(fromStage)) {
    return {
      success: false,
      rollback_state: 'not_applicable',
      error: 'Stage "' + fromStage + '" does not support rollback. Allowed: ' + ROLLBACKABLE_STAGES.join(', ')
    };
  }

  // 2. 更新 rollback_state = 'initiated'
  missionStore.updateMissionTask(task.id, {
    rollback_state: 'initiated',
    recovery_status: 'rolling_back'
  });

  // 3. 发射 ROLLBACK_TRIGGERED
  emitEvent(task.id, 'ROLLBACK_TRIGGERED', {
    reason: reason || 'unknown',
    from_stage: fromStage,
    rollback_state: 'initiated'
  });

  // 4. 通过 ROLLBACK_INITIATED 事件驱动状态转换
  var transitionResult = transitionEngine.attemptTransition(task.id, 'ROLLBACK_INITIATED', {
    source: 'rollback-engine',
    reason: reason
  });

  if (transitionResult && transitionResult.success) {
    // 5a. 成功 → ROLLBACK_COMPLETED
    missionStore.updateMissionTask(task.id, {
      rollback_state: 'completed',
      recovery_status: 'rolled_back'
    });

    emitEvent(task.id, 'ROLLBACK_COMPLETED', {
      from_stage: transitionResult.from_stage,
      to_stage: transitionResult.to_stage,
      rollback_state: 'completed'
    });

    return {
      success: true,
      rollback_state: 'completed',
      event: transitionResult.event
    };
  }

  // 5b. 失败 → ROLLBACK_FAILED
  var errorMsg = (transitionResult && transitionResult.error) || 'Transition failed';

  missionStore.updateMissionTask(task.id, {
    rollback_state: 'failed',
    recovery_status: 'rollback_failed'
  });

  emitEvent(task.id, 'ROLLBACK_FAILED', {
    error: errorMsg,
    from_stage: fromStage,
    rollback_state: 'failed'
  });

  return {
    success: false,
    rollback_state: 'failed',
    error: errorMsg
  };
}

// ─── 回滚判定 ──────────────────────────────────────────────

/**
 * 判断指定阶段是否支持回滚
 *
 * @param {string} stage - 当前阶段
 * @returns {boolean}
 */
function canRollback(stage) {
  return ROLLBACKABLE_STAGES.indexOf(stage) !== -1;
}

/**
 * 获取支持回滚的阶段列表
 * @returns {string[]}
 */
function getRollbackableStages() {
  return ROLLBACKABLE_STAGES.slice();
}

// ─── 导出 ─────────────────────────────────────────────────

module.exports = {
  triggerRollback: triggerRollback,
  canRollback: canRollback,
  getRollbackableStages: getRollbackableStages
};
