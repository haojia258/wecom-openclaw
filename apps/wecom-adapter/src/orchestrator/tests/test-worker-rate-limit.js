/**
 * test-worker-rate-limit.js — 调用限流测试
 *
 * 测试 worker-rate-limit.js:
 *   - 首次调用 allowed
 *   - 每分钟上限 2 次
 *   - 每小时上限 10 次
 *   - 并发上限 1
 *   - release() 释放并发
 *   - getStatus() 返回正确计数
 *   - reset() 重置
 */
'use strict';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { console.error('  FAIL: ' + msg); failed++; }
}

console.log('\n=== Worker Rate Limit Tests ===\n');

// Test 1: 模块加载
console.log('Test 1: Module loads');
const limiter = require('../worker-rate-limit');
assert(typeof limiter === 'object', 'limiter should be an object');
assert(typeof limiter.check === 'function', 'check should be a function');
assert(typeof limiter.release === 'function', 'release should be a function');
assert(typeof limiter.getStatus === 'function', 'getStatus should be a function');
assert(typeof limiter.reset === 'function', 'reset should be a function');

// 每个测试组前重置
limiter.reset();

// Test 2: 首次调用 → allowed
console.log('\nTest 2: First call → allowed');
var r1 = limiter.check('task-1');
assert(r1.allowed === true, 'first call should be allowed');
limiter.release(); // 释放并发槽位

// Test 3: 第二次调用 → allowed (每分钟上限=2)
console.log('\nTest 3: Second call → allowed');
var r2 = limiter.check('task-2');
assert(r2.allowed === true, 'second call should be allowed');
limiter.release(); // 释放并发槽位

// Test 4: 第三次调用 → blocked (超过每分钟上限)
console.log('\nTest 4: Third call → blocked (minute limit)');
limiter.release(); // 确保前序并发已释放
var r3 = limiter.check('task-3');
assert(r3.allowed === false, 'third call should be blocked');
assert(r3.reason.indexOf('RATE_LIMIT_EXCEEDED') !== -1, 'reason should contain RATE_LIMIT_EXCEEDED');
assert(r3.reason.indexOf('分钟') !== -1, 'reason should mention minute limit');

// Test 5: release() 释放并发槽位
console.log('\nTest 5: release() frees concurrent slot');
limiter.reset();
limiter.check('task-a'); // 占用并发
limiter.release();
var r_after = limiter.check('task-b'); // 应该允许
assert(r_after.allowed === true, 'after release, next call should be allowed');

// Test 6: 并发限制 (不 release 时不允许新调用)
console.log('\nTest 6: Concurrent limit blocks without release');
limiter.reset();
limiter.check('task-c'); // 占用并发
var r_blocked = limiter.check('task-d'); // 应被阻塞
assert(r_blocked.allowed === false, 'concurrent call should be blocked');
assert(r_blocked.reason.indexOf('并发') !== -1, 'reason should mention concurrent limit');

// Test 7: getStatus() 返回正确计数
console.log('\nTest 7: getStatus() returns correct counts');
limiter.reset();
limiter.check('task-1');
limiter.release();
limiter.check('task-2');
limiter.release();
var status = limiter.getStatus();
assert(status.minuteCount === 2, 'minuteCount should be 2');
assert(status.hourCount === 2, 'hourCount should be 2');
assert(status.concurrent === 0, 'concurrent should be 0 (releases called)');
assert(status.limits.perMinute === 2, 'perMinute limit should be 2');
assert(status.limits.perHour === 10, 'perHour limit should be 10');
assert(status.limits.concurrent === 1, 'concurrent limit should be 1');

// Test 8: reset() 清空状态
console.log('\nTest 8: reset() clears all state');
limiter.reset();
var status2 = limiter.getStatus();
assert(status2.minuteCount === 0, 'after reset minuteCount should be 0');
assert(status2.hourCount === 0, 'after reset hourCount should be 0');
assert(status2.concurrent === 0, 'after reset concurrent should be 0');

// Test 9: 常量正确
console.log('\nTest 9: Constants are correct');
assert(limiter.LIMIT_PER_MINUTE === 2, 'LIMIT_PER_MINUTE should be 2');
assert(limiter.LIMIT_PER_HOUR === 10, 'LIMIT_PER_HOUR should be 10');
assert(limiter.LIMIT_CONCURRENT === 1, 'LIMIT_CONCURRENT should be 1');

// Test 10: release() 安全 (不会负数)
console.log('\nTest 10: release() is safe (no negative)');
limiter.reset();
limiter.release(); // 不应崩溃
limiter.release();
limiter.release();
var status3 = limiter.getStatus();
assert(status3.concurrent === 0, 'concurrent should be 0 after extra releases');

// Test 11: 多次被拒仍返回正确原因
console.log('\nTest 11: Multiple rejections return correct reason');
limiter.reset();
limiter.check('task-a');
limiter.check('task-b');
var r4 = limiter.check('task-c');
assert(r4.allowed === false, 'should be blocked');
assert(r4.reason.indexOf('RATE_LIMIT_EXCEEDED') !== -1, 'reason should contain RATE_LIMIT_EXCEEDED');

// Cleanup
limiter.reset();

// Summary
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
process.exit(failed > 0 ? 1 : 0);
