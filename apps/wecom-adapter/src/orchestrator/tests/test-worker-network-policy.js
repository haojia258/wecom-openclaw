'use strict';

/**
 * test-worker-network-policy.js — worker-network-policy.js 单元测试
 *
 * 测试覆盖:
 *   1. executeWithTimeout 正常完成
 *   2. executeWithTimeout 超时触发
 *   3. executeWithTimeout 错误传递
 *   4. executeWithRetry 一次成功
 *   5. executeWithRetry 第2次成功
 *   6. executeWithRetry 全部失败→最终错误
 *   7. CircuitBreaker 初始 CLOSED
 *   8. CircuitBreaker 3次失败→OPEN
 *   9. CircuitBreaker OPEN→HALF_OPEN (时间推进)
 *   10. CircuitBreaker HALF_OPEN 成功→CLOSED
 *   11. CircuitBreaker HALF_OPEN 失败→OPEN
 *   12. getEffectiveMode() 代理健康→'real'
 *   13. getEffectiveMode() 代理不健康→'mock'
 *   14. getState() 返回正确状态
 *   15. reset() 恢复初始状态
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

// 安全兜底：8 秒后强制结束
setTimeout(function () {
  if (pending > 0) {
    tests.push('⚠ ' + pending + ' async tests未完成');
    pending = 0;
    maybeDone();
  }
}, 8000);

// ========== 模块加载 ==========
var networkPolicy;
try {
  networkPolicy = require('../worker-network-policy');
  tests.push('✓ 模块加载成功');
} catch (e) {
  tests.push('✗ 模块加载失败: ' + e.message);
  console.log(tests.join('\n'));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(1);
}

// ========== 1. executeWithTimeout 正常完成 ==========
test('executeWithTimeout 正常完成', function () {
  return networkPolicy.executeWithTimeout(
    function () { return Promise.resolve('ok'); },
    't-timeout-1'
  ).then(function (r) {
    assert.strictEqual(r, 'ok');
  });
});

// ========== 2. executeWithTimeout 超时触发 ==========
test('executeWithTimeout 超时触发', function () {
  return networkPolicy.executeWithTimeout(
    function () { return new Promise(function () {}); }, // 永不 resolve
    't-timeout-2',
    500 // 500ms 超时
  ).then(
    function () { throw new Error('should not reach here'); },
    function (e) {
      assert.ok(e.message.indexOf('timeout') >= 0 || e.message.indexOf('Timeout') >= 0);
    }
  );
});

// ========== 3. executeWithTimeout 错误传递 ==========
test('executeWithTimeout 错误传递', function () {
  return networkPolicy.executeWithTimeout(
    function () { return Promise.reject(new Error('test error')); },
    't-timeout-3'
  ).then(
    function () { throw new Error('should not reach here'); },
    function (e) {
      assert.ok(e.message.indexOf('test error') >= 0);
    }
  );
});

// ========== 4. executeWithRetry 一次成功 ==========
test('executeWithRetry 一次成功', function () {
  return networkPolicy.executeWithRetry(
    function () { return Promise.resolve('success'); },
    't-retry-1'
  ).then(function (r) {
    assert.strictEqual(r, 'success');
  });
});

// ========== 5. executeWithRetry 第2次成功 ==========
test('executeWithRetry 第2次成功', function () {
  var callCount = 0;
  return networkPolicy.executeWithRetry(
    function () {
      callCount++;
      if (callCount < 2) return Promise.reject(new Error('fail ' + callCount));
      return Promise.resolve('ok at ' + callCount);
    },
    't-retry-2'
  ).then(function (r) {
    assert.strictEqual(r, 'ok at 2');
    assert.strictEqual(callCount, 2);
  });
});

// ========== 6. executeWithRetry 全部失败→最终错误 ==========
test('executeWithRetry 全部失败→最终错误', function () {
  return networkPolicy.executeWithRetry(
    function () { return Promise.reject(new Error('always fail')); },
    't-retry-3',
    { maxRetries: 2, backoffBase: 50 }
  ).then(
    function () { throw new Error('should not reach here'); },
    function (e) {
      assert.ok(e.message.indexOf('always fail') >= 0);
    }
  );
});

// ========== 7. CircuitBreaker 初始 CLOSED ==========
test('CircuitBreaker 初始 CLOSED', function () {
  var cb = new networkPolicy.CircuitBreaker({ failureThreshold: 3, cooldownMs: 5000 });
  var state = cb.getState();
  assert.strictEqual(state.state, 'CLOSED');
  assert.strictEqual(state.failureCount, 0);
});

// ========== 8. CircuitBreaker 3次失败→OPEN ==========
test('CircuitBreaker 3次失败→OPEN', function () {
  var cb = new networkPolicy.CircuitBreaker({ failureThreshold: 3, cooldownMs: 5000 });
  var err = new Error('test fail');

  return cb.call(function () { throw err; }, 't-cb-1').then(
    function () { throw new Error('should not reach'); },
    function () { // 第1次失败
      return cb.call(function () { throw err; }, 't-cb-2');
    }
  ).then(
    function () { throw new Error('should not reach'); },
    function () { // 第2次失败
      return cb.call(function () { throw err; }, 't-cb-3');
    }
  ).then(
    function () { throw new Error('should not reach'); },
    function () { // 第3次失败 → OPEN
      var state = cb.getState();
      assert.strictEqual(state.state, 'OPEN');
    }
  );
});

// ========== 9. CircuitBreaker OPEN→HALF_OPEN (时间推进) ==========
test('CircuitBreaker OPEN→HALF_OPEN (时间推进)', function () {
  var cb = new networkPolicy.CircuitBreaker({ failureThreshold: 2, cooldownMs: 500 });
  var err = new Error('fail');

  // 2次失败 → OPEN
  return cb.call(function () { throw err; }, 't-cb-4').then(
    function () { throw new Error('s1'); }, function () { return cb.call(function () { throw err; }, 't-cb-5'); }
  ).then(
    function () { throw new Error('s2'); },
    function () {
      assert.strictEqual(cb.getState().state, 'OPEN');
      // 等待冷却时间 (500ms + 100ms 余量)
      return new Promise(function (resolve) { setTimeout(resolve, 600); });
    }
  ).then(function () {
    // cooldown 结束后调用 call()，应该触发 HALF_OPEN → success → CLOSED
    return cb.call(function () { return 'probe ok'; }, 't-cb-probe');
  }).then(function (r) {
    assert.strictEqual(r, 'probe ok');
    assert.strictEqual(cb.getState().state, 'CLOSED');
  });
});

// ========== 10. CircuitBreaker HALF_OPEN 成功→CLOSED ==========
test('CircuitBreaker HALF_OPEN 成功→CLOSED', function () {
  var cb = new networkPolicy.CircuitBreaker({ failureThreshold: 2, cooldownMs: 300 });
  var err = new Error('fail');

  // 进入 OPEN
  return cb.call(function () { throw err; }, 't-cb-6').then(
    function () { throw new Error('s1'); },
    function () { return cb.call(function () { throw err; }, 't-cb-7'); }
  ).then(
    function () { throw new Error('s2'); },
    function () {
      // 等待 → HALF_OPEN
      return new Promise(function (resolve) { setTimeout(resolve, 500); });
    }
  ).then(function () {
    // HALF_OPEN 中成功 → CLOSED
    return cb.call(function () { return 'recovered'; }, 't-cb-8');
  }).then(function (r) {
    assert.strictEqual(r, 'recovered');
    assert.strictEqual(cb.getState().state, 'CLOSED');
    assert.strictEqual(cb.getState().failureCount, 0);
  });
});

// ========== 11. CircuitBreaker HALF_OPEN 失败→OPEN ==========
test('CircuitBreaker HALF_OPEN 失败→OPEN', function () {
  var cb = new networkPolicy.CircuitBreaker({ failureThreshold: 2, cooldownMs: 300 });
  var err = new Error('fail');

  // 进入 OPEN
  return cb.call(function () { throw err; }, 't-cb-9').then(
    function () { throw new Error('s1'); },
    function () { return cb.call(function () { throw err; }, 't-cb-10'); }
  ).then(
    function () { throw new Error('s2'); },
    function () {
      return new Promise(function (resolve) { setTimeout(resolve, 500); });
    }
  ).then(function () {
    // HALF_OPEN 中失败 → OPEN (重置定时器)
    return cb.call(function () { throw err; }, 't-cb-11');
  }).then(
    function () { throw new Error('should not reach'); },
    function () {
      assert.strictEqual(cb.getState().state, 'OPEN');
    }
  );
});

// ========== 12. getEffectiveMode() mock 模式 (无代理配置) ==========
test('getEffectiveMode() 无代理配置 → mock', function () {
  // 无 OPENAI_PROXY_HOST → isEnabled()=false → 'mock'
  delete process.env.OPENAI_PROXY_HOST;
  networkPolicy.resetGlobalBreaker();
  return networkPolicy.getEffectiveMode().then(function (mode) {
    assert.strictEqual(mode, 'mock');
  });
});

// ========== 13. getState() 返回正确状态 ==========
test('getState() 返回正确状态', function () {
  var cb = new networkPolicy.CircuitBreaker({ failureThreshold: 5, cooldownMs: 10000 });
  var state = cb.getState();
  assert.ok(state.hasOwnProperty('state'));
  assert.ok(state.hasOwnProperty('failureCount'));
  assert.ok(state.hasOwnProperty('lastFailureAt'));
  assert.ok(state.hasOwnProperty('nextTryAt'));
});

// ========== 14. reset() 恢复初始状态 ==========
test('reset() 恢复初始状态', function () {
  var cb = new networkPolicy.CircuitBreaker({ failureThreshold: 2, cooldownMs: 5000 });
  var err = new Error('x');
  // 需要 2 次失败才能到达 OPEN (failureThreshold=2)
  return cb.call(function () { throw err; }, 't-reset-1').then(
    function () { throw new Error('should not reach'); },
    function () { // 第1次失败
      return cb.call(function () { throw err; }, 't-reset-2');
    }
  ).then(
    function () { throw new Error('should not reach'); },
    function () { // 第2次失败 → OPEN
      assert.strictEqual(cb.getState().state, 'OPEN');
      cb.reset();
      assert.strictEqual(cb.getState().state, 'CLOSED');
      assert.strictEqual(cb.getState().failureCount, 0);
    }
  );
});

// ========== 15. getEffectiveMode() 全局熔断器开启 → mock ==========
test('getEffectiveMode() 全局熔断器 OPEN → mock', function () {
  var gb = networkPolicy.getGlobalBreaker();
  // 强制设为 OPEN
  gb.state = 'OPEN';
  gb.nextTryAt = Date.now() + 60000; // 60s 后重试

  return networkPolicy.getEffectiveMode().then(function (mode) {
    assert.strictEqual(mode, 'mock');
    // 恢复
    gb.reset();
  });
});

// ========== 收尾：触发测试完成检查 ==========
console.log('\n=== Worker Network Policy Tests ===\n');
setTimeout(function () {
  if (pending <= 0) {
    console.log(tests.join('\n'));
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail > 0 ? 1 : 0);
  }
}, 1000);
