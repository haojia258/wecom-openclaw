'use strict';

/**
 * strategy-planner.js — P13.3 Strategy Planner
 *
 * 自动经营规划引擎。
 * 基于 KPI 走势 + 预算分析，生成 7 天经营计划。
 *
 * REVIEW_ONLY — 计划仅供人工决策参考，不自动执行。
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

// ─── 7 天经营计划 ──────────────────────────────────────────

/**
 * 生成 7 天经营计划
 * @returns {object} { planId, days[], summary }
 */
function generate7DayPlan() {
  var kpiEngine = getSource('kpi', '../kpi-engine/kpi-engine');
  var budgetEngine = getSource('budget', '../budget-engine/budget-engine');
  var trendAnalyzer = getSource('trend', '../kpi-engine/trend-analyzer');

  // 获取基础数据
  var kpi = null;
  try { if (kpiEngine) kpi = kpiEngine.getKPISnapshot(); } catch (_) {}
  var budget = null;
  try { if (budgetEngine) budget = budgetEngine.getBudgetRecommendations(); } catch (_) {}
  var trend = null;
  try { if (trendAnalyzer) trend = trendAnalyzer.getWeeklyTrend(); } catch (_) {}

  var planId = 'plan-' + crypto.randomBytes(4).toString('hex');
  var days = [];
  var now = new Date();

  // 未来 7 天核心策略
  var strategies = deriveStrategies(kpi, budget, trend);

  for (var i = 0; i < 7; i++) {
    var date = new Date(now);
    date.setDate(date.getDate() + i + 1);
    var dayLabel = getDayLabel(date);
    var isWeekend = date.getDay() === 0 || date.getDay() === 6;

    var dayPlan = {
      day: i + 1,
      date: date.toISOString().split('T')[0],
      label: dayLabel,
      isWeekend: isWeekend,
      campaign: buildCampaignPlan(strategies, i, isWeekend),
      ads: buildAdsPlan(strategies, i, isWeekend, budget),
      video: buildVideoPlan(strategies, i),
      inventory: buildInventoryPlan(kpi, i),
      budget_allocation: buildBudgetAllocation(budget, i, isWeekend),
    };

    days.push(dayPlan);
  }

  return {
    planId: planId,
    title: '7天经营计划 — ' + formatDate(now),
    generatedAt: new Date().toISOString(),
    strategies: strategies,
    days: days,
    summary: buildPlanSummary(strategies, budget, kpi),
    requiresHumanApproval: true,
  };
}

// ─── 策略推导 ──────────────────────────────────────────────

function deriveStrategies(kpi, budget, trend) {
  var strategies = [];

  // 增长策略
  var gmvTrend = (trend && trend.gmvTrend) || 'stable';
  if (gmvTrend === 'up') {
    strategies.push({ domain: 'growth', action: '加速', detail: 'GMV 处于上升趋势，建议加大投流和活动力度', priority: 'high' });
  } else if (gmvTrend === 'down') {
    strategies.push({ domain: 'growth', action: '优化', detail: 'GMV 下滑，建议检查转化率和退款率，优化素材', priority: 'high' });
  } else {
    strategies.push({ domain: 'growth', action: '稳定', detail: 'GMV 平稳，保持节奏，测试新渠道', priority: 'normal' });
  }

  // 利润策略
  var profitMargin = (kpi && kpi.profitMargin) || 0.3;
  if (profitMargin > 0.35) {
    strategies.push({ domain: 'profit', action: '扩张', detail: '利润率 >35%，可适当让利抢量', priority: 'normal' });
  } else if (profitMargin < 0.20) {
    strategies.push({ domain: 'profit', action: '收紧', detail: '利润率 <20%，优先优化成本结构', priority: 'high' });
  } else {
    strategies.push({ domain: 'profit', action: '维持', detail: '利润率适中，控本增效同步推进', priority: 'normal' });
  }

  // 风险策略
  var refundRate = (kpi && kpi.refundRate) || 0.03;
  if (refundRate > 0.05) {
    strategies.push({ domain: 'risk', action: '预警', detail: '退款率 >5%，排查产品质量与售后', priority: 'high' });
  } else {
    strategies.push({ domain: 'risk', action: '监控', detail: '退款率正常，持续监控', priority: 'low' });
  }

  // 预算策略
  var budgetScore = (budget && budget.analysis && budget.analysis.score) || 70;
  if (budgetScore > 80) {
    strategies.push({ domain: 'budget', action: '平衡', detail: '预算健康，可以按计划执行', priority: 'normal' });
  } else if (budgetScore > 60) {
    strategies.push({ domain: 'budget', action: '谨慎', detail: '预算偏紧，建议控制非核心支出', priority: 'normal' });
  } else {
    strategies.push({ domain: 'budget', action: '收缩', detail: '预算紧张，暂停低效渠道', priority: 'high' });
  }

  return strategies;
}

// ─── 活动计划 ──────────────────────────────────────────────

function buildCampaignPlan(strategies, dayIndex, isWeekend) {
  var plan = { actions: [] };

  if (isWeekend) {
    plan.actions.push({ type: 'campaign', action: '冲刺转化', detail: '周末用户活跃，适合促销活动', intensity: 'high' });
    plan.actions.push({ type: 'livestream', action: '安排直播', detail: '周末晚间直播效果最佳', intensity: 'medium' });
  } else {
    if (dayIndex <= 1) {
      plan.actions.push({ type: 'campaign', action: '活动预热', detail: '发布预告内容，测试素材', intensity: 'medium' });
    } else if (dayIndex >= 4) {
      plan.actions.push({ type: 'campaign', action: '数据复盘', detail: '回顾前半周数据，调整后半周策略', intensity: 'low' });
    } else {
      plan.actions.push({ type: 'campaign', action: '日常运营', detail: '保持活动节奏，监控转化率', intensity: 'normal' });
    }
  }

  return plan;
}

// ─── 投流计划 ──────────────────────────────────────────────

function buildAdsPlan(strategies, dayIndex, isWeekend, budget) {
  var dailyBudget = 800;

  // 从预算引擎获取建议
  if (budget && budget.recommendations) {
    var adsRec = budget.recommendations.find(function (r) { return r.category === 'ads'; });
    if (adsRec && adsRec.action === 'increase') dailyBudget = 960;
    else if (adsRec && adsRec.action === 'reduce') dailyBudget = 560;
  }

  // 周末系数
  if (isWeekend) dailyBudget = Math.round(dailyBudget * 1.2);

  return {
    dailyBudget: dailyBudget,
    platforms: ['douyin', 'kuaishou'],
    bidding: isWeekend ? 'aggressive' : 'standard',
    creativeRefresh: dayIndex % 2 === 0, // 隔天换素材
  };
}

// ─── 视频计划 ──────────────────────────────────────────────

function buildVideoPlan(strategies, dayIndex) {
  var templates = ['极速冲泡', '食材卖点', '场景剧情', '花式吃法', '带货转化'];
  var template = templates[dayIndex % templates.length];

  var isReviewDay = dayIndex === 3 || dayIndex === 6;

  return {
    count: 5,
    template: template,
    publishSlots: ['08:00', '12:00', '17:30', '20:00', '22:00'],
    reviewDay: isReviewDay,
  };
}

// ─── 库存计划 ──────────────────────────────────────────────

function buildInventoryPlan(kpi, dayIndex) {
  var skus = [
    { sku: '6桶装', role: '引流款', stock: 200, reorderPoint: 30, status: 'safe' },
    { sku: '12桶装', role: '主力款', stock: 150, reorderPoint: 25, status: 'safe' },
    { sku: '18桶装', role: 'GMV款', stock: 80, reorderPoint: 15, status: 'safe' },
  ];

  // 模拟库存消耗
  skus.forEach(function (s) {
    s.stock = Math.max(0, s.stock - dayIndex * 8);
    if (s.stock < s.reorderPoint) s.status = 'warning';
    if (s.stock < s.reorderPoint / 2) s.status = 'critical';
  });

  return {
    alert: skus.some(function (s) { return s.status !== 'safe'; }),
    items: skus,
  };
}

// ─── 预算分配 ──────────────────────────────────────────────

function buildBudgetAllocation(budget, dayIndex, isWeekend) {
  var analysis = (budget && budget.analysis) || { totalRemaining: 20000 };
  var daysLeft = Math.max(1, 7 - dayIndex);
  var daily = Math.round(analysis.totalRemaining / daysLeft);

  return {
    dailyTotal: daily,
    ads: Math.round(daily * 0.5),
    campaign: Math.round(daily * 0.2),
    ai: Math.round(daily * 0.15),
    other: Math.round(daily * 0.15),
  };
}

// ─── 计划摘要 ──────────────────────────────────────────────

function buildPlanSummary(strategies, budget, kpi) {
  var highPriority = strategies.filter(function (s) { return s.priority === 'high'; });

  return {
    totalStrategies: strategies.length,
    highPriorityActions: highPriority.map(function (s) { return s.domain + ': ' + s.action; }),
    total7DayBudget: (budget && budget.analysis && budget.analysis.totalRemaining) || 20000,
    riskLevel: highPriority.length >= 3 ? 'high' : highPriority.length >= 1 ? 'medium' : 'low',
  };
}

// ─── 工具函数 ──────────────────────────────────────────────

function getDayLabel(date) {
  var days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var m = date.getMonth() + 1;
  var d = date.getDate();
  return m + '/' + d + ' ' + days[date.getDay()];
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  generate7DayPlan: generate7DayPlan,
  deriveStrategies: deriveStrategies,
  buildCampaignPlan: buildCampaignPlan,
  buildAdsPlan: buildAdsPlan,
  buildVideoPlan: buildVideoPlan,
  buildInventoryPlan: buildInventoryPlan,
};
