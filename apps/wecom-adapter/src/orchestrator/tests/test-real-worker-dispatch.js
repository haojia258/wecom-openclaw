'use strict';

/**
 * test-real-worker-dispatch.js — Phase2-A 真实 Worker 派发集成测试
 *
 * 测试覆盖:
 *   1. openai-worker 模块加载正常
 *   2. 无 API Key → 优雅返回 error (不崩溃)
 *   3. Codex worker artifact 结构正确
 *   4. 其他 worker 仍使用 mock 行为
 *   5. Artifact 模块可用
 */

var assert = require('assert');
var path = require('path');

var pass = 0;
var fail = 0;
var tests = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    tests.push('  ✓ ' + name);
  } catch (e) {
    fail++;
    tests.push('  ✗ ' + name + ' — ' + e.message);
  }
}

// ========== 模块加载 ==========
var openaiWorker;
try {
  openaiWorker = require('../workers/openai-worker');
  tests.push('✓ openai-worker 模块加载成功');
} catch (e) {
  tests.push('✗ openai-worker 模块加载失败: ' + e.message);
  console.log(tests.join('\n'));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(1);
}

var workerDispatcher;
try {
  workerDispatcher = require('../worker-dispatcher');
  tests.push('✓ worker-dispatcher 模块加载成功');
} catch (e) {
  tests.push('✗ worker-dispatcher 模块加载失败: ' + e.message);
}

var artifactStore;
try {
  artifactStore = require('../artifact-store');
  tests.push('✓ artifact-store 模块加载成功');
} catch (e) {
  tests.push('✗ artifact-store 模块加载失败: ' + e.message);
}

// ========== Worker 身份验证 ==========
test('openai-worker 导出 executeOpenAIWorker', function () {
  assert.strictEqual(typeof openaiWorker.executeOpenAIWorker, 'function');
});

test('openai-worker 导出 callOpenAI', function () {
  assert.strictEqual(typeof openaiWorker.callOpenAI, 'function');
});

test('openai-worker 导出 buildPrompt', function () {
  assert.strictEqual(typeof openaiWorker.buildPrompt, 'function');
});

test('openai-worker 导出 hashText', function () {
  assert.strictEqual(typeof openaiWorker.hashText, 'function');
});

// ========== Worker Dispatcher 验证 ==========
if (workerDispatcher) {
  test('worker-dispatcher generateDispatchPayload 正常工作', function () {
    var payload = workerDispatcher.generateDispatchPayload({
      taskId: 'task-test-001',
      userRequest: '生成日报',
      assignee: 'codex',
    });
    assert.ok(payload, '应返回 payload');
    assert.ok(payload.payload, '应包含 payload 对象');
    assert.strictEqual(payload.assignee, 'codex');
  });

  test('worker-dispatcher 对 codex 返回正确 provider', function () {
    var payload = workerDispatcher.generateDispatchPayload({
      taskId: 'task-test-002',
      userRequest: 'test',
      assignee: 'codex',
    });
    assert.ok(payload.payload.provider.indexOf('OpenAI') >= 0 ||
              payload.payload.provider.indexOf('Codex') >= 0);
  });

  test('worker-dispatcher 对 workbuddy 返回 mock 行为', function () {
    var payload = workerDispatcher.generateDispatchPayload({
      taskId: 'task-test-003',
      userRequest: 'test',
      assignee: 'workbuddy',
    });
    assert.ok(payload.payload.capabilities.length > 0);
  });

  test('worker-dispatcher _note 已更新为 v0.5', function () {
    var payload = workerDispatcher.generateDispatchPayload({
      taskId: 'task-test-004',
      userRequest: 'test',
      assignee: 'codex',
    });
    var note = payload.payload._note || '';
    assert.ok(
      note.indexOf('v0.5') >= 0 || note.indexOf('real AI API') >= 0,
      '_note 应反映 v0.5 真实 AI 调用'
    );
  });
}

// ========== Artifact Store 验证 ==========
if (artifactStore) {
  test('artifact-store saveArtifact 函数存在', function () {
    assert.strictEqual(typeof artifactStore.saveArtifact, 'function');
  });

  test('artifact-store readArtifact 函数存在', function () {
    assert.strictEqual(typeof artifactStore.readArtifact, 'function');
  });

  test('artifact-store listArtifacts 函数存在', function () {
    assert.strictEqual(typeof artifactStore.listArtifacts, 'function');
  });
}

// ========== Codex Worker 无 API Key 优雅降级 ==========
test('executeOpenAIWorker 无 key → 返回 error 对象 不崩溃', function () {
  var oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  return openaiWorker.executeOpenAIWorker({ taskId: 'intg-test-1', userRequest: 'test' })
    .then(function (result) {
      if (oldKey !== undefined) process.env.OPENAI_API_KEY = oldKey;
      assert.ok(result.error, '应有 error 字段');
      assert.strictEqual(result.taskId, 'intg-test-1');
      assert.strictEqual(result.assignee, 'codex');
      assert.ok(result.error.indexOf('OPENAI_API_KEY') >= 0, '应提示缺少 key');
    });
});

// ========== Key 安全验证 ==========
test('无 key 错误消息不包含 sk- 前缀', function () {
  var oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  return openaiWorker.executeOpenAIWorker({ taskId: 'intg-test-2', userRequest: 'test' })
    .then(function (result) {
      if (oldKey !== undefined) process.env.OPENAI_API_KEY = oldKey;
      var str = JSON.stringify(result);
      assert.ok(str.indexOf('sk-') === -1, '不应包含 key 前缀');
    });
});

// ========== Artifact 结构验证 ==========
test('执行后 artifact 包含全部必要字段', function () {
  var oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  return openaiWorker.executeOpenAIWorker({ taskId: 'intg-test-3', userRequest: 'test' })
    .then(function (result) {
      if (oldKey !== undefined) process.env.OPENAI_API_KEY = oldKey;
      var required = ['taskId', 'assignee', 'model', 'promptHash', 'outputText', 'createdAt', 'safetyNote'];
      required.forEach(function (field) {
        assert.ok(result.hasOwnProperty(field), '缺少字段: ' + field);
      });
    });
});

// ========== 总结 ==========
setTimeout(function () {
  console.log(tests.join('\n'));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail > 0 ? 1 : 0);
}, 300);
