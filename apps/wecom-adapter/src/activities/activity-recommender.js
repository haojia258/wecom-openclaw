var profitEngine = require('./activity-profit-engine'); var riskEngine = require('./activity-risk-engine');
function recommend(activities) {
  if (!activities || !Array.isArray(activities) || activities.length === 0) return [];
  return activities.map(function (a) { var p = profitEngine.calculate(a); var r = riskEngine.assess(a, parseFloat(p.profitMargin) / 100 || 0); var score = 0; if (p.recommendation === 'profitable') score += 50; if (r.riskLevel === 'low') score += 30; else if (r.riskLevel === 'medium') score += 15; if (a.subsidy && a.subsidy > 3000) score += 20; return { activity: a.name, profit: p, risk: r, recommendationScore: Math.min(score, 100), shouldEnroll: score >= 50, reason: score >= 70 ? 'Highly Recommended' : score >= 50 ? 'Recommended' : 'Not Recommended', cta: score >= 50 ? '生成报名计划' : '关注' }; }).sort(function (a, b) { return b.recommendationScore - a.recommendationScore; });
}
module.exports = { recommend: recommend };
