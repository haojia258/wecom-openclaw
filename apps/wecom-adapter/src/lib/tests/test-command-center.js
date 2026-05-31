'use strict';

/**
 * test-command-center.js - 紧凑参数解析测试
 * 验证 prefix matching + global alias sorting
 */

const { resolve, REGISTRY } = require('../command-center');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; }
  else { console.error('  FAIL: ' + msg); failed++; }
}

// ═══ 审查命令 - 紧凑参数 ═══
console.log('=== 审查命令紧凑参数 ===');

const reviewTests = [
  { input: '/审查 nginx.conf',         expectArgs: 'nginx.conf' },
  { input: '/审查nginx.conf',          expectArgs: 'nginx.conf' },
  { input: '/审 apps/wecom-adapter/src/review', expectArgs: 'apps/wecom-adapter/src/review' },
  { input: '/审apps/wecom-adapter/src/review',  expectArgs: 'apps/wecom-adapter/src/review' },
  { input: '/ai-review apps/wecom-adapter/src/commands', expectArgs: 'apps/wecom-adapter/src/commands' },
  { input: '/ai-reviewapps/wecom-adapter/src/commands', expectArgs: 'apps/wecom-adapter/src/commands' },
  { input: '/review apps/wecom-adapter/src/review', expectArgs: 'apps/wecom-adapter/src/review' },
  { input: '/reviewapps/wecom-adapter/src/review',  expectArgs: 'apps/wecom-adapter/src/review' },
  { input: '/代码审查 src/',          expectArgs: 'src/' },
  { input: '/代码审查src/',           expectArgs: 'src/' },
];

for (const { input, expectArgs } of reviewTests) {
  const m = resolve(input);
  assert(m !== null, 'resolve(' + input + ') should not be null');
  if (m) {
    assert(m.args === expectArgs, 'args should be ' + JSON.stringify(expectArgs) + ' got ' + JSON.stringify(m.args));
    assert(typeof m.handler === 'function', 'handler should be function');
  }
}

// ═══ 无参数精确匹配 ═══
console.log('\n=== 无参数精确匹配 ===');

const exactTests = ['/审查', '/ai-review', '/review', '/代码审查', '/审'];
for (const t of exactTests) {
  const m = resolve(t);
  assert(m !== null, 'resolve(' + t + ') should not be null');
  if (m) {
    assert(m.args === '', 'args should be empty for exact match');
  }
}

// ═══ /ai调度 不回归 ═══
console.log('\n=== /ai调度 不回归 ===');

const aiSchedulerTests = [
  { input: '/ai调度 帮助', expectArgs: '帮助' },
  { input: '/ai调度帮助',  expectArgs: '帮助' },
  { input: '/ai 帮助',     expectArgs: '帮助' },
  { input: '/ai帮助',      expectArgs: '帮助' },
];

for (const { input, expectArgs } of aiSchedulerTests) {
  const m = resolve(input);
  assert(m !== null, 'resolve(' + input + ') should not be null');
  if (m) {
    assert(m.args === expectArgs, 'args for ' + input + ' should be ' + JSON.stringify(expectArgs) + ' got ' + JSON.stringify(m.args));
  }
}

// ═══ 边界情况 ═══
console.log('\n=== 边界情况 ===');

assert(resolve('') === null, 'empty string should return null');
assert(resolve(null) === null, 'null should return null');
assert(resolve('/unknowncommand') === null, 'unknown command should return null');
assert(resolve('hello world') === null, 'non-command text should return null');

// ═══ REGISTRY 结构验证 ═══
console.log('\n=== REGISTRY 结构 ===');
assert(REGISTRY['/审查'] !== undefined, '/审查 should be registered');
assert(REGISTRY['/审查'].aliases.includes('/审'), '/审 should be in aliases');
assert(REGISTRY['/审查'].aliases.includes('/ai-review'), '/ai-review should be in aliases');
assert(REGISTRY['/审查'].aliases.includes('/review'), '/review should be in aliases');
assert(REGISTRY['/审查'].aliases.includes('/代码审查'), '/代码审查 should be in aliases');
assert(REGISTRY['/审查'].file === '../commands/ai-review', 'file path should be ../commands/ai-review');

// ═══ 结果 ═══
console.log('\n═══════════════════');
console.log('通过: ' + passed + ' / 失败: ' + failed);
console.log('═══════════════════');

if (failed > 0) process.exit(1);
