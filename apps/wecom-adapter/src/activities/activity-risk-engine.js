function safe(v, d) { return (v !== undefined && v !== null) ? v : d; }
function assess(activity, margin) {
  if (!activity) return { activity: 'N/A', riskScore: 0, riskLevel: 'UNKNOWN', factors: {} };
  var d = safe(activity.discount, 0); var s = safe(activity.subsidy, 0); var p = safe(activity.products, []); var m = safe(margin, 0);
  var score = 0;
  if (d > 0.15) score += 40; else if (d > 0.1) score += 25;
  if (s < 3000) score += 20; if (m < 0.1) score += 25; if (p.length < 2) score += 10;
  var level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  return { activity: safe(activity.name, 'Unknown'), riskScore: score, riskLevel: level, factors: { discount: d, subsidy: s, margin: m, productCount: p.length } };
}
module.exports = { assess: assess };
