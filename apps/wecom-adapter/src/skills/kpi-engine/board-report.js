'use strict';

/**
 * board-report.js — P13.1 董事会报告生成器
 *
 * 生成经营评分卡（Growth / Profit / Risk / Budget 四维评分）。
 * REVIEW_ONLY — 只读展示。
 */

var { getSnapshot } = require('./kpi-engine');

// ─── 评分卡 ────────────────────────────────────────────────

function calculateScorecard() {
  var snapshot = getSnapshot();
  var c = snapshot.current;

  // Growth (GMV + 订单增长)
  var growthScore = Math.min(100, Math.round((c.gmv / 80000) * 60 + (c.ctr || 2.8) * 10));
  var growthGrade = growthScore >= 80 ? 'A' : growthScore >= 60 ? 'B' : growthScore >= 40 ? 'C' : 'D';

  // Profit (利润率)
  var profitMargin = c.profit / c.gmv * 100;
  var profitScore = Math.min(100, Math.round(profitMargin / 30 * 100));
  var profitGrade = profitScore >= 80 ? 'A' : profitScore >= 60 ? 'B' : profitScore >= 40 ? 'C' : 'D';

  // Risk (退款率 + 风险)
  var riskScore = Math.max(0, 100 - (c.refund_rate * 10) - (c.inventory_risk || 0) * 5);
  var riskGrade = riskScore >= 80 ? 'A' : riskScore >= 60 ? 'B' : riskScore >= 40 ? 'C' : 'D';

  // Budget (ROI + 效率)
  var budgetScore = Math.min(100, Math.round((c.roi || 2.1) / 3 * 70 + 30));
  var budgetGrade = budgetScore >= 80 ? 'A' : budgetScore >= 60 ? 'B' : budgetScore >= 40 ? 'C' : 'D';

  // Overall
  var overall = Math.round((growthScore + profitScore + riskScore + budgetScore) / 4);
  var overallGrade = overall >= 80 ? 'A' : overall >= 60 ? 'B' : overall >= 40 ? 'C' : 'D';

  return {
    growth: { score: growthScore, grade: growthGrade, label: '增长' },
    profit: { score: profitScore, grade: profitGrade, label: '利润' },
    risk: { score: riskScore, grade: riskGrade, label: '风险' },
    budget: { score: budgetScore, grade: budgetGrade, label: '预算' },
    overall: { score: overall, grade: overallGrade },
    generated_at: new Date().toISOString(),
  };
}

// ─── 建议生成 ──────────────────────────────────────────────

function generateRecommendations(scorecard) {
  var recs = [];

  if (scorecard.growth.score < 60) {
    recs.push('📈 **增长建议**: GMV 未达标，建议增加投流预算 15-20% 并优化视频内容');
  } else {
    recs.push('✅ **增长**: GMV 趋势良好，保持当前投流和内容策略');
  }

  if (scorecard.profit.score < 60) {
    recs.push('💰 **利润建议**: 毛利率偏低，建议优化 SKU 组合提高高毛利款占比');
  } else {
    recs.push('✅ **利润**: 利润率健康，可考虑小幅提升活动折扣力度');
  }

  if (scorecard.risk.score < 60) {
    recs.push('⚠️ **风险建议**: 退款率偏高或库存告警，建议检查售后原因并补货');
  } else {
    recs.push('✅ **风险**: 风险可控，退款率和库存均在安全范围');
  }

  if (scorecard.budget.score < 60) {
    recs.push('💵 **预算建议**: ROI 偏低，建议暂停低效投流渠道，集中预算到高 ROI 渠道');
  } else {
    recs.push('✅ **预算**: 预算使用效率良好，ROI 处于健康水平');
  }

  return recs;
}

// ─── Markdown 格式化 ───────────────────────────────────────

function formatBoardReport() {
  var scorecard = calculateScorecard();
  var recs = generateRecommendations(scorecard);

  var gradeIcon = function (g) {
    if (g === 'A') return '🟢';
    if (g === 'B') return '🔵';
    if (g === 'C') return '🟡';
    return '🔴';
  };

  var lines = [];
  lines.push('# 🏛 AI 董事会 — 经营评分卡');
  lines.push('');
  lines.push('> 生成时间: ' + scorecard.generated_at);
  lines.push('> 综合评分: **' + gradeIcon(scorecard.overall.grade) + ' ' + scorecard.overall.score + '/100 (等级 ' + scorecard.overall.grade + ')**');
  lines.push('');

  // 四维评分
  lines.push('## 📊 四维评分');
  lines.push('');
  lines.push('| 维度 | 评分 | 等级 |');
  lines.push('|------|------|------|');

  var dims = ['growth', 'profit', 'risk', 'budget'];
  dims.forEach(function (dim) {
    var s = scorecard[dim];
    lines.push('| ' + s.label + ' | **' + gradeIcon(s.grade) + ' ' + s.score + '/100** | ' + s.grade + ' |');
  });

  lines.push('');
  lines.push('| **综合** | **' + gradeIcon(scorecard.overall.grade) + ' ' + scorecard.overall.score + '/100** | **' + scorecard.overall.grade + '** |');
  lines.push('');

  // 建议
  lines.push('## 💡 经营建议');
  lines.push('');
  recs.forEach(function (rec) {
    lines.push(rec);
    lines.push('');
  });

  lines.push('---');
  lines.push('> 🔒 REVIEW_ONLY — P13.1 Board Report v1');
  lines.push('> 使用 /KPI 查看详细指标 | /周报 /月报 查看趋势');

  return lines.join('\n');
}

// ─── 公共 API ──────────────────────────────────────────────

module.exports = {
  calculateScorecard: calculateScorecard,
  generateRecommendations: generateRecommendations,
  formatBoardReport: formatBoardReport,
};
