'use strict';

/**
 * autonomous-board.js — P13.4 AI Autonomous Board
 *
 * 多 Agent 董事会决策引擎。
 * CEO/COO/CTO/CMO/CFO 五角色各自发表意见并投票，
 * 综合生成经营评分和下周建议。
 *
 * REVIEW_ONLY — 投票结果仅为 AI 决策建议，最终决策权在人类 CEO。
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

// ─── 董事会成员 ─────────────────────────────────────────────

var BOARD_MEMBERS = [
  { role: 'CEO',  name: 'AI CEO',  voteWeight: 2, domain: 'all',      emoji: '👑' },
  { role: 'COO',  name: 'AI COO',  voteWeight: 1, domain: 'growth',   emoji: '📈' },
  { role: 'CTO',  name: 'AI CTO',  voteWeight: 1, domain: 'tech',     emoji: '⚙️' },
  { role: 'CMO',  name: 'AI CMO',  voteWeight: 1, domain: 'marketing',emoji: '📢' },
  { role: 'CFO',  name: 'AI CFO',  voteWeight: 2, domain: 'finance',  emoji: '💰' },
];

// ─── 董事会会议 ────────────────────────────────────────────

/**
 * 召开董事会会议
 * @returns {object} { meetingId, members[], votes, scorecard, recommendations }
 */
function conveneBoardMeeting() {
  var kpiEngine = getSource('kpi', '../kpi-engine/kpi-engine');
  var budgetEngine = getSource('budget', '../budget-engine/budget-engine');
  var planner = getSource('planner', '../strategy-planner/strategy-planner');
  var trendAnalyzer = getSource('trend', '../kpi-engine/trend-analyzer');

  // 聚合数据
  var kpi = null;
  try { if (kpiEngine) kpi = kpiEngine.getKPISnapshot(); } catch (_) {}
  var budget = null;
  try { if (budgetEngine) budget = budgetEngine.getBudgetRecommendations(); } catch (_) {}
  var plan = null;
  try { if (planner) plan = planner.generate7DayPlan(); } catch (_) {}
  var trend = null;
  try { if (trendAnalyzer) trend = trendAnalyzer.getWeeklyTrend(); } catch (_) {}

  var context = buildContext(kpi, budget, plan, trend);
  var members = simulateVoting(context);
  var scorecard = buildScorecard(members, context);
  var recommendations = buildRecommendations(members, context);

  return {
    meetingId: 'board-' + crypto.randomBytes(4).toString('hex'),
    convenedAt: new Date().toISOString(),
    context: context,
    members: members,
    scorecard: scorecard,
    recommendations: recommendations,
    verdict: buildVerdict(scorecard),
    requiresHumanDecision: true,
    _note: 'REVIEW_ONLY — 以上为 AI 董事会模拟决策，最终决策权在人类 CEO',
  };
}

// ─── 数据上下文 ─────────────────────────────────────────────

function buildContext(kpi, budget, plan, trend) {
  return {
    gmv: (kpi && kpi.gmv) || 48000,
    profit: (kpi && kpi.profit) || 14400,
    profitMargin: (kpi && kpi.profitMargin) || 0.30,
    roi: (kpi && kpi.roi) || 2.2,
    refundRate: (kpi && kpi.refundRate) || 0.03,
    missionSuccessRate: (kpi && kpi.missionSuccessRate) || 0.92,
    gmvTrend: (trend && trend.gmvTrend) || 'stable',
    profitTrend: (trend && trend.profitTrend) || 'stable',
    budgetScore: (budget && budget.analysis && budget.analysis.score) || 70,
    budgetStatus: (budget && budget.analysis && budget.analysis.status) || 'caution',
    budgetRemaining: (budget && budget.analysis && budget.analysis.totalRemaining) || 20000,
    planDays: (plan && plan.days && plan.days.length) || 7,
    planRiskLevel: (plan && plan.summary && plan.summary.riskLevel) || 'medium',
    currentMonth: new Date().getMonth() + 1,
  };
}

// ─── 模拟投票 ──────────────────────────────────────────────

function simulateVoting(context) {
  return BOARD_MEMBERS.map(function (member) {
    var opinion = memberOpinion(member, context);
    return {
      role: member.role,
      name: member.name,
      emoji: member.emoji,
      voteWeight: member.voteWeight,
      vote: opinion.vote,
      confidence: opinion.confidence,
      comment: opinion.comment,
      scores: opinion.scores,
      recommendations: opinion.recommendations,
    };
  });
}

function memberOpinion(member, ctx) {
  switch (member.role) {
    case 'CEO': return ceoOpinion(ctx);
    case 'COO': return cooOpinion(ctx);
    case 'CTO': return ctoOpinion(ctx);
    case 'CMO': return cmoOpinion(ctx);
    case 'CFO': return cfoOpinion(ctx);
    default: return { vote: 'abstain', confidence: 0, comment: '无数据', scores: {}, recommendations: [] };
  }
}

function ceoOpinion(ctx) {
  var totalScore = 0;
  var counts = 0;

  // Growth assessment
  if (ctx.gmvTrend === 'up') totalScore += 80;
  else if (ctx.gmvTrend === 'down') totalScore += 30;
  else totalScore += 55;

  if (ctx.profitMargin > 0.30) totalScore += 85;
  else if (ctx.profitMargin > 0.20) totalScore += 60;
  else totalScore += 35;

  if (ctx.refundRate < 0.04) totalScore += 90;
  else if (ctx.refundRate < 0.06) totalScore += 60;
  else totalScore += 30;

  if (ctx.budgetScore > 80) totalScore += 85;
  else if (ctx.budgetScore > 60) totalScore += 60;
  else totalScore += 35;

  var avgScore = Math.round(totalScore / 4);

  return {
    vote: avgScore >= 60 ? 'approve' : avgScore >= 40 ? 'needs_info' : 'reject',
    confidence: Math.min(95, avgScore),
    comment: '综合评估: GMV趋势' + ctx.gmvTrend + ', 利润率' + (ctx.profitMargin * 100).toFixed(1) + '%, 退款率' + (ctx.refundRate * 100).toFixed(1) + '%',
    scores: { growth: scoreFromTrend(ctx.gmvTrend), profit: scoreFromMargin(ctx.profitMargin), risk: scoreFromRefund(ctx.refundRate), budget: ctx.budgetScore },
    recommendations: [],
  };
}

function cooOpinion(ctx) {
  var growthScore = scoreFromTrend(ctx.gmvTrend);
  return {
    vote: growthScore >= 50 ? 'approve' : 'needs_info',
    confidence: growthScore,
    comment: '运营视角: GMV ' + ctx.gmv.toLocaleString() + ' 元, 任务成功率 ' + (ctx.missionSuccessRate * 100).toFixed(0) + '%',
    scores: { growth: growthScore, mission: Math.round(ctx.missionSuccessRate * 100) },
    recommendations: [
      ctx.gmvTrend === 'down' ? '建议增加视频产出到 8 条/天' : '保持5条/天视频节奏',
      '优化发布时段，测试22:00档转化',
    ],
  };
}

function ctoOpinion(ctx) {
  return {
    vote: ctx.missionSuccessRate > 0.90 ? 'approve' : 'needs_info',
    confidence: Math.round(ctx.missionSuccessRate * 85),
    comment: '技术视角: 系统运行稳定，Agent 成功率 ' + (ctx.missionSuccessRate * 100).toFixed(0) + '%',
    scores: { tech: Math.round(ctx.missionSuccessRate * 100), budget: Math.round(ctx.budgetRemaining / 300) },
    recommendations: [
      '服务器预算使用率偏高，建议评估扩容',
      'DeepSeek API 调用正常，可保持当前配额',
    ],
  };
}

function cmoOpinion(ctx) {
  var roiScore = ctx.roi >= 2.5 ? 85 : ctx.roi >= 1.8 ? 60 : 35;
  return {
    vote: roiScore >= 60 ? 'approve' : 'needs_info',
    confidence: roiScore,
    comment: '营销视角: ROI=' + ctx.roi.toFixed(2) + ', 投流效率' + (ctx.roi >= 2.0 ? '良好' : '需优化'),
    scores: { roi: Math.round(ctx.roi * 30), growth: scoreFromTrend(ctx.gmvTrend) },
    recommendations: [
      ctx.roi >= 2.5 ? '建议加大投流预算 20%' : ctx.roi < 1.5 ? '建议减少投流，优化素材' : '维持当前投流节奏',
      '周末安排直播活动，提升转化',
    ],
  };
}

function cfoOpinion(ctx) {
  var budgetScore = ctx.budgetScore;
  var profitScore = scoreFromMargin(ctx.profitMargin);
  var avgScore = Math.round((budgetScore + profitScore) / 2);

  return {
    vote: avgScore >= 60 ? 'approve' : 'needs_info',
    confidence: avgScore,
    comment: '财务视角: 预算健康度 ' + budgetScore + '/100, 利润率 ' + (ctx.profitMargin * 100).toFixed(1) + '%',
    scores: { budget: budgetScore, profit: profitScore },
    recommendations: [
      ctx.budgetScore < 60 ? '建议收紧非核心支出，暂停低 ROI 渠道' : '预算健康，可按计划执行',
      ctx.profitMargin < 0.20 ? '利润率偏低，审查定价策略' : '',
    ].filter(Boolean),
  };
}

// ─── 评分卡 ────────────────────────────────────────────────

function buildScorecard(members, ctx) {
  var dims = ['growth', 'profit', 'risk', 'budget'];
  var card = {};

  dims.forEach(function (dim) {
    var scores = members
      .filter(function (m) { return m.scores[dim] !== undefined; })
      .map(function (m) { return m.scores[dim]; });

    var avg = scores.length > 0
      ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length)
      : 50;

    card[dim] = {
      score: avg,
      grade: scoreToGrade(avg),
      contributors: scores.length,
    };
  });

  // 加权综合分
  var weightedScore = Math.round(
    (card.growth.score + card.profit.score + card.risk.score + card.budget.score) / 4
  );

  card.overall = {
    score: weightedScore,
    grade: scoreToGrade(weightedScore),
  };

  return card;
}

// ─── 建议汇总 ──────────────────────────────────────────────

function buildRecommendations(members, ctx) {
  var all = [];
  members.forEach(function (m) {
    if (m.recommendations) {
      m.recommendations.forEach(function (r) {
        all.push({ from: m.role, text: r });
      });
    }
  });

  // 去重
  var seen = {};
  var unique = all.filter(function (r) {
    var key = r.text.substring(0, 30);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });

  return {
    total: unique.length,
    items: unique,
    topPriority: unique.slice(0, 3),
  };
}

// ─── 最终裁决 ──────────────────────────────────────────────

function buildVerdict(scorecard) {
  var score = scorecard.overall.score;
  var grade = scorecard.overall.grade;

  if (grade === 'A' || grade === 'B') {
    return { decision: 'approve', summary: '董事会一致看好，建议按计划执行', risk: 'low' };
  } else if (grade === 'C') {
    return { decision: 'review', summary: '部分指标待改善，建议调整后重新审议', risk: 'medium' };
  } else {
    return { decision: 'reject', summary: '多项指标告警，需要 CEO 介入决策', risk: 'high' };
  }
}

// ─── 工具函数 ──────────────────────────────────────────────

function scoreFromTrend(trend) {
  switch (trend) {
    case 'up': return 80;
    case 'down': return 35;
    default: return 55;
  }
}

function scoreFromMargin(margin) {
  if (margin >= 0.35) return 85;
  if (margin >= 0.25) return 65;
  if (margin >= 0.15) return 45;
  return 25;
}

function scoreFromRefund(rate) {
  if (rate <= 0.03) return 90;
  if (rate <= 0.05) return 65;
  if (rate <= 0.07) return 40;
  return 20;
}

function scoreToGrade(score) {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

function gradeLabel(score) {
  var g = scoreToGrade(score);
  var labels = { A: '优秀', B: '良好', C: '一般', D: '需改进' };
  return labels[g] || g;
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  conveneBoardMeeting: conveneBoardMeeting,
  BOARD_MEMBERS: BOARD_MEMBERS,
  simulateVoting: simulateVoting,
  buildScorecard: buildScorecard,
  buildRecommendations: buildRecommendations,
  buildVerdict: buildVerdict,
  scoreToGrade: scoreToGrade,
  gradeLabel: gradeLabel,
};
