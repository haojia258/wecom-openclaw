'use strict';

/**
 * task-state-machine.js - Agent 状态机统一 (P6.6.2)
 *
 * 所有 Agent / Planner / Reporter / Task Store 的统一状态表达。
 *
 * 状态定义（大写）:
 *   PENDING    - 任务已创建，等待处理
 *   PLANNING   - 正在生成执行计划（plan-only 阶段）
 *   RUNNING    - Agent 正在执行任务
 *   REVIEWING  - 结果进入审查阶段
 *   COMPLETED  - 任务已完成
 *   FAILED     - 任务执行失败
 *   BLOCKED    - 任务被阻断，需人工介入
 *
 * 状态转换规则:
 *   PENDING → PLANNING
 *   PLANNING → RUNNING
 *   RUNNING → REVIEWING
 *   RUNNING → COMPLETED
 *   RUNNING → FAILED
 *   RUNNING → BLOCKED
 *   REVIEWING → COMPLETED
 *   REVIEWING → FAILED
 *   BLOCKED → RUNNING
 *   FAILED → RUNNING
 */

// ─── 状态常量 ─────────────────────────────────────────────

const STATES = {
  PENDING: 'PENDING',
  PLANNING: 'PLANNING',
  RUNNING: 'RUNNING',
  REVIEWING: 'REVIEWING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED'
};

// ─── 所有合法状态 ────────────────────────────────────────

const VALID_STATES = [
  STATES.PENDING,
  STATES.PLANNING,
  STATES.RUNNING,
  STATES.REVIEWING,
  STATES.COMPLETED,
  STATES.FAILED,
  STATES.BLOCKED
];

// ─── 合法转换表 ──────────────────────────────────────────

const VALID_TRANSITIONS = {};
VALID_TRANSITIONS[STATES.PENDING] = [STATES.PLANNING];
VALID_TRANSITIONS[STATES.PLANNING] = [STATES.RUNNING];
VALID_TRANSITIONS[STATES.RUNNING] = [STATES.REVIEWING, STATES.COMPLETED, STATES.FAILED, STATES.BLOCKED];
VALID_TRANSITIONS[STATES.REVIEWING] = [STATES.COMPLETED, STATES.FAILED];
VALID_TRANSITIONS[STATES.BLOCKED] = [STATES.RUNNING];
VALID_TRANSITIONS[STATES.FAILED] = [STATES.RUNNING];
VALID_TRANSITIONS[STATES.COMPLETED] = [];

// ─── 旧状态 → 新状态映射（向后兼容）──────────────────────

const STATE_NORMALIZE_MAP = {
  'pending': STATES.PENDING,
  'in_progress': STATES.RUNNING,
  'completed': STATES.COMPLETED,
  'failed': STATES.FAILED,
  'blocked': STATES.BLOCKED
};

// ─── Public API ──────────────────────────────────────────

/**
 * 检查状态是否合法
 * @param {string} state
 * @returns {boolean}
 */
function isValidState(state) {
  return VALID_STATES.indexOf(state) !== -1;
}

/**
 * 检查状态转换是否合法
 * @param {string} from - 当前状态
 * @param {string} to - 目标状态
 * @returns {boolean}
 */
function isValidTransition(from, to) {
  if (!isValidState(from) || !isValidState(to)) {
    return false;
  }
  var allowed = VALID_TRANSITIONS[from] || [];
  return allowed.indexOf(to) !== -1;
}

/**
 * 验证状态合法性，非法时抛出异常
 * @param {string} status
 * @throws {Error}
 */
function validateStatus(status) {
  if (!isValidState(status)) {
    throw new Error(
      'Invalid status: "' + status + '". ' +
      'Valid states: ' + VALID_STATES.join(', ')
    );
  }
}

/**
 * 验证状态转换合法性，非法时抛出异常
 * @param {string} from - 当前状态
 * @param {string} to - 目标状态
 * @throws {Error}
 */
function validateTransition(from, to) {
  if (!isValidTransition(from, to)) {
    throw new Error(
      'Invalid transition: ' + from + ' → ' + to + '. ' +
      'Allowed from ' + from + ': ' + (VALID_TRANSITIONS[from] || []).join(', ')
    );
  }
}

/**
 * 标准化状态字符串（旧小写 → 新大写）
 * - 已经是合法新状态 → 原样返回
 * - 旧小写状态 → 映射为大写
 * - 不认识的字符串 → 原样返回（后续 validateStatus 会拒绝）
 *
 * @param {string} state
 * @returns {string}
 */
function normalizeState(state) {
  if (!state) return state;
  if (isValidState(state)) {
    return state;
  }
  var mapped = STATE_NORMALIZE_MAP[state];
  if (mapped) {
    return mapped;
  }
  // 未知状态，保持原样
  return state;
}

/**
 * 标准化任务对象中的 status 字段
 * @param {object} task
 * @returns {object} 同一个 task 对象（原地修改）
 */
function normalizeTask(task) {
  if (task && task.status) {
    task.status = normalizeState(task.status);
  }
  return task;
}

/**
 * 获取终端状态列表
 * @returns {string[]}
 */
function getTerminalStates() {
  return [STATES.COMPLETED, STATES.FAILED];
}

/**
 * 检查状态是否为终端状态
 * @param {string} state
 * @returns {boolean}
 */
function isTerminalState(state) {
  return getTerminalStates().indexOf(state) !== -1;
}

// ─── 导出 ─────────────────────────────────────────────────

module.exports = {
  STATES: STATES,
  VALID_STATES: VALID_STATES,
  VALID_TRANSITIONS: VALID_TRANSITIONS,
  isValidState: isValidState,
  isValidTransition: isValidTransition,
  validateStatus: validateStatus,
  validateTransition: validateTransition,
  normalizeState: normalizeState,
  normalizeTask: normalizeTask,
  getTerminalStates: getTerminalStates,
  isTerminalState: isTerminalState,
  STATE_NORMALIZE_MAP: STATE_NORMALIZE_MAP
};
