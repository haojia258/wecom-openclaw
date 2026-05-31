/**
 * task-planner.js
 * 将用户需求拆解为 AI 可执行的任务分工方案
 * 只做规划，不做推理（推理由 Codex/DeepSeek 负责）
 */

const { checkScope } = require("./patch-policy")

/**
 * AI 角色定义（只读，不被修改）
 */
const AI_ROLES = {
  workbuddy: {
    name: "WorkBuddy",
    duty: "核心框架 + 命令接入 + patch 执行",
    outputs: ["orchestrator", "task-planner", "branch-planner", "patch-policy", "commands"],
  },
  codex: {
    name: "Codex",
    duty: "AI 推理 + 任务拆解 + review checklist",
    outputs: ["role-registry", "review-checklist", "prompt-templates", "ai-planner"],
  },
  deepseek: {
    name: "DeepSeek",
    duty: "风险评估 + diff 检测 + 合并风险评分",
    outputs: ["merge-risk-policy", "risk-score", "diff-detection"],
  },
  doubao: {
    name: "豆包",
    duty: "中文文案 + 任务描述优化 + 企微回复模板",
    outputs: ["task-description", "copywriting", "reply-template"],
  },
}

/**
 * 将用户需求拆解为 AI 任务分工
 * @param {string} userRequest - 用户原始需求描述
 * @returns {{ role: string, task: string, taskNameZH: string, scopes: string[], forbidden: string[], patchFile: string }[]}
 */
function planTasks(userRequest) {
  // 基础模板：每次调度都输出这 4 个角色的任务
  const plan = [
    {
      role: "workbuddy",
      task: "orchestrator-core",
      taskNameZH: "调度核心框架",
      scopes: ["orchestrator", "task-planner", "branch-planner", "patch-policy"],
      forbidden: ["ai-reasoning", "score-model", "prompt-builder", "memory-rules"],
      patchFile: "workbuddy-orchestrator-core-v1.patch",
    },
    {
      role: "codex",
      task: "ai-planner",
      taskNameZH: "AI 任务拆解 + review checklist",
      scopes: ["role-registry", "review-checklist", "prompt-templates", "ai-planner"],
      forbidden: ["nginx", "pm2", "deploy", "wecom-main-chain"],
      patchFile: "codex-ai-planner-v1.patch",
    },
    {
      role: "deepseek",
      task: "risk-policy",
      taskNameZH: "合并风险评估策略",
      scopes: ["merge-risk-policy", "risk-score", "diff-detection", "forbidden-file-scoring"],
      forbidden: ["push-main", "merge-develop", "modify-nginx", "modify-env"],
      patchFile: "deepseek-risk-policy-v1.patch",
    },
    {
      role: "doubao",
      task: "ai-copywriter",
      taskNameZH: "AI 文案优化 + 企微回复模板",
      scopes: ["task-description", "copywriting", "reply-template", "prompt-polish"],
      forbidden: ["push-main", "merge-develop", "nginx", "pm2"],
      patchFile: "doubao-ai-copywriter-v1.patch",
    },
  ]

  return plan
}

/**
 * 生成 AI 调度日报文案（供 /ai调度 命令输出）
 * @param {{ role: string, task: string, taskNameZH: string, scopes: string[], forbidden: string[], patchFile: string }[]} plan
 * @returns {string} 日报文案
 */
function formatDailyReport(plan) {
  const { formatBranchReport } = require("./branch-planner")
  const lines = ["🤖 AI 调度日报", "=".repeat(30), ""]

  lines.push(`📅 ${new Date().toISOString().split("T")[0]}`)
  lines.push("")

  for (const item of plan) {
    const roleInfo = AI_ROLES[item.role]
    lines.push(`【${roleInfo.name}】${item.taskNameZH}`)
    lines.push(`  patch: ${item.patchFile}`)
    lines.push(`  输出: ${roleInfo.outputs.join(", ")}`)
    lines.push("")
  }

  lines.push(formatBranchReport(plan))
  lines.push("")
  lines.push("⚠️ 当前仅自动规划，不自动执行合并/deploy")

  return lines.join("\n")
}

/**
 * 验证任务分工是否越权
 * @param {{ role: string, scopes: string[] }[]} plan
 * @returns {{ valid: boolean, violations: string[] }}
 */
function validatePlan(plan) {
  const violations = []
  for (const item of plan) {
    const result = checkScope(item.role, item.scopes)
    if (!result.inScope) {
      violations.push(`${item.role} 越权: ${result.outOfScope.join(", ")}`)
    }
  }
  return {
    valid: violations.length === 0,
    violations,
  }
}

module.exports = {
  planTasks,
  formatDailyReport,
  validatePlan,
  AI_ROLES,
}
