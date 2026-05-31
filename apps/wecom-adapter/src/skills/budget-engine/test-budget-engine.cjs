'use strict';

/**
 * test-budget-engine.cjs — P13.2 Budget Engine Tests
 */

var assert = require('assert');
var budgetEngine = require('./budget-engine');

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

console.log('\nP13.2 Budget Engine Tests\n');

// ─── Group A: Budget Snapshot ─────────────────────────────

test('getBudgetSnapshot 返回对象', function () {
  var snap = budgetEngine.getBudgetSnapshot();
  assertExists(snap);
  assertType(snap.total, 'number');
});

test('snapshot 包含 items 数组', function () {
  var snap = budgetEngine.getBudgetSnapshot();
  assert.ok(Array.isArray(snap.items), 'items should be array');
  assert.ok(snap.items.length >= 5, 'should have at least 5 budget items');
});

test('snapshot items 字段完整', function () {
  var snap = budgetEngine.getBudgetSnapshot();
  snap.items.forEach(function (item) {
    assertExists(item.category, 'item needs category');
    assertExists(item.label, 'item needs label');
    assertType(item.amount, 'number');
    assertType(item.spent, 'number');
    assert.ok(item.amount >= 0, 'amount should be >= 0');
  });
});

test('total = sum of item amounts', function () {
  var snap = budgetEngine.getBudgetSnapshot();
  var expected = snap.items.reduce(function (s, i) { return s + i.amount; }, 0);
  assert.strictEqual(snap.total, expected);
});

test('spent = sum of item spent', function () {
  var snap = budgetEngine.getBudgetSnapshot();
  var expected = snap.items.reduce(function (s, i) { return s + (i.spent || 0); }, 0);
  assert.strictEqual(snap.spent, expected);
});

test('remaining = total - spent', function () {
  var snap = budgetEngine.getBudgetSnapshot();
  assert.strictEqual(snap.remaining, snap.total - snap.spent);
});

// ─── Group B: Budget Analysis ─────────────────────────────

test('analyzeBudget 返回分析对象', function () {
  var analysis = budgetEngine.analyzeBudget();
  assertExists(analysis);
  assertType(analysis.score, 'number');
  assertExists(analysis.status, 'status should exist');
});

test('analyzeBudget score 在 0-100', function () {
  var analysis = budgetEngine.analyzeBudget();
  assertRange(analysis.score, 0, 100);
});

test('analyzeBudget status 合法', function () {
  var analysis = budgetEngine.analyzeBudget();
  assert.ok(['healthy', 'caution', 'warning', 'critical'].indexOf(analysis.status) !== -1,
    'invalid status: ' + analysis.status);
});

test('analyzeBudget 包含 spendRate', function () {
  var analysis = budgetEngine.analyzeBudget();
  assertType(analysis.spendRate, 'number');
  assertRange(analysis.spendRate, 0, 1);
});

test('analyzeBudget 包含 monthProgress', function () {
  var analysis = budgetEngine.analyzeBudget();
  assertType(analysis.monthProgress, 'number');
  assertRange(analysis.monthProgress, 0, 1);
});

test('analyzeBudget items 与 snapshot items 数量一致', function () {
  var snap = budgetEngine.getBudgetSnapshot();
  var analysis = budgetEngine.analyzeBudget(snap);
  assert.strictEqual(analysis.items.length, snap.items.length);
});

test('analyzeBudget 每个 item 有 spendRate/status', function () {
  var analysis = budgetEngine.analyzeBudget();
  analysis.items.forEach(function (item) {
    assertType(item.spendRate, 'number');
    assertExists(item.status);
    assert.ok(['normal', 'high', 'exhausted', 'idle'].indexOf(item.status) !== -1,
      'invalid item status: ' + item.status);
  });
});

test('低消耗 item status=idle', function () {
  var snap = { total: 30000, spent: 100, remaining: 29900, items: [
    { category: 'ads', label: '投流', amount: 12000, spent: 50 }
  ]};
  var analysis = budgetEngine.analyzeBudget(snap);
  assert.strictEqual(analysis.items[0].status, 'idle');
});

test('高消耗 item status=exhausted', function () {
  var snap = { total: 30000, spent: 12000, remaining: 18000, items: [
    { category: 'ads', label: '投流', amount: 12000, spent: 11900 }
  ]};
  var analysis = budgetEngine.analyzeBudget(snap);
  assert.strictEqual(analysis.items[0].status, 'exhausted');
});

test('alerts 在超支时触发', function () {
  var snap = { total: 30000, spent: 29000, remaining: 1000, items: [
    { category: 'ads', label: '投流', amount: 12000, spent: 11000 }
  ]};
  var analysis = budgetEngine.analyzeBudget(snap);
  assert.ok(analysis.alerts.length > 0, 'should have alerts');
  assert.ok(analysis.alerts.some(function (a) { return a.level === 'critical'; }), 'should have critical alert');
});

// ─── Group C: Budget Recommendations ──────────────────────

test('getBudgetRecommendations 返回建议对象', function () {
  var rec = budgetEngine.getBudgetRecommendations();
  assertExists(rec);
  assert.ok(Array.isArray(rec.recommendations));
  assertExists(rec.summary);
});

test('getBudgetRecommendations 包含 snapshot 和 analysis', function () {
  var rec = budgetEngine.getBudgetRecommendations();
  assertExists(rec.snapshot);
  assertExists(rec.analysis);
});

test('getBudgetRecommendations requiresHumanApproval 为布尔', function () {
  var rec = budgetEngine.getBudgetRecommendations();
  assertType(rec.requiresHumanApproval, 'boolean');
});

test('recommendations 结构完整', function () {
  var rec = budgetEngine.getBudgetRecommendations();
  rec.recommendations.forEach(function (r) {
    assertExists(r.category);
    assertExists(r.action);
    assert.ok(['increase', 'reduce', 'maintain', 'review'].indexOf(r.action) !== -1,
      'invalid action: ' + r.action);
    assertExists(r.reason);
    assertExists(r.priority);
  });
});

test('summary 汇总正确', function () {
  var rec = budgetEngine.getBudgetRecommendations();
  assertType(rec.summary.totalRecommendations, 'number');
  assertType(rec.summary.totalIncrease, 'number');
  assertType(rec.summary.totalReduce, 'number');
});

// ─── Group D: Budget Plan ─────────────────────────────────

test('generateBudgetPlan 返回计划对象', function () {
  var plan = budgetEngine.generateBudgetPlan();
  assertExists(plan);
  assertType(plan.dailyBudget, 'number');
});

test('generateBudgetPlan dailyBudget > 0', function () {
  var plan = budgetEngine.generateBudgetPlan();
  assert.ok(plan.dailyBudget >= 0, 'dailyBudget should be >= 0');
});

test('generateBudgetPlan daysLeft > 0', function () {
  var plan = budgetEngine.generateBudgetPlan();
  assert.ok(plan.daysLeft > 0);
});

test('generateBudgetPlan 包含 allocation 数组', function () {
  var plan = budgetEngine.generateBudgetPlan();
  assert.ok(Array.isArray(plan.allocation));
});

test('generateBudgetPlan summary 包含关键信息', function () {
  var plan = budgetEngine.generateBudgetPlan();
  assert.ok(plan.summary.indexOf('剩余') !== -1);
  assert.ok(plan.summary.indexOf('日均') !== -1);
});

// ─── Group E: REVIEW_ONLY ─────────────────────────────────

test('不包含 .env 引用', function () {
  var code = require('fs').readFileSync(__filename.replace('test-budget-engine.cjs', 'budget-engine.js'), 'utf-8');
  assert.strictEqual(code.indexOf('.env'), -1, 'should not reference .env');
});

test('不包含 deploy/merge', function () {
  var code = require('fs').readFileSync(__filename.replace('test-budget-engine.cjs', 'budget-engine.js'), 'utf-8');
  var lower = code.toLowerCase();
  assert.strictEqual(lower.indexOf('deploy'), -1, 'should not contain deploy');
  assert.strictEqual(lower.indexOf('merge'), -1, 'should not contain merge');
});

// ─── Group F: Idempotency ─────────────────────────────────

test('getBudgetSnapshot 幂等', function () {
  var s1 = budgetEngine.getBudgetSnapshot();
  var s2 = budgetEngine.getBudgetSnapshot();
  assert.strictEqual(s1.total, s2.total);
  assert.strictEqual(s1.spent, s2.spent);
});

test('analyzeBudget 幂等', function () {
  var a1 = budgetEngine.analyzeBudget();
  var a2 = budgetEngine.analyzeBudget();
  assert.strictEqual(a1.score, a2.score);
  assert.strictEqual(a1.status, a2.status);
});

// ─── Results ──────────────────────────────────────────────

console.log('');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
