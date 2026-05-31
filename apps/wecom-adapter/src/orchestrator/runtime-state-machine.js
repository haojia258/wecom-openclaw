/**
 * runtime-state-machine.js
 * AI Orchestrator Runtime 状态机 v0.4
 *
 * 限制合法状态流转，禁止非法跳转。
 *
 * 合法流转：
 *   queued           → planned
 *   planned          → dispatched
 *   dispatched       → artifact_received
 *   artifact_received → review_pending
 *   review_pending   → approved
 *   review_pending   → rejected
 *   approved         → closed
 *   rejected         → rollback_required
 *   rollback_required → closed
 */

const VALID_TRANSITIONS = {
  queued:           ['planned', 'cancelled'],
  planned:          ['dispatched', 'cancelled'],
  dispatched:       ['artifact_received', 'cancelled'],
  artifact_received: ['review_pending', 'cancelled'],
  review_pending:   ['approved', 'rejected', 'cancelled'],
  approved:         ['closed'],
  rejected:         ['rollback_required'],
  rollback_required: ['closed'],
  cancelled:        [],  // 终态，不可再流转
  // closed 是终态，无出边
};

const TERMINAL_STATUSES = ['closed', 'cancelled'];

/**
 * 检查状态跳转是否合法
 *
 * @param {string} from - 当前状态
 * @param {string} to - 目标状态
 * @returns {{ valid: boolean, reason?: string, nextSteps?: string[] }}
 */
function validateTransition(from, to) {
  if (!VALID_TRANSITIONS[from]) {
    return {
      valid: false,
      reason: `Unknown source status: ${from}`,
    };
  }

  if (!VALID_TRANSITIONS[to] && !TERMINAL_STATUSES.includes(to)) {
    return {
      valid: false,
      reason: `Unknown target status: ${to}`,
    };
  }

  if (from === to) {
    return {
      valid: false,
      reason: `Cannot transition to same status: ${from} → ${to}`,
    };
  }

  const allowed = VALID_TRANSITIONS[from] || [];
  if (allowed.includes(to)) {
    return {
      valid: true,
      nextSteps: getNextStates(to),
    };
  }

  return {
    valid: false,
    reason: `Invalid transition: ${from} → ${to}. Allowed: ${allowed.join(', ')}`,
  };
}

/**
 * 执行状态跳转（带校验）
 *
 * @param {object} task - 任务对象
 * @param {string} to - 目标状态
 * @returns {{ success: boolean, task: object|null, error?: string }}
 */
function transition(task, to) {
  if (!task || !task.status) {
    return { success: false, error: 'Invalid task object' };
  }

  const result = validateTransition(task.status, to);
  if (!result.valid) {
    return { success: false, error: result.reason };
  }

  const fromStatus = task.status;
  task.status = to;
  task.updatedAt = new Date().toISOString();
  task.lastTransition = { from: fromStatus, to, at: task.updatedAt };

  // 追加事件
  if (!task.events) task.events = [];
  task.events.push({
    type: 'state_transition',
    from: fromStatus,
    to,
    ts: task.updatedAt,
  });

  return { success: true, task };
}

/**
 * 获取从某状态可以跳转到的下一个状态列表
 */
function getNextStates(status) {
  return VALID_TRANSITIONS[status] || [];
}

/**
 * 获取完整的状态流转图
 */
function getStateGraph() {
  return VALID_TRANSITIONS;
}

/**
 * 获取建议的下一个操作
 */
function getNextAction(status) {
  const actionMap = {
    queued: 'plan',
    planned: 'dispatch',
    dispatched: 'receive_artifact',
    artifact_received: 'review',
    review_pending: 'approve_or_reject',
    approved: 'close',
    rejected: 'plan_rollback',
    rollback_required: 'close',
    closed: 'none',
  };
  return actionMap[status] || 'unknown';
}

module.exports = {
  validateTransition,
  transition,
  getNextStates,
  getNextAction,
  getStateGraph,
  VALID_TRANSITIONS,
  TERMINAL_STATUSES,
};
