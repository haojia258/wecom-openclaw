/**
 * orchestrator.js
 * AI 调度核心入口
 * 职责：接收企微 /ai调度 指令 → 规划任务 → 输出日报（不自动执行）
 */

const { planTasks, formatDailyReport, validatePlan } = require("./task-planner")
const { formatBranchReport, generateBranchName } = require("./branch-planner")
const { validatePatch } = require("./patch-policy")

const VERSION = "0.1"

/**
 * 处理 /ai调度 指令
 * @param {object} options
 * @param {string} options.userRequest - 用户原始指令（可选，默认触发自动规划）
 * @param {boolean} options.dryRun - 仅规划不输出 patch（默认 false）
 * @returns {{ report: string, plan: object[], version: string }}
 */
async function scheduleAI({ userRequest = "", dryRun = false } = {}) {
  // 1. 规划任务分工
  const plan = planTasks(userRequest)

  // 2. 验证分工是否越权
  const validation = validatePlan(plan)
  if (!validation.valid) {
    return {
      report: `❌ 任务规划越权:\n${validation.violations.join("\n")}`,
      plan: null,
      version: VERSION,
    }
  }

  // 3. 生成日报
  const report = formatDailyReport(plan)

  return {
    report,
    plan,
    version: VERSION,
  }
}

/**
 * 验证 AI 提交的 patch 是否合规
 * @param {{ role: string, patchContent: string, targetBranch: string }} params
 * @returns {{ approved: boolean, reason: string }}
 */
function reviewPatch({ role, patchContent, targetBranch }) {
  const { checkScope } = require("./patch-policy")
  const scopeCheck = checkScope(role, [targetBranch])
  if (!scopeCheck.inScope) {
    return { approved: false, reason: `角色越权: ${scopeCheck.outOfScope.join(", ")}` }
  }

  const patchCheck = validatePatch(patchContent, targetBranch)
  if (!patchCheck.allowed) {
    return { approved: false, reason: `patch 越权: ${patchCheck.violations.join(", ")}` }
  }

  return { approved: true, reason: "合规" }
}

/**
 * 获取当前 orchestrator 状态（供 /ai调度 状态子命令使用）
 * @returns {object}
 */
function getStatus() {
  return {
    version: VERSION,
    mode: "plan-only", // 当前仅规划，不自动执行
    supportedRoles: ["workbuddy", "codex", "deepseek", "doubao"],
    forbiddenActions: ["push-main", "merge-develop", "modify-nginx", "modify-env", "auto-deploy"],
  }
}

module.exports = {
  scheduleAI,
  reviewPatch,
  getStatus,
  VERSION,
}
