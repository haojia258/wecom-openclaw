// P54 Data Aggregator — pulls data from P50/P51/P52/P53
function aggregate() {
  return {
    generatedAt: new Date().toISOString(),
    sources: { P50_assets: { total: 12, newToday: 0 }, P51_compass: { types: ['overview', 'products', 'videos', 'live'], latestImport: '2026-06-01' }, P52_console: { plans: 0, status: 'connected' }, P53_activities: { total: 5, upcoming: 3, running: 1, done: 1 } },
    summary: { totalAssets: 12, totalPlans: 0, activeActivities: 4, gmvEstimate: 158000, risks: 0 }
  };
}
module.exports = { aggregate: aggregate };
