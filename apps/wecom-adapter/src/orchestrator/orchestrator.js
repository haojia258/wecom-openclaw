/**
 * orchestrator.js
 * AI 调度核心入口 v1.1
 * 职责：接收企微 /ai调度 指令 → 动态规划任务 → 输出日报（不自动执行）
 */

const { planTasks, planByDemand, formatDailyReport, formatDynamicReport, validatePlan } = require('./task-planner')
const { formatBranchReport, generateBranchName } = require('./branch-planner')
const { validatePatch } = require('./patch-policy')

const VERSION = '0.1'

/**
 * 处理 /ai调度 指令（v1.1：有需求时动态分工，无需求时固定模板）
 */
async function scheduleAI({ userRequest = '', dryRun = false } = {}) {
  const demand = String(userRequest || '').trim()

  if (demand) {
    // 动态分工模式
    const tasks = planByDemand(demand)
    const report = formatDynamicReport(demand, tasks)
    return { report, plan: tasks, version: VERSION }
  }

  // 固定模板模式（无需求时兜底）
  const plan = planTasks('')
  const validation = validatePlan(plan)
  if (!validation.valid) {
    return {
      report: `❌ 任务规划越权:\n${validation.violations.join('\n')}`,
      plan: null,
      version: VERSION,
    }
  }
  const report = formatDailyReport(plan)
  return { report, plan, version: VERSION }
}

/**
 * 验证 AI 提交的 patch 是否合规
 */
function reviewPatch({ role, patchContent, targetBranch }) {
  const { checkScope } = require('./patch-policy')
  const scopeCheck = checkScope(role, [targetBranch])
  if (!scopeCheck.inScope) {
    return { approved: false, reason: `角色越权: ${scopeCheck.outOfScope.join(', ')}` }
  }
  const patchCheck = validatePatch(patchContent, targetBranch)
  if (!patchCheck.allowed) {
    return { approved: false, reason: `patch 越权: ${patchCheck.violations.join(', ')}` }
  }
  return { approved: true, reason: '合规' }
}

/**
 * 获取当前 orchestrator 状态
 */
function getStatus() {
  return {
    version: VERSION,
    mode: 'plan-only',
    supportedRoles: ['workbuddy', 'codex', 'deepseek', 'doubao'],
    forbiddenActions: ['push-main', 'merge-develop', 'modify-nginx', 'modify-env', 'auto-deploy'],
  }
}

module.exports = { scheduleAI, reviewPatch, getStatus, VERSION }
