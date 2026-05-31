'use strict';

/**
 * long-term-memory.js — P13.5 Long-term Memory Engine
 *
 * 经营长期记忆。
 * 从 KPI/Budget/Strategy/Board 引擎获取快照，
 * 写入 JSONL 持久化存储，支持多时间窗口查询。
 *
 * REVIEW_ONLY — 只读记录和查询，不执行写操作。
 */

var memoryStore = require('./memory-store');
var crypto = require('crypto');

// ─── 数据源（延迟加载）──────────────────────────────────────

var _sources = {};

function getSource(name, modulePath) {
  if (!_sources[name]) {
    try { _sources[name] = require(modulePath); } catch (_) { _sources[name] = null; }
  }
  return _sources[name];
}

// ─── 快照存档 ──────────────────────────────────────────────

/**
 * 存档所有类型快照
 * @returns {object} { kpi, budget, strategy, board, archivedAt }
 */
function archiveAll() {
  var results = {};

  // KPI
  var kpiEngine = getSource('kpi', '../kpi-engine/kpi-engine');
  if (kpiEngine) {
    try {
      var kpi = kpiEngine.getKPISnapshot();
      results.kpi = memoryStore.append('kpi', kpi);
    } catch (_) { results.kpi = null; }
  }

  // Budget
  var budgetEngine = getSource('budget', '../budget-engine/budget-engine');
  if (budgetEngine) {
    try {
      var budget = budgetEngine.analyzeBudget();
      results.budget = memoryStore.append('budget', {
        score: budget.score,
        status: budget.status,
        spendRate: budget.spendRate,
        totalBudget: budget.totalBudget,
        totalSpent: budget.totalSpent,
        totalRemaining: budget.totalRemaining,
      });
    } catch (_) { results.budget = null; }
  }

  // Strategy
  var planner = getSource('planner', '../strategy-planner/strategy-planner');
  if (planner) {
    try {
      var plan = planner.generate7DayPlan();
      results.strategy = memoryStore.append('strategy', {
        planId: plan.planId,
        riskLevel: plan.summary.riskLevel,
        highPriorityActions: plan.summary.highPriorityActions,
        total7DayBudget: plan.summary.total7DayBudget,
      });
    } catch (_) { results.strategy = null; }
  }

  // Board
  var board = getSource('board', '../autonomous-board/autonomous-board');
  if (board) {
    try {
      var meeting = board.conveneBoardMeeting();
      results.board = memoryStore.append('board', {
        meetingId: meeting.meetingId,
        decision: meeting.verdict.decision,
        risk: meeting.verdict.risk,
        score: meeting.scorecard.overall.score,
        grade: meeting.scorecard.overall.grade,
        summary: meeting.verdict.summary,
      });
    } catch (_) { results.board = null; }
  }

  results.archivedAt = new Date().toISOString();
  return results;
}

// ─── 历史查询 ──────────────────────────────────────────────

/**
 * 获取指定类型的历史趋势
 * @param {string} type
 * @param {number} days
 * @returns {object} { records[], trend, summary }
 */
function getHistory(type, days) {
  var records = memoryStore.query(type, days || 30);

  // 趋势分析
  var trend = 'stable';
  if (records.length >= 3) {
    var first = _extractMetric(records[records.length - 1], type);
    var last = _extractMetric(records[0], type);
    if (first > 0 && last > 0) {
      var change = (last - first) / first;
      if (change > 0.1) trend = 'up';
      else if (change < -0.1) trend = 'down';
    }
  }

  return {
    type: type,
    period: days + '天',
    count: records.length,
    trend: trend,
    latest: records.length > 0 ? records[0] : null,
    records: records,
    summary: _buildSummary(records, type, days),
  };
}

function _extractMetric(record, type) {
  if (!record || !record.data) return 0;
  var d = record.data;
  switch (type) {
    case 'kpi': return d.gmv || 0;
    case 'budget': return d.score || 0;
    case 'strategy': return d.total7DayBudget || 0;
    case 'board': return d.score || 0;
    default: return 0;
  }
}

function _buildSummary(records, type, days) {
  if (records.length === 0) return type + '暂无历史数据';
  var latest = records[0];
  switch (type) {
    case 'kpi': return '最近' + days + '天共 ' + records.length + ' 条KPI快照，最新: GMV ¥' + ((latest.data.gmv || 0).toLocaleString());
    case 'budget': return '最近' + days + '天共 ' + records.length + ' 条预算快照，最新评分: ' + (latest.data.score || 'N/A') + '/100';
    case 'strategy': return '最近' + days + '天共 ' + records.length + ' 条策略快照，最新: ' + (latest.data.planId || 'N/A');
    case 'board': return '最近' + days + '天共 ' + records.length + ' 次董事会，最新决议: ' + (latest.data.decision || 'N/A');
    default: return records.length + ' records';
  }
}

// ─── 对比分析 ──────────────────────────────────────────────

/**
 * 对比两个时间段的经营数据
 * @param {number} recentDays - 近期天数 (默认 7)
 * @param {number} baseDays - 基期天数 (默认 30)
 * @returns {object} { kpi, budget, board }
 */
function comparePeriods(recentDays, baseDays) {
  recentDays = recentDays || 7;
  baseDays = baseDays || 30;

  var recent = memoryStore.queryAll(recentDays);
  var base = memoryStore.queryAll(baseDays);

  return {
    period: recentDays + 'd vs ' + baseDays + 'd',
    kpi: compareAvg(recent.kpi, base.kpi, 'gmv'),
    budget: compareAvg(recent.budget, base.budget, 'score'),
    board: compareAvg(recent.board, base.board, 'score'),
  };
}

function compareAvg(recent, base, field) {
  var recentAvg = avg(recent, field);
  var baseAvg = avg(base, field);
  var change = baseAvg > 0 ? ((recentAvg - baseAvg) / baseAvg * 100).toFixed(1) : 'N/A';
  return {
    recent: recentAvg,
    base: baseAvg,
    changePct: change,
    direction: recentAvg > baseAvg ? 'up' : recentAvg < baseAvg ? 'down' : 'stable',
  };
}

function avg(records, field) {
  if (records.length === 0) return 0;
  var sum = records.reduce(function (s, r) { return s + (_extractMetric(r, '')); }, 0);

  // For custom field extraction
  if (field && field !== '') {
    var values = records.map(function (r) { return (r.data && r.data[field]) || 0; });
    return Math.round(values.reduce(function (a, b) { return a + b; }, 0) / values.length);
  }

  return Math.round(sum / records.length);
}

// ─── 存储统计 ──────────────────────────────────────────────

function getMemoryStats(days) {
  return memoryStore.stats(days || 90);
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  archiveAll: archiveAll,
  getHistory: getHistory,
  comparePeriods: comparePeriods,
  getMemoryStats: getMemoryStats,
  STORE_DIR: memoryStore.STORE_DIR,
};
