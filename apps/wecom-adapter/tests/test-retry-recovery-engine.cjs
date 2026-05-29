'use strict';

/**
 * test-retry-recovery-engine.cjs - P10.2 Retry & Recovery Engine 专项测试
 *
 * 9 组测试:
 *   A: Retry Policy (策略查询, delay 计算, 策略验证)
 *   B: Failure Classifier (6 种失败类型识别)
 *   C: Retry Engine (重试调度, 执行, 耗尽)
 *   D: Exponential Backoff (指数退避验证)
 *   E: Rollback Path (回滚触发, 完成, 失败)
 *   F: Recovery Success (统一恢复成功路径)
 *   G: Unrecoverable Failure (不可恢复失败处理)
 *   H: Event Emission (事件写入正确性)
 *   I: State Machine Compatibility (与 P10.1 兼容性)
 */

var fs = require('fs');
var path = require('path');
var http = require('http');

// ─── 测试环境隔离 ─────────────────────────────────────────

var TEST_DB_DIR = path.resolve(__dirname, '../logs/recovery-test');
if (!fs.existsSync(TEST_DB_DIR)) {
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
}

process.env.TASK_DB_PATH = path.resolve(TEST_DB_DIR, 'test-recovery.db');
process.env.TASK_LOG_DIR = path.resolve(TEST_DB_DIR);
process.env.RETRY_TEST_FAST = '1'; // 跳过 cooldown 延迟，加速测试

// 清理旧测试数据
(function() {
  var dbPath = process.env.TASK_DB_PATH;
  var files = [dbPath, dbPath + '-wal', dbPath + '-shm'];
  for (var i = 0; i < files.length; i++) {
    if (fs.existsSync(files[i])) {
      try { fs.unlinkSync(files[i]); } catch (_) {}
    }
  }
})();

var taskDb = require('../src/storage/task-db');
var missionStore = require('../src/mission/mission-store');
var policyEngine = require('../src/mission/retry-policy-engine');
var classifier = require('../src/mission/failure-classifier');
var retryEngine = require('../src/mission/retry-engine');
var rollbackEngine = require('../src/mission/rollback-engine');
var recoveryEngine = require('../src/mission/recovery-engine');
var stateMachine = require('../src/mission/workflow-state-machine');
var transitionEngine = require('../src/mission/workflow-transition-engine');

// ─── 测试工具 ─────────────────────────────────────────────

var passed = 0;
var failed = 0;
var failures = [];

function assert(condition, message) {
  if (condition) { passed++; }
  else { failed++; failures.push('FAIL: ' + message); }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) { passed++; }
  else { failed++; failures.push('FAIL: ' + message + ' - expected: ' + JSON.stringify(expected) + ', actual: ' + JSON.stringify(actual)); }
}

function assertNotNull(value, message) {
  if (value !== null && value !== undefined) { passed++; }
  else { failed++; failures.push('FAIL: ' + message + ' - value is null/undefined'); }
}

function assertThrows(fn, expectedMsg, message) {
  var threw = false;
  try { fn(); }
  catch (e) {
    threw = true;
    if (expectedMsg && e.message.indexOf(expectedMsg) === -1) {
      failed++;
      failures.push('FAIL: ' + message + ' - wrong error: ' + e.message);
      return;
    }
  }
  if (threw) { passed++; }
  else { failed++; failures.push('FAIL: ' + message + ' - expected exception not thrown'); }
}

// ─── 辅助函数 ─────────────────────────────────────────────

function setupTestTask(id, stage) {
  return missionStore.createMissionTask({
    id: id,
    title: 'Test Task ' + id,
    description: 'Test recovery engine',
    status: 'running',
    owner_agent: 'test-agent',
    current_stage: stage || 'queued'
  });
}

function getTask(id) {
  return missionStore.getMissionTask(id);
}

function listEvents(taskId) {
  return missionStore.listAgentEvents(taskId, { limit: 200 });
}

// ═══════════════════════════════════════════════════════════
// A: Retry Policy
// ═══════════════════════════════════════════════════════════

console.log('\n=== A: Retry Policy ===\n');

// A1: getRetryPolicy for staging_deploy
var sp = policyEngine.getRetryPolicy('staging_deploy');
assertNotNull(sp, 'A1a: staging_deploy policy exists');
assertEqual(sp.retries, 3, 'A1b: staging_deploy retries=3');
assertEqual(sp.strategy, 'exponential', 'A1c: staging_deploy strategy=exponential');
assertEqual(sp.cooldown_ms, 30000, 'A1d: staging_deploy cooldown_ms=30000');

// A2: getRetryPolicy for production_deploy
var pp = policyEngine.getRetryPolicy('production_deploy');
assertNotNull(pp, 'A2a: production_deploy policy exists');
assertEqual(pp.retries, 2, 'A2b: production_deploy retries=2');
assertEqual(pp.strategy, 'linear', 'A2c: production_deploy strategy=linear');
assertEqual(pp.cooldown_ms, 60000, 'A2d: production_deploy cooldown_ms=60000');

// A3: getRetryPolicy for unknown stage → default
var dp = policyEngine.getRetryPolicy('unknown_stage');
assertNotNull(dp, 'A3a: unknown stage returns default policy');
assertEqual(dp.retries, 3, 'A3b: default retries=3');

// A4: calculateDelay - fixed strategy
var fixedPolicy = { strategy: 'fixed', cooldown_ms: 10000 };
assertEqual(policyEngine.calculateDelay(fixedPolicy, 1), 10000, 'A4a: fixed attempt#1 = 10000');
assertEqual(policyEngine.calculateDelay(fixedPolicy, 2), 10000, 'A4b: fixed attempt#2 = 10000');
assertEqual(policyEngine.calculateDelay(fixedPolicy, 3), 10000, 'A4c: fixed attempt#3 = 10000');

// A5: calculateDelay - linear strategy
var linearPolicy = { strategy: 'linear', cooldown_ms: 10000 };
assertEqual(policyEngine.calculateDelay(linearPolicy, 1), 10000, 'A5a: linear attempt#1 = 10000');
assertEqual(policyEngine.calculateDelay(linearPolicy, 2), 20000, 'A5b: linear attempt#2 = 20000');
assertEqual(policyEngine.calculateDelay(linearPolicy, 3), 30000, 'A5c: linear attempt#3 = 30000');

// A6: calculateDelay - exponential strategy
var expPolicy = { strategy: 'exponential', cooldown_ms: 10000 };
assertEqual(policyEngine.calculateDelay(expPolicy, 1), 10000, 'A6a: exponential attempt#1 = 10000');
assertEqual(policyEngine.calculateDelay(expPolicy, 2), 20000, 'A6b: exponential attempt#2 = 20000');
assertEqual(policyEngine.calculateDelay(expPolicy, 3), 40000, 'A6c: exponential attempt#3 = 40000');

// A7: getMaxRetries
assertEqual(policyEngine.getMaxRetries('staging_deploy'), 3, 'A7a: staging max=3');
assertEqual(policyEngine.getMaxRetries('production_deploy'), 2, 'A7b: production max=2');
assertEqual(policyEngine.getMaxRetries('unknown'), 3, 'A7c: unknown max=3 (default)');

// A8: isMaxRetriesReached
assert(!policyEngine.isMaxRetriesReached('staging_deploy', 0), 'A8a: 0 < 3');
assert(!policyEngine.isMaxRetriesReached('staging_deploy', 2), 'A8b: 2 < 3');
assert(policyEngine.isMaxRetriesReached('staging_deploy', 3), 'A8c: 3 >= 3');
assert(policyEngine.isMaxRetriesReached('staging_deploy', 5), 'A8d: 5 >= 3');

// A9: validatePolicy
var vResult = policyEngine.validatePolicy({ retries: 3, strategy: 'exponential', cooldown_ms: 30000 });
assert(vResult.valid, 'A9a: valid policy passes');
var vBad = policyEngine.validatePolicy({ retries: 0, strategy: 'fixed', cooldown_ms: 1000 });
assert(!vBad.valid, 'A9b: retries=0 fails validation');

// ═══════════════════════════════════════════════════════════
// B: Failure Classifier
// ═══════════════════════════════════════════════════════════

console.log('\n=== B: Failure Classifier ===\n');

// B1: timeout detection
var t1 = classifier.classifyFailure('TASK_FAILED', 'Connection ETIMEDOUT', null);
assertEqual(t1.failure_type, 'timeout', 'B1a: ETIMEDOUT → timeout');
assert(t1.recoverable, 'B1b: timeout is recoverable');
assertEqual(t1.recommended_action, 'retry', 'B1c: timeout recommends retry');

// B2: timeout via exit code 124
var t2 = classifier.classifyFailure('FAILED', 'Process exited', 124);
assertEqual(t2.failure_type, 'timeout', 'B2a: exitCode 124 → timeout');

// B3: network detection
var t3 = classifier.classifyFailure('TASK_FAILED', 'ECONNREFUSED 127.0.0.1:8080', null);
assertEqual(t3.failure_type, 'network', 'B3a: ECONNREFUSED → network');
assert(t3.recoverable, 'B3b: network is recoverable');

// B4: validation detection
var t4 = classifier.classifyFailure('BUILD_FAILED', 'Schema validation error: missing field', null);
assertEqual(t4.failure_type, 'validation', 'B4a: validation → validation');
assert(!t4.recoverable, 'B4b: validation is NOT recoverable');
assertEqual(t4.recommended_action, 'manual_review', 'B4c: validation recommends manual_review');

// B5: governance detection
var t5 = classifier.classifyFailure('DEPLOY_REJECTED', 'Policy rejected: unauthorized', null);
assertEqual(t5.failure_type, 'governance', 'B5a: governance → governance');
assert(!t5.recoverable, 'B5b: governance is NOT recoverable');

// B6: runtime crash detection
var t6 = classifier.classifyFailure('CRASH', 'SIGSEGV: segmentation fault', null);
assertEqual(t6.failure_type, 'runtime_crash', 'B6a: SIGSEGV → runtime_crash');
assert(t6.recoverable, 'B6b: runtime_crash is recoverable');

// B7: unknown type (use a truly unclassifiable message and null exit code)
var t7 = classifier.classifyFailure('MYSTERY_ERROR', 'An inexplicable quantum fluctuation occurred', null);
assertEqual(t7.failure_type, 'unknown', 'B7a: unclassifiable → unknown');
assert(!t7.recoverable, 'B7b: unknown is NOT recoverable');
assertEqual(t7.matched_rule, 'fallback', 'B7c: unknown uses fallback rule');

// B8: isRecoverable helper
assert(classifier.isRecoverable('network'), 'B8a: network recoverable');
assert(classifier.isRecoverable('timeout'), 'B8b: timeout recoverable');
assert(classifier.isRecoverable('runtime_crash'), 'B8c: runtime_crash recoverable');
assert(!classifier.isRecoverable('validation'), 'B8d: validation not recoverable');
assert(!classifier.isRecoverable('governance'), 'B8e: governance not recoverable');

// ═══════════════════════════════════════════════════════════
// C: Retry Engine (core logic, no async)
// ═══════════════════════════════════════════════════════════

console.log('\n=== C: Retry Engine ===\n');

// C1: isRetryExhausted
var taskC1 = setupTestTask('retry-c1', 'staging');
assert(!retryEngine.isRetryExhausted(taskC1, 'staging_deploy'), 'C1a: 0 retries, not exhausted');
missionStore.updateMissionTask('retry-c1', { retry_count: 3 });
var updatedC1 = getTask('retry-c1');
assert(retryEngine.isRetryExhausted(updatedC1, 'staging_deploy'), 'C1b: 3 retries, exhausted');

// C2: getRemainingRetries
var taskC2 = setupTestTask('retry-c2', 'staging');
assertEqual(retryEngine.getRemainingRetries(taskC2, 'staging_deploy'), 3, 'C2a: remaining=3 at start');
missionStore.updateMissionTask('retry-c2', { retry_count: 1 });
var updatedC2 = getTask('retry-c2');
assertEqual(retryEngine.getRemainingRetries(updatedC2, 'staging_deploy'), 2, 'C2b: remaining=2 after 1 retry');

// C3: executeRetry success (put task in recoverable state: failed)
var taskC3 = setupTestTask('retry-c3', 'failed');
var resultC3 = retryEngine.executeRetry(taskC3, 1, 3);
assert(resultC3.success, 'C3a: executeRetry from failed succeeds (RE_RUN → running)');
var updatedC3 = getTask('retry-c3');
assertEqual(updatedC3.current_stage, 'running', 'C3b: current_stage now running');
assertEqual(updatedC3.retry_count, 0, 'C3c: retry_count reset to 0');

// C4: executeRetry failure - not exhausted
var taskC4 = setupTestTask('retry-c4', 'completed'); // completed state, RE_RUN invalid
var resultC4 = retryEngine.executeRetry(taskC4, 1, 3);
assert(!resultC4.success, 'C4a: RE_RUN from completed fails');
assert(!resultC4.exhausted, 'C4b: not exhausted (attempt 1 of 3)');

// C5: executeRetry failure - exhausted
var taskC5 = setupTestTask('retry-c5', 'completed');
var resultC5 = retryEngine.executeRetry(taskC5, 3, 3);
assert(!resultC5.success, 'C5a: executeRetry fails');
assert(resultC5.exhausted, 'C5b: exhausted after 3rd attempt');
var updatedC5 = getTask('retry-c5');
assertEqual(updatedC5.recovery_status, 'retry_exhausted', 'C5c: recovery_status=retry_exhausted');

// C6: event emission via retry-engine
var taskC6 = setupTestTask('retry-c6', 'failed');
retryEngine.emitEvent('retry-c6', 'RETRY_SCHEDULED', { retry_count: 1, delay: 30000 });
var eventsC6 = listEvents('retry-c6');
var evtC6 = eventsC6[0]; // most recent first
assertNotNull(evtC6, 'C6a: RETRY_SCHEDULED event written');
assertEqual(evtC6.event_type, 'RETRY_SCHEDULED', 'C6b: event_type correct');
assertNotNull(evtC6.payload, 'C6c: payload exists');

// ═══════════════════════════════════════════════════════════
// D: Exponential Backoff
// ═══════════════════════════════════════════════════════════

console.log('\n=== D: Exponential Backoff ===\n');

// D1: delay grows exponentially
var expP = { strategy: 'exponential', cooldown_ms: 10000 };
assertEqual(policyEngine.calculateDelay(expP, 1), 10000, 'D1a: 2^0 * 10k = 10k');
assertEqual(policyEngine.calculateDelay(expP, 2), 20000, 'D1b: 2^1 * 10k = 20k');
assertEqual(policyEngine.calculateDelay(expP, 3), 40000, 'D1c: 2^2 * 10k = 40k');
assertEqual(policyEngine.calculateDelay(expP, 4), 80000, 'D1d: 2^3 * 10k = 80k');
assertEqual(policyEngine.calculateDelay(expP, 5), 160000, 'D1e: 2^4 * 10k = 160k');

// D2: delay capped at 5 minutes (300000ms)
var highDelay = policyEngine.calculateDelay(expP, 10);
assert(highDelay <= 300000, 'D2a: delay capped at 300000ms');

// D3: linear delay for production
var linP = { strategy: 'linear', cooldown_ms: 60000 };
assertEqual(policyEngine.calculateDelay(linP, 1), 60000, 'D3a: linear attempt#1 = 60k');
assertEqual(policyEngine.calculateDelay(linP, 2), 120000, 'D3b: linear attempt#2 = 120k');

// ═══════════════════════════════════════════════════════════
// E: Rollback Path
// ═══════════════════════════════════════════════════════════

console.log('\n=== E: Rollback Path ===\n');

// E1: canRollback
assert(rollbackEngine.canRollback('staging'), 'E1a: staging is rollbackable');
assert(rollbackEngine.canRollback('production'), 'E1b: production is rollbackable');
assert(!rollbackEngine.canRollback('queued'), 'E1c: queued is NOT rollbackable');
assert(!rollbackEngine.canRollback('running'), 'E1d: running is NOT rollbackable');
assert(!rollbackEngine.canRollback('testing'), 'E1e: testing is NOT rollbackable');

// E2: triggerRollback from staging
var taskE2 = setupTestTask('rollback-e2', 'staging');
var resultE2 = rollbackEngine.triggerRollback(taskE2, 'network');
assert(resultE2.success, 'E2a: rollback from staging succeeds');
assertEqual(resultE2.rollback_state, 'completed', 'E2b: rollback_state=completed');
var updatedE2 = getTask('rollback-e2');
assertEqual(updatedE2.current_stage, 'rollback', 'E2c: current_stage=rollback');
assertEqual(updatedE2.rollback_state, 'completed', 'E2d: rollback_state in DB=completed');

// E3: triggerRollback from production
var taskE3 = setupTestTask('rollback-e3', 'production');
var resultE3 = rollbackEngine.triggerRollback(taskE3, 'timeout');
assert(resultE3.success, 'E3a: rollback from production succeeds');
var updatedE3 = getTask('rollback-e3');
assertEqual(updatedE3.current_stage, 'rollback', 'E3b: current_stage=rollback');

// E4: triggerRollback from invalid stage
var taskE4 = setupTestTask('rollback-e4', 'queued');
var resultE4 = rollbackEngine.triggerRollback(taskE4, 'network');
assert(!resultE4.success, 'E4a: rollback from queued fails');
assert(resultE4.error.indexOf('does not support rollback') !== -1, 'E4b: error message correct');

// E5: rollback events
var taskE5 = setupTestTask('rollback-e5', 'staging');
rollbackEngine.triggerRollback(taskE5, 'runtime_crash');
var eventsE5 = listEvents('rollback-e5');
var evtTypes = eventsE5.map(function(e) { return e.event_type; });
assert(evtTypes.indexOf('ROLLBACK_TRIGGERED') !== -1, 'E5a: ROLLBACK_TRIGGERED event');
assert(evtTypes.indexOf('ROLLBACK_COMPLETED') !== -1, 'E5b: ROLLBACK_COMPLETED event');
assert(evtTypes.indexOf('TASK_STAGE_CHANGED') !== -1, 'E5c: TASK_STAGE_CHANGED event (from transition engine)');

// ═══════════════════════════════════════════════════════════
// F: Recovery Success
// ═══════════════════════════════════════════════════════════

console.log('\n=== F: Recovery Success ===\n');

// F1: complete recovery via retry (staging, network failure)
var taskF1 = setupTestTask('recover-f1', 'staging');
// Manually set task to failed state first
transitionEngine.attemptTransition('recover-f1', 'FAILED');
var f1Failed = getTask('recover-f1');
assertEqual(f1Failed.current_stage, 'failed', 'F1a: task in failed state');

// Now handle a network failure (recoverable)
recoveryEngine.handleFailure(f1Failed, {
  event_type: 'TASK_FAILED',
  error_message: 'ECONNREFUSED connection to staging server',
  exit_code: null
}).then(function(f1Result) {
  assert(f1Result.success, 'F1b: recovery via retry succeeded');
  assertEqual(f1Result.action_taken, 'retry', 'F1c: action=retry');
  assertEqual(f1Result.failure_type, 'network', 'F1d: failure_type=network');

  // Verify task recovered
  var f1Recovered = getTask('recover-f1');
  assertEqual(f1Recovered.current_stage, 'running', 'F1e: stage back to running');
  assertEqual(f1Recovered.recovery_status, 'recovered', 'F1f: recovery_status=recovered');
  assertEqual(f1Recovered.retry_count, 0, 'F1g: retry_count reset');

  // Verify events
  var eventsF1 = listEvents('recover-f1');
  var typesF1 = eventsF1.map(function(e) { return e.event_type; });
  assert(typesF1.indexOf('RECOVERY_SUCCESS') !== -1, 'F1h: RECOVERY_SUCCESS event emitted');

  // Run next test
  runTestG();
});

function runTestG() {

// ═══════════════════════════════════════════════════════════
// G: Unrecoverable Failure
// ═══════════════════════════════════════════════════════════

console.log('\n=== G: Unrecoverable Failure ===\n');

// G1: validation failure → unrecoverable (rollback attempts from staging)
var taskG1 = setupTestTask('recover-g1', 'staging');

recoveryEngine.handleFailure(taskG1, {
  event_type: 'BUILD_FAILED',
  error_message: 'Schema validation error: missing required field "version"',
  exit_code: 1
}).then(function(g1Result) {
  assert(g1Result.success, 'G1a: rollback from staging succeeded');
  assertEqual(g1Result.action_taken, 'rollback', 'G1b: action=rollback');
  assertEqual(g1Result.failure_type, 'validation', 'G1c: failure_type=validation');

  // G2: governance failure → unrecoverable (rollback from production)
  var taskG2 = setupTestTask('recover-g2', 'production');

  recoveryEngine.handleFailure(taskG2, {
    event_type: 'DEPLOY_REJECTED',
    error_message: 'Governance policy rejected: requires 2 approvals',
    exit_code: null
  }).then(function(g2Result) {
    assert(g2Result.success, 'G2a: rollback from production succeeded');
    assertEqual(g2Result.action_taken, 'rollback', 'G2b: action=rollback');

    // G3: unknown failure on non-rollbackable stage → truly unrecoverable
    var taskG3 = setupTestTask('recover-g3', 'testing');

    recoveryEngine.handleFailure(taskG3, {
      event_type: 'BIZARRE_ERROR',
      error_message: 'An inexplicable quantum fluctuation occurred in the pipeline',
      exit_code: null
    }).then(function(g3Result) {
      assert(!g3Result.success, 'G3a: unknown failure unrecoverable');
      assertEqual(g3Result.action_taken, 'none', 'G3b: no action taken');
      assertEqual(g3Result.recovery_status, 'unrecoverable', 'G3c: recovery_status=unrecoverable');

      var g3Updated = getTask('recover-g3');
      assertEqual(g3Updated.recovery_status, 'unrecoverable', 'G3d: DB shows unrecoverable');
      assertEqual(g3Updated.last_failure_type, 'unknown', 'G3e: last_failure_type=unknown');

      runTestH();
    });
  });
});

} // end runTestG

function runTestH() {

// ═══════════════════════════════════════════════════════════
// H: Event Emission Correctness
// ═══════════════════════════════════════════════════════════

console.log('\n=== H: Event Emission ===\n');

// Collect all events from a full recovery scenario
var taskH = setupTestTask('events-h1', 'staging');
transitionEngine.attemptTransition('events-h1', 'FAILED');
var hFailed = getTask('events-h1');

recoveryEngine.handleFailure(hFailed, {
  event_type: 'TASK_FAILED',
  error_message: 'ETIMEDOUT connection timeout',
  exit_code: null
}).then(function(hResult) {
  assert(hResult.success, 'H1a: recovery succeeded');

  var allEvents = listEvents('events-h1');
  var eventTypes = allEvents.map(function(e) { return e.event_type; }).reverse(); // chron order
  console.log('  Events: ' + eventTypes.join(' → '));

  // Verify key events exist in the chain
  assert(eventTypes.indexOf('TASK_STAGE_CHANGED') !== -1, 'H1b: TASK_STAGE_CHANGED event present (FAILED transition)');
  assert(eventTypes.indexOf('RETRY_SCHEDULED') !== -1, 'H1c: RETRY_SCHEDULED event present');
  assert(eventTypes.indexOf('RETRY_STARTED') !== -1, 'H1d: RETRY_STARTED event present');
  assert(eventTypes.indexOf('RETRY_SUCCESS') !== -1, 'H1e: RETRY_SUCCESS event present');
  assert(eventTypes.indexOf('RECOVERY_SUCCESS') !== -1, 'H1f: RECOVERY_SUCCESS event present');

  // H2: Retry exhaustion event chain
  var taskH2 = setupTestTask('events-h2', 'completed'); // can't RE_RUN from completed
  missionStore.updateMissionTask('events-h2', { retry_count: 3, current_stage: 'completed' });
  var h2Exhausted = getTask('events-h2');
  retryEngine.executeRetry(h2Exhausted, 3, 3);
  var h2events = listEvents('events-h2');
  var h2types = h2events.map(function(e) { return e.event_type; });
  assert(h2types.indexOf('RETRY_STARTED') !== -1, 'H2a: RETRY_STARTED fired');
  assert(h2types.indexOf('RETRY_EXHAUSTED') !== -1, 'H2b: RETRY_EXHAUSTED fired');

  // H3: Rollback event chain (already verified in E5)
  var taskH3 = setupTestTask('events-h3', 'production');
  rollbackEngine.triggerRollback(taskH3, 'timeout');
  var h3events = listEvents('events-h3');
  var h3types = h3events.map(function(e) { return e.event_type; });
  assert(h3types.indexOf('ROLLBACK_TRIGGERED') !== -1, 'H3a: ROLLBACK_TRIGGERED');
  assert(h3types.indexOf('ROLLBACK_COMPLETED') !== -1, 'H3b: ROLLBACK_COMPLETED');

  // H4: Event payload integrity
  var scheduledEvt = allEvents.find(function(e) { return e.event_type === 'RETRY_SCHEDULED'; });
  assertNotNull(scheduledEvt, 'H4a: RETRY_SCHEDULED event found');
  assertNotNull(scheduledEvt.payload, 'H4b: has payload');
  assert(typeof scheduledEvt.payload.retry_count === 'number', 'H4c: retry_count in payload');
  assert(typeof scheduledEvt.payload.next_retry_delay_ms === 'number', 'H4d: delay in payload');

  // H5: Recovery status tracking
  var hTask = getTask('events-h1');
  assertEqual(hTask.recovery_status, 'recovered', 'H5a: recovery_status=recovered');
  assertEqual(hTask.last_failure_type, '', 'H5b: last_failure_type cleared after success');

  runTestI();
});

} // end runTestH

function runTestI() {

// ═══════════════════════════════════════════════════════════
// I: State Machine Compatibility
// ═══════════════════════════════════════════════════════════

console.log('\n=== I: State Machine Compatibility ===\n');

// I1: Existing P10.1 transitions still work after P10.2 modules loaded
var taskI1 = setupTestTask('compat-i1', 'queued');
var transI1 = transitionEngine.attemptTransition('compat-i1', 'PR_CREATED');
assert(transI1.success, 'I1a: PR_CREATED queued→running still works');
assertEqual(transI1.to_stage, 'running', 'I1b: to_stage=running');

// I2: Full forward flow still valid
transitionEngine.attemptTransition('compat-i1', 'TEST_PASSED');
transitionEngine.attemptTransition('compat-i1', 'AUDIT_PASSED');
transitionEngine.attemptTransition('compat-i1', 'STAGING_DEPLOYED');
var i1staging = getTask('compat-i1');
assertEqual(i1staging.current_stage, 'production', 'I2a: full flow queued→running→testing→staging→production works');

// I3: FAILED → running (via RE_RUN)
var taskI3 = setupTestTask('compat-i3', 'queued');
transitionEngine.attemptTransition('compat-i3', 'PR_CREATED');
transitionEngine.attemptTransition('compat-i3', 'FAILED');
var i3failed = getTask('compat-i3');
assertEqual(i3failed.current_stage, 'failed', 'I3a: in failed state');
var transI3 = transitionEngine.attemptTransition('compat-i3', 'RE_RUN');
assert(transI3.success, 'I3b: RE_RUN failed→running works');
assertEqual(transI3.to_stage, 'running', 'I3c: to_stage=running');

// I4: production → rollback → running cycle
var taskI4 = setupTestTask('compat-i4', 'production');
var transI4a = transitionEngine.attemptTransition('compat-i4', 'ROLLBACK_INITIATED');
assert(transI4a.success, 'I4a: ROLLBACK_INITIATED production→rollback');
var transI4b = transitionEngine.attemptTransition('compat-i4', 'RE_RUN');
assert(transI4b.success, 'I4b: RE_RUN rollback→running');

// I5: isRecoverableState still works
assert(stateMachine.isRecoverableState('failed'), 'I5a: failed is recoverable');
assert(stateMachine.isRecoverableState('rollback'), 'I5b: rollback is recoverable');
assert(!stateMachine.isRecoverableState('completed'), 'I5c: completed is NOT recoverable');

// I6: Event creation via store still works
var taskI6 = setupTestTask('compat-i6', 'running');
var evtCreated = missionStore.createAgentEvent({
  mission_task_id: 'compat-i6',
  event_type: 'TEST_PASSED',
  stage: null,
  payload: { source: 'compat-test' }
});
assertNotNull(evtCreated, 'I6a: event created successfully');
assertEqual(evtCreated.event_type, 'TEST_PASSED', 'I6b: correct event type');
assertNotNull(evtCreated.id, 'I6c: event has auto-generated id');

// Done with unit tests, run API integration tests
runAPITests();
}

// ═══════════════════════════════════════════════════════════
// API Integration Tests
// ═══════════════════════════════════════════════════════════

var routesPassed = 0;
var routesFailed = 0;
var routesFailures = [];

function routeAssert(condition, message) {
  if (condition) { routesPassed++; }
  else { routesFailed++; routesFailures.push('FAIL: ' + message); }
}

function routeAssertEqual(actual, expected, message) {
  if (actual === expected) { routesPassed++; }
  else { routesFailed++; routesFailures.push('FAIL: ' + message + ' - expected: ' + JSON.stringify(expected) + ', actual: ' + JSON.stringify(actual)); }
}

var express = require('express');
var missionRoutes = require('../src/mission/mission-routes');
var testApp = express();
testApp.disable('x-powered-by');
missionRoutes.registerMissionRoutes(testApp);

var TEST_PORT = 13997;
var server = null;

function httpPost(path, body, callback) {
  var json = JSON.stringify(body);
  var opts = {
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: path,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) }
  };
  var req = http.request(opts, function(res) {
    var data = '';
    res.on('data', function(c) { data += c; });
    res.on('end', function() {
      var result = { status: res.statusCode, body: null };
      try { result.body = JSON.parse(data); } catch (_) { result.body = data; }
      callback(null, result);
    });
  });
  req.on('error', function(e) { callback(e); });
  req.write(json);
  req.end();
}

function startServer(callback) {
  server = testApp.listen(TEST_PORT, '127.0.0.1', callback);
}

function stopServer() {
  if (server) { server.close(); }
}

function runAPITests() {

  console.log('\n=== API Integration Tests ===\n');

  // API-1: POST /mission/recovery with recoverable failure
  var apiTask1 = setupTestTask('api-recov-1', 'staging');
  transitionEngine.attemptTransition('api-recov-1', 'FAILED');

  httpPost('/mission/recovery', {
    mission_task_id: 'api-recov-1',
    event_type: 'TASK_FAILED',
    error_message: 'ECONNREFUSED: staging deploy failed',
    exit_code: null
  }, function(err1, resp1) {
    routeAssert(!err1, 'API1a: POST /recovery no error');
    routeAssertEqual(resp1.status, 200, 'API1b: status=200');
    routeAssert(resp1.body.success, 'API1c: recovery succeeded');
    routeAssertEqual(resp1.body.action_taken, 'retry', 'API1d: action=retry');
    routeAssertEqual(resp1.body.failure_type, 'network', 'API1e: failure_type=network');

    // API-2: POST /mission/recovery with unrecoverable failure
    var apiTask2 = setupTestTask('api-recov-2', 'testing');
    httpPost('/mission/recovery', {
      mission_task_id: 'api-recov-2',
      event_type: 'VALIDATION_ERROR',
      error_message: 'Schema validation failed',
      exit_code: 1
    }, function(err2, resp2) {
      routeAssert(!err2, 'API2a: POST /recovery no error');
      routeAssertEqual(resp2.status, 200, 'API2b: status=200 (even on failure, returns 200 with result)');
      routeAssert(!resp2.body.success, 'API2c: unrecoverable, success=false');
      routeAssertEqual(resp2.body.action_taken, 'none', 'API2d: no action possible');

      // API-3: Missing mission_task_id
      httpPost('/mission/recovery', {
        event_type: 'FAILED'
      }, function(err3, resp3) {
        routeAssert(!err3, 'API3a: no error');
        routeAssertEqual(resp3.status, 400, 'API3b: status=400');

        // API-4: Nonexistent task
        httpPost('/mission/recovery', {
          mission_task_id: 'nonexistent-task',
          event_type: 'FAILED'
        }, function(err4, resp4) {
          routeAssert(!err4, 'API4a: no error');
          routeAssertEqual(resp4.status, 404, 'API4b: status=404');

          // API-5: Retry exhaustion path (setup task with max retries)
          var apiTask5 = setupTestTask('api-recov-5', 'staging');
          missionStore.updateMissionTask('api-recov-5', { retry_count: 3, current_stage: 'staging' });
          httpPost('/mission/recovery', {
            mission_task_id: 'api-recov-5',
            event_type: 'TASK_FAILED',
            error_message: 'ETIMEDOUT',
            exit_code: null
          }, function(err5, resp5) {
            routeAssert(!err5, 'API5a: no error');
            routeAssertEqual(resp5.status, 200, 'API5b: status=200');
            // Should attempt rollback (retries exhausted, staging is rollbackable)
            routeAssertEqual(resp5.body.action_taken, 'rollback', 'API5c: rollback triggered after retry exhaustion');

            // API-6: Retry exhaustion on non-rollbackable stage
            var apiTask6 = setupTestTask('api-recov-6', 'testing');
            missionStore.updateMissionTask('api-recov-6', { retry_count: 3, current_stage: 'testing' });
            httpPost('/mission/recovery', {
              mission_task_id: 'api-recov-6',
              event_type: 'TASK_FAILED',
              error_message: 'ETIMEDOUT',
              exit_code: null
            }, function(err6, resp6) {
              routeAssert(!err6, 'API6a: no error');
              routeAssertEqual(resp6.status, 200, 'API6b: status=200');
              // Cannot rollback from testing → unrecoverable
              routeAssertEqual(resp6.body.action_taken, 'none', 'API6c: unrecoverable on testing');

              finishAllTests();
            });
          });
        });
      });
    });
  });
}

function finishAllTests() {
  stopServer();

  // ─── 汇总 ──────────────────────────────────────────────

  var totalPassed = passed + routesPassed;
  var totalFailed = failed + routesFailed;
  var totalAll = totalPassed + totalFailed;

  console.log('\n========================================');
  console.log('  P10.2 Retry & Recovery Engine - 测试结果');
  console.log('========================================\n');

  console.log('单元测试: ' + passed + '/' + (passed + failed) + ' 通过 (A-I 组)');
  console.log('API 测试: ' + routesPassed + '/' + (routesPassed + routesFailed) + ' 通过');
  console.log('总断言:   ' + totalAll);
  console.log('总通过:   ' + totalPassed + ' / 总失败: ' + totalFailed);

  if (totalFailed > 0) {
    console.log('\n失败详情:');
    var allFails = failures.concat(routesFailures);
    for (var k = 0; k < allFails.length; k++) {
      console.log('  ' + allFails[k]);
    }
  }

  console.log('\n通过率: ' + (totalFailed === 0 ? '100%' : Math.round(totalPassed / totalAll * 100) + '%'));

  // 清理
  taskDb.close();

  if (totalFailed === 0) {
    console.log('\n✓ 所有 P10.2 测试通过!\n');
    process.exit(0);
  } else {
    console.log('\n✗ ' + totalFailed + ' 个测试失败\n');
    process.exit(1);
  }
}

// Start the API server and begin test chain
startServer(function() {
  console.log('API test server started on port ' + TEST_PORT);

  // Run tests sequentially: A-I are synchronous, then API after F/G/H callbacks
  // Since F is async, the chain is: F → G → H → I → API
  // F is called at the end of the synchronous block, which triggers the chain

  // The F test handler is triggered from within runTestF which auto-starts
  // But we need to actually call runTestF... Wait, let me re-check the flow.

  // Actually all A-E tests are synchronous and already ran above.
  // F starts the async chain. But F's callback is called asynchronously.
  // The call to F's handler was in the sync block: recoveryEngine.handleFailure() 
  // which returns a Promise. Let me verify the flow works.

  // The script runs A-E synchronously, then F starts the async chain via .then().
  // The problem is: we can't just let the script end. We need the event loop to stay open.

  // Since the server is running, the event loop stays open. The async chain should complete.
});

// ─── F test trigger ────────────────────────────────────────
// Note: F is triggered from within the test body itself at the end of section F.
// The callbacks chain through: F → G → H → I → runAPITests → finishAllTests

