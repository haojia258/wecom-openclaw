// P54 Activity Approval Viewer — Read-only detail page
var store = require('./activity-store');
var profitEngine = require('./activity-profit-engine');
var riskEngine = require('./activity-risk-engine');

function riskEmoji(l) { if (!l) return '❓ UNKNOWN'; var x = l.toLowerCase(); if (x === 'low') return '✅ LOW'; if (x === 'medium') return '⚠️ MEDIUM'; if (x === 'high') return '🔴 HIGH'; return '❓ ' + l.toUpperCase(); }

function listPending() {
  var plans = store.getEnrollmentPlans();
  if (!plans || plans.length === 0) return '📋 暂无待审批活动报名计划。';
  var pending = plans.filter(function (p) { return p.status === 'pending_approval'; });
  if (pending.length === 0) return '📋 暂无待审批活动报名计划。\n\n所有计划已处理完毕。';

  var lines = ['📋 待审批活动报名计划 (' + pending.length + ')', ''];
  pending.forEach(function (p, i) {
    lines.push((i + 1) + '. ' + p.activity + ' | ' + riskEmoji(p.riskLevel));
    lines.push('   计划ID: ' + p.planId + ' | 状态: ' + p.status);
    lines.push('   SKU: ' + (p.skus || []).join(', '));
    lines.push('   🔒 已阻断 · 需P48审批');
    lines.push('');
  });
  lines.push('发送 /审批 活动详情 <计划ID> 查看详情');
  return lines.join('\n');
}

function detail(planId) {
  var plans = store.getEnrollmentPlans();
  if (!plans || plans.length === 0) return '📋 未找到计划 ' + (planId || '');

  var plan;
  if (planId) {
    plan = plans.find(function (p) { return p.planId === planId; });
    if (!plan) return '❌ 未找到计划: ' + planId + '\n\n发送 /审批 活动 查看所有待审批计划。';
  } else {
    var pending = plans.filter(function (p) { return p.status === 'pending_approval'; });
    if (pending.length === 0) return '📋 暂无待审批活动报名计划。';
    plan = pending[0];
  }

  var activity = store.getById(plan.activityId);
  var profit = activity ? profitEngine.calculate(activity) : { estimatedGMV: 0, netProfit: 0, profitMargin: 'N/A' };
  var risk = activity ? riskEngine.assess(activity, parseFloat(profit.profitMargin) / 100 || 0) : { riskLevel: 'UNKNOWN', riskScore: 0 };

  return [
    '📝 活动报名审批详情', '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '计划ID: ' + plan.planId,
    '活动: ' + plan.activity,
    '活动ID: ' + (plan.activityId || 'N/A'),
    'SKU: ' + (plan.skus || []).join('、'),
    '',
    '状态: ' + plan.status.toUpperCase(),
    '风险等级: ' + riskEmoji(plan.riskLevel),
    '🔒 已阻断: ' + (plan.approvalRequired ? '是 (需P48审批)' : '否'),
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '💰 财务分析',
    '预估GMV: ¥' + (profit.estimatedGMV || 0).toLocaleString(),
    '预计净利润: ¥' + (profit.netProfit || 0).toLocaleString(),
    '利润率: ' + (profit.profitMargin || 'N/A'),
    '补贴: ¥' + (profit.subsidy || 0).toLocaleString(),
    '',
    '⚠️ 风险评估',
    '风险等级: ' + riskEmoji(risk.riskLevel),
    '风险评分: ' + (risk.riskScore || 0) + '/100',
    '折扣率: ' + ((risk.factors && risk.factors.discount ? risk.factors.discount * 100 : 0) || 0) + '%',
    '产品数: ' + ((risk.factors && risk.factors.productCount) || 0),
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '🔒 安全状态',
    'AUTO_ENROLL_EXECUTE: false',
    'REVIEW_ONLY: true',
    '需要P48审批: 是',
    '已阻断自动报名: 是',
    '',
    '创建时间: ' + (plan.createdAt || 'N/A'),
    '',
    '⚠️ 本页面为只读详情。',
    '批准/拒绝操作生成审计记录，不触发生产动作。'
  ].join('\n');
}

module.exports = { listPending: listPending, detail: detail, riskEmoji: riskEmoji };
