/**
 * orchestrator-core.js
 * AI Orchestrator Runtime Core 桥接层 v0.4
 *
 * 复用 v0.2 task-planner / branch-planner / patch-policy，
 * 提供 runtime-core.js 所需的 decompose / buildPlan / formatPlanForWecom 接口。
 */

const { planTasks, formatDailyReport, validatePlan, AI_ROLES } = require('./task-planner');
const { generateBranchName, formatBranchReport } = require('./branch-planner');
const { checkScope } = require('./patch-policy');

/**
 * 意图分解：将自然语言转为结构化描述
 *
 * @param {string} userRequest - 用户指令
 * @returns {object} decomposition
 */
function decompose(userRequest) {
  const req = (userRequest || '').trim();
  if (!req) {
    return { intent: 'unknown', recommendedAssignee: 'workbuddy', keywords: [] };
  }

  // 关键词匹配意图
  const INTENT_MAP = [
    { keywords: ['运营分析', '运营报告', '日报', '分析', '运营'], intent: 'ops_analysis', assignee: 'workbuddy' },
    { keywords: ['投流', 'ROI', '广告', '转化', '千川'], intent: 'ads_analysis', assignee: 'workbuddy' },
    { keywords: ['视频', '脚本', '内容', '创意', '剪辑'], intent: 'video_script', assignee: 'doubao' },
    { keywords: ['风险', '安全', '告警', '漏洞'], intent: 'risk_analysis', assignee: 'deepseek' },
    { keywords: ['代码', 'patch', 'bug', '修复', '测试', '优化', '重构'], intent: 'code_change', assignee: 'codex' },
    { keywords: ['数据', '趋势', '预测', '报表', '统计'], intent: 'data_analysis', assignee: 'deepseek' },
    { keywords: ['部署', '上线', '发布', 'deploy'], intent: 'deploy', assignee: 'workbuddy' },
    { keywords: ['文案', '标题', '描述', '文案优化'], intent: 'copywriting', assignee: 'doubao' },
  ];

  let matched = null;
  for (const entry of INTENT_MAP) {
    if (entry.keywords.some(function(kw) { return req.includes(kw); })) {
      matched = entry;
      break;
    }
  }

  if (!matched) {
    matched = { intent: 'general', assignee: 'workbuddy', keywords: [] };
  }

  // 生成 branch 名
  const branch = generateBranchName(req) || 'feature/ai-task';

  // 范围检查
  let scopeCheck = null;
  try {
    scopeCheck = checkScope(matched.assignee, []);
  } catch (e) {
    scopeCheck = { inScope: true, outOfScope: [] };
  }

  return {
    intent: matched.intent,
    recommendedAssignee: matched.assignee,
    keywords: matched.keywords,
    branch,
    patchFile: '',
    forbidden: (scopeCheck && scopeCheck.outOfScope) || [],
    acceptance: `任务 "${req.substring(0, 50)}" 完成并通过审查`,
    userRequest: req,
  };
}

/**
 * 构建任务规划
 *
 * @param {object} decomposition - decompose 的输出
 * @returns {object} plan
 */
function buildPlan(decomposition) {
  if (!decomposition) return null;

  const tasks = planTasks(decomposition.userRequest || '');
  const validation = validatePlan(tasks);

  return {
    intent: decomposition.intent,
    assignee: decomposition.recommendedAssignee,
    branch: decomposition.branch,
    tasks,
    validation,
    summary: 'AI Orchestrator v0.4 自动规划',
    createdAt: new Date().toISOString(),
  };
}

/**
 * 格式化计划为 WeCom 可读文本
 *
 * @param {object} plan - buildPlan 的输出
 * @returns {string}
 */
function formatPlanForWecom(plan) {
  if (!plan) return '无计划';

  const lines = [
    '📋 AI 任务规划',
    '',
    '意图: ' + (plan.intent || 'unknown'),
    '指派: ' + (plan.assignee || 'workbuddy'),
    '分支: ' + (plan.branch || 'N/A'),
    '',
  ];

  if (plan.tasks && plan.tasks.length > 0) {
    lines.push('── 子任务 ──');
    plan.tasks.forEach(function(t, i) {
      lines.push('');
      lines.push('[' + (i + 1) + '] ' + t.taskNameZH + ' (' + t.role + ')');
      lines.push('  Patch: ' + t.patchFile);
      lines.push('  范围: ' + (t.scopes || []).join(', '));
      if (t.forbidden && t.forbidden.length > 0) {
        lines.push('  禁止: ' + t.forbidden.join(', '));
      }
    });
  }

  if (plan.validation && !plan.validation.valid) {
    lines.push('');
    lines.push('🚫 规划越权:');
    plan.validation.violations.forEach(function(v) { lines.push('  - ' + v); });
  }

  return lines.join('\n');
}

module.exports = {
  decompose,
  buildPlan,
  formatPlanForWecom,
  AI_ROLES,
};
