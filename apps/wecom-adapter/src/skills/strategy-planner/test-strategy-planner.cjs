'use strict';

/**
 * test-strategy-planner.cjs — P13.3 Strategy Planner Tests
 */

var assert = require('assert');
var planner = require('./strategy-planner');

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

console.log('\nP13.3 Strategy Planner Tests\n');

// ─── Group A: 7-Day Plan Generation ───────────────────────

test('generate7DayPlan 返回完整对象', function () {
  var plan = planner.generate7DayPlan();
  assertExists(plan);
  assertExists(plan.planId);
  assertType(plan.planId, 'string');
});

test('planId 格式正确', function () {
  var plan = planner.generate7DayPlan();
  assert.ok(plan.planId.startsWith('plan-'), 'should start with plan-');
  assert.strictEqual(plan.planId.length, 13, 'plan- + 8 hex chars');
});

test('7天计划包含 7 天', function () {
  var plan = planner.generate7DayPlan();
  assert.strictEqual(plan.days.length, 7);
});

test('days 按日期递增', function () {
  var plan = planner.generate7DayPlan();
  for (var i = 1; i < 7; i++) {
    assert.ok(plan.days[i].date > plan.days[i - 1].date,
      'day ' + (i + 1) + ' should be after day ' + i);
  }
});

test('每天有完整结构', function () {
  var plan = planner.generate7DayPlan();
  plan.days.forEach(function (day, idx) {
    assert.strictEqual(day.day, idx + 1);
    assertExists(day.date);
    assertExists(day.label);
    assertType(day.isWeekend, 'boolean');
    assertExists(day.campaign);
    assertExists(day.ads);
    assertExists(day.video);
    assertExists(day.inventory);
    assertExists(day.budget_allocation);
  });
});

test('包含周末标记', function () {
  var plan = planner.generate7DayPlan();
  var weekendDays = plan.days.filter(function (d) { return d.isWeekend; });
  assert.ok(weekendDays.length >= 1, '7 days should include at least 1 weekend day');
});

// ─── Group B: Strategies ──────────────────────────────────

test('deriveStrategies 返回 4 个领域', function () {
  var strategies = planner.deriveStrategies({ profitMargin: 0.3, refundRate: 0.03 }, { analysis: { score: 70 } }, { gmvTrend: 'stable' });
  var domains = strategies.map(function (s) { return s.domain; });
  assert.ok(domains.indexOf('growth') !== -1);
  assert.ok(domains.indexOf('profit') !== -1);
  assert.ok(domains.indexOf('risk') !== -1);
  assert.ok(domains.indexOf('budget') !== -1);
});

test('GMV 上升 → growth加速', function () {
  var strategies = planner.deriveStrategies({}, {}, { gmvTrend: 'up' });
  var g = strategies.find(function (s) { return s.domain === 'growth'; });
  assert.strictEqual(g.action, '加速');
});

test('GMV 下滑 → growth优化', function () {
  var strategies = planner.deriveStrategies({}, {}, { gmvTrend: 'down' });
  var g = strategies.find(function (s) { return s.domain === 'growth'; });
  assert.strictEqual(g.action, '优化');
});

test('退款率 >5% → risk预警', function () {
  var strategies = planner.deriveStrategies({ refundRate: 0.06 }, {}, {});
  var r = strategies.find(function (s) { return s.domain === 'risk'; });
  assert.strictEqual(r.action, '预警');
  assert.strictEqual(r.priority, 'high');
});

test('预算紧张 → budget收缩', function () {
  var strategies = planner.deriveStrategies({}, { analysis: { score: 40 } }, {});
  var b = strategies.find(function (s) { return s.domain === 'budget'; });
  assert.strictEqual(b.action, '收缩');
  assert.strictEqual(b.priority, 'high');
});

// ─── Group C: Campaign Plan ───────────────────────────────

test('campaign 周末有冲刺/直播', function () {
  var plan = planner.buildCampaignPlan([], 2, true);
  var actions = plan.actions.map(function (a) { return a.action; });
  assert.ok(actions.indexOf('冲刺转化') !== -1 || actions.indexOf('安排直播') !== -1);
});

test('campaign 工作日有日常运营', function () {
  var plan = planner.buildCampaignPlan([], 2, false);
  assert.ok(plan.actions.length > 0);
});

// ─── Group D: Ads Plan ────────────────────────────────────

test('ads plan 有 dailyBudget', function () {
  var plan = planner.buildAdsPlan([], 0, false, null);
  assertType(plan.dailyBudget, 'number');
  assert.ok(plan.dailyBudget > 0);
});

test('ads 周末预算更高', function () {
  var weekday = planner.buildAdsPlan([], 0, false, null);
  var weekend = planner.buildAdsPlan([], 0, true, null);
  assert.ok(weekend.dailyBudget > weekday.dailyBudget, 'weekend should have higher budget');
});

test('ads plan 有平台和出价', function () {
  var plan = planner.buildAdsPlan([], 0, false, null);
  assert.ok(Array.isArray(plan.platforms));
  assert.ok(plan.platforms.length >= 1);
  assert.ok(['standard', 'aggressive'].indexOf(plan.bidding) !== -1);
});

// ─── Group E: Video Plan ──────────────────────────────────

test('video plan 每天 5 条', function () {
  var plan = planner.buildVideoPlan([], 0);
  assert.strictEqual(plan.count, 5);
});

test('video plan 有模板和发布时段', function () {
  var plan = planner.buildVideoPlan([], 0);
  assert.ok(plan.template.length > 0);
  assert.strictEqual(plan.publishSlots.length, 5);
});

test('video 有复盘日', function () {
  var reviewDay = planner.buildVideoPlan([], 3);
  assert.strictEqual(reviewDay.reviewDay, true);
});

// ─── Group F: Inventory Plan ──────────────────────────────

test('inventory plan 有 3 个 SKU', function () {
  var plan = planner.buildInventoryPlan(null, 0);
  assert.strictEqual(plan.items.length, 3);
});

test('inventory 消耗模拟', function () {
  var plan0 = planner.buildInventoryPlan(null, 0);
  var plan5 = planner.buildInventoryPlan(null, 5);
  assert.ok(plan5.items[0].stock < plan0.items[0].stock, 'stock should decrease');
});

// ─── Group G: Plan Summary ────────────────────────────────

test('plan.summary 存在', function () {
  var plan = planner.generate7DayPlan();
  assertExists(plan.summary);
  assertType(plan.summary.totalStrategies, 'number');
  assertExists(plan.summary.riskLevel);
});

test('plan.requiresHumanApproval = true', function () {
  var plan = planner.generate7DayPlan();
  assert.strictEqual(plan.requiresHumanApproval, true);
});

// ─── Group H: REVIEW_ONLY ─────────────────────────────────

test('不含 .env 引用', function () {
  var code = require('fs').readFileSync(__filename.replace('test-strategy-planner.cjs', 'strategy-planner.js'), 'utf-8');
  assert.strictEqual(code.indexOf('.env'), -1);
});

test('不含 deploy/merge', function () {
  var code = require('fs').readFileSync(__filename.replace('test-strategy-planner.cjs', 'strategy-planner.js'), 'utf-8');
  var lower = code.toLowerCase();
  assert.strictEqual(lower.indexOf('deploy'), -1);
  assert.strictEqual(lower.indexOf('merge'), -1);
});

// ─── Group I: Idempotency ─────────────────────────────────

test('generate7DayPlan 幂等 — 每次生成不同 planId', function () {
  var p1 = planner.generate7DayPlan();
  var p2 = planner.generate7DayPlan();
  assert.notStrictEqual(p1.planId, p2.planId);
});

test('deriveStrategies 同输入同输出', function () {
  var s1 = planner.deriveStrategies({ profitMargin: 0.25, refundRate: 0.04 }, { analysis: { score: 75 } }, { gmvTrend: 'stable' });
  var s2 = planner.deriveStrategies({ profitMargin: 0.25, refundRate: 0.04 }, { analysis: { score: 75 } }, { gmvTrend: 'stable' });
  assert.strictEqual(s1.length, s2.length);
  s1.forEach(function (s, i) { assert.strictEqual(s.action, s2[i].action); });
});

// ─── Results ──────────────────────────────────────────────

console.log('');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
