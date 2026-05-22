/**
 * orchestrator-core.js
 * AI Orchestrator v0.2 — 动态意图解析 + AI 角色分配 + 任务规划
 *
 * 架构：
 *   用户请求 → decompose() → 识别 intent → 推荐 AI 角色
 *   → 输出结构化 task plan（含分支、patch、禁止范围、验收标准）
 *
 * 与 v0.1 的区别：
 *   v0.1: 固定 4 角色模板（无论用户请求是什么，4 个角色各一份）
 *   v0.2: 动态意图解析 → 智能匹配单一 AI 角色 → 精准任务输出
 */

const path = require('path');
const fs = require('fs');

const VERSION = '0.2';

// ========== 1. AI 角色定义 ==========

const AI_ASSIGNEES = {
  workbuddy: {
    name: 'WorkBuddy',
    label: 'WorkBuddy（Claude）',
    description: '核心框架 + 命令接入 + 运营日报 + push 调度',
    defaultBranchPrefix: 'feature/workbuddy',
    forbidden: [
      '.env', '.env.example', 'nginx', 'PM2 主配置', 'ecosystem.config.js',
      '企业微信加密/解密主链路', 'main', 'develop',
      'auto-deploy', 'force-push', 'pm2 delete',
    ],
  },
  codex: {
    name: 'Codex',
    label: 'Codex（OpenAI）',
    description: 'AI 推理 + 任务拆解 + 代码审查 + 风险策略 + 规划逻辑',
    defaultBranchPrefix: 'feature/codex',
    forbidden: [
      '.env', '.env.example', 'nginx', 'PM2 主配置', 'ecosystem.config.js',
      '企业微信加密/解密主链路', 'main', 'develop',
      'auto-deploy', 'force-push', '数据文件直接修改',
    ],
  },
  deepseek: {
    name: 'DeepSeek',
    label: 'DeepSeek',
    description: '投流分析 + ROI/CTR/CVR 计算 + 广告预算优化',
    defaultBranchPrefix: 'feature/deepseek',
    forbidden: [
      '.env', '.env.example', 'nginx', 'PM2 主配置', 'ecosystem.config.js',
      '企业微信加密/解密主链路', 'main', 'develop',
      'auto-deploy', 'force-push', '非 ads/ 路径修改',
    ],
  },
  doubao: {
    name: '豆包',
    label: '豆包（字节）',
    description: '视频脚本生成 + 标题优化 + 封面建议 + 评论区运营文案',
    defaultBranchPrefix: 'feature/doubao',
    forbidden: [
      '.env', '.env.example', 'nginx', 'PM2 主配置', 'ecosystem.config.js',
      '企业微信加密/解密主链路', 'main', 'develop',
      'auto-deploy', 'force-push', '非 video/ 路径修改',
    ],
  },
};

// ========== 2. 意图 → AI 角色映射 ==========

const INTENT_MAP = [
  {
    keywords: ['日报', '自动日报', '推送', '定时', 'summary', 'daily', '运营摘要', '今日摘要', '自动推送'],
    assignee: 'workbuddy',
    intent: 'daily_report',
    intentLabel: '日报/推送',
    priority: 10,
    reason: '日报推送属于 WorkBuddy 核心运营框架职责',
    acceptance: [
      '日报内容覆盖 GMV/订单/利润/风险四大板块',
      '推送时间配置正确（9/13/22点）',
      '不包含敏感数据（api key、密钥等）',
    ],
  },
  {
    keywords: ['帮助', '状态', 'ping', '诊断', 'help', 'status', '菜单', '命令'],
    assignee: 'workbuddy',
    intent: 'system_ops',
    intentLabel: '系统运维',
    priority: 10,
    reason: '系统命令和状态查询属于 WorkBuddy 运维框架职责',
    acceptance: [
      '命令注册正确，别名可用',
      '状态输出格式完整',
    ],
  },
  {
    keywords: ['gmv', '订单', '利润', '运营', '实时', '数据', '分析', '趋势', '今日数据', '昨天', '报表'],
    assignee: 'workbuddy',
    intent: 'ops_analysis',
    intentLabel: '运营分析',
    priority: 8,
    reason: '运营数据分析属于 WorkBuddy 核心能力范围',
    acceptance: [
      '数据来源正确（电商罗盘/数据库）',
      '趋势分析有环比/同比',
      '异常数据有标注',
    ],
  },
  {
    keywords: ['风险', '告警', '退款', '库存', '异常', '报警', '红线', 'alert', '复盘'],
    assignee: 'codex',
    intent: 'risk_review',
    intentLabel: '风险/复盘',
    priority: 10,
    reason: '风险策略和异常检测需要 Codex 的推理和评分能力',
    acceptance: [
      '风险评分基于 risk-policy 双 API（scoreRisk + classifyRisk）',
      '告警阈值符合配置',
      '复盘包含根因分析和改进建议',
    ],
  },
  {
    keywords: ['review', '审查', '代码审查', 'code review', 'patch审计', '审计', 'fallback'],
    assignee: 'codex',
    intent: 'code_review',
    intentLabel: '代码审查',
    priority: 9,
    reason: '代码审查需要 Codex 的深度推理和风险判断',
    acceptance: [
      '审查覆盖所有变更文件',
      '禁止范围（.env/nginx/PM2）零触碰',
      '风险分级准确（>=80 high, >=40 medium）',
    ],
  },
  {
    keywords: ['planner', '规划', '任务拆解', 'task breakdown', 'plan', 'memory', '记忆', '上下文'],
    assignee: 'codex',
    intent: 'ai_planning',
    intentLabel: 'AI 规划/记忆',
    priority: 8,
    reason: '任务拆解和规划逻辑需要 Codex 的结构化推理能力',
    acceptance: [
      '任务拆解粒度合理（3-7 个子任务）',
      '依赖关系清晰',
      '上下文记忆正确加载',
    ],
  },
  {
    keywords: ['投流', 'roi', 'ctr', 'cvr', '广告', '千川', '预算', '转化', '千次展示', 'ecpm', 'cpm', 'cpc', '出价', '消耗'],
    assignee: 'deepseek',
    intent: 'ads_analysis',
    intentLabel: '投流分析',
    priority: 10,
    reason: '投流 ROI 分析和预算优化需要 DeepSeek 的数据计算能力',
    acceptance: [
      'ROI/CTR/CVR 计算正确',
      '预算分配建议合理（基于历史数据）',
      '输出包含 actionable 建议',
    ],
  },
  {
    keywords: ['视频', '脚本', '标题', '开头', '文案', '选题', '口播', '带货视频', '短视频', '封面', '评论区', '字幕'],
    assignee: 'doubao',
    intent: 'video_creation',
    intentLabel: '视频创作',
    priority: 10,
    reason: '视频脚本和标题创作需要豆包的中文创意能力',
    acceptance: [
      '脚本长度符合平台要求（抖音/快手）',
      '标题含关键词且吸引点击',
      '封面建议有具体描述',
    ],
  },
];

// ========== 3. 默认/兜底配置 ==========

const DEFAULT_ASSIGNEE = 'workbuddy';
const DEFAULT_INTENT = 'general_task';

// ========== 4. 核心函数：意图解析 ==========

/**
 * 从用户自然语言输入中识别意图，推荐 AI 角色，输出完整任务计划
 *
 * @param {string} input - 用户自然语言请求
 * @returns {{
 *   goal: string,
 *   intent: string,
 *   recommendedAssignee: string,
 *   reason: string,
 *   branch: string,
 *   patchFile: string,
 *   prTarget: string,
 *   forbidden: string[],
 *   acceptance: string[],
 *   fullPrompt: string
 * }}
 */
function decompose(input) {
  const goal = (input || '').trim();
  const normalized = goal.toLowerCase();

  // 空输入 → 兜底
  if (!goal || goal.length === 0) {
    return buildFallbackPlan(goal);
  }

  // 匹配 INTENT_MAP
  let bestMatch = null;
  let bestPriority = -1;

  for (const entry of INTENT_MAP) {
    let matched = false;
    for (const kw of entry.keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        matched = true;
        break;
      }
    }
    if (matched && entry.priority > bestPriority) {
      bestMatch = entry;
      bestPriority = entry.priority;
    }
  }

  // 无匹配 → 兜底
  if (!bestMatch) {
    return buildFallbackPlan(goal);
  }

  // 构建计划
  return buildPlan(goal, bestMatch);
}

/**
 * 构建结构化任务计划
 */
function buildPlan(goal, intentEntry) {
  const assignee = AI_ASSIGNEES[intentEntry.assignee];
  const branch = generateBranchForIntent(goal, intentEntry);
  const patchFile = generatePatchFileName(intentEntry);

  const fullPrompt = buildFullPrompt(goal, intentEntry, assignee);

  return {
    goal,
    intent: intentEntry.intent,
    recommendedAssignee: intentEntry.assignee,
    reason: intentEntry.reason,
    branch,
    patchFile,
    prTarget: 'develop',
    forbidden: assignee.forbidden,
    acceptance: intentEntry.acceptance,
    fullPrompt,
  };
}

/**
 * 兜底计划：无法识别意图时，分配给 WorkBuddy
 */
function buildFallbackPlan(goal) {
  const assignee = AI_ASSIGNEES[DEFAULT_ASSIGNEE];
  const branch = `feature/workbuddy-general-${Date.now().toString(36)}`;

  return {
    goal: goal || '(空)',
    intent: DEFAULT_INTENT,
    recommendedAssignee: DEFAULT_ASSIGNEE,
    reason: '无法识别具体意图，默认分配给 WorkBuddy 作为通用任务处理',
    branch,
    patchFile: `workbuddy-general-task.patch`,
    prTarget: 'develop',
    forbidden: assignee.forbidden,
    acceptance: [
      '任务范围不超出 WorkBuddy 职责',
      '不触碰 .env/nginx/PM2 等禁止路径',
    ],
    fullPrompt: goal
      ? `【通用任务】\n\n用户请求：${goal}\n\n请作为 WorkBuddy 分析此任务，确定具体执行方案。\n\n约束：\n- 禁止修改 .env / nginx / PM2 配置\n- 禁止直接修改 main/develop\n- 输出为 feature 分支 patch\n- PR 目标：develop\n- 不自动执行、不自动 merge`
      : '【通用任务】\n\n（用户未提供具体请求内容）\n\n请确认任务范围后再执行。',
  };
}

/**
 * 根据意图生成分支名
 */
function generateBranchForIntent(goal, intentEntry) {
  const prefix = AI_ASSIGNEES[intentEntry.assignee].defaultBranchPrefix;
  const slug = intentEntry.intent.replace(/_/g, '-');
  // 从 goal 中提取简短的英文 slug
  const dateSlug = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${slug}-${dateSlug}`;
}

/**
 * 生成 patch 文件名
 */
function generatePatchFileName(intentEntry) {
  const slug = intentEntry.intent.replace(/_/g, '-');
  const assignee = intentEntry.assignee;
  return `${assignee}-${slug}-v2.patch`;
}

/**
 * 构建给 AI 的完整任务文案
 */
function buildFullPrompt(goal, intentEntry, assignee) {
  const lines = [];

  lines.push(`【${intentEntry.intentLabel}任务】`);
  lines.push('');
  lines.push(`用户原始请求：${goal}`);
  lines.push('');
  lines.push(`分配给：${assignee.label}`);
  lines.push(`角色职责：${assignee.description}`);
  lines.push(`分配原因：${intentEntry.reason}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 执行要求');
  lines.push('');
  lines.push('1. 请基于以上用户请求，完成对应的分析和代码生成');
  lines.push('2. 所有变更以 patch 形式输出');
  lines.push('3. PR 目标分支：develop');
  lines.push('');
  lines.push('## 禁止修改');
  lines.push('');
  for (const item of assignee.forbidden) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## 验收标准');
  lines.push('');
  for (const item of intentEntry.acceptance) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push('');
  lines.push('## 约束');
  lines.push('');
  lines.push('- 不自动执行');
  lines.push('- 不自动 merge');
  lines.push('- 不自动 apply patch');
  lines.push('- 所有操作需人工确认');

  return lines.join('\n');
}

// ========== 5. 规划格式化（企微输出） ==========

/**
 * 将任务计划格式化为企微可读文本
 * @param {object} plan - decompose() 的输出
 * @param {string} [auditId] - 审计 ID（可选）
 * @returns {string}
 */
function formatPlanForWecom(plan, auditId) {
  const assignee = AI_ASSIGNEES[plan.recommendedAssignee] || AI_ASSIGNEES[DEFAULT_ASSIGNEE];
  const lines = [];

  lines.push('🤖 AI 调度规划 v' + VERSION);
  lines.push('═'.repeat(30));
  lines.push('');
  lines.push(`📝 用户目标：${plan.goal || '(空)'}`);
  lines.push(`🎯 识别意图：${plan.intent}`);
  lines.push(`🤖 推荐 AI：${assignee.label}`);
  lines.push(`💡 原因：${plan.reason}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`🌿 分支名：${plan.branch}`);
  lines.push(`📦 Patch 文件：${plan.patchFile}`);
  lines.push(`🔀 PR 目标：${plan.prTarget}`);
  lines.push('');
  lines.push('🚫 禁止修改范围：');
  for (const item of plan.forbidden) {
    lines.push(`  - ${item}`);
  }
  lines.push('');
  lines.push('✅ 验收标准：');
  for (const item of plan.acceptance) {
    lines.push(`  - ${item}`);
  }
  lines.push('');

  if (auditId) {
    lines.push(`📋 Audit ID：${auditId}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('📤 完整任务文案（可直接发给对应 AI）：');
  lines.push('');
  lines.push(plan.fullPrompt);
  lines.push('');
  lines.push('═'.repeat(30));
  lines.push('⚠️ 仅规划不执行 | 需人工确认后操作');

  return lines.join('\n');
}

/**
 * 获取所有支持的意图列表
 * @returns {{ intent: string, label: string, assignee: string }[]}
 */
function listIntents() {
  return INTENT_MAP.map(e => ({
    intent: e.intent,
    label: e.intentLabel,
    assignee: e.assignee,
  }));
}

/**
 * 获取 orchestrator 状态
 */
function getStatus() {
  return {
    version: VERSION,
    mode: 'plan-only',
    supportedAssignees: Object.keys(AI_ASSIGNEES),
    supportedIntents: INTENT_MAP.map(e => e.intentLabel),
    defaultAssignee: DEFAULT_ASSIGNEE,
    forbiddenDefaults: AI_ASSIGNEES[DEFAULT_ASSIGNEE].forbidden,
  };
}

// ========== 6. 导出 ==========

module.exports = {
  decompose,
  formatPlanForWecom,
  listIntents,
  getStatus,
  buildPlan,
  buildFallbackPlan,
  buildFullPrompt,
  generateBranchForIntent,
  generatePatchFileName,
  INTENT_MAP,
  AI_ASSIGNEES,
  DEFAULT_ASSIGNEE,
  DEFAULT_INTENT,
  VERSION,
};
