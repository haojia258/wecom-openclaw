'use strict';

/**
 * test-goal-manager.cjs — P14.2 Goal Manager Tests
 */

var assert = require('assert');
var fs = require('fs');
var gm = require('./goal-manager');

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

// Reset to defaults before testing
gm.resetToDefaults();
if (fs.existsSync(gm.GOALS_PATH)) fs.unlinkSync(gm.GOALS_PATH);

console.log('\nP14.2 Goal Manager Tests\n');

// ─── Group A: Load/Defaults ───────────────────────────────

test('getAll 返回默认 7 个目标', function () {
  var goals = gm.getAll();
  assert.strictEqual(goals.length, 7);
});

test('getById 返回单个目标', function () {
  var g = gm.getById('goal-gmv');
  assertExists(g);
  assert.strictEqual(g.type, 'gmv');
  assert.strictEqual(g.target, 80000);
});

test('getByType 按类型过滤', function () {
  var gmvGoals = gm.getByType('gmv');
  assert.strictEqual(gmvGoals.length, 1);
  assert.strictEqual(gmvGoals[0].id, 'goal-gmv');
});

// ─── Group B: setGoal ─────────────────────────────────────

test('setGoal 更新已有目标', function () {
  gm.setGoal('goal-gmv', { target: 100000 });
  var g = gm.getById('goal-gmv');
  assert.strictEqual(g.target, 100000);
  gm.setGoal('goal-gmv', { target: 80000 }); // restore
});

test('setGoal 创建新目标', function () {
  gm.setGoal('goal-test', { name: '测试目标', type: 'test', target: 100, current: 50, unit: '个', priority: 'low' });
  var g = gm.getById('goal-test');
  assertExists(g);
  assert.strictEqual(g.target, 100);
  // Clean up
  var goals = gm.getAll().filter(function (g) { return g.id !== 'goal-test'; });
  fs.writeFileSync(gm.GOALS_PATH, JSON.stringify(goals, null, 2));
});

// ─── Group C: updateProgress ──────────────────────────────

test('updateProgress 更新当前值', function () {
  gm.updateProgress('goal-gmv', 50000);
  var g = gm.getById('goal-gmv');
  assert.strictEqual(g.current, 50000);
  gm.updateProgress('goal-gmv', 48000); // restore
});

test('updateProgress 不存在目标返回 null', function () {
  var result = gm.updateProgress('nonexistent', 100);
  assert.strictEqual(result, null);
});

// ─── Group D: getProgress ─────────────────────────────────

test('getProgress 返回进度对象', function () {
  var progress = gm.getProgress();
  assertExists(progress);
  assert.ok(Array.isArray(progress.goals));
  assertExists(progress.summary);
});

test('getProgress 每个目标有 completion', function () {
  var progress = gm.getProgress();
  progress.goals.forEach(function (g) {
    assertType(g.completion, 'number');
    assertRange(g.completion, 0, 5); // can be >1 for exceeded
    assertExists(g.status);
    assert.ok(['exceeded', 'on_track', 'at_risk', 'behind'].indexOf(g.status) !== -1);
  });
});

test('getProgress summary 计数自洽', function () {
  fs.writeFileSync(gm.GOALS_PATH, JSON.stringify(gm.DEFAULT_GOALS, null, 2));
  var progress = gm.getProgress();
  var s = progress.summary;
  // 类型分布之和应等于总数
  var total = s.onTrack + s.atRisk + s.behind + s.exceeded;
  assert.strictEqual(total, s.total);
  assert.ok(s.total >= 7);
});

test('getProgress avgCompletion 在 0-100', function () {
  var progress = gm.getProgress();
  var avg = parseFloat(progress.summary.avgCompletion);
  assertRange(avg, 0, 100);
});

test('超额目标 status=exceeded', function () {
  gm.updateProgress('goal-gmv', 100000);
  var progress = gm.getProgress();
  var g = progress.goals.find(function (g) { return g.id === 'goal-gmv'; });
  assert.strictEqual(g.status, 'exceeded');
  gm.updateProgress('goal-gmv', 48000); // restore
});

// ─── Group E: Goal-driven Decisions ───────────────────────

test('getGoalDrivenDecisions 返回决策对象', function () {
  var decisions = gm.getGoalDrivenDecisions();
  assertExists(decisions);
  assert.ok(Array.isArray(decisions.drivers));
  assertExists(decisions.summary);
});

test('落后目标产生决策', function () {
  gm.updateProgress('goal-gmv', 10000); // make it behind
  var decisions = gm.getGoalDrivenDecisions();
  var gmvDec = decisions.drivers.find(function (d) { return d.goalId === 'goal-gmv'; });
  assertExists(gmvDec, 'should have decision for behind goal');
  assert.strictEqual(gmvDec.priority, 'high');
  gm.updateProgress('goal-gmv', 48000); // restore
});

test('应急目标有建议', function () {
  gm.updateProgress('goal-roi', 0.5);
  var decisions = gm.getGoalDrivenDecisions();
  var roiDec = decisions.drivers.find(function (d) { return d.goalId === 'goal-roi'; });
  assertExists(roiDec);
  assertExists(roiDec.suggestion);
  gm.updateProgress('goal-roi', 2.2); // restore
});

// ─── Group F: REVIEW_ONLY ─────────────────────────────────

test('不含 .env 引用', function () {
  var code = fs.readFileSync(__filename.replace('test-goal-manager.cjs', 'goal-manager.js'), 'utf-8');
  assert.strictEqual(code.indexOf('.env'), -1);
});

test('不含 deploy/merge', function () {
  var code = fs.readFileSync(__filename.replace('test-goal-manager.cjs', 'goal-manager.js'), 'utf-8');
  var lower = code.toLowerCase();
  assert.strictEqual(lower.indexOf('deploy'), -1);
  assert.strictEqual(lower.indexOf('merge'), -1);
});

// ─── Group G: Idempotency ─────────────────────────────────

test('getProgress 幂等', function () {
  var p1 = gm.getProgress();
  var p2 = gm.getProgress();
  assert.strictEqual(p1.goals.length, p2.goals.length);
  assert.strictEqual(p1.summary.total, p2.summary.total);
});

test('resetToDefaults 恢复 7 个目标', function () {
  gm.setGoal('goal-gmv', { target: 99999 });
  gm.resetToDefaults();
  var g = gm.getById('goal-gmv');
  assert.strictEqual(g.target, 80000);
});

// ─── Results ──────────────────────────────────────────────

console.log('');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
