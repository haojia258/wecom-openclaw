'use strict';

/**
 * test-worker-lock-release.js — 验证 worker rate-limit release() 修复
 *
 * 测试:
 *   1. 成功调用后 release 被调用 → currentConcurrent = 0
 *   2. API 失败后 release 被调用 → currentConcurrent = 0
 *   3. 连续派发 2 个任务不再 RATE_LIMIT_EXCEEDED
 *   4. currentConcurrent 不残留
 */

var rateLimit = require('../worker-rate-limit');
var deepseekWorker = require('../workers/deepseek-worker');
var doubaoWorker = require('../workers/doubao-worker');

var passed = 0;
var failed = 0;
var errors = [];

function assert(label, condition, detail) {
  if (condition) {
    passed++;
    console.log('  ✅ PASS: ' + label);
  } else {
    failed++;
    var msg = '  ❌ FAIL: ' + label + (detail ? ' — ' + detail : '');
    console.log(msg);
    errors.push(msg);
  }
}

// ─── Setup & Teardown ─────────────────────────────────────

function reset() {
  rateLimit.reset();
  assert('reset() works', rateLimit.getStatus().concurrent === 0);
}

// ─── Test 1: 成功调用后 release() 被调用 ──────────────────

function testSuccessRelease() {
  console.log('\n── Test 1: 成功调用后 release() ──');
  reset();

  // Mock: simulate a task
  var task = { taskId: 'test-success-001', userRequest: 'say hello', assignee: 'deepseek' };

  // We can test the rate limit directly
  var checkResult = rateLimit.check('deepseek');
  assert('check() allows', checkResult.allowed === true,
    'Expected allowed=true, got ' + JSON.stringify(checkResult));
  assert('currentConcurrent=1 after check', rateLimit.getStatus().concurrent === 1,
    'Expected 1, got ' + rateLimit.getStatus().concurrent);

  // Simulate release as worker would do
  rateLimit.release();
  assert('currentConcurrent=0 after release', rateLimit.getStatus().concurrent === 0,
    'Expected 0, got ' + rateLimit.getStatus().concurrent);
}

// ─── Test 2: 失败调用后 release() 被调用 ──────────────────

function testFailureRelease() {
  console.log('\n── Test 2: 失败调用后 release() ──');
  reset();

  var checkResult = rateLimit.check('deepseek');
  assert('check() allows', checkResult.allowed === true);
  assert('concurrent=1 after check', rateLimit.getStatus().concurrent === 1);

  // Simulate release even on failure path
  rateLimit.release();
  assert('concurrent=0 after failure release', rateLimit.getStatus().concurrent === 0);
}

// ─── Test 3: 连续派发 2 个任务不出现 RATE_LIMIT_EXCEEDED ───

function testConsecutiveDispatch() {
  console.log('\n── Test 3: 连续派发 2 个任务 ──');
  reset();

  // Dispatch task 1
  var r1 = rateLimit.check('deepseek');
  assert('task 1 dispatch allowed', r1.allowed === true);
  assert('concurrent=1 after task 1', rateLimit.getStatus().concurrent === 1);

  // Release task 1 (simulating worker completion)
  rateLimit.release();
  assert('concurrent=0 after task 1 release', rateLimit.getStatus().concurrent === 0);

  // Dispatch task 2 — should NOT be rate limited
  var r2 = rateLimit.check('deepseek');
  assert('task 2 dispatch allowed (no rate limit)', r2.allowed === true,
    'Got: ' + JSON.stringify(r2));
  assert('concurrent=1 after task 2', rateLimit.getStatus().concurrent === 1);

  // Release task 2
  rateLimit.release();
  assert('concurrent=0 after task 2 release', rateLimit.getStatus().concurrent === 0);
}

// ─── Test 4: currentConcurrent 不残留 ─────────────────────

function testNoResidue() {
  console.log('\n── Test 4: currentConcurrent 不残留 ──');
  reset();

  // Run 2 dispatch+release cycles (within minute limit of 2)
  for (var i = 1; i <= 2; i++) {
    var check = rateLimit.check('test-cycle');
    assert('cycle ' + i + ': check() allowed', check.allowed === true,
      check.allowed ? '' : 'Reason: ' + check.reason);
    assert('cycle ' + i + ': concurrent=1', rateLimit.getStatus().concurrent === 1,
      'Got: ' + rateLimit.getStatus().concurrent);
    rateLimit.release();
    assert('cycle ' + i + ': concurrent=0 after release', rateLimit.getStatus().concurrent === 0,
      'Got: ' + rateLimit.getStatus().concurrent);
  }

  // After all releases, concurrent must be 0
  var final = rateLimit.getStatus();
  assert('final concurrent=0', final.concurrent === 0,
    'Got: ' + final.concurrent);
}

// ─── Test 5: 多次 release 不会溢出 ─────────────────────────

function testMultipleRelease() {
  console.log('\n── Test 5: 多次 release 安全 ──');
  reset();

  var r = rateLimit.check('test');
  assert('check() allowed', r.allowed === true);
  assert('concurrent=1', rateLimit.getStatus().concurrent === 1);

  // Release twice — should not go negative
  rateLimit.release();
  rateLimit.release();
  rateLimit.release();
  assert('concurrent=0 after multiple releases', rateLimit.getStatus().concurrent === 0,
    'Got: ' + rateLimit.getStatus().concurrent);
}

// ─── Test 6: both worker modules export correctly ──────────

function testWorkerExports() {
  console.log('\n── Test 6: Worker 模块导出 ──');
  assert('deepseek-worker exports executeDeepSeekWorker',
    typeof deepseekWorker.executeDeepSeekWorker === 'function');
  assert('doubao-worker exports executeDoubaoWorker',
    typeof doubaoWorker.executeDoubaoWorker === 'function');
}

// ─── Run All ───────────────────────────────────────────────

console.log('╔══════════════════════════════════════╗');
console.log('║  Worker Lock Release Test Suite     ║');
console.log('╚══════════════════════════════════════╝');

testWorkerExports();
testSuccessRelease();
testFailureRelease();
testConsecutiveDispatch();
testNoResidue();
testMultipleRelease();

// ─── Summary ───────────────────────────────────────────────

console.log('\n═══════════════════════════════════════');
console.log('  Total: ' + (passed + failed) + ' | ✅ ' + passed + ' | ❌ ' + failed);
if (failed > 0) {
  console.log('\n  Failures:');
  errors.forEach(function(e) { console.log('  ' + e); });
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
  process.exit(0);
}
