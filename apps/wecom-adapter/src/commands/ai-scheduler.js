/**
 * ai-scheduler.js
 * /ai调度 企微命令 v2.0
 *
 * v2.0 变更：
 * - 集成 orchestrator-core.js 动态意图解析
 * - 新增 /ai调度 历史 子命令（查看审计记录）
 * - 输出包含：推荐 AI、原因、分支名、patch 文件名、禁止范围、验收标准、Audit ID、完整任务文案
 * - 只输出文本，不自动执行
 */
'use strict';

const { scheduleAI, getStatus, getHistory } = require('../orchestrator/orchestrator');

const COMMAND_NAME = '/ai调度';

/**
 * 命令入口（由 command-center 调用）
 * @param {object} ctx - 企微消息上下文
 * @param {string} arg - 用户附加参数
 * @returns {Promise<string>} 回复文案
 */
async function execute(ctx, arg = '') {
  const sub = (arg || '').trim();

  // 子命令：状态
  if (sub === '状态' || sub === 'status') {
    return formatStatus();
  }

  // 子命令：帮助
  if (sub === '帮助' || sub === 'help') {
    return formatHelp();
  }

  // 子命令：历史
  if (sub === '历史' || sub === 'history') {
    return getHistory(10);
  }

  // 子命令：执行（v0.1 兼容模式，输出固定 4 角色日报）
  if (sub === '执行' || sub === 'run' || sub === '日报') {
    const { report } = await scheduleAI({ userRequest: sub, legacyMode: true });
    return report;
  }

  // 默认：v0.2 动态意图模式
  const { report, plan, auditId } = await scheduleAI({ userRequest: sub });

  if (!plan) {
    return report; // 包含错误信息
  }

  return report;
}

/**
 * 格式化状态输出
 */
function formatStatus() {
  const status = getStatus();
  const lines = [
    '🤖 AI Orchestrator 状态',
    '═'.repeat(30),
    `版本: v${status.version}`,
    `模式: ${status.mode}`,
    '',
    '支持 AI 角色:',
    ...status.supportedAssignees.map(r => `  - ${r}`),
    '',
    '支持意图类型:',
    ...status.supportedIntents.map(i => `  - ${i}`),
    '',
    '禁止操作:',
    ...status.forbiddenActions.map(a => `  - ${a}`),
    '',
    '⚠️ 当前仅自动规划，不自动执行',
  ];
  return lines.join('\n');
}

/**
 * 格式化帮助输出
 */
function formatHelp() {
  return [
    '🤖 /ai调度 使用帮助 v2.0',
    '═'.repeat(30),
    '',
    '【功能】',
    '  动态意图解析 + AI 角色推荐 + 任务规划',
    '  根据用户目标自动匹配最适合的 AI 角色',
    '',
    '【用法】',
    '  /ai调度 <你的目标>  → 动态意图解析 + 推荐 AI',
    '  /ai调度 状态         → 查看 orchestrator 状态',
    '  /ai调度 历史         → 查看审计记录（最近 10 条）',
    '  /ai调度 帮助         → 显示本帮助',
    '  /ai调度 执行         → v0.1 兼容模式（固定 4 角色日报）',
    '',
    '【AI 角色分工】',
    '  WorkBuddy → 日报/推送/运营分析/系统运维',
    '  Codex     → 风险/复盘/代码审查/AI 规划/记忆',
    '  DeepSeek  → 投流分析/ROI/CTR/CVR/预算优化',
    '  豆包      → 视频脚本/标题/封面/评论区文案',
    '',
    '【示例】',
    '  /ai调度 自动日报         → 推荐 WorkBuddy',
    '  /ai调度 做投流ROI分析    → 推荐 DeepSeek',
    '  /ai调度 生成视频脚本     → 推荐 豆包',
    '  /ai调度 开发AI planner   → 推荐 Codex',
    '',
    '⚠️ 仅规划不执行 | 需人工确认后操作',
  ].join('\n');
}

module.exports = { execute, COMMAND_NAME };
