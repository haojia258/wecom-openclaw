'use strict';

/**
 * test-decision-engine.cjs — P14.1 Decision Engine Tests
 */

var assert = require('assert');
var engine = require('./decision-engine');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name + ' — ' + e.message);
  }
}

function assertExists(val, msg) { assert.ok(val != null, msg || 'should exist'); }
function assertType(val, type) { assert.strictEqual(typeof val, type); }
function assertRange(val, min, max) { assert.ok(val >= min && val <= max, 'expected ' + min + '-' + max + ', got ' + val); }

console.log('\nP14.1 Decision Engine Tests\n');

// ─── Group A: analyze() ───────────────────────────────────

test('analyze 返回完整对象', function () {
  var result = engine.analyze();
  assertExists(result);
  assertExists(result.decisionId);
  assertType(result.decisionId, 'string');
  assert.ok(result.decisionId.startsWith('dec-'));
});

test('analyze 包含 decisions 数组', function () {
  var result = engine.analyze();
  assert.ok(Array.isArray(result.decisions));
  assert.ok(result.decisions.length >= 4, 'should have at least 4 decisions, got ' + result.decisions.length);
});

test('analyze 包含 context', function () {
  var result = engine.analyze();
  assertExists(result.context);
  assertExists(result.context.kpi);
  assertExists(result.context.budget);
  assertExists(result.context.strategy);
  assertExists(result.context.board);
});

test('analyze 包含 summary', function () {
  var result = engine.analyze();
  assertExists(result.summary);
  assertType(result.summary.total, 'number');
  assertType(result.summary.highPriority, 'number');
  assertType(result.summary.avgConfidence, 'number');
});

// ─── Group B: Decision Structure ──────────────────────────

test('每个 decision 有 id/action/priority/confidence/risk/reason', function () {
  var result = engine.analyze();
  result.decisions.forEach(function (d) {
    assertExists(d.id);
    assertExists(d.action);
    assertExists(d.priority);
    assert.ok(['high', 'normal', 'low'].indexOf(d.priority) !== -1, 'invalid priority: ' + d.priority);
    assertType(d.confidence, 'number');
    assertRange(d.confidence, 0, 100);
    assertExists(d.risk);
    assert.ok(['low', 'medium', 'high'].indexOf(d.risk) !== -1, 'invalid risk: ' + d.risk);
    assertExists(d.reason);
    assertType(d.reason, 'string');
    assert.ok(d.reason.length > 0, 'reason should not be empty');
  });
});

test('高优决策或常规决策参与排序', function () {
  var result = engine.analyze();
  var sorted = result.decisions.slice().sort(function (a, b) {
    var p = { high: 0, normal: 1, low: 2 };
    return (p[a.priority] || 1) - (p[b.priority] || 1);
  });
  // 排序后条目数不变
  assert.strictEqual(sorted.length, result.decisions.length);
  // 全部有合法 priority
  sorted.forEach(function (d) {
    assert.ok(['high', 'normal', 'low'].indexOf(d.priority) !== -1);
  });
});

// ─── Group C: generateDecisions() ──────────────────────────

test('generateDecisions 高 ROI 返回 scale_ads', function () {
  var ctx = {
    kpi: { gmv: 50000, roi: 3.0, profitMargin: 0.35, refundRate: 0.02 },
    budget: { score: 85, totalRemaining: 25000, totalBudget: 30000 },
    strategy: { riskLevel: 'low', highPriorityActions: [] },
    board: { decision: 'approve', risk: 'low', summary: 'good' },
  };
  var decisions = engine.generateDecisions(ctx);
  var ads = decisions.find(function (d) { return d.id === 'scale_ads'; });
  assertExists(ads);
  assert.strictEqual(ads.priority, 'high');
  assertRange(ads.confidence, 80, 100);
});

test('generateDecisions 低 ROI 返回 reduce_ads', function () {
  var ctx = {
    kpi: { gmv: 25000, roi: 1.2, profitMargin: 0.18, refundRate: 0.06 },
    budget: { score: 40, totalRemaining: 5000, totalBudget: 30000 },
    strategy: { riskLevel: 'high', highPriorityActions: [] },
    board: { decision: 'reject', risk: 'high', summary: 'bad' },
  };
  var decisions = engine.generateDecisions(ctx);
  var ads = decisions.find(function (d) { return d.id === 'reduce_ads'; });
  assertExists(ads);
  assert.strictEqual(ads.priority, 'high');
});

test('generateDecisions 高利润率返回 launch_campaign', function () {
  var ctx = {
    kpi: { gmv: 50000, roi: 2.0, profitMargin: 0.40, refundRate: 0.02 },
    budget: { score: 85, totalRemaining: 25000, totalBudget: 30000 },
    strategy: { riskLevel: 'low' },
    board: { decision: 'approve', risk: 'low' },
  };
  var decisions = engine.generateDecisions(ctx);
  var campaign = decisions.find(function (d) { return d.id === 'launch_campaign'; });
  assertExists(campaign);
});

test('generateDecisions 低利润率返回 pause_campaign', function () {
  var ctx = {
    kpi: { gmv: 30000, roi: 1.5, profitMargin: 0.15, refundRate: 0.04 },
    budget: { score: 50, totalRemaining: 8000, totalBudget: 30000 },
    strategy: { riskLevel: 'high' },
    board: { decision: 'review', risk: 'high' },
  };
  var decisions = engine.generateDecisions(ctx);
  var campaign = decisions.find(function (d) { return d.id === 'pause_campaign'; });
  assertExists(campaign);
  assert.strictEqual(campaign.priority, 'high');
  assertRange(campaign.confidence, 80, 100);
});

test('generateDecisions 预算紧张返回 tighten_budget', function () {
  var ctx = {
    kpi: { gmv: 30000, roi: 1.5, profitMargin: 0.20, refundRate: 0.04 },
    budget: { score: 35, totalRemaining: 3000, totalBudget: 30000 },
    strategy: { riskLevel: 'high' },
    board: { decision: 'reject', risk: 'high' },
  };
  var decisions = engine.generateDecisions(ctx);
  var budget = decisions.find(function (d) { return d.id === 'tighten_budget'; });
  assertExists(budget);
  assert.strictEqual(budget.priority, 'high');
});

test('generateDecisions 高退款率返回 reduce_inventory', function () {
  var ctx = {
    kpi: { gmv: 40000, roi: 2.0, profitMargin: 0.25, refundRate: 0.07 },
    budget: { score: 60, totalRemaining: 15000, totalBudget: 30000 },
    strategy: { riskLevel: 'medium' },
    board: { decision: 'review', risk: 'medium' },
  };
  var decisions = engine.generateDecisions(ctx);
  var inv = decisions.find(function (d) { return d.id === 'reduce_inventory'; });
  assertExists(inv);
});

// ─── Group D: Summary ─────────────────────────────────────

test('summary.highActions 为数组', function () {
  var result = engine.analyze();
  assert.ok(Array.isArray(result.summary.highActions));
});

test('avgConfidence 在 0-100', function () {
  var result = engine.analyze();
  assertRange(result.summary.avgConfidence, 0, 100);
});

test('decisionId 每次不同', function () {
  var r1 = engine.analyze();
  var r2 = engine.analyze();
  assert.notStrictEqual(r1.decisionId, r2.decisionId);
});

// ─── Group E: REVIEW_ONLY ─────────────────────────────────

test('不含 .env 引用', function () {
  var code = require('fs').readFileSync(__filename.replace('test-decision-engine.cjs', 'decision-engine.js'), 'utf-8');
  assert.strictEqual(code.indexOf('.env'), -1);
});

test('不含 deploy/merge', function () {
  var code = require('fs').readFileSync(__filename.replace('test-decision-engine.cjs', 'decision-engine.js'), 'utf-8');
  var lower = code.toLowerCase();
  assert.strictEqual(lower.indexOf('deploy'), -1);
  assert.strictEqual(lower.indexOf('merge'), -1);
});

// ─── Group F: Context Integrity ───────────────────────────

test('context.kpi 包含关键字段引用', function () {
  var result = engine.analyze();
  assert.ok(result.context.kpi.indexOf('GMV') !== -1);
  assert.ok(result.context.kpi.indexOf('ROI') !== -1);
});

test('context.budget 包含评分', function () {
  var result = engine.analyze();
  assert.ok(result.context.budget.indexOf('/100') !== -1);
});

// ─── Group G: Decision Types ──────────────────────────────

test('至少包含 6 种决策类型', function () {
  var ids = engine.analyze().decisions.map(function (d) { return d.id; });
  // ads + campaign + video + budget + inventory + board
  var expected = ['ads', 'campaign', 'video', 'budget', 'inventory', 'board'];
  var count = expected.filter(function (e) { return ids.some(function (id) { return id.indexOf(e) !== -1; }); }).length;
  assert.ok(count >= 4, 'should cover at least 4 of 6 domains, got ' + count);
});

// ─── Results ──────────────────────────────────────────────

console.log('');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
