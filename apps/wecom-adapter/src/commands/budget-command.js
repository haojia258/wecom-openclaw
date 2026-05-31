'use strict';

/**
 * budget-command.js — P13.2 Budget Engine Commands
 *
 * /预算     — 预算总览 + 健康度评分
 * /预算分析 — 逐项分析 + 风险告警
 * /预算建议 — ROI 驱动的预算调整建议
 */

var budgetEngine = require('../skills/budget-engine/budget-engine');

// ─── /预算 ─────────────────────────────────────────────────

function handleBudget() {
  var snapshot = budgetEngine.getBudgetSnapshot();
  var analysis = budgetEngine.analyzeBudget(snapshot);
  var plan = budgetEngine.generateBudgetPlan();

  var lines = [
    '💰 **预算总览 — ' + getMonthLabel() + '**',
    '',
    '| 指标 | 值 |',
    '|------|-----|',
    '| 总预算 | ¥' + snapshot.total.toLocaleString() + ' |',
    '| 已使用 | ¥' + snapshot.spent.toLocaleString() + ' (' + (analysis.spendRate * 100).toFixed(1) + '%) |',
    '| 剩余 | ¥' + analysis.totalRemaining.toLocaleString() + ' |',
    '| 健康度 | ' + getStatusEmoji(analysis.status) + ' ' + analysis.status + ' (' + analysis.score + '/100) |',
    '| 月进度 | ' + (analysis.monthProgress * 100).toFixed(0) + '% |',
    '',
    '**分项预算**:',
  ];

  (analysis.items || []).forEach(function (item) {
    var bar = progressBar(item.spendRate);
    var roiStr = item.roi ? ' ROI:' + item.roi.toFixed(2) : '';
    lines.push('- ' + getStatusEmoji(item.status) + ' **' + item.label + '**: ¥' + item.spent.toLocaleString() + '/' + item.amount.toLocaleString() + ' (' + (item.spendRate * 100).toFixed(0) + '%) ' + bar + roiStr);
  });

  lines.push('');
  lines.push('📅 ' + plan.summary);
  lines.push('');
  lines.push('💡 `/预算分析` 逐项分析 | `/预算建议` 调整建议');

  return lines.join('\n');
}

// ─── /预算分析 ─────────────────────────────────────────────

function handleBudgetAnalysis() {
  var snapshot = budgetEngine.getBudgetSnapshot();
  var analysis = budgetEngine.analyzeBudget(snapshot);

  var lines = [
    '📊 **预算分析报告 — ' + getMonthLabel() + '**',
    '',
    '**综合评分**: ' + getStatusEmoji(analysis.status) + ' ' + analysis.score + '/100 (' + analysis.status + ')',
    '',
    '**逐项诊断**:',
  ];

  (analysis.items || []).forEach(function (item) {
    lines.push('');
    lines.push('### ' + item.label + ' (' + item.owner + ')');
    lines.push('- 预算: ¥' + item.amount.toLocaleString());
    lines.push('- 已用: ¥' + (item.spent || 0).toLocaleString() + ' (' + (item.spendRate * 100).toFixed(1) + '%)');
    lines.push('- 剩余: ¥' + (item.remaining || 0).toLocaleString());

    var diagnosis = '';
    if (item.status === 'exhausted') diagnosis = '⚠️ 已接近耗尽，需立即补充或暂停支出';
    else if (item.status === 'high') diagnosis = '📌 使用率偏高，建议审查支出效率';
    else if (item.status === 'idle') diagnosis = '💤 使用率偏低，可考虑重新分配至高效渠道';
    else diagnosis = '✅ 使用率正常';

    lines.push('- 诊断: ' + diagnosis);

    if (item.roi) lines.push('- 预估 ROI: ' + item.roi.toFixed(2));

    var bar = progressBar(item.spendRate);
    lines.push('- ' + bar);
  });

  if (analysis.alerts && analysis.alerts.length > 0) {
    lines.push('');
    lines.push('**风险告警**:');
    analysis.alerts.forEach(function (a) {
      var icon = a.level === 'critical' ? '🔴' : a.level === 'warning' ? '🟡' : '🔵';
      lines.push('- ' + icon + ' ' + a.message);
    });
  }

  lines.push('');
  lines.push('💡 `/预算建议` 查看调整方案');

  return lines.join('\n');
}

// ─── /预算建议 ─────────────────────────────────────────────

function handleBudgetSuggestions() {
  var budget = budgetEngine.getBudgetRecommendations();
  var analysis = budget.analysis;

  var lines = [
    '🎯 **预算调整建议 — ' + getMonthLabel() + '**',
    '',
    '**当前状态**: 健康度 ' + analysis.score + '/100 (' + analysis.status + ')',
    '**总预算**: ¥' + analysis.totalBudget.toLocaleString() + ' | 已用 ¥' + analysis.totalSpent.toLocaleString() + ' | 剩余 ¥' + analysis.totalRemaining.toLocaleString(),
    '',
  ];

  if (budget.recommendations.length === 0) {
    lines.push('✅ 当前预算分配合理，无需调整。');
  } else {
    lines.push('**调整建议**:');
    lines.push('');

    // High priority first
    var sorted = budget.recommendations.slice().sort(function (a, b) {
      var priority = { high: 0, normal: 1, low: 2 };
      return (priority[a.priority] || 1) - (priority[b.priority] || 1);
    });

    sorted.forEach(function (rec, idx) {
      var icon = rec.action === 'increase' ? '📈' : rec.action === 'reduce' ? '📉' : rec.action === 'maintain' ? '➡️' : '🔍';
      var priorityTag = rec.priority === 'high' ? ' 🔴高优' : '';
      lines.push((idx + 1) + '. ' + icon + ' **' + rec.category.toUpperCase() + '**: ' + rec.action + (rec.amount > 0 ? ' ¥' + rec.amount.toLocaleString() : '') + priorityTag);
      lines.push('   > ' + rec.reason);
    });

    lines.push('');
    lines.push('**汇总**:');
    lines.push('- 增加: ¥' + budget.summary.totalIncrease.toLocaleString());
    lines.push('- 减少: ¥' + budget.summary.totalReduce.toLocaleString());
    lines.push('- 高优先项: ' + budget.summary.highPriority + ' 项');
  }

  lines.push('');
  lines.push('⚠️ 以上为 **REVIEW_ONLY** 建议。所有预算变更需 CEO/CFO 审批。');
  lines.push('💡 `/董事会` 审批决策 | `/审计` 查看审计日志');

  return lines.join('\n');
}

// ─── 工具函数 ──────────────────────────────────────────────

function progressBar(rate) {
  var filled = Math.round(rate * 10);
  var empty = 10 - filled;
  var bar = '';
  for (var i = 0; i < filled; i++) bar += '█';
  for (var j = 0; j < empty; j++) bar += '░';
  return bar;
}

function getStatusEmoji(status) {
  switch (status) {
    case 'healthy': return '🟢';
    case 'caution': return '🟡';
    case 'warning': return '🟠';
    case 'critical': return '🔴';
    case 'exhausted': return '🔴';
    case 'high': return '🟠';
    case 'idle': return '🔵';
    default: return '🟢';
  }
}

function getMonthLabel() {
  var now = new Date();
  return (now.getMonth() + 1) + '月';
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  handleBudget: handleBudget,
  handleBudgetAnalysis: handleBudgetAnalysis,
  handleBudgetSuggestions: handleBudgetSuggestions,
};

if (require.main === module) {
  var args = process.argv.slice(2);
  var sub = args[0] || 'overview';
  if (sub === 'analysis' || sub === 'analyze') console.log(handleBudgetAnalysis());
  else if (sub === 'suggestions' || sub === 'suggest') console.log(handleBudgetSuggestions());
  else console.log(handleBudget());
}
