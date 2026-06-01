// P53.1 Activity Renderer — WeCom Markdown output
var store = require('./activity-store');
var profitEngine = require('./activity-profit-engine');
var riskEngine = require('./activity-risk-engine');
var recommender = require('./activity-recommender');
var enrollment = require('./enrollment-planner');
var autoEnroll = require('./activity-auto-enroll');

function riskEmoji(level) {
  if (!level) return '❓ UNKNOWN';
  var l = level.toLowerCase();
  if (l === 'low') return '✅ LOW';
  if (l === 'medium') return '⚠️ MEDIUM';
  if (l === 'high') return '🔴 HIGH';
  return '❓ ' + level.toUpperCase();
}

var MEDAL = ['🥇', '🥈', '🥉'];

function renderRecommendations() {
  var all = store.getAll();
  if (!all || all.length === 0) return '暂无可推荐活动。';

  var recs = recommender.recommend(all);
  if (!recs || recs.length === 0) return '暂无可推荐活动。';

  var top = recs.filter(function (r) { return r.shouldEnroll; }).slice(0, 3);
  if (top.length === 0) return '暂无可推荐活动。';

  var lines = ['🎯 活动推荐 TOP' + top.length, ''];
  top.forEach(function (r, i) {
    lines.push((MEDAL[i] || '▸') + ' ' + r.activity);
    lines.push('预计GMV：¥' + (r.profit.estimatedGMV || 0).toLocaleString());
    lines.push('预计净利润：¥' + (r.profit.netProfit || 0).toLocaleString());
    lines.push('利润率：' + (r.profit.profitMargin || '0%'));
    lines.push('风险等级：' + riskEmoji(r.risk ? r.risk.riskLevel : null));
    lines.push('推荐指数：' + (r.recommendationScore || 0));
    lines.push('建议：' + (r.cta || '关注'));
    lines.push('');
  });
  lines.push('发送：');
  lines.push('/活动 报名计划');
  return lines.join('\n');
}

function renderEnrollmentPlan() {
  var all = store.getAll();
  if (!all || all.length === 0) return '暂无可生成报名计划。';

  var scan = autoEnroll.scanLowRisk();
  if (!scan.candidates || scan.candidates.length === 0) return '暂无可生成报名计划。\n\n当前无满足低风险条件的活动。';

  var c = scan.candidates[0];
  var a = c.activity;
  var plan = enrollment.createPlan(a, a.products);

  return [
    '📝 活动报名计划已生成', '',
    '计划ID：' + plan.planId,
    '活动：' + (a.name || 'N/A'),
    '活动ID：' + (a.id || 'N/A'),
    'SKU：' + (a.products || []).join('、'),
    '风险等级：' + riskEmoji(plan.riskLevel),
    '状态：PENDING_APPROVAL', '',
    '🔒 执行状态：',
    '已阻断，不会自动报名', '',
    '审批要求：',
    '需要 P48 审批', '',
    '安全配置：',
    'AUTO_ENROLL_EXECUTE=false',
    'REVIEW_ONLY=true', '',
    '下一步：',
    '请到 Web Console /activities 或审批队列查看。'
  ].join('\n');
}

function renderStatus() {
  var all = store.getAll();
  return [
    '📊 活动状态',
    '',
    '总数：' + all.length,
    '即将开始：' + all.filter(function (a) { return a.status === 'upcoming'; }).length,
    '进行中：' + all.filter(function (a) { return a.status === 'running'; }).length,
    '已完成：' + all.filter(function (a) { return a.status === 'done'; }).length,
    '',
    '半自动模式：' + (autoEnroll.getConfig().AUTO_ENROLL_PLAN ? '✅ 启用' : '❌ 关闭'),
    '自动执行：' + (autoEnroll.getConfig().AUTO_ENROLL_EXECUTE ? '❌ 启用(危险)' : '✅ 关闭(P48阻断)'),
    'REVIEW_ONLY=true'
  ].join('\n');
}

function renderProfits() {
  var all = store.getAll();
  if (!all || all.length === 0) return '暂无活动数据，无法计算利润。';
  var profits = profitEngine.calculateAll(all);
  var lines = ['💰 活动利润', ''];
  profits.forEach(function (p) {
    lines.push(p.activity);
    lines.push('  预估GMV：¥' + (p.estimatedGMV || 0).toLocaleString());
    lines.push('  净利润：¥' + (p.netProfit || 0).toLocaleString());
    lines.push('  利润率：' + (p.profitMargin || '0%'));
    lines.push('  建议：' + (p.recommendation || 'N/A'));
    lines.push('');
  });
  return lines.join('\n');
}

function renderRisks() {
  var all = store.getAll();
  if (!all || all.length === 0) return '暂无活动数据，无法评估风险。';
  var lines = ['⚠️ 活动风险', ''];
  all.forEach(function (a) {
    var r = riskEngine.assess(a, 0.3);
    lines.push(a.name + ' — ' + riskEmoji(r.riskLevel) + ' (评分：' + r.riskScore + ')');
  });
  return lines.join('\n');
}

function renderList() {
  var all = store.getAll();
  if (!all || all.length === 0) return '暂无活动数据。';
  var lines = ['📋 活动列表 (' + all.length + ')', ''];
  all.forEach(function (a) {
    lines.push('• ' + a.name + ' [' + a.type + '] ' + a.status + ' | ¥' + (a.subsidy || 0) + ' | ' + (a.startDate || 'N/A') + '~' + (a.endDate || 'N/A'));
  });
  return lines.join('\n');
}

module.exports = { renderRecommendations: renderRecommendations, renderEnrollmentPlan: renderEnrollmentPlan, renderStatus: renderStatus, renderProfits: renderProfits, renderRisks: renderRisks, renderList: renderList, riskEmoji: riskEmoji };
