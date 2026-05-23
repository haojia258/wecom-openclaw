/**
 * test-worker-feature-gate.js — 灰度开关测试
 *
 * 测试 worker-feature-gate.js:
 *   - 默认 disabled
 *   - OPENAI_WORKER_ENABLED=true → enabled
 *   - OPENAI_WORKER_ENABLED=false → disabled
 *   - 非法值 → disabled
 *   - check() 返回正确结果
 */
'use strict';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { console.error('  FAIL: ' + msg); failed++; }
}

console.log('\n=== Worker Feature Gate Tests ===\n');

// Test 1: 模块加载
console.log('Test 1: Module loads');
const gate = require('../worker-feature-gate');
assert(typeof gate === 'object', 'gate should be an object');
assert(typeof gate.getStatus === 'function', 'getStatus should be a function');
assert(typeof gate.isEnabled === 'function', 'isEnabled should be a function');
assert(typeof gate.check === 'function', 'check should be a function');

// Test 2: 默认 disabled (OPENAI_WORKER_ENABLED 未设)
console.log('\nTest 2: Default state is disabled');
delete process.env.OPENAI_WORKER_ENABLED;
assert(gate.getStatus() === 'disabled', 'getStatus should return disabled when env not set');
assert(gate.isEnabled() === false, 'isEnabled should return false');

// Test 3: 设为 true → enabled
console.log('\nTest 3: OPENAI_WORKER_ENABLED=true → enabled');
process.env.OPENAI_WORKER_ENABLED = 'true';
assert(gate.getStatus() === 'enabled', 'getStatus should return enabled');
assert(gate.isEnabled() === true, 'isEnabled should return true');

// Test 4: 设为 false → disabled
console.log('\nTest 4: OPENAI_WORKER_ENABLED=false → disabled');
process.env.OPENAI_WORKER_ENABLED = 'false';
assert(gate.getStatus() === 'disabled', 'getStatus should return disabled');
assert(gate.isEnabled() === false, 'isEnabled should return false');

// Test 5: 非法值 'yes' → enabled (视为 truthy)
console.log('\nTest 5: OPENAI_WORKER_ENABLED=yes → enabled');
process.env.OPENAI_WORKER_ENABLED = 'yes';
assert(gate.getStatus() === 'enabled', 'yes should be enabled');

// Test 6: 非法值 '1' → enabled
console.log('\nTest 6: OPENAI_WORKER_ENABLED=1 → enabled');
process.env.OPENAI_WORKER_ENABLED = '1';
assert(gate.getStatus() === 'enabled', '1 should be enabled');

// Test 7: 非法值 'no' → disabled
console.log('\nTest 7: OPENAI_WORKER_ENABLED=no → disabled');
process.env.OPENAI_WORKER_ENABLED = 'no';
assert(gate.getStatus() === 'disabled', 'no should be disabled');

// Test 8: 非法值 '0' → disabled
console.log('\nTest 8: OPENAI_WORKER_ENABLED=0 → disabled');
process.env.OPENAI_WORKER_ENABLED = '0';
assert(gate.getStatus() === 'disabled', '0 should be disabled');

// Test 9: 空字符串 → disabled
console.log('\nTest 9: OPENAI_WORKER_ENABLED="" → disabled');
process.env.OPENAI_WORKER_ENABLED = '';
assert(gate.getStatus() === 'disabled', 'empty string should be disabled');

// Test 10: 大写 TRUE → enabled
console.log('\nTest 10: OPENAI_WORKER_ENABLED=TRUE → enabled');
process.env.OPENAI_WORKER_ENABLED = 'TRUE';
assert(gate.getStatus() === 'enabled', 'TRUE uppercase should be enabled');

// Test 11: check() disabled → 返回拒绝
console.log('\nTest 11: check() when disabled → returns rejection');
process.env.OPENAI_WORKER_ENABLED = 'false';
const result1 = gate.check({ taskId: 'test-1' });
assert(result1 !== null, 'should return rejection object');
assert(result1.allowed === false, 'allowed should be false');
assert(result1.reason.indexOf('GATE_DISABLED') !== -1, 'reason should contain GATE_DISABLED');

// Test 12: check() enabled → 返回 null
console.log('\nTest 12: check() when enabled → returns null');
process.env.OPENAI_WORKER_ENABLED = 'true';
const result2 = gate.check({ taskId: 'test-2' });
assert(result2 === null, 'should return null when enabled');

// Test 13: 大小写不敏感
console.log('\nTest 13: Case insensitive');
process.env.OPENAI_WORKER_ENABLED = 'True';
assert(gate.getStatus() === 'enabled', 'True mixed case should be enabled');
process.env.OPENAI_WORKER_ENABLED = 'FALSE';
assert(gate.getStatus() === 'disabled', 'FALSE mixed case should be disabled');

// Cleanup
delete process.env.OPENAI_WORKER_ENABLED;

// Summary
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
process.exit(failed > 0 ? 1 : 0);
