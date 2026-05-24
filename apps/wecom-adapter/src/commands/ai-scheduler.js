/**
 * ai-scheduler.js
 * /ai调度 企微命令
 *
 * v2.0 — WorkerSpec Runtime Mode
 *   新增：/ai调度 创建 Worker → WorkerSpec Runtime Layer
 *   保留：/ai调度 → 传统 Goal → Branch → Patch 规划
 */

const { scheduleAI } = require("../orchestrator/orchestrator")
const { getStatus } = require("../orchestrator/orchestrator")
const { planWorkerCreation } = require("../orchestrator/worker-runtime-planner")

const COMMAND_NAME = "/ai调度"

/**
 * 命令入口（由 command-center 调用）
 * @param {object} ctx - 企微消息上下文
 * @param {string} arg - 用户附加参数
 * @returns {Promise<string>} 回复文案
 */
async function execute(ctx, arg = "") {
  const sub = (arg || "").trim()

  // 子命令：状态
  if (sub === "状态" || sub === "status") {
    return formatStatus()
  }

  // 子命令：帮助
  if (sub === "帮助" || sub === "help") {
    return formatHelp()
  }

  // ======== WorkerSpec Runtime Mode ========
  // 子命令：创建 Worker（v2.0 新增）
  if (sub.startsWith("创建") || sub.startsWith("create")) {
    const workerInput = sub.replace(/^(创建|create)\s*(Worker|worker)?\s*/i, "").trim()
    const result = planWorkerCreation(workerInput)
    return result.report
  }

  // ======== 传统模式：Goal → Branch → Patch ========
  const { report, plan, version } = await scheduleAI({ userRequest: sub })

  if (!plan) {
    return report
  }

  return report
}

/**
 * 格式化状态输出
 */
function formatStatus() {
  const status = getStatus()
  const { VERSION: workerRuntimeVersion } = require("../orchestrator/worker-runtime-planner")
  const lines = [
    "🤖 AI Orchestrator 状态",
    "=".repeat(30),
    `版本: v${status.version}`,
    `WorkerSpec Runtime: ${workerRuntimeVersion}`,
    `模式: ${status.mode}`,
    "",
    "支持 AI 角色:",
    ...status.supportedRoles.map(r => `  - ${r}`),
    "",
    "禁止操作:",
    ...status.forbiddenActions.map(a => `  - ${a}`),
    "",
    "WorkerSpec Runtime:",
    "  /ai调度 创建 Worker → 解析 WorkerSpec → 三方协作计划",
    "",
    "⚠️ 当前仅自动规划，不自动执行",
  ]
  return lines.join("\n")
}

/**
 * 格式化帮助输出
 */
function formatHelp() {
  return [
    "🤖 /ai调度 使用帮助",
    "=".repeat(30),
    "",
    "【传统模式】Goal → Branch → Patch",
    "  /ai调度        → 执行自动规划",
    "  /ai调度 状态   → 查看 orchestrator 状态",
    "  /ai调度 帮助   → 显示本帮助",
    "",
    "【WorkerSpec Runtime v1.0】（新）",
    "  /ai调度 创建 Worker 名称:ops-monitor 类型:executor 提供商:openai 模型:gpt-4o",
    "",
    "  支持字段：",
    "    名称 (workerId)        — Worker 标识",
    "    类型 (role)            — executor/planner/reviewer/risk_analyzer/reporter",
    "    提供商 (provider)      — openai/deepseek/doubao/claude/workbuddy",
    "    模型 (model)           — gpt-4o/deepseek-chat/doubao-pro 等",
    "    blockedActions         — 禁止操作（逗号分隔）",
    "    allowedIntents         — 允许操作",
    "    reviewOnly             — 审查模式（必须 true）",
    "    requiresHumanApproval  — 人工审批（必须 true）",
    "",
    "  输出：",
    "    - WorkerSpec JSON",
    "    - 三方协作计划（WorkBuddy/Codex/Risk Worker）",
    "    - 安全约束检查",
    "",
    "【AI 角色分工】",
    "  WorkBuddy  → 核心框架 + worker-registry patch",
    "  Codex       → prompt patch",
    "  DeepSeek    → 风险评估 + diff 检测",
    "  豆包        → 文案优化 + 企微回复模板",
    "",
    "⚠️ 禁止：动态 Worker / 自动 merge / 自动 deploy / 自动 apply",
  ].join("\n")
}

module.exports = { execute, COMMAND_NAME }
