'use strict';

/**
 * Goal Registry — Barrel Export
 * P9.5.1 Goal Registry MVP
 *
 * 统一导出所有模块
 */

var types = require('./goal-types');
var validator = require('./goal-validator');
var store = require('./goal-store');
var runtime = require('./goal-runtime');

// 类型定义
module.exports.GOAL_STATUS = types.GOAL_STATUS;
module.exports.GOAL_PRIORITY = types.GOAL_PRIORITY;
module.exports.GOAL_CATEGORIES = types.GOAL_CATEGORIES;
module.exports.GOAL_STORAGE_DIR = types.GOAL_STORAGE_DIR;
module.exports.GOAL_STORAGE_FILE = types.GOAL_STORAGE_FILE;

// 类型工具函数
module.exports.validateGoalId = types.validateGoalId;
module.exports.generateGoalId = types.generateGoalId;
module.exports.validateStatus = types.validateStatus;
module.exports.validatePriority = types.validatePriority;
module.exports.validateCategory = types.validateCategory;

// 校验器
module.exports.validateGoal = validator.validateGoal;
module.exports.validateGoalUpdate = validator.validateGoalUpdate;
module.exports.validateStatusTransition = validator.validateStatusTransition;

// 存储层
module.exports.createGoal = store.createGoal;
module.exports.updateGoal = store.updateGoal;
module.exports.deleteGoal = store.deleteGoal;
module.exports.getGoal = store.getGoal;
module.exports.listGoals = store.listGoals;

// 运行时层
module.exports.registerGoal = runtime.registerGoal;
module.exports.pauseGoal = runtime.pauseGoal;
module.exports.archiveGoal = runtime.archiveGoal;
module.exports.activateGoal = runtime.activateGoal;
module.exports.getActiveGoals = runtime.getActiveGoals;
module.exports.getPausedGoals = runtime.getPausedGoals;
module.exports.getArchivedGoals = runtime.getArchivedGoals;
module.exports.generateGoalSnapshot = runtime.generateGoalSnapshot;

// 测试辅助（不暴露给生产代码，但通过 require 可访问）
module.exports._reset = function() {
  types._reset && types._reset();
  validator._reset && validator._reset();
  store._reset && store._reset();
  runtime._reset && runtime._reset();
};
