'use strict';

/**
 * workflow-state-machine.js - AI Mission Control Workflow 状态机 (P10.1)
 *
 * 定义 Mission Task 在工作流中的合法状态流转。
 *
 * 状态定义（小写，与 legacy orchestrator 风格一致）:
 *   queued     - 任务已排队，等待处理
 *   running    - 正在执行
 *   testing    - 测试阶段
 *   audit      - 审核/审计阶段
 *   staging    - 预发布（staging）环境部署
 *   production - 生产环境部署
 *   completed  - 任务完成（终端状态）
 *   failed     - 任务失败（可恢复）
 *   rollback   - 回滚中
 *
 * 状态转换规则（正向流转 + 分支）:
 *   queued     → running
 *   running    → testing, failed
 *   testing    → audit, failed
 *   audit      → staging, failed
 *   staging    → production, failed, rollback
 *   production → completed, failed, rollback
 *   failed     → running               (重试/恢复)
 *   rollback   → running, failed       (回滚后恢复或确认失败)
 *   completed  → []                    (终端，无出边)
 */

// ─── 状态常量 ─────────────────────────────────────────────

var STATES = {
  QUEUED: 'queued',
  RUNNING: 'running',
  TESTING: 'testing',
  AUDIT: 'audit',
  STAGING: 'staging',
  PRODUCTION: 'production',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ROLLBACK: 'rollback'
};

// ─── 所有合法状态 ────────────────────────────────────────

var VALID_STATES = [
  STATES.QUEUED,
  STATES.RUNNING,
  STATES.TESTING,
  STATES.AUDIT,
  STATES.STAGING,
  STATES.PRODUCTION,
  STATES.COMPLETED,
  STATES.FAILED,
  STATES.ROLLBACK
];

// ─── 合法转换表 ──────────────────────────────────────────

var VALID_TRANSITIONS = {};
VALID_TRANSITIONS[STATES.QUEUED] = [STATES.RUNNING];
VALID_TRANSITIONS[STATES.RUNNING] = [STATES.TESTING, STATES.FAILED];
VALID_TRANSITIONS[STATES.TESTING] = [STATES.AUDIT, STATES.STAGING, STATES.FAILED];
VALID_TRANSITIONS[STATES.AUDIT] = [STATES.STAGING, STATES.FAILED];
VALID_TRANSITIONS[STATES.STAGING] = [STATES.PRODUCTION, STATES.FAILED, STATES.ROLLBACK];
VALID_TRANSITIONS[STATES.PRODUCTION] = [STATES.COMPLETED, STATES.FAILED, STATES.ROLLBACK];
VALID_TRANSITIONS[STATES.FAILED] = [STATES.RUNNING];
VALID_TRANSITIONS[STATES.ROLLBACK] = [STATES.RUNNING, STATES.FAILED];
VALID_TRANSITIONS[STATES.COMPLETED] = [];

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
 * 检查状态转换是否合法（非抛出版本）
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
 * @param {string} state
 * @throws {Error}
 */
function validateState(state) {
  if (!isValidState(state)) {
    throw new Error(
      'Invalid workflow state: "' + state + '". ' +
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
    var allowed = VALID_TRANSITIONS[from] || [];
    throw new Error(
      'Invalid workflow transition: ' + from + ' → ' + to + '. ' +
      'Allowed from ' + from + ': ' + (allowed.length > 0 ? allowed.join(', ') : '(terminal - no outgoing transitions)')
    );
  }
}

/**
 * 获取终端状态列表
 * @returns {string[]}
 */
function getTerminalStates() {
  return [STATES.COMPLETED];
}

/**
 * 检查状态是否为终端状态
 * @param {string} state
 * @returns {boolean}
 */
function isTerminalState(state) {
  return getTerminalStates().indexOf(state) !== -1;
}

/**
 * 获取从某状态可以跳转到的下一个状态列表
 * @param {string} state
 * @returns {string[]}
 */
function getNextStates(state) {
  if (!isValidState(state)) return [];
  return (VALID_TRANSITIONS[state] || []).slice();
}

/**
 * 获取完整的状态流转图
 * @returns {object}
 */
function getStateGraph() {
  return VALID_TRANSITIONS;
}

/**
 * 检查是否为"失败可恢复"状态
 * 即：failed 和 rollback 状态可以通过 RE_RUN 恢复到 running
 * @param {string} state
 * @returns {boolean}
 */
function isRecoverableState(state) {
  return state === STATES.FAILED || state === STATES.ROLLBACK;
}

/**
 * 标准化状态字符串（用于兼容可能的变体输入）
 * - 已经是合法状态 → 原样返回
 * - null/undefined → 返回 null
 * - 未知字符串 → 原样返回（后续 validateState 会拒绝）
 *
 * @param {string} state
 * @returns {string|null}
 */
function normalizeState(state) {
  if (state === null || state === undefined) return state;
  if (isValidState(state)) return state;
  // 未知状态保持原样
  return state;
}

// ─── 导出 ─────────────────────────────────────────────────

module.exports = {
  STATES: STATES,
  VALID_STATES: VALID_STATES,
  VALID_TRANSITIONS: VALID_TRANSITIONS,
  isValidState: isValidState,
  isValidTransition: isValidTransition,
  validateState: validateState,
  validateTransition: validateTransition,
  getTerminalStates: getTerminalStates,
  isTerminalState: isTerminalState,
  getNextStates: getNextStates,
  getStateGraph: getStateGraph,
  isRecoverableState: isRecoverableState,
  normalizeState: normalizeState
};
