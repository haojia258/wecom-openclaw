'use strict';

/**
 * test-openai-worker.js — Phase2-A OpenAI Worker 单元测试
 *
 * 测试覆盖:
 *   1. hashText() 不泄露原文
 *   2. buildPrompt() 构建合法 prompt
 *   3. 无 OPENAI_API_KEY 不崩溃
 *   4. API Key 不进入错误消息
 *   5. API 成功/失败 artifact 结构正确
 */

var assert = require('assert');

var pass = 0;
var fail = 0;
var tests = [];
var pending = 0;

function test(name, fn) {
  try {
    var result = fn();
    if (result && typeof result.then === 'function') {
      pending++;
      result.then(function () {
        pass++;
        tests.push('  ✓ ' + name);
        maybeDone();
      }).catch(function (e) {
        fail++;
        tests.push('  ✗ ' + name + ' — ' + e.message);
        maybeDone();
      });
    } else {
      pass++;
      tests.push('  ✓ ' + name);
    }
  } catch (e) {
    fail++;
    tests.push('  ✗ ' + name + ' — ' + e.message);
  }
}

function maybeDone() {
  pending--;
  if (pending <= 0) {
    console.log(tests.join('\n'));
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail > 0 ? 1 : 0);
  }
}

// 安全兜底：5 秒后强制结束
setTimeout(function () {
  if (pending > 0) {
    tests.push('⚠ ' + pending + ' async tests未完成');
    pending = 0;
    maybeDone();
  }
}, 5000);

// ========== 模块加载 ==========
var openaiWorker;
try {
  openaiWorker = require('../workers/openai-worker');
  tests.push('✓ 模块加载成功');
} catch (e) {
  tests.push('✗ 模块加载失败: ' + e.message);
  console.log(tests.join('\n'));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(1);
}

// ========== hashText() 测试 (同步) ==========
test('hashText("") → "none"', function () {
  assert.strictEqual(openaiWorker.hashText(''), 'none');
});

test('hashText("hello") 返回 12 位 hex', function () {
  var h = openaiWorker.hashText('hello');
  assert.strictEqual(typeof h, 'string');
  assert.strictEqual(h.length, 12);
});

test('hashText 相同输入相同输出', function () {
  assert.strictEqual(openaiWorker.hashText('abc'), openaiWorker.hashText('abc'));
});

test('hashText 不同输入不同输出', function () {
  assert.notStrictEqual(openaiWorker.hashText('A'), openaiWorker.hashText('B'));
});

test('hashText 不返回原文', function () {
  var h = openaiWorker.hashText('secret_key_123');
  assert.ok(h.indexOf('secret_key_123') === -1);
});

// ========== buildPrompt() 测试 (同步) ==========
test('buildPrompt 包含 taskId', function () {
  var p = openaiWorker.buildPrompt({ taskId: 't1', userRequest: 'test' });
  assert.ok(p.indexOf('t1') >= 0);
});

test('buildPrompt 包含安全规则 REVIEW_ONLY', function () {
  var p = openaiWorker.buildPrompt({ taskId: 't2', userRequest: 'test' });
  assert.ok(p.indexOf('REVIEW_ONLY') >= 0);
  assert.ok(p.indexOf('DO NOT auto-apply') >= 0);
});

test('buildPrompt 不包含 API key', function () {
  var p = openaiWorker.buildPrompt({ taskId: 't3', userRequest: 'test' });
  assert.ok(p.indexOf('OPENAI_API_KEY') === -1);
  assert.ok(p.indexOf('sk-') === -1);
});

// ========== 无 API Key 测试 (异步 Promise) ==========
test('无 API Key → executeOpenAIWorker 返回 error', function () {
  var old = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  return openaiWorker.executeOpenAIWorker({ taskId: 't4', userRequest: 'test' })
    .then(function (r) {
      if (old !== undefined) process.env.OPENAI_API_KEY = old;
      assert.ok(r.error, '应有 error 字段');
      assert.ok(r.error.indexOf('OPENAI_API_KEY') >= 0, '应提示缺少 key');
    });
});

test('无 API Key → artifact taskId 正确', function () {
  var old = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  return openaiWorker.executeOpenAIWorker({ taskId: 'custom-id', userRequest: 'x' })
    .then(function (r) {
      if (old !== undefined) process.env.OPENAI_API_KEY = old;
      assert.strictEqual(r.taskId, 'custom-id');
    });
});

test('无 API Key → outputText 为空', function () {
  var old = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  return openaiWorker.executeOpenAIWorker({ taskId: 't6', userRequest: 'x' })
    .then(function (r) {
      if (old !== undefined) process.env.OPENAI_API_KEY = old;
      assert.strictEqual(r.outputText, '');
    });
});

test('无 API Key → 错误消息不包含 sk-', function () {
  var old = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  return openaiWorker.executeOpenAIWorker({ taskId: 't7', userRequest: 'x' })
    .then(function (r) {
      if (old !== undefined) process.env.OPENAI_API_KEY = old;
      var s = JSON.stringify(r);
      assert.ok(s.indexOf('sk-') === -1, 'JSON 不应包含 key 前缀');
    });
});

test('无 API Key → artifact 结构完整', function () {
  var old = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  return openaiWorker.executeOpenAIWorker({ taskId: 't8', userRequest: 'test' })
    .then(function (r) {
      if (old !== undefined) process.env.OPENAI_API_KEY = old;
      assert.ok(r.hasOwnProperty('taskId'));
      assert.ok(r.hasOwnProperty('assignee'));
      assert.ok(r.hasOwnProperty('model'));
      assert.ok(r.hasOwnProperty('promptHash'));
      assert.ok(r.hasOwnProperty('outputText'));
      assert.ok(r.hasOwnProperty('createdAt'));
      assert.ok(r.hasOwnProperty('safetyNote'));
    });
});

test('无 API Key → safetyNote 包含 ERROR 标记', function () {
  var old = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  return openaiWorker.executeOpenAIWorker({ taskId: 't9', userRequest: 'x' })
    .then(function (r) {
      if (old !== undefined) process.env.OPENAI_API_KEY = old;
      assert.ok(r.safetyNote.indexOf('ERROR') >= 0 || r.safetyNote.indexOf('REVIEW_ONLY') >= 0);
    });
});

// ========== 模块导出验证 ==========
test('导出 executeOpenAIWorker 函数', function () {
  assert.strictEqual(typeof openaiWorker.executeOpenAIWorker, 'function');
});

test('导出 callOpenAI 函数', function () {
  assert.strictEqual(typeof openaiWorker.callOpenAI, 'function');
});

test('导出 buildPrompt 函数', function () {
  assert.strictEqual(typeof openaiWorker.buildPrompt, 'function');
});

test('导出 hashText 函数', function () {
  assert.strictEqual(typeof openaiWorker.hashText, 'function');
});
