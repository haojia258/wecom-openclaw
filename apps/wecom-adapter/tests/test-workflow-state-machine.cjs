'use strict';

/**
 * test-workflow-state-machine.cjs - P10.1 Workflow State Machine 测试
 *
 * 5 组测试:
 *   A: 状态定义 (STATES 常量, VALID_STATES, VALID_TRANSITIONS 完整性)
 *   B: 合法 Transition (正向流转 + failed/rollback 分支)
 *   C: 非法 Transition (跳跃、回退、终端状态出边)
 *   D: Event-Driven Transition Engine
 *   E: Failed/Rollback Path
 *   F: 集成测试 (mission-routes POST /transition)
 */

var fs = require('fs');
var path = require('path');
var http = require('http');

// ─── 测试环境隔离 ─────────────────────────────────────────

var TEST_DB_DIR = path.resolve(__dirname, '../logs/workflow-test');
if (!fs.existsSync(TEST_DB_DIR)) {
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
}

process.env.TASK_DB_PATH = path.resolve(TEST_DB_DIR, 'test-workflow.db');
process.env.TASK_LOG_DIR = path.resolve(TEST_DB_DIR);

var taskDb = require('../src/storage/task-db');
var missionStore = require('../src/mission/mission-store');
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

// ─── 清理 ─────────────────────────────────────────────────

function cleanTestData() {
  var dbPath = process.env.TASK_DB_PATH;
  var files = [dbPath, dbPath + '-wal', dbPath + '-shm'];
  for (var i = 0; i < files.length; i++) {
    if (fs.existsSync(files[i])) {
      try { fs.unlinkSync(files[i]); } catch (_) {}
    }
  }
}

cleanTestData();
taskDb.close();

// ─── 辅助 ─────────────────────────────────────────────────

function setupTestTask(id, stage) {
  return missionStore.createMissionTask({
    id: id,
    title: 'Test Task ' + id,
    description: 'Test workflow',
    status: 'running',
    owner_agent: 'test-agent',
    current_stage: stage || null
  });
}

// ═══════════════════════════════════════════════════════════
// A: 状态定义
// ═══════════════════════════════════════════════════════════

console.log('\n--- A: 状态定义 ---\n');

var STATES = stateMachine.STATES;

// A1
assertEqual(Object.keys(STATES).length, 9, 'A1: STATES 包含 9 个状态');
assertEqual(STATES.QUEUED, 'queued', 'A1a: QUEUED');
assertEqual(STATES.RUNNING, 'running', 'A1b: RUNNING');
assertEqual(STATES.TESTING, 'testing', 'A1c: TESTING');
assertEqual(STATES.AUDIT, 'audit', 'A1d: AUDIT');
assertEqual(STATES.STAGING, 'staging', 'A1e: STAGING');
assertEqual(STATES.PRODUCTION, 'production', 'A1f: PRODUCTION');
assertEqual(STATES.COMPLETED, 'completed', 'A1g: COMPLETED');
assertEqual(STATES.FAILED, 'failed', 'A1h: FAILED');
assertEqual(STATES.ROLLBACK, 'rollback', 'A1i: ROLLBACK');

// A2
assertEqual(stateMachine.VALID_STATES.length, 9, 'A2: VALID_STATES 包含 9 个元素');

// A3: validateState on all valid states
stateMachine.VALID_STATES.forEach(function(s) {
  stateMachine.validateState(s); // should not throw
});
assert(true, 'A3: validateState 接受所有合法状态');

// A4: VALID_TRANSITIONS completeness
var vt = stateMachine.VALID_TRANSITIONS;
assertEqual(vt[STATES.QUEUED].length, 1, 'A4a: queued has 1 outgoing');
assert(vt[STATES.QUEUED].indexOf(STATES.RUNNING) !== -1, 'A4b: queued→running');

assertEqual(vt[STATES.RUNNING].length, 2, 'A4c: running has 2 outgoing');
assert(vt[STATES.RUNNING].indexOf(STATES.TESTING) !== -1, 'A4d: running→testing');
assert(vt[STATES.RUNNING].indexOf(STATES.FAILED) !== -1, 'A4e: running→failed');

assertEqual(vt[STATES.TESTING].length, 3, 'A4f: testing has 3 outgoing');
assert(vt[STATES.TESTING].indexOf(STATES.AUDIT) !== -1, 'A4g: testing→audit');
assert(vt[STATES.TESTING].indexOf(STATES.STAGING) !== -1, 'A4g2: testing→staging');
assert(vt[STATES.TESTING].indexOf(STATES.FAILED) !== -1, 'A4h: testing→failed');

assertEqual(vt[STATES.AUDIT].length, 2, 'A4i: audit has 2 outgoing');
assert(vt[STATES.AUDIT].indexOf(STATES.STAGING) !== -1, 'A4j: audit→staging');
assert(vt[STATES.AUDIT].indexOf(STATES.FAILED) !== -1, 'A4k: audit→failed');

assertEqual(vt[STATES.STAGING].length, 3, 'A4l: staging has 3 outgoing');
assert(vt[STATES.STAGING].indexOf(STATES.PRODUCTION) !== -1, 'A4m: staging→production');
assert(vt[STATES.STAGING].indexOf(STATES.FAILED) !== -1, 'A4n: staging→failed');
assert(vt[STATES.STAGING].indexOf(STATES.ROLLBACK) !== -1, 'A4o: staging→rollback');

assertEqual(vt[STATES.PRODUCTION].length, 3, 'A4p: production has 3 outgoing');
assert(vt[STATES.PRODUCTION].indexOf(STATES.COMPLETED) !== -1, 'A4q: production→completed');
assert(vt[STATES.PRODUCTION].indexOf(STATES.FAILED) !== -1, 'A4r: production→failed');
assert(vt[STATES.PRODUCTION].indexOf(STATES.ROLLBACK) !== -1, 'A4s: production→rollback');

assertEqual(vt[STATES.FAILED].length, 1, 'A4t: failed has 1 outgoing');
assert(vt[STATES.FAILED].indexOf(STATES.RUNNING) !== -1, 'A4u: failed→running');

assertEqual(vt[STATES.ROLLBACK].length, 2, 'A4v: rollback has 2 outgoing');
assert(vt[STATES.ROLLBACK].indexOf(STATES.RUNNING) !== -1, 'A4w: rollback→running');
assert(vt[STATES.ROLLBACK].indexOf(STATES.FAILED) !== -1, 'A4x: rollback→failed');

assertEqual(vt[STATES.COMPLETED].length, 0, 'A4y: completed is terminal (0 outgoing)');

// A5: getTerminalStates
var terminals = stateMachine.getTerminalStates();
assertEqual(terminals.length, 1, 'A5a: 1 terminal state');
assert(terminals.indexOf(STATES.COMPLETED) !== -1, 'A5b: completed is terminal');
assert(terminals.indexOf(STATES.FAILED) === -1, 'A5c: failed is NOT terminal');
assert(terminals.indexOf(STATES.ROLLBACK) === -1, 'A5d: rollback is NOT terminal');

// A6: isTerminalState
assert(stateMachine.isTerminalState(STATES.COMPLETED), 'A6a: completed is terminal');
assert(!stateMachine.isTerminalState(STATES.FAILED), 'A6b: failed is not terminal');
assert(!stateMachine.isTerminalState(STATES.QUEUED), 'A6c: queued is not terminal');
assert(!stateMachine.isTerminalState(STATES.RUNNING), 'A6d: running is not terminal');

// A7: recoverable states
assert(stateMachine.isRecoverableState(STATES.FAILED), 'A7a: failed is recoverable');
assert(stateMachine.isRecoverableState(STATES.ROLLBACK), 'A7b: rollback is recoverable');
assert(!stateMachine.isRecoverableState(STATES.RUNNING), 'A7c: running is not recoverable');
assert(!stateMachine.isRecoverableState(STATES.COMPLETED), 'A7d: completed is not recoverable');

// ═══════════════════════════════════════════════════════════
// B: 合法 Transition
// ═══════════════════════════════════════════════════════════

console.log('\n--- B: 合法 Transition ---\n');

// B1: Forward path
assert(stateMachine.isValidTransition(STATES.QUEUED, STATES.RUNNING), 'B1: queued→running');
assert(stateMachine.isValidTransition(STATES.RUNNING, STATES.TESTING), 'B2: running→testing');
assert(stateMachine.isValidTransition(STATES.TESTING, STATES.AUDIT), 'B3: testing→audit');
assert(stateMachine.isValidTransition(STATES.AUDIT, STATES.STAGING), 'B4: audit→staging');
assert(stateMachine.isValidTransition(STATES.STAGING, STATES.PRODUCTION), 'B5: staging→production');
assert(stateMachine.isValidTransition(STATES.PRODUCTION, STATES.COMPLETED), 'B6: production→completed');

// B2: Failed branches from any stage
assert(stateMachine.isValidTransition(STATES.RUNNING, STATES.FAILED), 'B7: running→failed');
assert(stateMachine.isValidTransition(STATES.TESTING, STATES.FAILED), 'B8: testing→failed');
assert(stateMachine.isValidTransition(STATES.AUDIT, STATES.FAILED), 'B9: audit→failed');
assert(stateMachine.isValidTransition(STATES.STAGING, STATES.FAILED), 'B10: staging→failed');
assert(stateMachine.isValidTransition(STATES.PRODUCTION, STATES.FAILED), 'B11: production→failed');

// B3: Rollback from staging/production
assert(stateMachine.isValidTransition(STATES.STAGING, STATES.ROLLBACK), 'B12: staging→rollback');
assert(stateMachine.isValidTransition(STATES.PRODUCTION, STATES.ROLLBACK), 'B13: production→rollback');

// B4: Recovery paths
assert(stateMachine.isValidTransition(STATES.FAILED, STATES.RUNNING), 'B14: failed→running (recovery)');
assert(stateMachine.isValidTransition(STATES.ROLLBACK, STATES.RUNNING), 'B15: rollback→running (recovery)');
assert(stateMachine.isValidTransition(STATES.ROLLBACK, STATES.FAILED), 'B16: rollback→failed');

// B5: validateTransition (throwing version) - should not throw
stateMachine.validateTransition(STATES.QUEUED, STATES.RUNNING);
stateMachine.validateTransition(STATES.RUNNING, STATES.TESTING);
stateMachine.validateTransition(STATES.STAGING, STATES.PRODUCTION);
stateMachine.validateTransition(STATES.PRODUCTION, STATES.COMPLETED);
assert(true, 'B17: validateTransition accepts all valid paths');

// B6: getNextStates
var nextFromQueued = stateMachine.getNextStates(STATES.QUEUED);
assert(nextFromQueued.indexOf(STATES.RUNNING) !== -1, 'B18a: queued→next');
assertEqual(nextFromQueued.length, 1, 'B18b: queued has exactly 1 next');

var nextFromProduction = stateMachine.getNextStates(STATES.PRODUCTION);
assertEqual(nextFromProduction.length, 3, 'B19: production has 3 next states');

// B7: normalizeState
assertEqual(stateMachine.normalizeState('queued'), 'queued', 'B20a: normalize queued');
assertEqual(stateMachine.normalizeState('running'), 'running', 'B20b: normalize running');
assertEqual(stateMachine.normalizeState(null), null, 'B20c: normalize null');
assertEqual(stateMachine.normalizeState(undefined), undefined, 'B20d: normalize undefined');
assertEqual(stateMachine.normalizeState('unknown'), 'unknown', 'B20e: normalize unknown');

// ═══════════════════════════════════════════════════════════
// C: 非法 Transition
// ═══════════════════════════════════════════════════════════

console.log('\n--- C: 非法 Transition ---\n');

// C1: Skip stages
assert(!stateMachine.isValidTransition(STATES.QUEUED, STATES.TESTING), 'C1: queued→testing SKIP');
assert(!stateMachine.isValidTransition(STATES.QUEUED, STATES.PRODUCTION), 'C2: queued→production SKIP');
assert(!stateMachine.isValidTransition(STATES.RUNNING, STATES.STAGING), 'C3: running→staging SKIP');
assert(!stateMachine.isValidTransition(STATES.RUNNING, STATES.PRODUCTION), 'C4: running→production SKIP');
assert(!stateMachine.isValidTransition(STATES.TESTING, STATES.PRODUCTION), 'C5: testing→production SKIP');

// C2: Backward transitions
assert(!stateMachine.isValidTransition(STATES.RUNNING, STATES.QUEUED), 'C6: running→queued BACKWARD');
assert(!stateMachine.isValidTransition(STATES.TESTING, STATES.RUNNING), 'C7: testing→running BACKWARD');
assert(!stateMachine.isValidTransition(STATES.AUDIT, STATES.TESTING), 'C8: audit→testing BACKWARD');
assert(!stateMachine.isValidTransition(STATES.STAGING, STATES.AUDIT), 'C9: staging→audit BACKWARD');
assert(!stateMachine.isValidTransition(STATES.PRODUCTION, STATES.STAGING), 'C10: production→staging BACKWARD');
assert(!stateMachine.isValidTransition(STATES.COMPLETED, STATES.PRODUCTION), 'C11: completed→production BACKWARD');

// C3: Terminal state has no outgoing edges
assert(!stateMachine.isValidTransition(STATES.COMPLETED, STATES.RUNNING), 'C12: completed→running TERMINAL');
assert(!stateMachine.isValidTransition(STATES.COMPLETED, STATES.FAILED), 'C13: completed→failed TERMINAL');

// C4: Invalid states
assert(!stateMachine.isValidTransition('INVALID', STATES.RUNNING), 'C14: invalid from state');
assert(!stateMachine.isValidTransition(STATES.RUNNING, 'INVALID'), 'C15: invalid to state');
assert(!stateMachine.isValidTransition('', ''), 'C16: empty states');

// C5: Same state (self-transition)
assert(!stateMachine.isValidTransition(STATES.RUNNING, STATES.RUNNING), 'C17: running→running SELF');

// C6: validateTransition throws on invalid
assertThrows(function() { stateMachine.validateTransition(STATES.QUEUED, STATES.PRODUCTION); }, 'Invalid workflow transition', 'C18: throws on skip');
assertThrows(function() { stateMachine.validateTransition(STATES.COMPLETED, STATES.RUNNING); }, 'Invalid workflow transition', 'C19: throws on terminal exit');

// C7: validateState throws on invalid
assertThrows(function() { stateMachine.validateState('invalid_state'); }, 'Invalid workflow state', 'C20: validateState throws');

// ═══════════════════════════════════════════════════════════
// D: Event-Driven Transition Engine
// ═══════════════════════════════════════════════════════════

console.log('\n--- D: Event-Driven Transition Engine ---\n');

// D1: EVENT_TO_TARGET_MAP coverage
var eventMap = transitionEngine.EVENT_TO_TARGET_MAP;
assertEqual(Object.keys(eventMap).length, 8, 'D1a: 8 trigger events');
assertEqual(eventMap.PR_CREATED, STATES.RUNNING, 'D1b: PR_CREATED→running');
assertEqual(eventMap.TEST_PASSED, STATES.TESTING, 'D1c: TEST_PASSED→testing');
assertEqual(eventMap.AUDIT_PASSED, STATES.STAGING, 'D1d: AUDIT_PASSED→staging');
assertEqual(eventMap.STAGING_DEPLOYED, STATES.PRODUCTION, 'D1e: STAGING_DEPLOYED→production');
assertEqual(eventMap.PRODUCTION_DEPLOYED, STATES.COMPLETED, 'D1f: PRODUCTION_DEPLOYED→completed');
assertEqual(eventMap.FAILED, STATES.FAILED, 'D1g: FAILED→failed');
assertEqual(eventMap.ROLLBACK_INITIATED, STATES.ROLLBACK, 'D1h: ROLLBACK_INITIATED→rollback');
assertEqual(eventMap.RE_RUN, STATES.RUNNING, 'D1i: RE_RUN→running');

// D2: isTransitionTrigger
assert(transitionEngine.isTransitionTrigger('PR_CREATED'), 'D2a: PR_CREATED is trigger');
assert(transitionEngine.isTransitionTrigger('TEST_PASSED'), 'D2b: TEST_PASSED is trigger');
assert(!transitionEngine.isTransitionTrigger('SOME_OTHER_EVENT'), 'D2c: unknown event not trigger');
assert(!transitionEngine.isTransitionTrigger(''), 'D2d: empty not trigger');

// D3: getTransitionTriggerEvents
var triggers = transitionEngine.getTransitionTriggerEvents();
assertEqual(triggers.length, 8, 'D3a: 8 triggers');

// D4: attemptTransition - full forward path
var taskId = 'wf-test-001';
setupTestTask(taskId, STATES.QUEUED);

var r1 = transitionEngine.attemptTransition(taskId, 'PR_CREATED');
assert(r1.success, 'D4a: PR_CREATED success');
assertEqual(r1.from_stage, STATES.QUEUED, 'D4b: from queued');
assertEqual(r1.to_stage, STATES.RUNNING, 'D4c: to running');
assertNotNull(r1.event, 'D4d: event created');
assertEqual(r1.event.event_type, 'TASK_STAGE_CHANGED', 'D4e: event type TASK_STAGE_CHANGED');

// D5: Continue from running → testing
var r2 = transitionEngine.attemptTransition(taskId, 'TEST_PASSED');
assert(r2.success, 'D5a: TEST_PASSED success');
assertEqual(r2.from_stage, STATES.RUNNING, 'D5b: from running');
assertEqual(r2.to_stage, STATES.TESTING, 'D5c: to testing');

// D6: Invalid transition (skip)
var r3 = transitionEngine.attemptTransition(taskId, 'PRODUCTION_DEPLOYED');
assert(!r3.success, 'D6a: PRODUCTION_DEPLOYED from testing fails');
assertNotNull(r3.error, 'D6b: error returned');
assert(r3.reason.indexOf('Invalid') !== -1 || r3.reason.indexOf('not found') === -1, 'D6c: has reason');

// D7: Continue full path testing→audit→staging→production→completed
var r4 = transitionEngine.attemptTransition(taskId, 'AUDIT_PASSED');
assert(r4.success, 'D7a: AUDIT_PASSED success');
assertEqual(r4.to_stage, STATES.STAGING, 'D7b: to staging');

var r5 = transitionEngine.attemptTransition(taskId, 'STAGING_DEPLOYED');
assert(r5.success, 'D8a: STAGING_DEPLOYED success');
assertEqual(r5.to_stage, STATES.PRODUCTION, 'D8b: to production');

var r6 = transitionEngine.attemptTransition(taskId, 'PRODUCTION_DEPLOYED');
assert(r6.success, 'D9a: PRODUCTION_DEPLOYED success');
assertEqual(r6.to_stage, STATES.COMPLETED, 'D9b: to completed');

// D8: Terminal state - can't transition further
var r7 = transitionEngine.attemptTransition(taskId, 'TEST_PASSED');
assert(!r7.success, 'D10: terminal completed rejects transition');

// D9: Verify task current_stage updated
var finalTask = missionStore.getMissionTask(taskId);
assertEqual(finalTask.current_stage, STATES.COMPLETED, 'D11: task current_stage = completed');

// D10: Verify TASK_STAGE_CHANGED events were created
var events = missionStore.listAgentEvents(taskId);
var stageEvents = [];
for (var i = 0; i < events.length; i++) {
  if (events[i].event_type === 'TASK_STAGE_CHANGED') stageEvents.push(events[i]);
}
assert(stageEvents.length >= 5, 'D12: At least 5 TASK_STAGE_CHANGED events created');

// D11: Verify payload structure
var firstEvent = stageEvents[0];
assertNotNull(firstEvent.payload, 'D13a: has payload');
assertNotNull(firstEvent.payload.from_stage, 'D13b: has from_stage');
assertNotNull(firstEvent.payload.to_stage, 'D13c: has to_stage');
assertNotNull(firstEvent.payload.trigger_event, 'D13d: has trigger_event');

// D12: Unknown event type
var r8 = transitionEngine.attemptTransition('wf-test-001', 'UNKNOWN_EVENT');
assert(!r8.success, 'D14: unknown event fails');

// D13: getTargetStage
assertEqual(transitionEngine.getTargetStage('TEST_PASSED'), STATES.TESTING, 'D15a: getTargetStage TEST_PASSED');
assertEqual(transitionEngine.getTargetStage('UNKNOWN'), null, 'D15b: getTargetStage unknown');

// ═══════════════════════════════════════════════════════════
// E: Failed/Rollback Path
// ═══════════════════════════════════════════════════════════

console.log('\n--- E: Failed/Rollback Path ---\n');

// E1: Failed from running
var failTaskId = 'wf-test-fail-001';
setupTestTask(failTaskId, STATES.RUNNING);

var f1 = transitionEngine.attemptTransition(failTaskId, 'FAILED');
assert(f1.success, 'E1a: FAILED from running success');
assertEqual(f1.to_stage, STATES.FAILED, 'E1b: stage = failed');

var failTask1 = missionStore.getMissionTask(failTaskId);
assertEqual(failTask1.current_stage, STATES.FAILED, 'E1c: task current_stage = failed');

// E2: Recovery from failed
var f2 = transitionEngine.attemptTransition(failTaskId, 'RE_RUN');
assert(f2.success, 'E2a: RE_RUN from failed success');
assertEqual(f2.to_stage, STATES.RUNNING, 'E2b: stage = running');

// E3: Failed from testing
var failTask2Id = 'wf-test-fail-002';
setupTestTask(failTask2Id, STATES.TESTING);

var f3 = transitionEngine.attemptTransition(failTask2Id, 'FAILED');
assert(f3.success, 'E3a: FAILED from testing success');

// E4: Rollback from staging
var rollbackTaskId = 'wf-test-rb-001';
setupTestTask(rollbackTaskId, STATES.STAGING);

var rb1 = transitionEngine.attemptTransition(rollbackTaskId, 'ROLLBACK_INITIATED');
assert(rb1.success, 'E4a: ROLLBACK_INITIATED from staging success');
assertEqual(rb1.to_stage, STATES.ROLLBACK, 'E4b: stage = rollback');

var rbTask = missionStore.getMissionTask(rollbackTaskId);
assertEqual(rbTask.current_stage, STATES.ROLLBACK, 'E4c: task current_stage = rollback');

// E5: Rollback → running (recovery)
var rb2 = transitionEngine.attemptTransition(rollbackTaskId, 'RE_RUN');
assert(rb2.success, 'E5a: RE_RUN from rollback success');
assertEqual(rb2.to_stage, STATES.RUNNING, 'E5b: stage = running');

// E6: Rollback from production
var rbTask2Id = 'wf-test-rb-002';
setupTestTask(rbTask2Id, STATES.PRODUCTION);

var rb3 = transitionEngine.attemptTransition(rbTask2Id, 'ROLLBACK_INITIATED');
assert(rb3.success, 'E6a: ROLLBACK_INITIATED from production success');
assertEqual(rb3.to_stage, STATES.ROLLBACK, 'E6b: stage = rollback');

// E7: Rollback → failed (confirmed failure)
var rb4 = transitionEngine.attemptTransition(rbTask2Id, 'FAILED');
assert(rb4.success, 'E7a: FAILED from rollback success');
assertEqual(rb4.to_stage, STATES.FAILED, 'E7b: stage = failed');

// E8: Failed not valid from queued
var queuedTaskId = 'wf-test-fail-003';
setupTestTask(queuedTaskId, STATES.QUEUED);

var f4 = transitionEngine.attemptTransition(queuedTaskId, 'FAILED');
assert(!f4.success, 'E8a: FAILED from queued rejected');
assert(f4.reason && f4.reason.indexOf('Invalid') !== -1, 'E8b: reason mentions invalid');

// E9: Rollback not valid from running
var runTaskId = 'wf-test-rb-003';
setupTestTask(runTaskId, STATES.RUNNING);

var rb5 = transitionEngine.attemptTransition(runTaskId, 'ROLLBACK_INITIATED');
assert(!rb5.success, 'E9: ROLLBACK_INITIATED from running rejected');

// E10: RE_RUN should succeed from failed state
var reTaskId = 'wf-test-rerun-001';
setupTestTask(reTaskId, STATES.QUEUED);

// First: queued → running
transitionEngine.attemptTransition(reTaskId, 'PR_CREATED');

// Then: running → failed
transitionEngine.attemptTransition(reTaskId, 'FAILED');

// Then: failed → running (RE_RUN)
var re1 = transitionEngine.attemptTransition(reTaskId, 'RE_RUN');
assert(re1.success, 'E10a: RE_RUN from failed success');

var reTask = missionStore.getMissionTask(reTaskId);
assertEqual(reTask.current_stage, STATES.RUNNING, 'E10b: back to running');

// ═══════════════════════════════════════════════════════════
// F: 集成测试 (mission-routes POST /transition)
// ═══════════════════════════════════════════════════════════

console.log('\n--- F: 集成测试 (API) ---\n');

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

var TEST_PORT = 13998;
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

// F1: Setup integration test task
var intTaskId = 'wf-int-001';
setupTestTask(intTaskId, STATES.QUEUED);

// F2: Valid transition via API
function runIntegrationTests(callback) {
  httpPost('/mission/tasks/' + intTaskId + '/transition',
    { event_type: 'PR_CREATED' },
    function(err1, resp1) {
      routeAssert(!err1, 'F1a: POST /transition no error');
      routeAssertEqual(resp1.status, 200, 'F1b: status=200');
      routeAssert(resp1.body.success, 'F1c: success=true');
      routeAssertEqual(resp1.body.from_stage, STATES.QUEUED, 'F1d: from=queued');
      routeAssertEqual(resp1.body.to_stage, STATES.RUNNING, 'F1e: to=running');

      // F3: Continue with another transition
      httpPost('/mission/tasks/' + intTaskId + '/transition',
        { event_type: 'TEST_PASSED' },
        function(err2, resp2) {
          routeAssert(!err2, 'F2a: TEST_PASSED no error');
          routeAssertEqual(resp2.status, 200, 'F2b: status=200');
          routeAssertEqual(resp2.body.from_stage, STATES.RUNNING, 'F2c: from=running');
          routeAssertEqual(resp2.body.to_stage, STATES.TESTING, 'F2d: to=testing');

          // F4: Invalid transition
          httpPost('/mission/tasks/' + intTaskId + '/transition',
            { event_type: 'PRODUCTION_DEPLOYED' },
            function(err3, resp3) {
              routeAssert(!err3, 'F3a: invalid transition no error');
              routeAssertEqual(resp3.status, 409, 'F3b: status=409 Conflict');
              routeAssert(!resp3.body.success, 'F3c: success=false');

              // F5: Missing event_type
              httpPost('/mission/tasks/' + intTaskId + '/transition',
                { payload: {} },
                function(err4, resp4) {
                  routeAssert(!err4, 'F4a: missing event_type no error');
                  routeAssertEqual(resp4.status, 400, 'F4b: status=400');

                  // F6: Nonexistent task
                  httpPost('/mission/tasks/nonexistent/transition',
                    { event_type: 'PR_CREATED' },
                    function(err5, resp5) {
                      routeAssert(!err5, 'F5a: nonexistent task no error');
                      routeAssertEqual(resp5.status, 404, 'F5b: status=404');

                      // F7: Transition + event via POST /mission/events with trigger event
                      var autoTaskId = 'wf-auto-001';
                      setupTestTask(autoTaskId, STATES.QUEUED);

                      // First create a trigger event and verify auto-transition
                      httpPost('/mission/events',
                        { mission_task_id: autoTaskId, event_type: 'PR_CREATED', payload: { source: 'test' } },
                        function(err6, resp6) {
                          routeAssert(!err6, 'F6a: POST /events PR_CREATED no error');
                          routeAssertEqual(resp6.status, 201, 'F6b: status=201');

                          // Verify transition happened
                          routeAssert(resp6.body.transition !== null, 'F6c: transition triggered');
                          routeAssert(resp6.body.transition.success, 'F6d: transition success');
                          routeAssertEqual(resp6.body.transition.to_stage, STATES.RUNNING, 'F6e: auto transition to running');

                          // Verify task updated
                          var autoTask = missionStore.getMissionTask(autoTaskId);
                          routeAssertEqual(autoTask.current_stage, STATES.RUNNING, 'F6f: task stage updated to running');

                          callback();
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
}

// ─── 运行集成测试 ────────────────────────────────────────

startServer(function() {
  runIntegrationTests(function() {
    stopServer();

    // ─── 汇总 ──────────────────────────────────────────

    var totalPassed = passed + routesPassed;
    var totalFailed = failed + routesFailed;
    var totalAll = totalPassed + totalFailed;

    console.log('\n========================================');
    console.log('  P10.1 Workflow State Machine - 测试结果');
    console.log('========================================\n');

    console.log('单元测试: ' + passed + '/' + (passed + failed) + ' 通过 (A-E 组)');
    console.log('集成测试: ' + routesPassed + '/' + (routesPassed + routesFailed) + ' 通过 (F 组)');
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
      console.log('\n✓ 所有测试通过!\n');
      process.exit(0);
    } else {
      console.log('\n✗ ' + totalFailed + ' 个测试失败\n');
      process.exit(1);
    }
  });
});
