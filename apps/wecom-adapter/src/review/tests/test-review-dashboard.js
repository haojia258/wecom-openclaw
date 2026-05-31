const assert = require('assert');
const { ReviewDashboard } = require('../review-dashboard');
const { buildRiskSummary, calculateRiskTrend } = require('../risk-summary');

// 测试基础统计
function testBasicStats() {
  const dashboard = new ReviewDashboard();
  const files1 = ['.env', 'src/index.js'];
  const files2 = ['nginx/conf', 'deploy/script.sh'];

  dashboard.addReview(files1);
  dashboard.addReview(files2);

  const stats = dashboard.getStats();
  assert.strictEqual(stats.highRiskCount, 0);
  assert.strictEqual(stats.forbiddenHits, 3);
  assert.ok(['up', 'down', 'stable'].includes(stats.riskTrend));
  assert.ok(typeof stats.summary === 'string');
  console.log('OK: basic stats');
}

// 测试风险趋势 (上升)
function testRiskTrendUp() {
  const prData = [
    { files: ['src/a.js'], timestamp: '2025-01-01' },
    { files: ['src/b.js'], timestamp: '2025-01-02' },
    { files: ['.env'], timestamp: '2025-01-03' },
    { files: ['.env', 'nginx/ssl.key'], timestamp: '2025-01-04' },
  ];
  const summary = buildRiskSummary(prData);
  assert.strictEqual(summary.riskTrend, 'up');
  assert.strictEqual(summary.highRiskCount, 1);
  assert.strictEqual(summary.forbiddenHits, 3);
  console.log('OK: risk trend up');
}

// 测试多PR聚合统计
function testMultiplePRs() {
  const dashboard = new ReviewDashboard();
  dashboard.addReview(['.env', 'src/main.js']);
  dashboard.addReview(['nginx/default.conf', 'deploy/pm2.json']);
  dashboard.addReview(['apps/wecom/callback.js']);
  dashboard.addReview(['logs/app.log']);

  const stats = dashboard.getStats();
  assert.strictEqual(stats.highRiskCount, 0);
  assert.strictEqual(stats.forbiddenHits, 5);
  assert.ok(stats.summary.includes('审查数据') || stats.summary.includes('风险'));
  console.log('OK: multiple PRs');
}

// 测试边界情况
function testEdgeCases() {
  const dashboard = new ReviewDashboard();
  // 空数组
  const emptyStats = dashboard.getStats();
  assert.strictEqual(emptyStats.highRiskCount, 0);
  assert.strictEqual(emptyStats.forbiddenHits, 0);
  assert.strictEqual(emptyStats.riskTrend, 'stable');
  assert.ok(emptyStats.summary.includes('暂无审查'));

  // 添加无风险文件
  dashboard.addReview(['src/ok.js', 'lib/helper.js']);
  const statsAfterOk = dashboard.getStats();
  assert.strictEqual(statsAfterOk.highRiskCount, 0);
  assert.strictEqual(statsAfterOk.forbiddenHits, 0);
  assert.strictEqual(statsAfterOk.riskTrend, 'stable');

  // 批量添加
  const batch = [
    { files: ['.env'], timestamp: '2025-01-01' },
    { files: ['nginx/conf'], timestamp: '2025-01-02' },
  ];
  dashboard.addReviews(batch);
  const finalStats = dashboard.getStats();
  assert.strictEqual(finalStats.forbiddenHits, 2);
  console.log('OK: edge cases');
}

// 测试 calculateRiskTrend 独立函数
function testTrendFunction() {
  const results = [
    { timestamp: '2025-01-01', riskScore: 10 },
    { timestamp: '2025-01-02', riskScore: 20 },
    { timestamp: '2025-01-03', riskScore: 30 },
    { timestamp: '2025-01-04', riskScore: 40 },
  ];
  const trend = calculateRiskTrend(results);
  assert.strictEqual(trend, 'up');

  const downResults = [
    { timestamp: '2025-01-01', riskScore: 50 },
    { timestamp: '2025-01-02', riskScore: 40 },
    { timestamp: '2025-01-03', riskScore: 30 },
  ];
  const downTrend = calculateRiskTrend(downResults);
  assert.strictEqual(downTrend, 'down');

  const stableResults = [{ timestamp: '2025-01-01', riskScore: 25 }, { timestamp: '2025-01-02', riskScore: 26 }];
  const stableTrend = calculateRiskTrend(stableResults);
  assert.strictEqual(stableTrend, 'stable');

  console.log('OK: trend function');
}

function runAllTests() {
  testBasicStats();
  testRiskTrendUp();
  testMultiplePRs();
  testEdgeCases();
  testTrendFunction();
  console.log('\nDashboard tests PASSED (5/5)');
}

runAllTests();
