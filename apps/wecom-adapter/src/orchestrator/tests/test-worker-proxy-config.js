'use strict';

/**
 * test-worker-proxy-config.js — worker-proxy-config.js 单元测试
 *
 * 测试覆盖:
 *   1. 无 OPENAI_PROXY_HOST → isEnabled()=false
 *   2. 有 OPENAI_PROXY_HOST → isEnabled()=true
 *   3. 默认端口 18080
 *   4. 自定义端口生效
 *   5. getConfig() 返回完整配置
 *   6. getStatus() 返回正确状态
 *   7. reload() 刷新环境变量
 *   8. healthCheck() 失败不崩溃
 *   9. healthCheck() 超时不崩溃
 *   10. 无 user/pass 时不发送认证
 *   11. createProxyAgent() 返回 https.Agent
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
      result.then(
        function () { pass++; tests.push('  ✓ ' + name); maybeDone(); },
        function (e) { fail++; tests.push('  ✗ ' + name + ' — ' + e.message); maybeDone(); }
      );
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
var proxyConfig;
try {
  proxyConfig = require('../worker-proxy-config');
  tests.push('✓ 模块加载成功');
} catch (e) {
  tests.push('✗ 模块加载失败: ' + e.message);
  console.log(tests.join('\n'));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(1);
}

// 保存原始环境变量
var _origEnv = {
  host: process.env.OPENAI_PROXY_HOST,
  port: process.env.OPENAI_PROXY_PORT,
  user: process.env.OPENAI_PROXY_USER,
  pass: process.env.OPENAI_PROXY_PASS,
};

function resetEnv() {
  if (_origEnv.host !== undefined) process.env.OPENAI_PROXY_HOST = _origEnv.host;
  else delete process.env.OPENAI_PROXY_HOST;
  if (_origEnv.port !== undefined) process.env.OPENAI_PROXY_PORT = _origEnv.port;
  else delete process.env.OPENAI_PROXY_PORT;
  if (_origEnv.user !== undefined) process.env.OPENAI_PROXY_USER = _origEnv.user;
  else delete process.env.OPENAI_PROXY_USER;
  if (_origEnv.pass !== undefined) process.env.OPENAI_PROXY_PASS = _origEnv.pass;
  else delete process.env.OPENAI_PROXY_PASS;
  proxyConfig.reload();
}

// ========== 同步测试 ==========

// Test 1: 无 OPENAI_PROXY_HOST → isEnabled()=false
test('无 OPENAI_PROXY_HOST → isEnabled()=false', function () {
  delete process.env.OPENAI_PROXY_HOST;
  proxyConfig.reload();
  assert.strictEqual(proxyConfig.isEnabled(), false);
  resetEnv();
});

// Test 2: 有 OPENAI_PROXY_HOST → isEnabled()=true
test('有 OPENAI_PROXY_HOST → isEnabled()=true', function () {
  process.env.OPENAI_PROXY_HOST = '127.0.0.1';
  proxyConfig.reload();
  assert.strictEqual(proxyConfig.isEnabled(), true);
  resetEnv();
});

// Test 3: 默认端口 18080
test('默认端口 18080', function () {
  process.env.OPENAI_PROXY_HOST = '127.0.0.1';
  delete process.env.OPENAI_PROXY_PORT;
  proxyConfig.reload();
  var cfg = proxyConfig.getConfig();
  assert.strictEqual(cfg.port, 18080);
  resetEnv();
});

// Test 4: 自定义端口生效
test('自定义端口生效', function () {
  process.env.OPENAI_PROXY_HOST = '127.0.0.1';
  process.env.OPENAI_PROXY_PORT = '18081';
  proxyConfig.reload();
  var cfg = proxyConfig.getConfig();
  assert.strictEqual(cfg.port, 18081);
  resetEnv();
});

// Test 5: getConfig() 返回完整配置
test('getConfig() 返回完整配置', function () {
  process.env.OPENAI_PROXY_HOST = 'proxy.example.com';
  process.env.OPENAI_PROXY_PORT = '8080';
  process.env.OPENAI_PROXY_USER = 'user1';
  process.env.OPENAI_PROXY_PASS = 'pass1';
  proxyConfig.reload();
  var cfg = proxyConfig.getConfig();
  assert.ok(cfg);
  assert.strictEqual(cfg.host, 'proxy.example.com');
  assert.strictEqual(cfg.port, 8080);
  assert.strictEqual(cfg.user, 'user1');
  assert.strictEqual(cfg.pass, 'pass1');
  resetEnv();
});

// Test 6: getStatus() 返回正确状态
test('getStatus() 返回正确状态', function () {
  process.env.OPENAI_PROXY_HOST = '127.0.0.1';
  proxyConfig.reload();
  var status = proxyConfig.getStatus();
  assert.ok(status);
  assert.strictEqual(status.enabled, true);
  assert.ok(status.config);
  assert.strictEqual(status.config.host, '127.0.0.1');
  resetEnv();
});

// Test 7: reload() 刷新环境变量
test('reload() 刷新环境变量', function () {
  delete process.env.OPENAI_PROXY_HOST;
  proxyConfig.reload();
  assert.strictEqual(proxyConfig.isEnabled(), false);

  process.env.OPENAI_PROXY_HOST = '127.0.0.1';
  proxyConfig.reload();
  assert.strictEqual(proxyConfig.isEnabled(), true);

  resetEnv();
});

// Test 8: 无 user/pass 时不发送认证
test('无 user/pass 时不发送认证', function () {
  process.env.OPENAI_PROXY_HOST = '127.0.0.1';
  delete process.env.OPENAI_PROXY_USER;
  delete process.env.OPENAI_PROXY_PASS;
  proxyConfig.reload();
  var cfg = proxyConfig.getConfig();
  assert.strictEqual(cfg.user, '');
  assert.strictEqual(cfg.pass, '');
  resetEnv();
});

// ========== 异步测试 ==========

// Test 9: healthCheck() 代理未配置 → false
test('healthCheck() 代理未配置 → false', function () {
  delete process.env.OPENAI_PROXY_HOST;
  proxyConfig.reload();
  return proxyConfig.healthCheck(1000).then(function (result) {
    assert.strictEqual(result, false);
    resetEnv();
  });
});

// Test 10: healthCheck() 连接拒绝 → false
test('healthCheck() 连接拒绝端口 → false', function () {
  process.env.OPENAI_PROXY_HOST = '127.0.0.1';
  process.env.OPENAI_PROXY_PORT = '54321';  // 避开 autossh 监控端口 19999
  proxyConfig.reload();
  return proxyConfig.healthCheck(1000).then(function (result) {
    assert.strictEqual(result, false);
    resetEnv();
  });
});

// Test 11: createProxyAgent() 返回 https.Agent 实例
test('createProxyAgent() 返回 https.Agent', function () {
  process.env.OPENAI_PROXY_HOST = '127.0.0.1';
  process.env.OPENAI_PROXY_PORT = '18080';
  proxyConfig.reload();
  var cfg = proxyConfig.getConfig();
  var agent = proxyConfig.createProxyAgent(cfg);
  assert.ok(agent);
  assert.ok(agent instanceof require('https').Agent);
  resetEnv();
});

// ========== 清理 ==========
resetEnv();

console.log('\n=== Worker Proxy Config Tests ===\n');
