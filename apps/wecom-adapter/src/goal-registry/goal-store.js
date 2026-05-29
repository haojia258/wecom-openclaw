'use strict';

/**
 * Goal Store — 目标持久化存储层
 * P9.5.1 Goal Registry MVP
 *
 * 存储路径：storage/goals/goals.json
 * 并发保护：简单 mutex（_writeLock / _writeQueue）
 */

var fs = require('fs');
var path = require('path');
var types = require('./goal-types');

var STORAGE_DIR = path.join(process.cwd(), types.GOAL_STORAGE_DIR);
var STORAGE_FILE = path.join(process.cwd(), types.GOAL_STORAGE_FILE);

// 简单互斥锁
var _writeLock = false;
var _writeQueue = [];

/**
 * 初始化存储目录和文件
 */
function _ensureStorage() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORAGE_FILE)) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

/**
 * 读取所有 goals（带 malformed JSON 容错）
 * @returns {Array}
 */
function _readGoals() {
  _ensureStorage();
  var raw;
  try {
    raw = fs.readFileSync(STORAGE_FILE, 'utf8');
  } catch (e) {
    // 读取失败 → 返回空数组
    return [];
  }
  if (!raw || raw.trim().length === 0) {
    return [];
  }
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // malformed JSON → 返回空数组（不崩溃）
    return [];
  }
}

/**
 * 写入 goals 数组（带 mutex）
 * @param {Array} goals
 * @param {Function} cb - 回调(err)
 */
function _writeGoals(goals, cb) {
  if (_writeLock) {
    _writeQueue.push({ goals: goals, cb: cb });
    return;
  }
  _writeLock = true;

  try {
    _ensureStorage();
    var tmpPath = STORAGE_FILE + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(goals, null, 2), 'utf8');
    fs.renameSync(tmpPath, STORAGE_FILE);
    _writeLock = false;
    cb(null);
  } catch (e) {
    _writeLock = false;
    cb(e);
  }

  // 处理队列
  _drainQueue();
}

function _drainQueue() {
  if (_writeQueue.length === 0) return;
  var next = _writeQueue.shift();
  _writeGoals(next.goals, next.cb);
}

/**
 * 生成 goalId（如果未提供）
 */
function _ensureGoalId(goal) {
  if (!goal.goalId || !types.validateGoalId(goal.goalId)) {
    goal.goalId = types.generateGoalId();
  }
  return goal;
}

/**
 * 设置时间戳
 */
function _setTimestamps(goal, isCreate) {
  var now = new Date().toISOString();
  if (isCreate) {
    goal.createdAt = now;
  }
  goal.updatedAt = now;
  return goal;
}

// ========================================
// 公开 API
// ========================================

/**
 * 创建 Goal
 * @param {Object} goalData
 * @returns {{success: boolean, goal: Object|null, error: string}}
 */
function createGoal(goalData) {
  var goals = _readGoals();

  // 检查 goalId 是否已存在
  if (goalData.goalId) {
    var existing = goals.find(function(g) { return g.goalId === goalData.goalId; });
    if (existing) {
      return { success: false, goal: null, error: 'goalId already exists: ' + goalData.goalId };
    }
  }

  var goal = {};
  _ensureGoalId(goalData);
  goal.goalId = goalData.goalId;
  goal.name = goalData.name;
  goal.description = goalData.description || '';
  goal.category = goalData.category || '';
  goal.priority = goalData.priority || types.GOAL_PRIORITY.MEDIUM;
  goal.status = (goalData.status || types.GOAL_STATUS.ACTIVE);
  goal.targets = goalData.targets || {};
  goal.constraints = goalData.constraints || {};
  goal.metadata = goalData.metadata || { owner: 'system', tags: [] };
  _setTimestamps(goal, true);

  goals.push(goal);

  var writeErr = null;
  _writeGoals(goals, function(err) { writeErr = err; });
  // 同步等待（简单实现，适合 CLI / 单进程）
  // 实际 _writeGoals 是同步的（writeFileSync），队列异步但不在此使用
  // 由于我们用 writeFileSync，直接写
  try {
    _ensureStorage();
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(goals, null, 2), 'utf8');
  } catch (e) {
    return { success: false, goal: null, error: 'write failed: ' + e.message };
  }

  return { success: true, goal: goal, error: null };
}

/**
 * 更新 Goal（部分更新）
 * @param {string} goalId
 * @param {Object} updates
 * @returns {{success: boolean, goal: Object|null, error: string}}
 */
function updateGoal(goalId, updates) {
  var goals = _readGoals();
  var idx = goals.findIndex(function(g) { return g.goalId === goalId; });
  if (idx === -1) {
    return { success: false, goal: null, error: 'goal not found: ' + goalId };
  }

  var goal = goals[idx];
  var allowedFields = ['name', 'description', 'category', 'priority', 'status', 'targets', 'constraints', 'metadata'];

  allowedFields.forEach(function(field) {
    if (updates[field] !== undefined) {
      // status 转换校验
      if (field === 'status' && !types.validateStatus(updates[field])) {
        return; // skip invalid status
      }
      if (field === 'priority' && !types.validatePriority(updates[field])) {
        return;
      }
      goal[field] = updates[field];
    }
  });

  _setTimestamps(goal, false);
  goals[idx] = goal;

  try {
    _ensureStorage();
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(goals, null, 2), 'utf8');
  } catch (e) {
    return { success: false, goal: null, error: 'write failed: ' + e.message };
  }

  return { success: true, goal: goal, error: null };
}

/**
 * 删除 Goal
 * @param {string} goalId
 * @returns {{success: boolean, error: string}}
 */
function deleteGoal(goalId) {
  var goals = _readGoals();
  var originalLen = goals.length;
  goals = goals.filter(function(g) { return g.goalId !== goalId; });

  if (goals.length === originalLen) {
    return { success: false, error: 'goal not found: ' + goalId };
  }

  try {
    _ensureStorage();
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(goals, null, 2), 'utf8');
  } catch (e) {
    return { success: false, error: 'write failed: ' + e.message };
  }

  return { success: true, error: null };
}

/**
 * 获取单个 Goal
 * @param {string} goalId
 * @returns {Object|null}
 */
function getGoal(goalId) {
  var goals = _readGoals();
  return goals.find(function(g) { return g.goalId === goalId; }) || null;
}

/**
 * 列出所有 Goal（支持过滤）
 * @param {Object} [filter] - { status, category, priority }
 * @returns {Array}
 */
function listGoals(filter) {
  var goals = _readGoals();
  if (!filter) return goals;

  return goals.filter(function(g) {
    if (filter.status && g.status !== filter.status) return false;
    if (filter.category && g.category !== filter.category) return false;
    if (filter.priority && g.priority !== filter.priority) return false;
    return true;
  });
}

/**
 * 获取存储文件路径（用于测试）
 */
function _getStoragePath() {
  return STORAGE_FILE;
}

/**
 * 重置存储（仅测试用）
 */
function _resetStorage() {
  if (fs.existsSync(STORAGE_FILE)) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

/**
 * 重置模块状态（仅测试用）
 */
function _reset() {
  _writeLock = false;
  _writeQueue = [];
  _resetStorage();
}

module.exports = {
  createGoal: createGoal,
  updateGoal: updateGoal,
  deleteGoal: deleteGoal,
  getGoal: getGoal,
  listGoals: listGoals,
  _readGoals: _readGoals,
  _getStoragePath: _getStoragePath,
  _resetStorage: _resetStorage,
  _reset: _reset
};
