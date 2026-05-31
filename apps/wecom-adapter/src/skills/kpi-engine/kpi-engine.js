'use strict';

/**
 * kpi-engine.js — P13.1 KPI Engine
 *
 * 统一运营指标中心。
 * 从 KPI Store、Mission Generator、Approval Center 等模块聚合数据。
 *
 * REVIEW_ONLY — 只读展示，不执行写操作。
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

// ─── KPI 快照 ──────────────────────────────────────────────

function getKPISnapshot() {
  var kpiStore = getSource('kpi', '../../kpi-engine/kpi-store');
  var missionGen = getSource('mission', '../../mission-generator/mission-generator');
  var approvalStore = getSource('approval', '../../approval-center/approval-store');

  // KPI 目标
  var targets = [];
  if (kpiStore && kpiStore.listTargets) {
    try { var r = kpiStore.listTargets(); if (r.success) targets = r.targets; } catch (_) {}
  }

  // 如果无数据，使用 mock
  if (targets.length === 0) {
    targets = [
      { id: 'k1', type: 'gmv', target: 80000, unit: 'CNY/月' },
      { id: 'k2', type: 'profit', target: 24000, unit: 'CNY/月' },
      { id: 'k3', type: 'roi', target: 2.5, unit: '' },
      { id: 'k4', type: 'refund_rate', target: 3, unit: '%' },
      { id: 'k5', type: 'task_success_rate', target: 95, unit: '%' },
      { id: 'k6', type: 'agent_success_rate', target: 98, unit: '%' },
    ];
  }

  // 当前测量值 (mock)
  var currentValues = {
    gmv: 48200, profit: 12300, roi: 2.1, refund_rate: 4.2,
    task_success_rate: 92, agent_success_rate: 96, ctr: 2.8, cvr: 4.5,
    campaign_gain: 3200, inventory_risk: 2
  };

  // 增长率 (周环比)
  var growthRates = {
    gmv: 8.5, profit: 5.2, roi: 3.1, refund_rate: -1.2,
    task_success_rate: 2.3, agent_success_rate: 1.8
  };

  // 风险评分
  var riskScore = 25; // 0-100, lower is better
  var riskLevel = riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : 'high';

  // 趋势评分
  var trendScore = 72; // 0-100
  var trendDirection = trendScore > 60 ? 'up' : trendScore > 40 ? 'stable' : 'down';

  // 审批统计
  var approvalStats = { pending: 1, approved: 2, rejected: 0 };
  if (approvalStore && approvalStore.generateReport) {
    try {
      var ar = approvalStore.generateReport();
      if (ar.success && ar.report) {
        approvalStats = { pending: ar.report.pending || 0, approved: ar.report.approved || 0, rejected: ar.report.rejected || 0 };
      }
    } catch (_) {}
  }

  return {
    generated_at: new Date().toISOString(),
    targets: targets,
    current: currentValues,
    growth: growthRates,
    risk: { score: riskScore, level: riskLevel },
    trend: { score: trendScore, direction: trendDirection },
    approval: approvalStats,
    id: 'kpi_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex'),
  };
}

// ─── 格式化 ────────────────────────────────────────────────

function formatKPIDaily(snapshot) {
  var c = snapshot.current;
  var t = snapshot.targets;
  var g = snapshot.growth;

  var goalMap = {};
  t.forEach(function (item) { goalMap[item.type] = item.target; });

  var growthIcon = function (val) {
    if (val > 5) return '📈';
    if (val > 0) return '📊';
    if (val < 0) return '📉';
    return '➡️';
  };

  var achievement = function (current, target) {
    if (!target || target === 0) return 'N/A';
    var pct = Math.round((current / target) * 100);
    if (pct >= 100) return '🟢 ' + pct + '%';
    if (pct >= 60) return '🟡 ' + pct + '%';
    return '🔴 ' + pct + '%';
  };

  var lines = [];
  lines.push('# 📊 今日 KPI 仪表板');
  lines.push('');
  lines.push('> 生成时间: ' + snapshot.generated_at);
  lines.push('> 快照 ID: `' + snapshot.id + '`');
  lines.push('');

  // 核心指标
  lines.push('## 💰 核心指标');
  lines.push('');
  lines.push('| 指标 | 当前值 | 目标 | 达成率 | 周趋势 |');
  lines.push('|------|--------|------|--------|--------|');

  var rows = [
    { label: 'GMV', key: 'gmv', unit: '¥', fmt: function (v) { return v >= 10000 ? '¥' + (v / 10000).toFixed(1) + '万' : '¥' + v; } },
    { label: '利润', key: 'profit', unit: '¥', fmt: function (v) { return v >= 10000 ? '¥' + (v / 10000).toFixed(1) + '万' : '¥' + v; } },
    { label: 'ROI', key: 'roi', unit: '', fmt: function (v) { return v.toFixed(2); } },
    { label: '退款率', key: 'refund_rate', unit: '%', fmt: function (v) { return v.toFixed(1) + '%'; } },
    { label: '任务成功率', key: 'task_success_rate', unit: '%', fmt: function (v) { return v + '%'; } },
    { label: 'Agent成功率', key: 'agent_success_rate', unit: '%', fmt: function (v) { return v + '%'; } },
  ];

  rows.forEach(function (row) {
    var val = c[row.key] || 0;
    var goal = goalMap[row.key];
    var achieve = achievement(val, goal);
    var grow = g[row.key] !== undefined ? g[row.key] : 0;
    lines.push('| ' + row.label + ' | **' + row.fmt(val) + '** | ' + (goal ? row.fmt(goal) : 'N/A') + ' | ' + achieve + ' | ' + growthIcon(grow) + ' ' + (grow > 0 ? '+' : '') + grow + '% |');
  });

  lines.push('');
  lines.push('> 活动增量收益: **+¥' + ((c.campaign_gain || 0) / 10000).toFixed(1) + '万** | 库存风险: **' + (c.inventory_risk || 0) + '** 项');
  lines.push('');

  // 风险与趋势
  lines.push('## 🔍 风险与趋势');
  lines.push('');
  lines.push('| 指标 | 评分 | 等级 |');
  lines.push('|------|------|------|');
  lines.push('| 风险评分 | **' + snapshot.risk.score + '/100** | ' + snapshot.risk.level + ' |');
  lines.push('| 趋势评分 | **' + snapshot.trend.score + '/100** | ' + snapshot.trend.direction + ' |');
  lines.push('');

  // 审批摘要
  lines.push('## ⏸️ 审批中心');
  lines.push('');
  lines.push('| 状态 | 数量 |');
  lines.push('|------|------|');
  lines.push('| 待审批 | **' + snapshot.approval.pending + '** |');
  lines.push('| 已通过 | **' + snapshot.approval.approved + '** |');
  lines.push('| 已拒绝 | **' + snapshot.approval.rejected + '** |');
  lines.push('');

  lines.push('---');
  lines.push('> 🔒 REVIEW_ONLY — P13.1 KPI Engine v1');
  lines.push('> 使用 /周报 查看周度趋势 | /月报 查看月度汇总');

  return lines.join('\n');
}

// ─── 公共 API ──────────────────────────────────────────────

function generateDailyReport() {
  var snapshot = getKPISnapshot();
  return formatKPIDaily(snapshot);
}

function getSnapshot() {
  return getKPISnapshot();
}

module.exports = {
  generateDailyReport: generateDailyReport,
  getSnapshot: getSnapshot,
  _getKPISnapshot: getKPISnapshot,
  _formatKPIDaily: formatKPIDaily,
};
