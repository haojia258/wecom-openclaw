'use strict';

var passed = 0, failed = 0, errors = [];
function assert(c, m) { if (c) passed++; else { failed++; errors.push('FAIL: ' + (m||'')); console.log('  ✗ ' + (m||'')); } }
function test(n, fn) { process.stdout.write('  ' + n + ' ... '); try { fn(); console.log('✓'); } catch (e) { failed++; errors.push('FAIL: ' + n + ' - ' + e.message); console.log('✗ ' + e.message); } }
function summary() {
  console.log('\n' + '='.repeat(60));
  console.log('KPI Engine 测试: ' + passed + ' 通过, ' + failed + ' 失败');
  if (errors.length) errors.forEach(function(e, i) { console.log('  ' + (i+1) + '. ' + e); });
  console.log('='.repeat(60));
  return failed === 0;
}

var kpi = require('./kpi-engine');
var trend = require('./trend-analyzer');
var board = require('./board-report');

// ─── A. KPI Engine ─────────────────────────────────────────

console.log('\n--- A. KPI Engine ---');

test('getSnapshot returns data', function () {
  var s = kpi.getSnapshot();
  assert(s !== null, 'snapshot not null');
  assert(s.targets.length >= 4, 'at least 4 targets');
  assert(s.current.gmv > 0, 'GMV > 0');
  assert(s.risk.score >= 0 && s.risk.score <= 100, 'risk score 0-100');
});

test('generateDailyReport returns markdown', function () {
  var r = kpi.generateDailyReport();
  assert(typeof r === 'string', 'should be string');
  assert(r.length > 200, 'should have content');
  assert(r.indexOf('KPI') !== -1 || r.indexOf('仪表板') !== -1, 'has header');
  assert(r.indexOf('REVIEW_ONLY') !== -1, 'has safety');
});

test('daily report contains core metrics', function () {
  var r = kpi.generateDailyReport();
  assert(r.indexOf('GMV') !== -1, 'contains GMV');
  assert(r.indexOf('利润') !== -1, 'contains 利润');
  assert(r.indexOf('ROI') !== -1, 'contains ROI');
  assert(r.indexOf('退款率') !== -1, 'contains 退款率');
});

test('daily report has approval section', function () {
  var r = kpi.generateDailyReport();
  assert(r.indexOf('审批') !== -1, 'has approval section');
});

// ─── B. Trend Analyzer ─────────────────────────────────────

console.log('\n--- B. Trend Analyzer ---');

test('getWeeklyData returns 7 days', function () {
  var d = trend.getWeeklyData();
  assert(d.length === 7, '7 days');
  assert(d[0].gmv > 0, 'has GMV');
  assert(d[0].profit > 0, 'has profit');
});

test('getMonthlyData returns 4 weeks', function () {
  var d = trend.getMonthlyData();
  assert(d.length === 4, '4 weeks');
  assert(d[0].gmv > 0, 'has GMV');
});

test('calculateTrends detects direction', function () {
  var r = trend.calculateTrends([100, 120], 'gmv');
  assert(r.direction === 'up', 'should be up');
  var r2 = trend.calculateTrends([120, 100], 'gmv');
  assert(r2.direction === 'down', 'should be down');
});

test('formatWeeklyReport returns markdown', function () {
  var r = trend.formatWeeklyReport();
  assert(typeof r === 'string', 'should be string');
  assert(r.indexOf('周报') !== -1, 'has title');
  assert(r.indexOf('REVIEW_ONLY') !== -1, 'has safety');
});

test('formatMonthlyReport returns markdown', function () {
  var r = trend.formatMonthlyReport();
  assert(typeof r === 'string', 'should be string');
  assert(r.indexOf('月报') !== -1, 'has title');
  assert(r.indexOf('REVIEW_ONLY') !== -1, 'has safety');
});

test('weekly report has trend analysis', function () {
  var r = trend.formatWeeklyReport();
  assert(r.indexOf('趋势') !== -1, 'has trend section');
});

test('monthly report has 环比 analysis', function () {
  var r = trend.formatMonthlyReport();
  assert(r.indexOf('环比') !== -1, 'has wow section');
});

// ─── C. Board Report ───────────────────────────────────────

console.log('\n--- C. Board Report ---');

test('calculateScorecard returns 4 dimensions', function () {
  var s = board.calculateScorecard();
  assert(s.growth.score >= 0, 'growth score >= 0');
  assert(s.profit.score >= 0, 'profit score >= 0');
  assert(s.risk.score >= 0, 'risk score >= 0');
  assert(s.budget.score >= 0, 'budget score >= 0');
  assert(s.overall.score >= 0, 'overall score >= 0');
});

test('scorecard has grades', function () {
  var s = board.calculateScorecard();
  var validGrades = ['A', 'B', 'C', 'D'];
  assert(validGrades.indexOf(s.overall.grade) !== -1, 'valid grade');
});

test('generateRecommendations returns 4 items', function () {
  var s = board.calculateScorecard();
  var r = board.generateRecommendations(s);
  assert(r.length === 4, '4 recommendations');
});

test('formatBoardReport returns markdown', function () {
  var r = board.formatBoardReport();
  assert(typeof r === 'string', 'should be string');
  assert(r.indexOf('董事会') !== -1, 'has board title');
  assert(r.indexOf('评分') !== -1, 'has score section');
  assert(r.indexOf('建议') !== -1, 'has recommendations');
  assert(r.indexOf('REVIEW_ONLY') !== -1, 'has safety');
});

// ─── D. Command routes ─────────────────────────────────────

console.log('\n--- D. Routes ---');

test('/周报 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  assert(resolve('/周报') !== null, 'should match');
});

test('/月报 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  assert(resolve('/月报') !== null, 'should match');
});

test('/weekly → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  assert(resolve('/weekly') !== null, 'alias match');
});

// ─── E. Safety ─────────────────────────────────────────────

console.log('\n--- E. Safety ---');

test('all reports have REVIEW_ONLY', function () {
  var reports = [kpi.generateDailyReport(), trend.formatWeeklyReport(), trend.formatMonthlyReport(), board.formatBoardReport()];
  reports.forEach(function(r) { assert(r.indexOf('REVIEW_ONLY') !== -1, 'has REVIEW_ONLY'); });
});

test('reports contain no dangerous keywords', function () {
  var all = kpi.generateDailyReport() + trend.formatWeeklyReport() + board.formatBoardReport();
  ['deploy', 'merge', '.env', 'vault', '下单', '改价'].forEach(function(w) {
    var idx = all.toLowerCase().indexOf(w);
    assert(idx === -1 || all.substring(idx - 20, idx + 20).indexOf('REVIEW_ONLY') > 0 || all.substring(idx - 20, idx + 20).indexOf('不') > 0, w + ' only in safety context');
  });
});

console.log('');
var ok = summary();
process.exit(ok ? 0 : 1);
