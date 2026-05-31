'use strict';

/**
 * budget-engine.js — P13.2 Budget Engine
 *
 * 预算分配中心。
 * 基于 KPI 数据、GMV/利润/ROI 走势，生成预算建议。
 *
 * REVIEW_ONLY — 只读分析，不执行预算变更。
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

// ─── 预算快照 ──────────────────────────────────────────────

/**
 * 获取当前预算状态
 * @returns {object} { total, items, remaining, spent }
 */
function getBudgetSnapshot() {
  var budgetStore = getSource('budget', '../../budget-engine/budget-store');
  var kpiEngine = getSource('kpi', '../kpi-engine/kpi-engine');

  // 默认预算（兜底数据）
  var defaults = {
    total: 30000,
    items: [
      { category: 'ads',       label: '投流预算',    amount: 12000, spent: 3500,  owner: 'CMO' },
      { category: 'campaign',  label: '活动预算',    amount: 5000,  spent: 800,   owner: 'CMO' },
      { category: 'ai',        label: 'AI 消耗',     amount: 5000,  spent: 1200,  owner: 'CTO' },
      { category: 'server',    label: '服务器',      amount: 3000,  spent: 2900,  owner: 'CTO' },
      { category: 'tools',     label: '工具订阅',    amount: 2000,  spent: 1800,  owner: 'CTO' },
      { category: 'reserve',   label: '储备金',      amount: 3000,  spent: 0,     owner: 'CEO' },
    ],
    remaining: 30000 - (3500 + 800 + 1200 + 2900 + 1800),
    spent: 3500 + 800 + 1200 + 2900 + 1800,
  };

  // 尝试从真实数据源加载
  if (budgetStore && typeof budgetStore.getAll === 'function') {
    try {
      var all = budgetStore.getAll();
      if (all && all.length > 0) {
        var total = all.reduce(function (sum, i) { return sum + (i.amount || 0); }, 0);
        var spent = all.reduce(function (sum, i) { return sum + (i.spent || 0); }, 0);
        return {
          total: total,
          items: all.map(function (i) { return { category: i.category || i.id, label: i.label || i.name, amount: i.amount, spent: i.spent || 0, owner: i.owner || 'CFO' }; }),
          remaining: total - spent,
          spent: spent,
        };
      }
    } catch (_) { /* fallback to defaults */ }
  }

  return defaults;
}

// ─── 预算分析 ──────────────────────────────────────────────

/**
 * 分析预算健康度
 * @param {object} snapshot - getBudgetSnapshot() 返回值
 * @returns {object} { score, status, alerts, items[] }
 */
function analyzeBudget(snapshot) {
  snapshot = snapshot || getBudgetSnapshot();
  var total = snapshot.total || 30000;
  var spent = snapshot.spent || 0;
  var remaining = snapshot.remaining || (total - spent);
  var spendRate = total > 0 ? spent / total : 0;

  var alerts = [];
  var itemAnalysis = [];
  var score = 100;

  // 总体使用率检查
  if (spendRate > 0.95) {
    alerts.push({ level: 'critical', message: '预算使用率 ' + (spendRate * 100).toFixed(1) + '% — 超支风险' });
    score -= 30;
  } else if (spendRate > 0.80) {
    alerts.push({ level: 'warning', message: '预算使用率 ' + (spendRate * 100).toFixed(1) + '% — 接近上限' });
    score -= 15;
  } else if (spendRate < 0.20) {
    alerts.push({ level: 'info', message: '预算使用率 ' + (spendRate * 100).toFixed(1) + '% — 投放不足' });
    score -= 5;
  }

  // 逐项分析
  var items = snapshot.items || [];
  items.forEach(function (item) {
    var itemRate = item.amount > 0 ? (item.spent || 0) / item.amount : 0;
    var status = 'normal';

    if (itemRate > 0.95) status = 'exhausted';
    else if (itemRate > 0.80) status = 'high';
    else if (itemRate < 0.10) status = 'idle';

    var roi = null;
    if (item.category === 'ads' && item.spent > 0) {
      roi = 1.8; // 默认投流 ROI（实际应从数据源获取）
    }

    itemAnalysis.push({
      category: item.category,
      label: item.label,
      amount: item.amount,
      spent: item.spent || 0,
      remaining: item.amount - (item.spent || 0),
      spendRate: itemRate,
      status: status,
      roi: roi,
      owner: item.owner || 'CFO',
    });

    if (status === 'exhausted') score -= 10;
    else if (status === 'high') score -= 5;
  });

  var statusLabel = score >= 80 ? 'healthy' : score >= 60 ? 'caution' : score >= 40 ? 'warning' : 'critical';

  return {
    score: Math.max(0, score),
    status: statusLabel,
    totalBudget: total,
    totalSpent: spent,
    totalRemaining: remaining,
    spendRate: spendRate,
    monthProgress: estimateMonthProgress(),
    alerts: alerts,
    items: itemAnalysis,
    generatedAt: new Date().toISOString(),
  };
}

function estimateMonthProgress() {
  var now = new Date();
  var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() / daysInMonth;
}

// ─── 预算建议 ──────────────────────────────────────────────

/**
 * 基于 KPI 表现生成预算调整建议
 * @returns {object} { recommendations[], summary }
 */
function getBudgetRecommendations() {
  var snapshot = getBudgetSnapshot();
  var analysis = analyzeBudget(snapshot);
  var kpiEngine = getSource('kpi', '../kpi-engine/kpi-engine');
  var kpi = null;
  try { if (kpiEngine) kpi = kpiEngine.getKPISnapshot(); } catch (_) {}

  var recommendations = [];
  var items = analysis.items || [];

  // 投流预算建议
  var adsItem = items.find(function (i) { return i.category === 'ads'; });
  if (adsItem) {
    var adsROI = (kpi && kpi.roi) || adsItem.roi || 1.8;
    if (adsROI >= 2.5 && adsItem.spendRate > 0.7) {
      recommendations.push({
        category: 'ads',
        action: 'increase',
        amount: Math.round(adsItem.amount * 0.2),
        reason: 'ROI=' + adsROI.toFixed(2) + ' ≥ 2.5，建议增加投流预算 20%',
        priority: 'high',
      });
    } else if (adsROI < 1.5 && adsItem.spendRate > 0.5) {
      recommendations.push({
        category: 'ads',
        action: 'reduce',
        amount: Math.round(adsItem.amount * 0.3),
        reason: 'ROI=' + adsROI.toFixed(2) + ' < 1.5，建议减少投流预算 30%',
        priority: 'high',
      });
    } else if (adsROI >= 1.8 && adsROI < 2.5) {
      recommendations.push({
        category: 'ads',
        action: 'maintain',
        amount: 0,
        reason: 'ROI=' + adsROI.toFixed(2) + ' 在 1.8~2.5 区间，建议维持当前投流',
        priority: 'normal',
      });
    }
  }

  // 活动预算建议
  var campaignItem = items.find(function (i) { return i.category === 'campaign'; });
  if (campaignItem) {
    var profitMargin = (kpi && kpi.profitMargin) || 0.3;
    if (profitMargin > 0.35 && campaignItem.spendRate < 0.6) {
      recommendations.push({
        category: 'campaign',
        action: 'increase',
        amount: Math.round(campaignItem.amount * 0.15),
        reason: '利润率 ' + (profitMargin * 100).toFixed(1) + '% > 35%，利润空间好，建议加码活动',
        priority: 'normal',
      });
    } else if (profitMargin < 0.20) {
      recommendations.push({
        category: 'campaign',
        action: 'reduce',
        amount: Math.round(campaignItem.amount * 0.25),
        reason: '利润率 ' + (profitMargin * 100).toFixed(1) + '% < 20%，建议收紧活动预算',
        priority: 'high',
      });
    }
  }

  // AI 消耗建议
  var aiItem = items.find(function (i) { return i.category === 'ai'; });
  if (aiItem && aiItem.spendRate > 0.85) {
    recommendations.push({
      category: 'ai',
      action: 'increase',
      amount: Math.round(aiItem.amount * 0.1),
      reason: 'AI 消耗已用 ' + (aiItem.spendRate * 100).toFixed(0) + '%，建议预留 10% 余量',
      priority: 'normal',
    });
  }

  // 储备金
  var reserveItem = items.find(function (i) { return i.category === 'reserve'; });
  if (analysis.spendRate > 0.85 && reserveItem) {
    recommendations.push({
      category: 'reserve',
      action: 'review',
      amount: 0,
      reason: '总预算使用率 ' + (analysis.spendRate * 100).toFixed(1) + '% > 85%，建议审查储备金动用方案',
      priority: 'high',
    });
  }

  var summary = {
    totalRecommendations: recommendations.length,
    totalIncrease: recommendations.filter(function (r) { return r.action === 'increase'; }).reduce(function (s, r) { return s + r.amount; }, 0),
    totalReduce: recommendations.filter(function (r) { return r.action === 'reduce'; }).reduce(function (s, r) { return s + r.amount; }, 0),
    highPriority: recommendations.filter(function (r) { return r.priority === 'high'; }).length,
  };

  return {
    snapshot: snapshot,
    analysis: analysis,
    recommendations: recommendations,
    summary: summary,
    requiresHumanApproval: recommendations.filter(function (r) { return r.action !== 'maintain'; }).length > 0,
  };
}

// ─── 预算分配计划 ──────────────────────────────────────────

/**
 * 生成 7 天预算分配计划
 * @returns {object} { campaigns, ads, videos, reserve }
 */
function generateBudgetPlan() {
  var budget = getBudgetRecommendations();
  var analysis = budget.analysis;
  var remaining = analysis.totalRemaining;
  var daysLeft = Math.max(1, estimateMonthDaysLeft());

  return {
    dailyBudget: Math.round(remaining / daysLeft),
    daysLeft: daysLeft,
    remaining: remaining,
    allocation: (analysis.items || []).map(function (i) { return { category: i.category, label: i.label, daily: Math.round((i.remaining || 0) / daysLeft), remaining: i.remaining, status: i.status }; }),
    summary: '剩余 ¥' + remaining.toFixed(0) + ' / ' + daysLeft + ' 天 = 日均 ¥' + Math.round(remaining / daysLeft),
    generatedAt: new Date().toISOString(),
  };
}

function estimateMonthDaysLeft() {
  var now = new Date();
  var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}

// ─── 输出 ──────────────────────────────────────────────────

module.exports = {
  getBudgetSnapshot: getBudgetSnapshot,
  analyzeBudget: analyzeBudget,
  getBudgetRecommendations: getBudgetRecommendations,
  generateBudgetPlan: generateBudgetPlan,
};
