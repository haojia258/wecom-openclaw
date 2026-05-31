'use strict';

var assert = require('assert');
var ep = require('./execution-planner');
var fs = require('fs');

var passed = 0, failed = 0;
function test(n, f) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.log('  ✗ ' + n + ' — ' + e.message); } }
function assertExists(v) { assert.ok(v != null); }
function assertType(v, t) { assert.strictEqual(typeof v, t); }
function assertRange(v, mn, mx) { assert.ok(v >= mn && v <= mx); }

console.log('\nP14.3 Execution Planner Tests\n');

test('generateTaskPlan 返回完整对象', function () {
  var plan = ep.generateTaskPlan();
  assertExists(plan);
  assertExists(plan.planId);
  assert.ok(plan.planId.startsWith('plan-'));
  assert.ok(Array.isArray(plan.tasks));
  assert.ok(Array.isArray(plan.phases));
});

test('3个 phase', function () { assert.strictEqual(ep.generateTaskPlan().phases.length, 3); });

test('每个 task 完整', function () {
  ep.generateTaskPlan().tasks.forEach(function (t) {
    assertExists(t.id); assertExists(t.action); assertExists(t.owner);
    assertExists(t.priority); assertExists(t.deadline); assertExists(t.reason);
    assert.ok(['urgent', 'normal', 'low'].indexOf(t.priority) !== -1);
  });
});

test('task deadline 格式为 YYYY-MM-DD', function () {
  ep.generateTaskPlan().tasks.forEach(function (t) {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(t.deadline), 'invalid deadline: ' + t.deadline);
  });
});

test('summary 统计正确', function () {
  var s = ep.generateTaskPlan().summary;
  assertType(s.total, 'number');
  assert.ok(s.total > 0);
  assert.ok(Array.isArray(s.owners));
});

test('不含 .env', function () {
  var c = fs.readFileSync(__filename.replace('test-execution-planner.cjs', 'execution-planner.js'), 'utf-8');
  assert.strictEqual(c.indexOf('.env'), -1);
});

test('不含 deploy/merge', function () {
  var c = fs.readFileSync(__filename.replace('test-execution-planner.cjs', 'execution-planner.js'), 'utf-8').toLowerCase();
  assert.strictEqual(c.indexOf('deploy'), -1);
  assert.strictEqual(c.indexOf('merge'), -1);
});

test('幂等 — 每次不同 planId', function () {
  assert.notStrictEqual(ep.generateTaskPlan().planId, ep.generateTaskPlan().planId);
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
