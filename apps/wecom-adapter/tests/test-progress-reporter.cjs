'use strict';

/**
 * test-progress-reporter.cjs - P6.4 Progress Reporter 连线测试
 *
 * 覆盖:
 * - 6 个 report 函数返回值格式
 * - reporter.log 写入验证
 * - tryPushToWecom 优雅降级
 * - mock wecom-sender 注入
 * - agent-dispatcher 集成 (mock + real-agent 分支不崩溃)
 */

const fs = require('fs');
const path = require('path');

const REPORTER_LOG = path.resolve(__dirname, '../logs/reporter.log');

let tests = 0;
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  tests++;
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log('  FAIL: ' + msg);
  }
}

function section(name) {
  console.log('\n=== ' + name + ' ===');
}

function cleanLog() {
  try { fs.unlinkSync(REPORTER_LOG); } catch (_) {}
}

// ─── 同步测试 1-12 ─────────────────────────────────────────

section('TEST 1: 模块导出验证');

var reporter = require('../src/wecom/progress-reporter');

assert(typeof reporter.reportTaskCreated === 'function', 'reportTaskCreated 是函数');
assert(typeof reporter.reportStatusChange === 'function', 'reportStatusChange 是函数');
assert(typeof reporter.reportBlocker === 'function', 'reportBlocker 是函数');
assert(typeof reporter.reportProgressSummary === 'function', 'reportProgressSummary 是函数');
assert(typeof reporter.reportTaskCompleted === 'function', 'reportTaskCompleted 是函数');
assert(typeof reporter.reportTaskFailed === 'function', 'reportTaskFailed 是函数');
assert(typeof reporter.tryPushToWecom === 'function', 'tryPushToWecom 是函数');
assert(typeof reporter.setWecomSender === 'function', 'setWecomSender 是函数');
assert(typeof reporter._resetForTest === 'function', '_resetForTest 是函数');

section('TEST 2: reportTaskCreated 返回值');

cleanLog();
var task = {
  task_id: 'task_123_abc',
  agent: 'codex',
  content: 'test content',
  status: 'pending',
  created_at: '2026-05-25T12:00:00.000Z'
};

var msg = reporter.reportTaskCreated(task);
assert(msg.indexOf('📝 新任务已创建') !== -1, '包含 新任务已创建');
assert(msg.indexOf('task_123_abc') !== -1, '包含 task_id');
assert(msg.indexOf('codex') !== -1, '包含 agent');
assert(msg.indexOf('test content') !== -1, '包含内容');
assert(msg.indexOf('pending') !== -1, '包含状态');

section('TEST 3: reportStatusChange 返回值');

var statusMsg = reporter.reportStatusChange(
  Object.assign({}, task, { status: 'in_progress', updated_at: '2026-05-25T12:01:00.000Z' }),
  'pending'
);
assert(statusMsg.indexOf('🔄 任务状态变更') !== -1, '包含状态变更');
assert(statusMsg.indexOf('pending → in_progress') !== -1, '包含 pending → in_progress');
assert(statusMsg.indexOf('2026-05-25') !== -1, '包含更新时间');

section('TEST 4: reportBlocker 返回值');

var blockerMsg = reporter.reportBlocker(task, '依赖未满足');
assert(blockerMsg.indexOf('🚫 阻断项通知') !== -1, '包含阻断项通知');
assert(blockerMsg.indexOf('依赖未满足') !== -1, '包含阻断原因');

section('TEST 5: reportProgressSummary 返回值');

var stats = { total: 10, completed: 5, pending: 2, in_progress: 1, blocked: 1, failed: 1 };
var summaryMsg = reporter.reportProgressSummary(stats);
assert(summaryMsg.indexOf('📊 进度报告') !== -1, '包含进度报告');
assert(summaryMsg.indexOf('50%') !== -1, '包含 50%');
assert(summaryMsg.indexOf('5/10') !== -1, '包含 5/10');

section('TEST 6: reportTaskCompleted 返回值');

var completedTask = Object.assign({}, task, { status: 'completed', updated_at: '2026-05-25T12:05:00.000Z' });
var completedMsg = reporter.reportTaskCompleted(completedTask);
assert(completedMsg.indexOf('✅ 任务已完成') !== -1, '包含任务已完成');
assert(completedMsg.indexOf('task_123_abc') !== -1, '包含 task_id');

section('TEST 7: reportTaskFailed 返回值');

var failedMsg = reporter.reportTaskFailed(task, 'timeout');
assert(failedMsg.indexOf('❌ 任务失败') !== -1, '包含任务失败');
assert(failedMsg.indexOf('timeout') !== -1, '包含错误信息');

section('TEST 8: reporter.log 写入验证');

var logExists = fs.existsSync(REPORTER_LOG);
assert(logExists, 'reporter.log 文件已创建');
if (logExists) {
  var logContent = fs.readFileSync(REPORTER_LOG, 'utf-8');
  assert(logContent.indexOf('TASK_CREATED') !== -1, 'log 包含 TASK_CREATED');
  assert(logContent.indexOf('STATUS_CHANGE') !== -1, 'log 包含 STATUS_CHANGE');
  assert(logContent.indexOf('BLOCKER') !== -1, 'log 包含 BLOCKER');
  assert(logContent.indexOf('PROGRESS_SUMMARY') !== -1, 'log 包含 PROGRESS_SUMMARY');
  assert(logContent.indexOf('TASK_COMPLETED') !== -1, 'log 包含 TASK_COMPLETED');
  assert(logContent.indexOf('TASK_FAILED') !== -1, 'log 包含 TASK_FAILED');
}

section('TEST 9: tryPushToWecom 无 WECOM 配置不崩溃');

reporter._resetForTest();
var threw1 = false;
try {
  reporter.tryPushToWecom('test message');
} catch (e) {
  threw1 = true;
}
assert(!threw1, 'tryPushToWecom 无配置时不抛异常');

section('TEST 10: setWecomSender 可多次调用');

reporter._resetForTest();
reporter.setWecomSender({ name: 'sender1' });
reporter._resetForTest();
reporter.setWecomSender({ name: 'sender2' });
assert(true, 'setWecomSender 可多次调用不崩溃');

section('TEST 11: tryPushToWecom sender 异常不崩溃');

reporter._resetForTest();

var errorSender = {
  sendToConfiguredUsers: function() {
    throw new Error('Boom!');
  }
};
reporter.setWecomSender(errorSender);

var threw2 = false;
try {
  reporter.tryPushToWecom('test');
} catch (e) {
  threw2 = true;
}
assert(!threw2, 'tryPushToWecom sender 抛异常时不崩溃');

section('TEST 12: tryPushToWecom sender reject 不崩溃');

reporter._resetForTest();

var rejectSender = {
  sendToConfiguredUsers: function() {
    return Promise.reject(new Error('API timeout'));
  }
};
reporter.setWecomSender(rejectSender);

var threw3 = false;
try {
  reporter.tryPushToWecom('test');
} catch (e) {
  threw3 = true;
}
assert(!threw3, 'tryPushToWecom sender reject 时不崩溃');

// ─── 异步测试 13-16 ────────────────────────────────────────

var asyncDone = 0;
var asyncTarget = 4;

function checkAsyncDone() {
  asyncDone++;
  if (asyncDone >= asyncTarget) {
    finish();
  }
}

section('TEST 13: dispatcher mock 路径调用 reporter');

var { dispatch } = require('../src/orchestrator/v2/agent-dispatcher');

// 清理日志确保是本次 dispatch 写入
// 注意: require 时模块已加载完成, 清理旧日志
cleanLog();

dispatch({ agent: 'codex', content: 'read_file check test', command: '/任务' })
  .then(function(result) {
    assert(result.success === true, 'dispatch mock 路径成功');
    // 验证 reporter.log 有记录
    if (fs.existsSync(REPORTER_LOG)) {
      var content = fs.readFileSync(REPORTER_LOG, 'utf-8');
      assert(content.indexOf('TASK_CREATED') !== -1, 'log 包含 TASK_CREATED');
      assert(content.indexOf('TASK_COMPLETED') !== -1, 'log 包含 TASK_COMPLETED');
    } else {
      assert(false, 'reporter.log 应存在');
    }
    checkAsyncDone();
  })
  .catch(function(e) {
    assert(false, 'dispatch 不抛异常: ' + e.message);
    checkAsyncDone();
  });

section('TEST 14: codex confirm:create-pr 路径不崩溃');

dispatch({ agent: 'codex', content: 'confirm:create-pr test repo', command: '/任务' })
  .then(function(result) {
    assert(result !== undefined, 'codex confirm:create-pr 有返回');
    checkAsyncDone();
  })
  .catch(function(e) {
    assert(false, 'codex confirm:create-pr 不抛异常: ' + e.message);
    checkAsyncDone();
  });

section('TEST 15: deepseek confirm:review 路径不崩溃');

dispatch({ agent: 'deepseek', content: 'confirm:review PR#43', command: '/任务' })
  .then(function(result) {
    assert(result !== undefined, 'deepseek confirm:review 有返回');
    checkAsyncDone();
  })
  .catch(function(e) {
    assert(false, 'deepseek confirm:review 不抛异常: ' + e.message);
    checkAsyncDone();
  });

section('TEST 16: workbuddy confirm:audit 路径不崩溃');

dispatch({ agent: 'workbuddy', content: 'confirm:audit pm2 status', command: '/任务' })
  .then(function(result) {
    assert(result !== undefined, 'workbuddy confirm:audit 有返回');
    checkAsyncDone();
  })
  .catch(function(e) {
    assert(false, 'workbuddy confirm:audit 不抛异常: ' + e.message);
    checkAsyncDone();
  });

// ─── 完成 ──────────────────────────────────────────────────

function finish() {
  console.log('\n============================================================');
  console.log('测试完成: ' + tests + ' 个断言');
  console.log('通过: ' + passed);
  console.log('失败: ' + failed);

  if (failed > 0) {
    console.log('\n存在失败测试!');
    process.exit(1);
  } else {
    console.log('\n所有测试通过!');
    process.exit(0);
  }
}

// 兜底超时
setTimeout(function() {
  if (asyncDone < asyncTarget) {
    console.log('\n超时: ' + asyncDone + '/' + asyncTarget + ' 异步测试完成');
    finish();
  }
}, 8000);
