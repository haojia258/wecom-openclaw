function safe(v, d) { return (v !== undefined && v !== null) ? v : d; }
function calculate(activity, skuProfitData) {
  if (!activity) return { activity: 'N/A', estimatedGMV: 0, discountCost: 0, subsidy: 0, netProfit: 0, profitMargin: '0%', recommendation: 'no_data' };
  var p = safe(activity.products, []); var d = safe(activity.discount, 0); var s = safe(activity.subsidy, 0); var n = safe(activity.name, 'Unknown');
  var gmv = p.length * 15000; var dc = Math.round(gmv * d); var np = Math.round(gmv - dc + s);
  return { activity: n, estimatedGMV: gmv, discountCost: dc, subsidy: s, netProfit: np, profitMargin: Math.round(np / Math.max(gmv, 1) * 100) + '%', recommendation: np > 0 ? 'profitable' : np === 0 ? 'break_even' : 'loss_risk' };
}
function calculateAll(activities, skuData) {
  if (!activities || !Array.isArray(activities) || activities.length === 0) return [];
  return activities.map(function (a) { return calculate(a, skuData); });
}
module.exports = { calculate: calculate, calculateAll: calculateAll };
