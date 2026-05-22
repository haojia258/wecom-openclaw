/**
 * rollback-planner.js
 * AI Orchestrator 回滚规划器 v1.0
 *
 * 为每个 AI 调度任务生成回滚方案
 * 安全约束：
 * - 禁止生成 reset main/develop 命令
 * - 禁止生成 force push 命令
 * - 仅生成 feature 分支相关操作
 * - 所有回滚操作需人工确认
 */

// ========== 核心函数 ==========

/**
 * 为审计记录生成回滚方案
 *
 * @param {object} params
 * @param {string} params.auditId - 审计 ID
 * @param {string} params.branch - 当前 feature 分支名
 * @param {string} [params.patchFile] - patch 文件名（可选）
 * @param {boolean} [params.hasRemote=false] - 是否已推送到远程
 * @returns {{
 *   auditId: string,
 *   rollbackBranch: string,
 *   revertCommandTemplate: string,
 *   deleteFeatureBranchCommand: string,
 *   warning: string,
 *   steps: string[]
 * }}
 */
function generateRollbackPlan({ auditId, branch, patchFile, hasRemote = false }) {
  const rollbackBranch = `rollback/${branch.replace('feature/', '')}`;

  const steps = [];
  const warnings = [];

  // 步骤 1：创建回滚记录分支
  steps.push(`git checkout -b ${rollbackBranch}`);

  // 步骤 2：根据是否有远程推送决定操作
  if (hasRemote) {
    steps.push(`# 已将 feature 分支推送到远程，需从远程删除`);
    steps.push(`git push origin --delete ${branch}`);
    steps.push(`# ⚠️ 以上命令需在确认 PR 未合并后执行`);
    warnings.push('警告：feature 分支已推送到远程，回滚前请确认 PR 未合并到 develop');
  }

  // 步骤 3：删除本地 feature 分支
  steps.push(`# 切回 develop 后删除 feature 分支`);
  steps.push(`git checkout develop`);
  steps.push(`git branch -D ${branch}`);

  // 步骤 4：清理
  if (patchFile) {
    steps.push(`# 删除 patch 文件（如果存在）`);
    steps.push(`rm -f ${patchFile}`);
  }

  // 构建标准警告
  const standardWarning = [
    '⚠️ 回滚操作不可逆，请确认以下条件后再执行：',
    '1. PR 未被合并到 develop',
    '2. 该 feature 分支的变更不再需要',
    '3. 已备份重要变更',
    '',
    '🚫 绝对禁止操作（本工具不会生成这些命令）：',
    '- git reset --hard main',
    '- git reset --hard develop',
    '- git push --force main',
    '- git push --force develop',
  ].join('\n');

  return {
    auditId,
    rollbackBranch,
    revertCommandTemplate: steps.join('\n'),
    deleteFeatureBranchCommand: `git branch -D ${branch}`,
    warning: standardWarning,
    steps,
  };
}

/**
 * 格式化回滚方案为企微可读文本
 *
 * @param {object} rollbackPlan - generateRollbackPlan() 的输出
 * @returns {string}
 */
function formatRollbackForWecom(rollbackPlan) {
  const lines = [];

  lines.push('🔄 回滚方案');
  lines.push('═'.repeat(30));
  lines.push('');
  lines.push(`📋 Audit ID：${rollbackPlan.auditId}`);
  lines.push(`🌿 回滚记录分支：${rollbackPlan.rollbackBranch}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('📝 回滚步骤：');
  lines.push('');
  lines.push('```bash');
  lines.push(rollbackPlan.revertCommandTemplate);
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('⚠️ 警告：');
  lines.push(rollbackPlan.warning);
  lines.push('');
  lines.push('═'.repeat(30));
  lines.push('🔒 所有回滚操作需人工确认后再执行');

  return lines.join('\n');
}

/**
 * 验证回滚方案不包含禁止操作
 *
 * @param {object} rollbackPlan - generateRollbackPlan() 的输出
 * @returns {{ safe: boolean, violations: string[] }}
 */
function validateRollbackPlan(rollbackPlan) {
  const violations = [];

  const forbiddenPatterns = [
    { pattern: /reset.*main/i, desc: 'reset main' },
    { pattern: /reset.*develop/i, desc: 'reset develop' },
    { pattern: /push.*--force.*main/i, desc: 'force push main' },
    { pattern: /push.*--force.*develop/i, desc: 'force push develop' },
    { pattern: /push.*-f.*main/i, desc: 'force push main (-f)' },
    { pattern: /push.*-f.*develop/i, desc: 'force push develop (-f)' },
    { pattern: /rm\s+-rf\s+\//, desc: 'rm -rf /' },
    { pattern: /DROP\s+TABLE/i, desc: 'DROP TABLE' },
  ];

  const allText = [
    rollbackPlan.revertCommandTemplate,
    rollbackPlan.deleteFeatureBranchCommand,
    ...(rollbackPlan.steps || []),
  ].join('\n');

  for (const { pattern, desc } of forbiddenPatterns) {
    if (pattern.test(allText)) {
      violations.push(`禁止操作: ${desc}`);
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}

// ========== 导出 ==========

module.exports = {
  generateRollbackPlan,
  formatRollbackForWecom,
  validateRollbackPlan,
};
