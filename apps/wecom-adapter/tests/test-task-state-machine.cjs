/**
 * test-task-state-machine.cjs - P6.6.2 Agent 状态机统一测试
 *
 * 测试维度:
 *   1. 状态常量定义
 *   2. isValidState 合法性检测
 *   3. isValidTransition 转换合法性检测
 *   4. normalizeState 向后兼容映射
 *   5. normalizeTask 任务对象标准化
 *   6. validateStatus 拒绝非法状态
 *   7. validateTransition 拒绝非法转换
 *   8. 终端状态判定
 *   9. 与 task-repository 集成验证
 */

'use strict';

var path = require('path');
var sm = require('../src/orchestrator/v2/task-state-machine');

var passed = 0;
var failed = 0;
var tests = [];

function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

function assert(condition, msg) {
  if (!condition) {
    throw new Error('Assertion failed: ' + (msg || 'expected truthy'));
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      'Assertion failed: ' + (msg || '') +
      '\n  expected: ' + JSON.stringify(expected) +
      '\n  actual:   ' + JSON.stringify(actual)
    );
  }
}

function assertThrows(fn, expectedMsg, testMsg) {
  var threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
    if (expectedMsg && e.message.indexOf(expectedMsg) === -1) {
      throw new Error(
        'Wrong error message: ' + (testMsg || '') +
        '\n  expected to contain: ' + expectedMsg +
        '\n  actual: ' + e.message
      );
    }
  }
  if (!threw) {
    throw new Error('Expected exception but none thrown: ' + (testMsg || ''));
  }
}

// ─── Group 1: State Constants ─────────────────────────────

test('STATES 包含所有 7 个状态', function () {
  var keys = Object.keys(sm.STATES);
  assertEqual(keys.length, 7, 'should have 7 states');
  assertEqual(sm.STATES.PENDING, 'PENDING');
  assertEqual(sm.STATES.PLANNING, 'PLANNING');
  assertEqual(sm.STATES.RUNNING, 'RUNNING');
  assertEqual(sm.STATES.REVIEWING, 'REVIEWING');
  assertEqual(sm.STATES.COMPLETED, 'COMPLETED');
  assertEqual(sm.STATES.FAILED, 'FAILED');
  assertEqual(sm.STATES.BLOCKED, 'BLOCKED');
});

test('VALID_STATES 包含 7 个元素', function () {
  assertEqual(sm.VALID_STATES.length, 7);
  assert(sm.VALID_STATES.indexOf('PENDING') !== -1);
  assert(sm.VALID_STATES.indexOf('PLANNING') !== -1);
  assert(sm.VALID_STATES.indexOf('RUNNING') !== -1);
  assert(sm.VALID_STATES.indexOf('REVIEWING') !== -1);
  assert(sm.VALID_STATES.indexOf('COMPLETED') !== -1);
  assert(sm.VALID_STATES.indexOf('FAILED') !== -1);
  assert(sm.VALID_STATES.indexOf('BLOCKED') !== -1);
});

// ─── Group 2: isValidState ────────────────────────────────

test('isValidState 识别所有合法状态', function () {
  sm.VALID_STATES.forEach(function (s) {
    assert(sm.isValidState(s), s + ' should be valid');
  });
});

test('isValidState 拒绝非法状态', function () {
  assert(!sm.isValidState('pending'), 'lowercase pending is not valid new state');
  assert(!sm.isValidState('in_progress'), 'lowercase in_progress is not valid new state');
  assert(!sm.isValidState('INVALID'), 'random string');
  assert(!sm.isValidState(''), 'empty string');
  assert(!sm.isValidState(null), 'null');
  assert(!sm.isValidState(undefined), 'undefined');
  assert(!sm.isValidState('RUNNINGG'), 'typo');
  assert(!sm.isValidState('running'), 'lowercase running');
});

// ─── Group 3: isValidTransition ───────────────────────────

test('PENDING → PLANNING 合法', function () {
  assert(sm.isValidTransition('PENDING', 'PLANNING'));
});

test('PLANNING → RUNNING 合法', function () {
  assert(sm.isValidTransition('PLANNING', 'RUNNING'));
});

test('RUNNING → COMPLETED 合法', function () {
  assert(sm.isValidTransition('RUNNING', 'COMPLETED'));
});

test('RUNNING → FAILED 合法', function () {
  assert(sm.isValidTransition('RUNNING', 'FAILED'));
});

test('RUNNING → BLOCKED 合法', function () {
  assert(sm.isValidTransition('RUNNING', 'BLOCKED'));
});

test('RUNNING → REVIEWING 合法', function () {
  assert(sm.isValidTransition('RUNNING', 'REVIEWING'));
});

test('REVIEWING → COMPLETED 合法', function () {
  assert(sm.isValidTransition('REVIEWING', 'COMPLETED'));
});

test('REVIEWING → FAILED 合法', function () {
  assert(sm.isValidTransition('REVIEWING', 'FAILED'));
});

test('BLOCKED → RUNNING 合法', function () {
  assert(sm.isValidTransition('BLOCKED', 'RUNNING'));
});

test('FAILED → RUNNING 合法', function () {
  assert(sm.isValidTransition('FAILED', 'RUNNING'));
});

test('PENDING → RUNNING 非法（缺少 PLANNING 过渡）', function () {
  assert(!sm.isValidTransition('PENDING', 'RUNNING'));
});

test('PENDING → COMPLETED 非法', function () {
  assert(!sm.isValidTransition('PENDING', 'COMPLETED'));
});

test('COMPLETED → RUNNING 非法（终端状态）', function () {
  assert(!sm.isValidTransition('COMPLETED', 'RUNNING'));
});

test('FAILED → COMPLETED 非法', function () {
  assert(!sm.isValidTransition('FAILED', 'COMPLETED'));
});

test('RUNNING → PENDING 非法（不可回退）', function () {
  assert(!sm.isValidTransition('RUNNING', 'PENDING'));
});

test('非法 from 状态返回 false', function () {
  assert(!sm.isValidTransition('INVALID', 'RUNNING'));
});

test('非法 to 状态返回 false', function () {
  assert(!sm.isValidTransition('RUNNING', 'INVALID'));
});

// ─── Group 4: normalizeState ──────────────────────────────

test('normalizeState: 大写状态原样返回', function () {
  assertEqual(sm.normalizeState('PENDING'), 'PENDING');
  assertEqual(sm.normalizeState('RUNNING'), 'RUNNING');
  assertEqual(sm.normalizeState('COMPLETED'), 'COMPLETED');
  assertEqual(sm.normalizeState('FAILED'), 'FAILED');
  assertEqual(sm.normalizeState('BLOCKED'), 'BLOCKED');
});

test('normalizeState: pending → PENDING', function () {
  assertEqual(sm.normalizeState('pending'), 'PENDING');
});

test('normalizeState: in_progress → RUNNING', function () {
  assertEqual(sm.normalizeState('in_progress'), 'RUNNING');
});

test('normalizeState: completed → COMPLETED', function () {
  assertEqual(sm.normalizeState('completed'), 'COMPLETED');
});

test('normalizeState: failed → FAILED', function () {
  assertEqual(sm.normalizeState('failed'), 'FAILED');
});

test('normalizeState: blocked → BLOCKED', function () {
  assertEqual(sm.normalizeState('blocked'), 'BLOCKED');
});

test('normalizeState: 未知状态原样返回', function () {
  assertEqual(sm.normalizeState('unknown'), 'unknown');
  assertEqual(sm.normalizeState(''), '');
});

test('normalizeState: null/undefined 原样返回', function () {
  assertEqual(sm.normalizeState(null), null);
  assertEqual(sm.normalizeState(undefined), undefined);
});

// ─── Group 5: normalizeTask ──────────────────────────────

test('normalizeTask: 标准化旧状态', function () {
  var t = { task_id: 't1', status: 'pending' };
  sm.normalizeTask(t);
  assertEqual(t.status, 'PENDING');
});

test('normalizeTask: 新状态不变', function () {
  var t = { task_id: 't2', status: 'RUNNING' };
  sm.normalizeTask(t);
  assertEqual(t.status, 'RUNNING');
});

test('normalizeTask: in_progress → RUNNING', function () {
  var t = { task_id: 't3', status: 'in_progress' };
  sm.normalizeTask(t);
  assertEqual(t.status, 'RUNNING');
});

test('normalizeTask: null task 不抛异常', function () {
  var result = sm.normalizeTask(null);
  assertEqual(result, null);
});

test('normalizeTask: 无 status 字段的任务不抛异常', function () {
  var t = { task_id: 't4' };
  sm.normalizeTask(t);
  assertEqual(t.task_id, 't4');
  assertEqual(t.status, undefined);
});

// ─── Group 6: validateStatus ─────────────────────────────

test('validateStatus: 合法状态不抛异常', function () {
  sm.validateStatus('PENDING');
  sm.validateStatus('PLANNING');
  sm.validateStatus('RUNNING');
  sm.validateStatus('REVIEWING');
  sm.validateStatus('COMPLETED');
  sm.validateStatus('FAILED');
  sm.validateStatus('BLOCKED');
  // 到达此处即成功
  assert(true);
});

test('validateStatus: 拒绝非法状态', function () {
  assertThrows(function () { sm.validateStatus('invalid'); }, 'Invalid status');
});

test('validateStatus: 拒绝旧小写状态', function () {
  assertThrows(function () { sm.validateStatus('pending'); }, 'Invalid status');
  assertThrows(function () { sm.validateStatus('in_progress'); }, 'Invalid status');
});

test('validateStatus: 拒绝空字符串', function () {
  assertThrows(function () { sm.validateStatus(''); }, 'Invalid status');
});

// ─── Group 7: validateTransition ─────────────────────────

test('validateTransition: 合法转换不抛异常', function () {
  sm.validateTransition('PENDING', 'PLANNING');
  sm.validateTransition('PLANNING', 'RUNNING');
  sm.validateTransition('RUNNING', 'COMPLETED');
  sm.validateTransition('RUNNING', 'FAILED');
  sm.validateTransition('RUNNING', 'BLOCKED');
  sm.validateTransition('RUNNING', 'REVIEWING');
  sm.validateTransition('REVIEWING', 'COMPLETED');
  sm.validateTransition('REVIEWING', 'FAILED');
  sm.validateTransition('BLOCKED', 'RUNNING');
  sm.validateTransition('FAILED', 'RUNNING');
  assert(true);
});

test('validateTransition: 拒绝非法转换', function () {
  assertThrows(function () { sm.validateTransition('PENDING', 'RUNNING'); }, 'Invalid transition');
});

test('validateTransition: 拒绝终端状态转换', function () {
  assertThrows(function () { sm.validateTransition('COMPLETED', 'RUNNING'); }, 'Invalid transition');
});

// ─── Group 8: Terminal States ────────────────────────────

test('getTerminalStates 返回 COMPLETED 和 FAILED', function () {
  var terminals = sm.getTerminalStates();
  assert(terminals.indexOf('COMPLETED') !== -1);
  assert(terminals.indexOf('FAILED') !== -1);
  assert(terminals.indexOf('PENDING') === -1);
});

test('isTerminalState 正确判定', function () {
  assert(sm.isTerminalState('COMPLETED'));
  assert(sm.isTerminalState('FAILED'));
  assert(!sm.isTerminalState('PENDING'));
  assert(!sm.isTerminalState('RUNNING'));
  assert(!sm.isTerminalState('BLOCKED'));
});

// ─── Group 9: TRANSITION 表完整性 ────────────────────────

test('每个非终端状态都有至少一个出口', function () {
  var nonTerminalStates = ['PENDING', 'PLANNING', 'RUNNING', 'REVIEWING', 'BLOCKED', 'FAILED'];
  nonTerminalStates.forEach(function (state) {
    var transitions = sm.VALID_TRANSITIONS[state];
    assert(transitions && transitions.length > 0, state + ' should have at least one outgoing transition');
  });
});

test('COMPLETED 状态没有出口', function () {
  assertEqual(sm.VALID_TRANSITIONS.COMPLETED.length, 0, 'COMPLETED should be terminal with no outgoing transitions');
});

// ─── Run ──────────────────────────────────────────────────

console.log('\n=== P6.6.2 Agent 状态机统一测试 ===\n');

tests.forEach(function (t, i) {
  try {
    t.fn();
    passed++;
    console.log('PASS #' + (i + 1) + ' - ' + t.name);
  } catch (e) {
    failed++;
    console.log('FAIL #' + (i + 1) + ' - ' + t.name);
    console.log('  ' + e.message);
  }
});

console.log('\n=== Results: ' + passed + '/' + (passed + failed) + ' passed ===\n');

if (failed > 0) {
  process.exit(1);
}
