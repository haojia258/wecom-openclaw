'use strict';

/**
 * decision-command.js — P14.1 Decision Engine Commands
 *
 * /决策     — 决策建议列表（高优排序）
 * /决策分析 — 详细决策分析 + 上下文 + 风险评估
 */

var engine = require('../skills/decision-engine/decision-engine');

// ─── /决策 ─────────────────────────────────────────────────

function handleDecision() {
  var result = engine.analyze();
  var decisions = result.decisions;
  var summary = result.summary;
  var ctx = result.context;

  var lines = [
    '🧭 **决策建议 — ' + result.generatedAt.split('T')[0] + '**',
    '',
    '决策 ID: `' + result.decisionId + '`',
    '',
    '**当前状态**:',
    '- ' + ctx.kpi,
    '- ' + ctx.budget,
    '- ' + ctx.strategy,
    '- ' + ctx.board,
    '',
    '---',
    '',
    '**决策建议 (' + summary.total + ' 项, ' + summary.highPriority + ' 项高优)**:',
    '',
  ];

  // 高优先排前面
  var sorted = decisions.slice().sort(function (a, b) {
    var p = { high: 0, normal: 1, low: 2 };
    return (p[a.priority] || 1) - (p[b.priority] || 1);
  });

  sorted.forEach(function (d, idx) {
    var pEmoji = d.priority === 'high' ? '🔴' : d.priority === 'normal' ? '🟡' : '🟢';
    var rEmoji = d.risk === 'high' ? '⚠️' : d.risk === 'medium' ? '📌' : '✅';
    lines.push('### ' + (idx + 1) + '. ' + pEmoji + ' ' + d.action + ' (置信度: ' + d.confidence + '%)');
    lines.push('- 风险: ' + rEmoji + ' ' + d.risk);
    lines.push('- > ' + d.reason);
    lines.push('');
  });

  lines.push('---');
  lines.push('');
  lines.push('📊 平均置信度: **' + summary.avgConfidence + '%**');
  lines.push('');
  lines.push('💡 `/决策分析` 查看详细分析 | `/董事会` 提交审议');

  return lines.join('\n');
}

// ─── /决策分析 ─────────────────────────────────────────────

function handleDecisionAnalysis() {
  var result = engine.analyze();
  var decisions = result.decisions;
  var ctx = result.context;

  var lines = [
    '📊 **决策分析报告 — ' + result.generatedAt.split('T')[0] + '**',
    '',
    '决策 ID: `' + result.decisionId + '`',
    '',
    '---',
    '',
    '## 📈 输入数据',
    '',
    '### KPI Engine',
    '> ' + ctx.kpi,
    '',
    '### Budget Engine',
    '> ' + ctx.budget,
    '',
    '### Strategy Planner',
    '> ' + ctx.strategy,
    '',
    '### Board Verdict',
    '> ' + ctx.board,
    '',
    '---',
    '',
    '## 🧭 决策详情',
    '',
  ];

  decisions.forEach(function (d, idx) {
    var priorityScore = d.priority === 'high' ? 90 : d.priority === 'normal' ? 60 : 30;
    var compositeScore = Math.round((d.confidence + priorityScore) / 2);

    lines.push('### ' + (idx + 1) + '. ' + d.action);
    lines.push('');
    lines.push('| 指标 | 值 |');
    lines.push('|------|-----|');
    lines.push('| 优先级 | ' + priorityLabel(d.priority) + ' |');
    lines.push('| 置信度 | ' + d.confidence + '% |');
    lines.push('| 执行风险 | ' + riskLabel(d.risk) + ' |');
    lines.push('| 综合评分 | ' + compositeScore + '/100 |');
    lines.push('| 决策 ID | `' + d.id + '` |');
    lines.push('');
    lines.push('**依据**: ' + d.reason);
    lines.push('');

    // 风险评估
    if (d.risk === 'medium' || d.risk === 'high') {
      lines.push('**风险提示**: ');
      if (d.risk === 'high') lines.push('- 🔴 高风险决策，建议董事会审议后执行');
      else lines.push('- 🟡 中等风险，建议监控执行效果');
    }
    lines.push('');
  });

  lines.push('---');
  lines.push('');
  lines.push('⚠️ 以上决策建议为 **REVIEW_ONLY**。所有执行需人类 CEO 审批。');
  lines.push('💡 `/董事会` 提交审议 | `/记忆存档` 保存决策快照');

  return lines.join('\n');
}

// ─── 工具函数 ──────────────────────────────────────────────

function priorityLabel(p) {
  var labels = { high: '🔴 高优先', normal: '🟡 常规', low: '🟢 低优先' };
  return labels[p] || p;
}

function riskLabel(r) {
  var labels = { high: '🔴 高风险', medium: '🟡 中等风险', low: '🟢 低风险' };
  return labels[r] || r;
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  handleDecision: handleDecision,
  handleDecisionAnalysis: handleDecisionAnalysis,
};

if (require.main === module) {
  var args = process.argv.slice(2);
  if (args[0] === 'analysis') console.log(handleDecisionAnalysis());
  else console.log(handleDecision());
}
