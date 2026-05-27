'use strict';

/**
 * Goal Validator — 目标数据结构校验
 * P9.5.1 Goal Registry MVP
 */

var types = require('./goal-types');
var GOAL_STATUS = types.GOAL_STATUS;
var GOAL_PRIORITY = types.GOAL_PRIORITY;
var GOAL_CATEGORIES = types.GOAL_CATEGORIES;

/**
 * 校验创建 Goal 的输入
 * @param {Object} input - 用户输入
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateGoal(input) {
  var errors = [];

  // name: 必填，string，1-200 字符
  if (!input || typeof input !== 'object') {
    errors.push('input must be an object');
    return { valid: false, errors: errors };
  }

  if (!input.name || typeof input.name !== 'string' || input.name.trim().length === 0) {
    errors.push('name is required and must be a non-empty string');
  } else if (input.name.length > 200) {
    errors.push('name must be <= 200 characters');
  }

  // description: 可选，string
  if (input.description !== undefined && typeof input.description !== 'string') {
    errors.push('description must be a string if provided');
  }

  // category: 可选，必须在 GOAL_CATEGORIES 中
  if (input.category !== undefined && !types.validateCategory(input.category)) {
    errors.push('category must be one of: ' + Object.keys(GOAL_CATEGORIES).map(function(k) { return GOAL_CATEGORIES[k]; }).join(', '));
  }

  // priority: 可选，默认 medium，必须在 GOAL_PRIORITY 中
  var priority = input.priority || GOAL_PRIORITY.MEDIUM;
  if (!types.validatePriority(priority)) {
    errors.push('priority must be one of: ' + Object.keys(GOAL_PRIORITY).map(function(k) { return GOAL_PRIORITY[k]; }).join(', '));
  }

  // status: 可选，默认 active，必须在 GOAL_STATUS 中
  var status = input.status || GOAL_STATUS.ACTIVE;
  if (!types.validateStatus(status)) {
    errors.push('status must be one of: ' + Object.keys(GOAL_STATUS).map(function(k) { return GOAL_STATUS[k]; }).join(', '));
  }

  // targets: 可选，object
  if (input.targets !== undefined && (typeof input.targets !== 'object' || Array.isArray(input.targets))) {
    errors.push('targets must be an object if provided');
  }

  // constraints: 可选，object
  if (input.constraints !== undefined && (typeof input.constraints !== 'object' || Array.isArray(input.constraints))) {
    errors.push('constraints must be an object if provided');
  }

  // metadata: 可选，object
  if (input.metadata !== undefined && (typeof input.metadata !== 'object' || Array.isArray(input.metadata))) {
    errors.push('metadata must be an object if provided');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * 校验更新 Goal 的输入
 * 只允许更新部分字段
 * @param {Object} input - 用户输入
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateGoalUpdate(input) {
  var errors = [];

  if (!input || typeof input !== 'object') {
    errors.push('input must be an object');
    return { valid: false, errors: errors };
  }

  // goalId: 更新时必须提供
  if (!input.goalId || !types.validateGoalId(input.goalId)) {
    errors.push('goalId is required and must be valid (goal_<16 hex chars>)');
  }

  // 可更新字段白名单
  var allowedFields = ['name', 'description', 'category', 'priority', 'status', 'targets', 'constraints', 'metadata'];
  var providedFields = Object.keys(input).filter(function(k) { return k !== 'goalId'; });

  // 至少有一个可更新字段
  if (providedFields.length === 0) {
    errors.push('at least one field to update must be provided');
  }

  // 校验每个提供的字段
  providedFields.forEach(function(field) {
    if (allowedFields.indexOf(field) === -1) {
      errors.push('field "' + field + '" is not allowed for update');
      return;
    }

    if (field === 'name') {
      if (typeof input.name !== 'string' || input.name.trim().length === 0) {
        errors.push('name must be a non-empty string');
      } else if (input.name.length > 200) {
        errors.push('name must be <= 200 characters');
      }
    }

    if (field === 'description' && input.description !== undefined && typeof input.description !== 'string') {
      errors.push('description must be a string if provided');
    }

    if (field === 'category' && !types.validateCategory(input.category)) {
      errors.push('category must be one of: ' + Object.keys(GOAL_CATEGORIES).map(function(k) { return GOAL_CATEGORIES[k]; }).join(', '));
    }

    if (field === 'priority' && !types.validatePriority(input.priority)) {
      errors.push('priority must be one of: ' + Object.keys(GOAL_PRIORITY).map(function(k) { return GOAL_PRIORITY[k]; }).join(', '));
    }

    if (field === 'status' && !types.validateStatus(input.status)) {
      errors.push('status must be one of: ' + Object.keys(GOAL_STATUS).map(function(k) { return GOAL_STATUS[k]; }).join(', '));
    }

    if (field === 'targets' && input.targets !== undefined && (typeof input.targets !== 'object' || Array.isArray(input.targets))) {
      errors.push('targets must be an object if provided');
    }

    if (field === 'constraints' && input.constraints !== undefined && (typeof input.constraints !== 'object' || Array.isArray(input.constraints))) {
      errors.push('constraints must be an object if provided');
    }

    if (field === 'metadata' && input.metadata !== undefined && (typeof input.metadata !== 'object' || Array.isArray(input.metadata))) {
      errors.push('metadata must be an object if provided');
    }
  });

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * 校验 status 转换是否合法
 * 当前只允许：active -> paused, active -> archived, paused -> active
 */
function validateStatusTransition(currentStatus, newStatus) {
  var VALID_TRANSITIONS = {};
  VALID_TRANSITIONS[GOAL_STATUS.ACTIVE] = [GOAL_STATUS.PAUSED, GOAL_STATUS.ARCHIVED];
  VALID_TRANSITIONS[GOAL_STATUS.PAUSED] = [GOAL_STATUS.ACTIVE];
  VALID_TRANSITIONS[GOAL_STATUS.ARCHIVED] = []; // archived 不可转换

  if (!VALID_TRANSITIONS[currentStatus]) return false;
  return VALID_TRANSITIONS[currentStatus].indexOf(newStatus) !== -1;
}

// 用于测试重置（无状态，留空）
function _reset() {}

module.exports = {
  validateGoal: validateGoal,
  validateGoalUpdate: validateGoalUpdate,
  validateStatusTransition: validateStatusTransition,
  _reset: _reset
};
