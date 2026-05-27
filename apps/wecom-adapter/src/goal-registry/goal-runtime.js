'use strict';

/**
 * Goal Runtime — 目标运行时层（只读/被动）
 * P9.5.1 Goal Registry MVP
 *
 * 职责：
 * - 注册/暂停/归档目标（通过 store）
 * - 获取活跃目标列表
 * - 生成目标快照（只读，不执行任务）
 *
 * 约束：
 * - 不执行 mission
 * - 不调用 shell/exec/spawn
 * - 不暴露 HTTP API
 * - 不修改服务配置（含 Web 服务器配置、环境变量文件等）
 */

var store = require('./goal-store');
var validator = require('./goal-validator');
var types = require('./goal-types');

var GOAL_STATUS = types.GOAL_STATUS;

// 运行时版本
var RUNTIME_VERSION = 'goal-runtime-v1.0.0';

/**
 * 注册新目标
 * @param {Object} goalData - { name, description?, category?, priority?, targets?, constraints?, metadata? }
 * @returns {{success: boolean, goal: Object|null, error: string}}
 */
function registerGoal(goalData) {
  // 校验输入
  var validation = validator.validateGoal(goalData);
  if (!validation.valid) {
    return {
      success: false,
      goal: null,
      error: 'validation failed: ' + validation.errors.join('; ')
    };
  }

  // 创建目标
  var result = store.createGoal(goalData);
  return result;
}

/**
 * 暂停目标
 * @param {string} goalId
 * @returns {{success: boolean, goal: Object|null, error: string}}
 */
function pauseGoal(goalId) {
  if (!types.validateGoalId(goalId)) {
    return { success: false, goal: null, error: 'invalid goalId: ' + goalId };
  }

  // 检查当前状态
  var existing = store.getGoal(goalId);
  if (!existing) {
    return { success: false, goal: null, error: 'goal not found: ' + goalId };
  }

  if (existing.status !== GOAL_STATUS.ACTIVE) {
    return {
      success: false,
      goal: null,
      error: 'goal must be active to pause, current status: ' + existing.status
    };
  }

  // 更新状态为 paused
  return store.updateGoal(goalId, { status: GOAL_STATUS.PAUSED });
}

/**
 * 归档目标
 * @param {string} goalId
 * @returns {{success: boolean, goal: Object|null, error: string}}
 */
function archiveGoal(goalId) {
  if (!types.validateGoalId(goalId)) {
    return { success: false, goal: null, error: 'invalid goalId: ' + goalId };
  }

  // 检查当前状态
  var existing = store.getGoal(goalId);
  if (!existing) {
    return { success: false, goal: null, error: 'goal not found: ' + goalId };
  }

  if (existing.status !== GOAL_STATUS.ACTIVE && existing.status !== GOAL_STATUS.PAUSED) {
    return {
      success: false,
      goal: null,
      error: 'goal must be active or paused to archive, current status: ' + existing.status
    };
  }

  // 更新状态为 archived
  return store.updateGoal(goalId, { status: GOAL_STATUS.ARCHIVED });
}

/**
 * 获取所有活跃目标
 * @returns {Array}
 */
function getActiveGoals() {
  return store.listGoals({ status: GOAL_STATUS.ACTIVE });
}

/**
 * 获取所有暂停目标
 * @returns {Array}
 */
function getPausedGoals() {
  return store.listGoals({ status: GOAL_STATUS.PAUSED });
}

/**
 * 获取所有归档目标
 * @returns {Array}
 */
function getArchivedGoals() {
  return store.listGoals({ status: GOAL_STATUS.ARCHIVED });
}

/**
 * 生成目标快照（只读，不执行任务）
 * @returns {Object} snapshot - { goals, activeGoals, pausedGoals, archivedGoals, summary, generatedAt, runtimeVersion }
 */
function generateGoalSnapshot() {
  var allGoals = store.listGoals();
  var activeGoals = getActiveGoals();
  var pausedGoals = getPausedGoals();
  var archivedGoals = getArchivedGoals();

  // 按优先级统计
  var priorityCounts = {};
  Object.keys(types.GOAL_PRIORITY).forEach(function(key) {
    var priority = types.GOAL_PRIORITY[key];
    priorityCounts[priority] = allGoals.filter(function(g) { return g.priority === priority; }).length;
  });

  // 按分类统计
  var categoryCounts = {};
  Object.keys(types.GOAL_CATEGORIES).forEach(function(key) {
    var category = types.GOAL_CATEGORIES[key];
    categoryCounts[category] = allGoals.filter(function(g) { return g.category === category; }).length;
  });

  var snapshot = {
    goals: allGoals,
    activeGoals: activeGoals,
    pausedGoals: pausedGoals,
    archivedGoals: archivedGoals,
    summary: {
      total: allGoals.length,
      active: activeGoals.length,
      paused: pausedGoals.length,
      archived: archivedGoals.length,
      byPriority: priorityCounts,
      byCategory: categoryCounts
    },
    generatedAt: new Date().toISOString(),
    runtimeVersion: RUNTIME_VERSION
  };

  return snapshot;
}

/**
 * 激活已暂停的目标
 * @param {string} goalId
 * @returns {{success: boolean, goal: Object|null, error: string}}
 */
function activateGoal(goalId) {
  if (!types.validateGoalId(goalId)) {
    return { success: false, goal: null, error: 'invalid goalId: ' + goalId };
  }

  var existing = store.getGoal(goalId);
  if (!existing) {
    return { success: false, goal: null, error: 'goal not found: ' + goalId };
  }

  if (existing.status !== GOAL_STATUS.PAUSED) {
    return {
      success: false,
      goal: null,
      error: 'goal must be paused to activate, current status: ' + existing.status
    };
  }

  return store.updateGoal(goalId, { status: GOAL_STATUS.ACTIVE });
}

/**
 * 获取单个目标（运行时封装）
 * @param {string} goalId
 * @returns {Object|null}
 */
function getGoal(goalId) {
  if (!types.validateGoalId(goalId)) {
    return null;
  }
  return store.getGoal(goalId);
}

/**
 * 列出目标（运行时封装）
 * @param {Object} [filter] - { status, category, priority }
 * @returns {Array}
 */
function listGoals(filter) {
  return store.listGoals(filter);
}

/**
 * 更新目标（运行时封装，带校验）
 * @param {string} goalId
 * @param {Object} updates
 * @returns {{success: boolean, goal: Object|null, error: string}}
 */
function updateGoal(goalId, updates) {
  if (!types.validateGoalId(goalId)) {
    return { success: false, goal: null, error: 'invalid goalId: ' + goalId };
  }

  // 校验更新
  var updateInput = Object.assign({}, updates, { goalId: goalId });
  var validation = validator.validateGoalUpdate(updateInput);
  if (!validation.valid) {
    return {
      success: false,
      goal: null,
      error: 'validation failed: ' + validation.errors.join('; ')
    };
  }

  return store.updateGoal(goalId, updates);
}

/**
 * 删除目标（运行时封装）
 * @param {string} goalId
 * @returns {{success: boolean, error: string}}
 */
function deleteGoal(goalId) {
  if (!types.validateGoalId(goalId)) {
    return { success: false, error: 'invalid goalId: ' + goalId };
  }
  return store.deleteGoal(goalId);
}

/**
 * 重置模块状态（仅测试用）
 */
function _reset() {
  store._reset();
}

module.exports = {
  registerGoal: registerGoal,
  pauseGoal: pauseGoal,
  archiveGoal: archiveGoal,
  activateGoal: activateGoal,
  getActiveGoals: getActiveGoals,
  getPausedGoals: getPausedGoals,
  getArchivedGoals: getArchivedGoals,
  getGoal: getGoal,
  listGoals: listGoals,
  updateGoal: updateGoal,
  deleteGoal: deleteGoal,
  generateGoalSnapshot: generateGoalSnapshot,
  _reset: _reset
};
