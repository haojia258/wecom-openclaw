'use strict';

/**
 * workflow-transition-engine.js - AI Mission Control 事件驱动流转引擎 (P10.1)
 *
 * 核心职责：
 *   1. 将外部事件（PR_CREATED, TEST_PASSED 等）映射为目标状态
 *   2. 调用 workflow-state-machine 验证转换合法性
 *   3. 自动写入 TASK_STAGE_CHANGED agent_event
 *   4. 更新 mission_tasks.current_stage
 *
 * 使用方式:
 *   var engine = require('./workflow-transition-engine');
 *   var result = engine.attemptTransition('task-001', 'TEST_PASSED');
 *   // → { success: true, from_stage: 'running', to_stage: 'testing', event: {...} }
 */

var stateMachine = require('./workflow-state-machine');
var missionStore = require('./mission-store');

// ─── 事件 → 目标状态映射 ─────────────────────────────────

/**
 * EVENT_TO_TARGET_MAP: 事件类型 → 目标状态
 *
 * 每个事件 type 会触发到特定 target state 的转换。
 * 转换合法性由 stateMachine.validateTransition 二次确认。
 */
var EVENT_TO_TARGET_MAP = {
  'PR_CREATED':           stateMachine.STATES.RUNNING,
  'TEST_PASSED':          stateMachine.STATES.TESTING,
  'AUDIT_PASSED':         stateMachine.STATES.STAGING,
  'STAGING_DEPLOYED':     stateMachine.STATES.PRODUCTION,
  'PRODUCTION_DEPLOYED':  stateMachine.STATES.COMPLETED,
  'FAILED':               stateMachine.STATES.FAILED,
  'ROLLBACK_INITIATED':   stateMachine.STATES.ROLLBACK,
  'RE_RUN':               stateMachine.STATES.RUNNING
};

// ─── 可触发流转的事件类型集合 ─────────────────────────────

var TRANSITION_TRIGGER_EVENTS = Object.keys(EVENT_TO_TARGET_MAP);

// ─── 内部函数 ─────────────────────────────────────────────

/**
 * 默认值处理：当 task.current_stage 为 null 时，默认视为 'queued'
 * @param {string|null} currentStage
 * @returns {string}
 */
function normalizeCurrentStage(currentStage) {
  if (!currentStage) return stateMachine.STATES.QUEUED;
  return currentStage;
}

/**
 * 执行完整的流转过程（状态验证 + DB 写入 + event 记录）
 *
 * @param {string} missionTaskId - Mission task ID
 * @param {string} eventType - 触发事件类型（如 TEST_PASSED）
 * @param {object} [extraPayload={}] - 额外 payload 数据
 * @returns {{ success: boolean, from_stage?: string, to_stage?: string, event?: object, error?: string, reason?: string }}
 */
function attemptTransition(missionTaskId, eventType, extraPayload) {
  extraPayload = extraPayload || {};

  // 1. 检查事件类型是否在映射表中
  if (!EVENT_TO_TARGET_MAP.hasOwnProperty(eventType)) {
    return {
      success: false,
      error: 'Unknown trigger event: ' + eventType,
      reason: 'Valid triggers: ' + TRANSITION_TRIGGER_EVENTS.join(', ')
    };
  }

  // 2. 查找 mission task
  var task;
  try {
    task = missionStore.getMissionTask(missionTaskId);
  } catch (e) {
    return {
      success: false,
      error: 'Failed to load mission task: ' + e.message
    };
  }

  if (!task) {
    return {
      success: false,
      error: 'Mission task not found: ' + missionTaskId
    };
  }

  // 3. 获取当前和目标状态
  var fromStage = normalizeCurrentStage(task.current_stage);
  var toStage = EVENT_TO_TARGET_MAP[eventType];

  // 4. 验证转换合法性
  try {
    stateMachine.validateTransition(fromStage, toStage);
  } catch (e) {
    return {
      success: false,
      error: 'Transition validation failed',
      reason: e.message,
      from_stage: fromStage,
      to_stage: toStage
    };
  }

  // 5. 写入 DB: 更新 current_stage + 创建 TASK_STAGE_CHANGED event
  try {
    // 5a. 更新 mission_tasks.current_stage
    var updatedTask = missionStore.updateMissionTask(missionTaskId, {
      current_stage: toStage
    });

    if (!updatedTask) {
      return {
        success: false,
        error: 'Failed to update mission task current_stage'
      };
    }

    // 5b. 创建 TASK_STAGE_CHANGED agent_event
    var payload = {
      from_stage: fromStage,
      to_stage: toStage,
      trigger_event: eventType
    };

    // 合并额外 payload
    var extraKeys = Object.keys(extraPayload);
    for (var i = 0; i < extraKeys.length; i++) {
      if (extraKeys[i] !== 'from_stage' && extraKeys[i] !== 'to_stage' && extraKeys[i] !== 'trigger_event') {
        payload[extraKeys[i]] = extraPayload[extraKeys[i]];
      }
    }

    var event = missionStore.createAgentEvent({
      mission_task_id: missionTaskId,
      event_type: 'TASK_STAGE_CHANGED',
      stage: toStage,
      payload: payload
    });

    return {
      success: true,
      from_stage: fromStage,
      to_stage: toStage,
      event: event,
      task: updatedTask
    };
  } catch (e) {
    return {
      success: false,
      error: 'DB operation failed: ' + e.message,
      from_stage: fromStage,
      to_stage: toStage
    };
  }
}

/**
 * 检查事件类型是否能触发状态流转
 * @param {string} eventType
 * @returns {boolean}
 */
function isTransitionTrigger(eventType) {
  return TRANSITION_TRIGGER_EVENTS.indexOf(eventType) !== -1;
}

/**
 * 获取事件类型对应的目标状态
 * @param {string} eventType
 * @returns {string|null}
 */
function getTargetStage(eventType) {
  return EVENT_TO_TARGET_MAP[eventType] || null;
}

/**
 * 获取所有可触发流转的事件类型列表
 * @returns {string[]}
 */
function getTransitionTriggerEvents() {
  return TRANSITION_TRIGGER_EVENTS.slice();
}

/**
 * 获取事件→目标状态映射表
 * @returns {object}
 */
function getEventTargetMap() {
  return EVENT_TO_TARGET_MAP;
}

// ─── 导出 ─────────────────────────────────────────────────

module.exports = {
  // 核心 API
  attemptTransition: attemptTransition,
  isTransitionTrigger: isTransitionTrigger,
  getTargetStage: getTargetStage,

  // 查询
  getTransitionTriggerEvents: getTransitionTriggerEvents,
  getEventTargetMap: getEventTargetMap,

  // 常量
  EVENT_TO_TARGET_MAP: EVENT_TO_TARGET_MAP,
  TRANSITION_TRIGGER_EVENTS: TRANSITION_TRIGGER_EVENTS
};
