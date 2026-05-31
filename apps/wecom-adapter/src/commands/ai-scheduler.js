/**
 * ai-scheduler.js
 * /ai调度 企微命令
 * 触发 AI 任务自动规划，输出日报（不自动执行）
 */

const { scheduleAI } = require("../orchestrator/orchestrator")
const { getStatus } = require("../orchestrator/orchestrator")

const COMMAND_NAME = "/ai调度"

/**
 * 命令入口（由 command-center 调用）
 * @param {object} ctx - 企微消息上下文
 * @param {string} arg - 用户附加参数（如 "状态", "help"）
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

  // 默认：执行 AI 调度规划
  const { report, plan, version } = await scheduleAI({ userRequest: sub })

  if (!plan) {
    return report // 包含错误信息
  }

  return report
}

/**
 * 格式化状态输出
 */
function formatStatus() {
  const status = getStatus()
  const lines = [
    "🤖 AI Orchestrator 状态",
    "=".repeat(30),
    `版本: v${status.version}`,
    `模式: ${status.mode}`,
    "",
    "支持 AI 角色:",
    ...status.supportedRoles.map(r => `  - ${r}`),
    "",
    "禁止操作:",
    ...status.forbiddenActions.map(a => `  - ${a}`),
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
    "【功能】",
    "  触发 AI 多角色任务自动规划",
    "  输出：分工方案 + 分支规划 + patch 列表",
    "",
    "【用法】",
    "  /ai调度        → 执行自动规划",
    "  /ai调度 状态   → 查看 orchestrator 状态",
    "  /ai调度 帮助   → 显示本帮助",
    "",
    "【AI 角色分工】",
    "  WorkBuddy  → 核心框架 + 命令接入",
    "  Codex       → AI 推理 + 任务拆解",
    "  DeepSeek    → 风险评估 + diff 检测",
    "  豆包        → 文案优化 + 企微回复模板",
    "",
    "⚠️ 当前仅规划，不自动执行合并/deploy",
  ].join("\n")
}

module.exports = { execute, COMMAND_NAME }
