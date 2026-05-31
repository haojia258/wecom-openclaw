/**
 * runtime-core.js
 * AI Orchestrator Runtime Core v0.6.1
 *
 * 整合：
 *   - task-queue    任务队列
 *   - artifact-store     产物存储
 *   - worker-dispatcher    Worker 调度器
 *   - runtime-state-machine 状态机
 *   - audit-recorder    审计记录器
 *   - rollback-planner   回滚规划器
 *   - review-pipeline    Review 流水线
 *   - orchestrator-core  意图解析（复用 v0.2）
 *
 * 提供方法：
 *   - createRuntimeTask(input)    创建任务 (queued)
 *   - planTask(taskId)            规划 (queued → planned)
 *   - dispatchTask(taskId)        派发 (planned → dispatched)
 *   - receiveArtifact(taskId, artifact)  接收产物 (dispatched → artifact_received)
 *   - reviewTask(taskId)          审查 (artifact_received → review_pending)
 *   - approveTask(taskId)         批准 (review_pending → approved)
 *   - rejectTask(taskId)          拒绝 (review_pending → rejected)
 *   - planRollback(taskId)        回滚规划 (rejected → rollback_required)
 *   - closeTask(taskId)           关闭 (approved/rollback_required → closed)
 *   - getTaskStatus(taskId)       获取状态
 */

const { createTask, getTask, listTasks, updateStatus, updateTask, appendEvent } = require('./task-queue');
const { saveArtifact, saveArtifacts, readArtifact } = require('./artifact-store');
const { generateDispatchPayload } = require('./worker-dispatcher');
const { validateTransition, getNextAction } = require('./runtime-state-machine');
const { recordAudit } = require('./audit-recorder');
const { generateRollbackPlan } = require('./rollback-planner');
const { reviewTask: reviewTaskPipeline, formatReviewForWecom } = require('./review-pipeline');
const { decompose, buildPlan, formatPlanForWecom } = require('./orchestrator-core');

const VERSION = '0.6.1';

/**
 * 创建 Runtime 任务
 *
 * @param {object} input
 * @param {string} input.userRequest - 用户指令
 * @param {string} [input.assignee] - 推荐 AI（可选，不传则自动分解）
 * @param {string} [input.auditId] - 关联审计 ID
 * @returns {object} { task, plan, auditId }
 */
function createRuntimeTask(input = {}) {
  const userRequest = input.userRequest || '';

  // 意图分解（复用 v0.2 orchestrator-core）
  const decomposition = decompose(userRequest);

  // 创建任务
  const task = createTask({
    userRequest,
    assignee: input.assignee || (decomposition ? decomposition.recommendedAssignee : 'workbuddy'),
    branch: decomposition ? decomposition.branch : '',
    patchFile: decomposition ? decomposition.patchFile : '',
    forbidden: decomposition ? decomposition.forbidden : [],
    acceptance: decomposition ? decomposition.acceptance : '',
    auditId: input.auditId || '',
  });

  // 审计记录
  const auditEntry = {
    taskId: task.taskId,
    action: 'create',
    fromStatus: '',
    toStatus: 'queued',
    actor: 'system',
    summary: `Task created: "${userRequest}"`,
    assignee: task.assignee,
    rollbackHint: `Delete task ${task.taskId}`,
  };
  const auditId = recordAudit(auditEntry);

  // 更新任务关联审计 ID
  if (auditId) {
    updateTask(task.taskId, { auditId });
    task.auditId = auditId;
  }

  // 构建规划
  const plan = decomposition ? buildPlan(decomposition) : null;

  return { task, plan, auditId, version: VERSION };
}

/**
 * 规划任务: queued → planned
 */
function planTask(taskId) {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const result = validateTransition(task.status, 'planned');
  if (!result.valid) {
    throw new Error(`Cannot plan: ${result.reason}`);
  }

  updateStatus(taskId, 'planned');

  recordAudit({
    taskId,
    action: 'plan',
    fromStatus: 'queued',
    toStatus: 'planned',
    actor: 'system',
    summary: `Task planned: assignee=${task.assignee}, branch=${task.branch}`,
    rollbackHint: `Unplan task ${taskId}`,
  });

  return getTask(taskId);
}

/**
 * 派发任务: planned → dispatched
 */
function dispatchTask(taskId) {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const result = validateTransition(task.status, 'dispatched');
  if (!result.valid) {
    throw new Error(`Cannot dispatch: ${result.reason}`);
  }

  // 生成 dispatch payload
  const dispatch = generateDispatchPayload(task);
  if (dispatch.error) {
    throw new Error(`Dispatch error: ${dispatch.error}`);
  }

  updateStatus(taskId, 'dispatched');

  // 保存 dispatch prompt 作为产物
  saveArtifact(taskId, 'prompt', dispatch.payload.instruction);

  recordAudit({
    taskId,
    action: 'dispatch',
    fromStatus: 'planned',
    toStatus: 'dispatched',
    actor: 'system',
    summary: `Task dispatched to ${dispatch.assigneeName} (${dispatch.payload.provider})`,
    rollbackHint: `Recall dispatch for task ${taskId}`,
  });

  return {
    task: getTask(taskId),
    dispatch,
  };
}

/**
 * 接收产物: dispatched → artifact_received
 */
function receiveArtifact(taskId, artifacts = {}) {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const result = validateTransition(task.status, 'artifact_received');
  if (!result.valid) {
    throw new Error(`Cannot receive artifact: ${result.reason}`);
  }

  // 保存产物
  const saved = saveArtifacts(taskId, artifacts);

  updateStatus(taskId, 'artifact_received');

  recordAudit({
    taskId,
    action: 'receive_artifact',
    fromStatus: 'dispatched',
    toStatus: 'artifact_received',
    actor: 'system',
    summary: `Artifacts received: ${Object.keys(saved).join(', ')}`,
    rollbackHint: `Remove artifacts for task ${taskId}`,
  });

  return {
    task: getTask(taskId),
    savedArtifacts: saved,
  };
}

/**
 * 审查任务: artifact_received → review_pending
 * v0.6.1: 幂等审查 — 已在 review_pending 时跳过状态机，直接重跑审查
 */
function reviewTask(taskId) {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  // ─── v0.6.1 幂等审查 ──────────────────────────────────
  // 已处于 review_pending 状态时，跳过状态转换校验，
  // 直接重新运行审查流水线，重新生成 review.md。
  if (task.status === 'review_pending') {
    const reviewResult = reviewTaskPipeline(task);

    // 重新保存审查结果
    saveArtifact(taskId, 'review', formatReviewForWecom(reviewResult));

    recordAudit({
      taskId,
      action: 're-review',
      fromStatus: 'review_pending',
      toStatus: 'review_pending',
      actor: 'system',
      summary: `Re-review completed: risk=${reviewResult.overallRisk}, recommendation=${reviewResult.recommendation}`,
      rollbackHint: null,
    });

    return {
      task: getTask(taskId),
      review: reviewResult,
      _note: 'idempotent re-review (v0.6.1)',
    };
  }
  // ─── 原有逻辑: artifact_received → review_pending ──────

  const result = validateTransition(task.status, 'review_pending');
  if (!result.valid) {
    throw new Error(`Cannot review: ${result.reason}`);
  }

  // 执行审查流水线
  const reviewResult = reviewTaskPipeline(task);

  // 保存审查结果
  saveArtifact(taskId, 'review', formatReviewForWecom(reviewResult));

  updateStatus(taskId, 'review_pending');

  recordAudit({
    taskId,
    action: 'review',
    fromStatus: 'artifact_received',
    toStatus: 'review_pending',
    actor: 'system',
    summary: `Review completed: risk=${reviewResult.overallRisk}, recommendation=${reviewResult.recommendation}`,
    rollbackHint: `Re-review task ${taskId}`,
  });

  return {
    task: getTask(taskId),
    review: reviewResult,
  };
}

/**
 * 批准任务: review_pending → approved
 */
function approveTask(taskId) {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const result = validateTransition(task.status, 'approved');
  if (!result.valid) {
    throw new Error(`Cannot approve: ${result.reason}`);
  }

  updateStatus(taskId, 'approved');

  recordAudit({
    taskId,
    action: 'approve',
    fromStatus: 'review_pending',
    toStatus: 'approved',
    actor: 'system',
    summary: `Task approved`,
    rollbackHint: `Reopen task ${taskId}`,
  });

  return getTask(taskId);
}

/**
 * 拒绝任务: review_pending → rejected
 */
function rejectTask(taskId) {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const result = validateTransition(task.status, 'rejected');
  if (!result.valid) {
    throw new Error(`Cannot reject: ${result.reason}`);
  }

  updateStatus(taskId, 'rejected');

  recordAudit({
    taskId,
    action: 'reject',
    fromStatus: 'review_pending',
    toStatus: 'rejected',
    actor: 'system',
    summary: `Task rejected`,
    rollbackHint: `Re-review task ${taskId}`,
  });

  return getTask(taskId);
}

/**
 * 回滚规划: rejected → rollback_required
 */
function planRollback(taskId) {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const result = validateTransition(task.status, 'rollback_required');
  if (!result.valid) {
    throw new Error(`Cannot plan rollback: ${result.reason}`);
  }

  // 生成回滚计划
  const rollbackPlan = generateRollbackPlan({
    auditId: task.auditId,
    branch: task.branch,
  });

  // 保存回滚计划
  if (rollbackPlan) {
    const planText = typeof rollbackPlan === 'string'
      ? rollbackPlan
      : JSON.stringify(rollbackPlan, null, 2);
    saveArtifact(taskId, 'rollbackPlan', planText);
  }

  updateStatus(taskId, 'rollback_required');

  recordAudit({
    taskId,
    action: 'plan_rollback',
    fromStatus: 'rejected',
    toStatus: 'rollback_required',
    actor: 'system',
    summary: `Rollback planned for task ${taskId}`,
    rollbackHint: null,
  });

  return {
    task: getTask(taskId),
    rollbackPlan,
  };
}

/**
 * 取消任务: queued/planned/dispatched/artifact_received/review_pending → cancelled
 * v0.6.2 — 不删除 artifact，不留 rollback
 */
function cancelTask(taskId) {
  const task = getTask(taskId);
  if (!task) throw new Error('Task not found: ' + taskId);

  const result = validateTransition(task.status, 'cancelled');
  if (!result.valid) {
    throw new Error('Cannot cancel: ' + result.reason);
  }

  updateStatus(taskId, 'cancelled');

  recordAudit({
    taskId: taskId,
    action: 'cancel',
    fromStatus: task.status,
    toStatus: 'cancelled',
    actor: 'system',
    summary: 'Task cancelled — artifacts preserved',
    rollbackHint: null,
  });

  return getTask(taskId);
}

/**
 * 关闭任务: approved/rollback_required → closed
 */
function closeTask(taskId) {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const result = validateTransition(task.status, 'closed');
  if (!result.valid) {
    throw new Error(`Cannot close: ${result.reason}`);
  }

  updateStatus(taskId, 'closed');

  recordAudit({
    taskId,
    action: 'close',
    fromStatus: task.events[task.events.length - 1]?.to || task.status,
    toStatus: 'closed',
    actor: 'system',
    summary: `Task closed`,
    rollbackHint: `Reopen task ${taskId}`,
  });

  return getTask(taskId);
}

/**
 * 获取任务状态（含下一步建议）
 */
function getTaskStatus(taskId) {
  const task = getTask(taskId);
  if (!task) return { error: `Task not found: ${taskId}` };

  const nextAction = getNextAction(task.status);
  const nextStates = getNextAction(task.status) !== 'none'
    ? require('./runtime-state-machine').getNextStates(task.status)
    : [];

  return {
    taskId: task.taskId,
    status: task.status,
    assignee: task.assignee,
    userRequest: task.userRequest,
    branch: task.branch,
    patchFile: task.patchFile,
    auditId: task.auditId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    events: task.events || [],
    nextAction,
    nextStates,
    version: VERSION,
  };
}

/**
 * 格式化状态为 WeCom 可读文本
 */
function formatStatusForWecom(status) {
  if (status.error) return `❌ ${status.error}`;

  const statusLabel = {
    queued: '📥 排队中',
    planned: '📋 已规划',
    dispatched: '🚀 已派发',
    artifact_received: '📦 产物已接收',
    review_pending: '🔍 待审查',
    approved: '✅ 已批准',
    rejected: '❌ 已拒绝',
    rollback_required: '🔄 需回滚',
    closed: '🏁 已关闭',
  };

  const nextActionLabel = {
    plan: '规划任务 → /ai任务 派发 {taskId}',
    dispatch: '派发任务 → /ai任务 派发 {taskId}',
    receive_artifact: '上传产物 → /ai任务 产物 {taskId}',
    review: '审查任务 → /ai任务 审查 {taskId}',
    approve_or_reject: '批准或拒绝 → /ai任务 审查 {taskId}',
    close: '关闭任务 → 自动关单',
    plan_rollback: '规划回滚 → /ai任务 回滚 {taskId}',
    none: '已完成',
  };

  const lines = [
    `${statusLabel[status.status] || status.status}`,
    ``,
    `Task ID: ${status.taskId}`,
    `状态: ${status.status}`,
    `Assignee: ${status.assignee}`,
    `请求: ${status.userRequest || '(未指定)'}`,
    ``,
  ];

  if (status.branch) lines.push(`Branch: ${status.branch}`);
  if (status.patchFile) lines.push(`Patch: ${status.patchFile}`);
  if (status.auditId) lines.push(`Audit ID: ${status.auditId}`);

  lines.push(``);
  lines.push(`📌 下一步: ${nextActionLabel[status.nextAction] || status.nextAction}`);

  return lines.join('\n');
}

module.exports = {
  createRuntimeTask,
  planTask,
  dispatchTask,
  receiveArtifact,
  reviewTask,
  approveTask,
  rejectTask,
  cancelTask,
  planRollback,
  closeTask,
  getTaskStatus,
  formatStatusForWecom,
  VERSION,
};
