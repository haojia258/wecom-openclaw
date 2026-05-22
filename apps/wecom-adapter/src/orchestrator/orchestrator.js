/**
 * orchestrator.js
 * AI 调度核心入口 v0.2
 *
 * 职责：接收企微 /ai调度 指令 → 动态意图解析 → 推荐 AI 角色 → 输出任务计划
 *
 * v0.2 变更：
 * - 集成 orchestrator-core.js 动态意图解析（替代 v0.1 固定 4 角色模板）
 * - 新增 audit-recorder.js 审计记录
 * - 新增 rollback-planner.js 回滚规划
 * - 保留 v0.1 的 reviewPatch/getStatus 接口（向后兼容）
 */

const { decompose, formatPlanForWecom, getStatus: getCoreStatus, VERSION: CORE_VERSION } = require('./orchestrator-core');
const { recordAudit, formatAuditHistory } = require('./audit-recorder');
const { generateRollbackPlan, formatRollbackForWecom, validateRollbackPlan } = require('./rollback-planner');
const { planTasks, formatDailyReport, validatePlan } = require('./task-planner');
const { validatePatch, checkScope } = require('./patch-policy');

const VERSION = CORE_VERSION; // 0.2

/**
 * 处理 /ai调度 指令（v0.2 动态意图模式）
 *
 * @param {object} options
 * @param {string} options.userRequest - 用户原始指令
 * @param {boolean} [options.legacyMode=false] - 是否使用 v0.1 固定模板模式
 * @returns {Promise<{ report: string, plan: object|null, auditId: string|null, version: string }>}
 */
async function scheduleAI({ userRequest = '', legacyMode = false } = {}) {
  // v0.1 兼容模式（保留旧行为）
  if (legacyMode) {
    const plan = planTasks(userRequest);
    const validation = validatePlan(plan);
    if (!validation.valid) {
      return {
        report: `❌ 任务规划越权:\n${validation.violations.join('\n')}`,
        plan: null,
        auditId: null,
        version: VERSION,
      };
    }
    const report = formatDailyReport(plan);
    return { report, plan, auditId: null, version: VERSION };
  }

  // === v0.2 动态意图模式 ===
  // 1. 意图解析
  const plan = decompose(userRequest);

  // 2. 审计记录
  let auditResult;
  try {
    auditResult = recordAudit(plan);
  } catch (_) {
    // 审计写入失败不中断主流程
    auditResult = { auditId: null, saved: false };
  }

  // 3. 回滚方案（可选）
  let rollbackText = '';
  try {
    const rollback = generateRollbackPlan({
      auditId: auditResult.auditId,
      branch: plan.branch,
      patchFile: plan.patchFile,
      hasRemote: false,
    });
    const validation = validateRollbackPlan(rollback);
    if (validation.safe) {
      rollbackText = '\n\n' + formatRollbackForWecom(rollback);
    }
  } catch (_) {
    // 回滚方案生成失败不中断主流程
  }

  // 4. 格式化输出
  const report = formatPlanForWecom(plan, auditResult.auditId) + rollbackText;

  return {
    report,
    plan,
    auditId: auditResult.auditId,
    version: VERSION,
  };
}

/**
 * 验证 AI 提交的 patch 是否合规（v0.1 兼容接口）
 * @param {{ role: string, patchContent: string, targetBranch: string }} params
 * @returns {{ approved: boolean, reason: string }}
 */
function reviewPatch({ role, patchContent, targetBranch }) {
  const scopeCheck = checkScope(role, [targetBranch]);
  if (!scopeCheck.inScope) {
    return { approved: false, reason: `角色越权: ${scopeCheck.outOfScope.join(', ')}` };
  }

  const patchCheck = validatePatch(patchContent, targetBranch);
  if (!patchCheck.allowed) {
    return { approved: false, reason: `patch 越权: ${patchCheck.violations.join(', ')}` };
  }

  return { approved: true, reason: '合规' };
}

/**
 * 获取 orchestrator 状态
 * @returns {object}
 */
function getStatus() {
  const coreStatus = getCoreStatus();
  return {
    version: VERSION,
    mode: 'plan-only', // 当前仅规划，不自动执行
    supportedAssignees: coreStatus.supportedAssignees,
    supportedIntents: coreStatus.supportedIntents,
    defaultAssignee: coreStatus.defaultAssignee,
    forbiddenActions: [
      'push-main', 'merge-develop', 'modify-nginx', 'modify-env',
      'auto-deploy', 'auto-apply-patch',
    ],
  };
}

/**
 * 获取审计历史（供 /ai调度 历史 使用）
 * @param {number} [limit=10]
 * @returns {string}
 */
function getHistory(limit = 10) {
  return formatAuditHistory(limit);
}

module.exports = {
  scheduleAI,
  reviewPatch,
  getStatus,
  getHistory,
  VERSION,
};
