'use strict';

/**
 * Goal Types — 组织目标注册层类型定义
 * P9.5.1 Goal Registry MVP
 */

// Goal 状态（只允许这 3 种）
var GOAL_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  ARCHIVED: 'archived'
};

// Goal 优先级（只允许这 4 种）
var GOAL_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Goal 分类（预定义，允许扩展）
var GOAL_CATEGORIES = {
  COMMERCE: 'commerce',
  OPERATIONS: 'operations',
  RELIABILITY: 'reliability',
  SECURITY: 'security',
  COST: 'cost',
  PERFORMANCE: 'performance',
  COMPLIANCE: 'compliance'
};

// 存储路径
var GOAL_STORAGE_DIR = 'storage/goals';
var GOAL_STORAGE_FILE = 'storage/goals/goals.json';

// 并发写保护（简单 mutex）
var _writeLock = false;
var _writeQueue = [];

/**
 * 校验 goalId 格式
 * 规则：goal_<16 hex chars>
 */
function validateGoalId(goalId) {
  if (!goalId || typeof goalId !== 'string') return false;
  return /^goal_[a-f0-9]{16}$/.test(goalId);
}

/**
 * 生成新 goalId
 */
function generateGoalId() {
  var hex = '';
  var chars = 'abcdef0123456789';
  for (var i = 0; i < 16; i++) {
    hex += chars[Math.floor(Math.random() * 16)];
  }
  return 'goal_' + hex;
}

/**
 * 校验 status
 */
function validateStatus(status) {
  return Object.keys(GOAL_STATUS).some(function(key) {
    return GOAL_STATUS[key] === status;
  });
}

/**
 * 校验 priority
 */
function validatePriority(priority) {
  return Object.keys(GOAL_PRIORITY).some(function(key) {
    return GOAL_PRIORITY[key] === priority;
  });
}

/**
 * 校验 category
 */
function validateCategory(category) {
  return Object.keys(GOAL_CATEGORIES).some(function(key) {
    return GOAL_CATEGORIES[key] === category;
  });
}

module.exports = {
  GOAL_STATUS: GOAL_STATUS,
  GOAL_PRIORITY: GOAL_PRIORITY,
  GOAL_CATEGORIES: GOAL_CATEGORIES,
  GOAL_STORAGE_DIR: GOAL_STORAGE_DIR,
  GOAL_STORAGE_FILE: GOAL_STORAGE_FILE,
  validateGoalId: validateGoalId,
  generateGoalId: generateGoalId,
  validateStatus: validateStatus,
  validatePriority: validatePriority,
  validateCategory: validateCategory
};
