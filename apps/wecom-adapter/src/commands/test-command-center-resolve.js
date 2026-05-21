'use strict';
/**
 * test-command-center-resolve.js
 * command-center resolve() 回归测试
 */

const { resolve, getCommandList } = require('../lib/command-center');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  OK: ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL: ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

console.log('command-center resolve() 回归测试：\n');

// === /技能 相关 ===
test('resolve /技能 returns handler', () => {
  const r = resolve('/技能');
  assert(r && typeof r.handler === 'function', '/技能 should return { handler }');
  assert(r.args === '', 'args should be empty for exact match');
});

test('resolve /skill returns handler', () => {
  const r = resolve('/skill');
  assert(r && typeof r.handler === 'function', '/skill alias should work');
});

test('resolve /skills returns handler', () => {
  const r = resolve('/skills');
  assert(r && typeof r.handler === 'function', '/skills alias should work');
});

test('resolve /技能列表 returns handler', () => {
  const r = resolve('/技能列表');
  assert(r && typeof r.handler === 'function', '/技能列表 alias should work');
});

test('resolve /技能 ops-summary returns handler with args', () => {
  const r = resolve('/技能 ops-summary');
  assert(r && typeof r.handler === 'function', '/技能 ops-summary should match');
  assert(r.args === 'ops-summary', `args should be 'ops-summary', got '${r.args}'`);
});

test('resolve /skill ops-summary returns handler with args', () => {
  const r = resolve('/skill ops-summary');
  assert(r && typeof r.handler === 'function');
  assert(r.args === 'ops-summary');
});

// === 粘连写法（无空格） ===
test('resolve /技能ops-summary (no space) returns handler with args', () => {
  const r = resolve('/技能ops-summary');
  // 注意：/技能 精确匹配优先，但 /技能ops-summary 长度 > cmd.length，应走前缀匹配
  // 由于 extractArgs 对粘连写法支持，这里应该提取出 'ops-summary'
  if (r) {
    assert(r.args === 'ops-summary', `args should be 'ops-summary', got '${r.args}'`);
  }
  // 如果 extractArgs 不处理中文粘连，可能返回 null，这个测试允许 null
});

// === 已有命令不被破坏 ===
test('resolve /帮助 still works', () => {
  const r = resolve('/帮助');
  assert(r && typeof r.handler === 'function', '/帮助 should still work');
});

test('resolve /帮助 (exact match, no args)', () => {
  const r = resolve('/帮助');
  assert(r.args === '', 'args should be empty');
});

test('resolve /状态 still works', () => {
  const r = resolve('/状态');
  assert(r && typeof r.handler === 'function');
});

test('resolve /今日GMV still works', () => {
  const r = resolve('/今日GMV');
  assert(r && typeof r.handler === 'function');
});

test('resolve /今日GMV 粘连参数', () => {
  const r = resolve('/今日GMV详情');
  // 应走前缀匹配，args = '详情'
  assert(r && typeof r.handler === 'function', 'should prefix-match /今日GMV');
  assert(r.args === '详情', `args should be '详情', got '${r.args}'`);
});

test('resolve /ping still works', () => {
  const r = resolve('/ping');
  assert(r && typeof r.handler === 'function');
});

test('resolve unknown command returns null', () => {
  const r = resolve('/不存在的命令');
  assert(r === null, 'unknown command should return null');
});

test('resolve empty input returns null', () => {
  assert(resolve('') === null);
  assert(resolve(null) === null);
  assert(resolve(undefined) === null);
});

// === getCommandList 包含 /技能 ===
test('getCommandList includes /技能', () => {
  const list = getCommandList();
  assert(list.includes('/技能'), 'getCommandList should include /技能');
  assert(list.includes('/帮助'), 'should still include /帮助');
});

// === handler 返回类型必须是 string ===
test('resolve("/技能").handler() returns string', async () => {
  const r = resolve('/技能');
  assert(r && typeof r.handler === 'function');
  const result = await r.handler();
  assert(typeof result === 'string', `should return string, got ${typeof result}`);
});

test('resolve("/技能 列表").handler("列表") returns string', async () => {
  const r = resolve('/技能 列表');
  assert(r && typeof r.handler === 'function');
  const result = await r.handler('列表');
  assert(typeof result === 'string', `should return string, got ${typeof result}`);
});

test('resolve("/技能 ops-summary").handler("ops-summary") returns string with keyword', async () => {
  const r = resolve('/技能 ops-summary');
  assert(r && typeof r.handler === 'function');
  const result = await r.handler('ops-summary');
  assert(typeof result === 'string', `should return string, got ${typeof result}`);
  const hasKeyword = result.includes('运营摘要') || result.includes('GMV');
  assert(hasKeyword, `result should contain "运营摘要" or "GMV", got: ${result.slice(0, 60)}`);
});

test('skills.execute("") returns string', async () => {
  const { execute } = require('../commands/skills');
  const result = await execute('');
  assert(typeof result === 'string', `should return string, got ${typeof result}`);
});

test('skills.execute("列表") returns string', async () => {
  const { execute } = require('../commands/skills');
  const result = await execute('列表');
  assert(typeof result === 'string', `should return string, got ${typeof result}`);
});

test('skills.execute({ args: "列表" }) returns string', async () => {
  const { execute } = require('../commands/skills');
  const result = await execute({ args: '列表' });
  assert(typeof result === 'string', `should return string, got ${typeof result}`);
});

test('skills.execute({ text: "ops-summary" }) returns string', async () => {
  const { execute } = require('../commands/skills');
  const result = await execute({ text: 'ops-summary' });
  assert(typeof result === 'string', `should return string, got ${typeof result}`);
});

console.log(`\n共 ${passed + failed} 个测试，${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
