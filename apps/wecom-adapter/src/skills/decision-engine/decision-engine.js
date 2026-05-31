'use strict';

/**
 * decision-engine.js — P14.1 Unified Decision Engine
 *
 * 统一决策引擎。
 * 从 KPI / Budget / Strategy / Board / Memory 聚合数据，
 * 生成结构化决策对象。
 *
 * REVIEW_ONLY — 决策建议仅供人工审核，不自动执行。
 */

var crypto = require('crypto');

// ─── 数据源（延迟加载）──────────────────────────────────────

var _sources = {};

function getSource(name, modulePath) {
  if (!_sources[name]) {
    try { _sources[name] = require(modulePath); } catch (_) { _sources[name] = null; }
  }
  return _sources[name];
}

// ─── 决策生成 ──────────────────────────────────────────────

/**
 * 执行决策分析，生成决策建议列表
 * @returns {object} { decisionId, decisions[], summary, context }
 */
function analyze() {
  var kpiEngine = getSource('kpi', '../kpi-engine/kpi-engine');
  var budgetEngine = getSource('budget', '../budget-engine/budget-engine');
  var planner = getSource('planner', '../strategy-planner/strategy-planner');
  var board = getSource('board', '../autonomous-board/autonomous-board');

  var kpi = null;
  try { if (kpiEngine) kpi = kpiEngine.getKPISnapshot(); } catch (_) {}
  var budget = null;
  try { if (budgetEngine) budget = budgetEngine.getBudgetRecommendations(); } catch (_) {}
  var plan = null;
  try { if (planner) plan = planner.generate7DayPlan(); } catch (_) {}
  var meeting = null;
  try { if (board) meeting = board.conveneBoardMeeting(); } catch (_) {}

  var context = {
    kpi: kpi || { gmv: 48000, profit: 14400, profitMargin: 0.30, roi: 2.2, refundRate: 0.03, missionSuccessRate: 0.92 },
    budget: (budget && budget.analysis) || { score: 70, status: 'caution', totalRemaining: 20000, totalBudget: 30000 },
    strategy: (plan && plan.summary) || { riskLevel: 'medium', highPriorityActions: [] },
    board: (meeting && meeting.verdict) || { decision: 'review', risk: 'medium', summary: '待审议' },
  };

  var decisions = generateDecisions(context);

  return {
    decisionId: 'dec-' + crypto.randomBytes(4).toString('hex'),
    generatedAt: new Date().toISOString(),
    context: _summarizeContext(context),
    decisions: decisions,
    summary: _summarizeDecisions(decisions),
  };
}

// ─── 决策生成逻辑 ──────────────────────────────────────────

function generateDecisions(ctx) {
  var decisions = [];

  // 1. 投流决策 (基于 KPI ROI + 预算)
  if (ctx.kpi.roi >= 2.5) {
    decisions.push(_makeDecision('scale_ads', '加大投流', 'high', 92,
      ctx.kpi.roi >= 2.5 ? 'low' : 'medium',
      'ROI=' + ctx.kpi.roi.toFixed(2) + ' ≥ 2.5，建议增加投流预算 20%'));
  } else if (ctx.kpi.roi < 1.5) {
    decisions.push(_makeDecision('reduce_ads', '减少投流', 'high', 88,
      'low',
      'ROI=' + ctx.kpi.roi.toFixed(2) + ' < 1.5，建议暂停低效计划并优化素材'));
  } else {
    decisions.push(_makeDecision('maintain_ads', '维持投流', 'normal', 75,
      'low',
      'ROI=' + ctx.kpi.roi.toFixed(2) + ' 在 1.5-2.5 区间，建议保持节奏并优化素材'));
  }

  // 2. 活动决策 (基于利润率 + 预算)
  if (ctx.kpi.profitMargin > 0.35 && ctx.budget.totalRemaining > ctx.budget.totalBudget * 0.3) {
    decisions.push(_makeDecision('launch_campaign', '启动促销活动', 'high', 85,
      'low',
      '利润率 ' + (ctx.kpi.profitMargin * 100).toFixed(1) + '% > 35% 且预算充足，建议安排周末活动'));
  } else if (ctx.kpi.profitMargin < 0.20) {
    decisions.push(_makeDecision('pause_campaign', '暂停新活动', 'high', 90,
      'low',
      '利润率 ' + (ctx.kpi.profitMargin * 100).toFixed(1) + '% < 20%，建议暂停新活动报名'));
  } else {
    decisions.push(_makeDecision('selective_campaign', '选择性参加活动', 'normal', 65,
      'medium',
      '利润率适中，建议只参加 ROI 预期 > 2.0 的活动'));
  }

  // 3. 视频决策 (基于 GMV 趋势 + 策略)
  if (ctx.strategy.riskLevel === 'low') {
    decisions.push(_makeDecision('increase_videos', '增加视频产出到 8 条/天', 'normal', 72,
      'low',
      '经营风险低，可增加内容产出测试新模板'));
  } else if (ctx.strategy.riskLevel === 'high') {
    decisions.push(_makeDecision('optimize_videos', '优化视频质量', 'high', 83,
      'low',
      '经营风险高，建议集中资源优化现有模板而非增加数量'));
  } else {
    decisions.push(_makeDecision('maintain_videos', '保持 5 条/天', 'normal', 80,
      'low',
      '维持当前视频节奏，可按计划轮流使用 5 个模板'));
  }

  // 4. 预算决策 (基于预算评分)
  if (ctx.budget.score >= 80) {
    decisions.push(_makeDecision('expand_budget', '预算扩张', 'normal', 70,
      'low',
      '预算健康度 ' + ctx.budget.score + '/100，可考虑下周期适度增加预算'));
  } else if (ctx.budget.score < 50) {
    decisions.push(_makeDecision('tighten_budget', '预算收缩', 'high', 91,
      'low',
      '预算健康度 ' + ctx.budget.score + '/100，建议暂停低效渠道并收紧非核心支出'));
  } else {
    decisions.push(_makeDecision('balance_budget', '预算平衡', 'normal', 75,
      'medium',
      '预算健康度 ' + ctx.budget.score + '/100，保持当前分配'));
  }

  // 5. 库存决策 (基于退款率)
  if (ctx.kpi.refundRate > 0.05) {
    decisions.push(_makeDecision('reduce_inventory', '减少备货', 'high', 86,
      'medium',
      '退款率 ' + (ctx.kpi.refundRate * 100).toFixed(1) + '% > 5%，建议减少安全库存'));
  } else {
    decisions.push(_makeDecision('normal_inventory', '正常备货', 'normal', 70,
      'low',
      '退款率正常 ' + (ctx.kpi.refundRate * 100).toFixed(1) + '%，按正常节奏备货'));
  }

  // 6. 董事会跟进
  if (ctx.board.decision === 'review') {
    decisions.push(_makeDecision('board_followup', '董事会复审', 'normal', 60,
      'medium',
      '董事会上次决议为 review，建议调整后重新提交审议'));
  }

  return decisions;
}

function _makeDecision(id, action, priority, confidence, risk, reason) {
  return {
    id: id,
    action: action,
    priority: priority,       // high / normal / low
    confidence: confidence,   // 0-100
    risk: risk,              // low / medium / high
    reason: reason,
  };
}

// ─── 摘要 ──────────────────────────────────────────────────

function _summarizeContext(ctx) {
  return {
    kpi: 'GMV ¥' + (ctx.kpi.gmv || 0).toLocaleString() + ' | ROI ' + (ctx.kpi.roi || 0).toFixed(2) + ' | 利润率 ' + ((ctx.kpi.profitMargin || 0) * 100).toFixed(1) + '%',
    budget: '评分 ' + (ctx.budget.score || 0) + '/100 | 剩余 ¥' + (ctx.budget.totalRemaining || 0).toLocaleString(),
    strategy: '风险等级 ' + (ctx.strategy.riskLevel || 'N/A'),
    board: '决议 ' + (ctx.board.decision || 'N/A') + ' (' + (ctx.board.risk || 'N/A') + ')',
  };
}

function _summarizeDecisions(decisions) {
  var high = decisions.filter(function (d) { return d.priority === 'high'; });
  return {
    total: decisions.length,
    highPriority: high.length,
    highActions: high.map(function (d) { return d.action; }),
    avgConfidence: Math.round(decisions.reduce(function (s, d) { return s + d.confidence; }, 0) / decisions.length),
  };
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  analyze: analyze,
  generateDecisions: generateDecisions,
};
