/**
 * branch-planner.js
 * 根据 AI 分工自动规划 feature 分支
 * 输入：AI 角色分工方案
 * 输出：分支名列表 + 依赖顺序
 */

const ROLE_BRANCH_PREFIX = {
  workbuddy: "feature/workbuddy",
  codex: "feature/codex",
  deepseek: "feature/deepseek",
  doubao: "feature/doubao",
}

/**
 * 根据任务描述生成标准化分支名
 * @param {string} role - AI 角色
 * @param {string} taskName - 任务名称（英文，kebab-case）
 * @param {string} version - 版本号，默认 v1
 * @returns {string} 分支名
 */
function generateBranchName(role, taskName, version = "v1") {
  const prefix = ROLE_BRANCH_PREFIX[role] || "feature"
  return `${prefix}-${taskName}-${version}`
}

/**
 * 规划分支创建顺序（依赖排序）
 * @param {{ role: string, task: string, dependsOn?: string[] }[]} tasks
 * @returns {string[]} 按依赖顺序排列的分支名列表
 */
function planBranchOrder(tasks) {
  const result = []
  const visited = new Set()
  const taskMap = new Map(tasks.map(t => [t.role + ":" + t.task, t]))

  function visit(task) {
    const key = task.role + ":" + task.task
    if (visited.has(key)) return
    visited.add(key)
    if (task.dependsOn) {
      for (const dep of task.dependsOn) {
        const depTask = tasks.find(t => t.task === dep || t.role + ":" + t.task === dep)
        if (depTask) visit(depTask)
      }
    }
    result.push(generateBranchName(task.role, task.task, "v1"))
  }

  for (const task of tasks) {
    visit(task)
  }

  return result
}

/**
 * 生成分支规划报告（供 /ai 调度 输出）
 * @param {{ role: string, task: string, taskNameZH: string, scopes: string[], forbidden: string[], patchFile: string }[]} plan
 * @returns {string} 格式化报告
 */
function formatBranchReport(plan) {
  const lines = ["🗂️ AI 分支规划", "=".repeat(30), ""]

  for (const item of plan) {
    const branch = generateBranchName(item.role, item.task, "v1")
    lines.push(`【${item.role}】${item.taskNameZH}`)
    lines.push(`  分支: ${branch}`)
    lines.push(`  patch: ${item.patchFile}`)
    lines.push(`  职责范围: ${item.scopes.join(", ")}`)
    lines.push(`  禁止范围: ${item.forbidden.join(", ")}`)
    lines.push("")
  }

  const mergeOrder = planBranchOrder(plan.map(p => ({ role: p.role, task: p.task })))
  lines.push("合并顺序:")
  mergeOrder.forEach((b, i) => lines.push(`  ${i + 1}. ${b}`))

  return lines.join("\n")
}

module.exports = {
  generateBranchName,
  planBranchOrder,
  formatBranchReport,
  ROLE_BRANCH_PREFIX,
}
