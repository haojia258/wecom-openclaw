/**
 * rollback-planner.js
 * AI Orchestrator Runtime 回滚规划器 v0.4
 *
 * 根据审计记录生成回滚计划。
 * v0.4 只输出计划，不执行回滚。
 */

const { findAuditByTask } = require('./audit-recorder');
const { listTasks } = require('./task-queue');

/**
 * 根据任务审计记录生成回滚计划
 *
 * @param {object} input
 * @param {string} input.auditId - 审计 ID（可选）
 * @param {string} input.taskId - 任务 ID（可选）
 * @param {string} input.branch - 分支名（可选）
 * @returns {object} rollbackPlan
 */
function generateRollbackPlan(input = {}) {
  const { auditId, taskId, branch } = input;

  const steps = [];
  const rollbackHint = `将关联分支 ${branch || 'unknown'} 回滚到变更前状态`;

  // 1. 如果提供了 taskId，分析审计记录
  if (taskId) {
    const records = findAuditByTask(taskId);
    if (records.length === 0) {
      steps.push({
        step: 1,
        action: 'no_audit_found',
        description: `未找到 taskId=${taskId} 的审计记录，请手动检查。`,
      });
    } else {
      // 从后往前生成回滚步骤
      const reversed = [...records].reverse();
      reversed.forEach(function(record, i) {
        steps.push({
          step: i + 1,
          action: `rollback_${record.action}`,
          description: record.rollbackHint || `撤销操作: ${record.action}`,
          auditId: record.auditId,
          fromStatus: record.toStatus,
          toStatus: record.fromStatus,
        });
      });
    }
  }

  // 2. 分支回滚（如果有分支信息）
  if (branch) {
    steps.push({
      step: steps.length + 1,
      action: 'git_checkout_base',
      description: `git checkout develop && git branch -D ${branch}`,
      warning: '请确认分支没有未合并的重要代码',
    });
  }

  // 3. 默认回滚步骤
  if (steps.length === 0) {
    steps.push({
      step: 1,
      action: 'manual_check',
      description: '无审计记录，请人工检查并确定回滚方案',
    });
  }

  const plan = {
    generatedAt: new Date().toISOString(),
    auditId: auditId || '',
    taskId: taskId || '',
    branch: branch || '',
    steps,
    summary: rollbackHint,
    note: 'v0.4 — 仅输出回滚计划，不执行实际回滚操作。',
  };

  return plan;
}

/**
 * 格式化回滚计划为可读文本
 */
function formatRollbackPlanForWecom(plan) {
  const lines = [
    '🔄 回滚计划',
    '',
    '生成时间: ' + plan.generatedAt,
    'Task ID:   ' + (plan.taskId || 'N/A'),
    'Branch:    ' + (plan.branch || 'N/A'),
    '',
    '── 回滚步骤 ──',
  ];

  plan.steps.forEach(function(s) {
    const warn = s.warning ? ' ⚠️ ' + s.warning : '';
    lines.push('');
    lines.push('Step ' + s.step + ': ' + s.action);
    lines.push('  ' + s.description + warn);
  });

  lines.push('');
  lines.push('📝 ' + plan.note);

  return lines.join('\n');
}

module.exports = {
  generateRollbackPlan,
  formatRollbackPlanForWecom,
};
