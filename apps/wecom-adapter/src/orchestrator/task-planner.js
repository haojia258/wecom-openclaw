/**
 * task-planner.js
 * 将用户需求拆解为 AI 可执行的任务分工方案
 * v1.1 - 支持动态分工（按需求关键词路由）
 */

const { checkScope } = require('./patch-policy')

const AI_ROLES = {
  workbuddy: {
    name: 'WorkBuddy',
    duty: '核心框架 + 命令接入 + patch 执行',
    outputs: ['orchestrator', 'task-planner', 'branch-planner', 'patch-policy', 'commands'],
  },
  codex: {
    name: 'Codex',
    duty: 'AI 推理 + 任务拆解 + review checklist',
    outputs: ['role-registry', 'review-checklist', 'prompt-templates', 'ai-planner'],
  },
  deepseek: {
    name: 'DeepSeek',
    duty: '风险评估 + diff 检测 + 合并风险评分',
    outputs: ['merge-risk-policy', 'risk-score', 'diff-detection'],
  },
  doubao: {
    name: '豆包',
    duty: '中文文案 + 任务描述优化 + 企微回复模板',
    outputs: ['task-description', 'copywriting', 'reply-template'],
  },
}

// ── 固定分工（保留旧逻辑，兜底无需求时使用） ──

function planTasks(userRequest) {
  const plan = [
    {
      role: 'workbuddy',
      task: 'orchestrator-core',
      taskNameZH: '调度核心框架',
      scopes: ['orchestrator', 'task-planner', 'branch-planner', 'patch-policy'],
      forbidden: ['ai-reasoning', 'score-model', 'prompt-builder', 'memory-rules'],
      patchFile: 'workbuddy-orchestrator-core-v1.patch',
    },
    {
      role: 'codex',
      task: 'ai-planner',
      taskNameZH: 'AI 任务拆解 + review checklist',
      scopes: ['role-registry', 'review-checklist', 'prompt-templates', 'ai-planner'],
      forbidden: ['nginx', 'pm2', 'deploy', 'wecom-main-chain'],
      patchFile: 'codex-ai-planner-v1.patch',
    },
    {
      role: 'deepseek',
      task: 'risk-policy',
      taskNameZH: '合并风险评估策略',
      scopes: ['merge-risk-policy', 'risk-score', 'diff-detection', 'forbidden-file-scoring'],
      forbidden: ['push-main', 'merge-develop', 'modify-nginx', 'modify-env'],
      patchFile: 'deepseek-risk-policy-v1.patch',
    },
    {
      role: 'doubao',
      task: 'ai-copywriter',
      taskNameZH: 'AI 文案优化 + 企微回复模板',
      scopes: ['task-description', 'copywriting', 'reply-template', 'prompt-polish'],
      forbidden: ['push-main', 'merge-develop', 'nginx', 'pm2'],
      patchFile: 'doubao-ai-copywriter-v1.patch',
    },
  ]
  return plan
}

// ── 动态分工（v1.1：按需求关键词路由） ──

const DEFAULT_FORBIDDEN = [
  '企业微信主链路', 'commands', 'nginx', 'PM2', 'deploy', '.env',
  'AI运营分析模块', 'ads模块', 'video模块',
]
const PATCH_FILE = 'codex-dynamic-ai-scheduler-v011.patch'
const PR_TARGET = 'develop'

function containsAny(text, keywords) {
  return keywords.some((kw) => text.includes(kw))
}

function buildTask(assignee, title, scope, acceptance) {
  return {
    assignee, title,
    branch: 'feature/codex-dynamic-ai-scheduler-v011',
    scope, forbidden: DEFAULT_FORBIDDEN,
    patchFile: PATCH_FILE, prTarget: PR_TARGET, acceptance,
  }
}

function planByDemand(rawDemand) {
  const demand = String(rawDemand || '').trim()

  if (containsAny(demand, ['投流优化'])) {
    return [
      buildTask('DeepSeek', '投流规则与ROI诊断', '制定投流规则，分析ROI与CTR/CVR，输出预算建议。', '产出可执行投流规则、核心指标诊断结论与预算建议。'),
      buildTask('WorkBuddy', '投流执行链路与定时采集', '负责ads-worker任务编排、数据采集cron、标准JSON输出。', '可按计划采集数据并输出稳定JSON结果。'),
      buildTask('Codex', '投流分析整合与调度总结', '整合多源AI分析结果，维护上下文，并生成调度总结。', '最终输出包含上下文、结论和下一步执行建议。'),
    ]
  }

  if (containsAny(demand, ['风险预警'])) {
    return [
      buildTask('DeepSeek', '风险规则与异常识别', '建立风险规则、评分体系和异常识别逻辑。', '能识别异常并输出清晰风险评分与触发原因。'),
      buildTask('Codex', '风险上下文与趋势总结', '补充风险上下文，进行趋势分析并形成AI总结。', '输出趋势变化、风险等级和行动建议。'),
      buildTask('WorkBuddy', '风险推送与日志闭环', '配置定时推送、企业微信提醒和风险日志沉淀。', '预警可准时触发，提醒可送达，日志可追溯。'),
    ]
  }

  if (containsAny(demand, ['视频优化'])) {
    return [
      buildTask('豆包', '视频素材与互动文案优化', '优化标题、脚本、开头3秒、封面和评论区话术。', '形成可直接投放的素材与评论区互动模板。'),
      buildTask('Codex', '内容策略与SKU关联', '构建内容策略，补齐上下文与SKU关联逻辑。', '输出内容策略图谱和SKU绑定建议。'),
      buildTask('WorkBuddy', '视频优化命令接入与推送', '负责命令接入及优化结果的定时推送。', '命令可触发，结果可按计划推送。'),
    ]
  }

  if (containsAny(demand, ['自动日报'])) {
    return [
      buildTask('WorkBuddy', '日报自动化推送', '实现cron调度、日报推送与企业微信发送。', '日报可按时生成并稳定发送至企业微信。'),
      buildTask('Codex', '日报结构与运营总结', '设计日报结构，生成运营总结并沉淀memory趋势。', '日报结构清晰，具备趋势洞察与可执行建议。'),
      buildTask('DeepSeek', '风险与投流评分输入', '提供风险/投流评分输入以增强日报决策信息。', '评分输入可被日报引用并支持决策判断。'),
    ]
  }

  return [
    buildTask('WorkBuddy', '通用执行编排', '负责任务执行、调度触发与输出推送链路。', '任务可执行且输出链路稳定。'),
    buildTask('Codex', '通用上下文与总结', '负责上下文聚合、分析整合与最终总结。', '总结完整且具可执行下一步。'),
    buildTask('DeepSeek', '通用规则与评分', '提供规则体系、评分模型与风险判断。', '规则与评分可用于后续策略执行。'),
    buildTask('豆包', '通用内容优化', '负责文案、素材表达与用户沟通内容优化。', '内容产出可直接应用于业务场景。'),
  ]
}

// ── 格式化日报 ──

function formatDailyReport(plan) {
  const { formatBranchReport } = require('./branch-planner')
  const lines = ['🤖 AI 调度日报', '='.repeat(30), '']
  lines.push(`📅 ${new Date().toISOString().split('T')[0]}`)
  lines.push('')
  for (const item of plan) {
    const roleInfo = AI_ROLES[item.role]
    lines.push(`【${roleInfo.name}】${item.taskNameZH}`)
    lines.push(`  patch: ${item.patchFile}`)
    lines.push(`  输出: ${roleInfo.outputs.join(', ')}`)
    lines.push('')
  }
  lines.push(formatBranchReport(plan))
  lines.push('')
  lines.push('⚠️ 当前仅自动规划，不自动执行合并/deploy')
  return lines.join('\n')
}

function formatDynamicReport(demand, tasks) {
  const lines = ['🤖 AI 调度日报', '='.repeat(30), '']
  lines.push(`📅 ${new Date().toISOString().split('T')[0]}`)
  lines.push(`📌 需求：${demand || '(通用调度)'}`)
  lines.push('')
  for (const task of tasks) {
    lines.push(`【${task.assignee}】${task.title}`)
    lines.push(`  范围: ${task.scope}`)
    lines.push(`  验收: ${task.acceptance}`)
    lines.push('')
  }
  lines.push('⚠️ 当前仅自动规划，不自动执行合并/deploy')
  return lines.join('\n')
}

function validatePlan(plan) {
  const violations = []
  for (const item of plan) {
    const result = checkScope(item.role, item.scopes || [])
    if (!result.inScope) {
      violations.push(`${item.role} 越权: ${result.outOfScope.join(', ')}`)
    }
  }
  return { valid: violations.length === 0, violations }
}

module.exports = {
  planTasks, planByDemand, formatDailyReport, formatDynamicReport, validatePlan, AI_ROLES,
}
