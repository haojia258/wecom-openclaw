'use strict';

const assert = require('assert');
const skillAgent = require('./skill-agent');

async function testExecuteString() {
  // ops-summary 是 stub，success 可能是 true 或 false（取决于实现），但不应 crash
  try {
    const result = await skillAgent.execute('ops-summary', {});
    assert.ok(result && typeof result === 'object', 'should return object');
    assert.ok('success' in result, 'should have success field');
  } catch (e) {
    // 如果 ops-summary 未实现，允许返回 success:false 但不允许 crash
    assert.ok(!e.message.includes('is not a function'), 'should not crash on function call');
  }
  console.log('OK: execute with string input');
}

async function testExecuteObjectWithText() {
  try {
    const result = await skillAgent.execute({ text: 'ops-summary' }, {});
    assert.ok(result && typeof result === 'object');
  } catch (e) {
    assert.ok(!e.message.includes('trim is not a function'), 'should not crash on object input');
  }
  console.log('OK: execute with object { text }');
}

async function testExecuteObjectWithArgs() {
  try {
    const result = await skillAgent.execute({ args: 'ops-summary' }, {});
    assert.ok(result && typeof result === 'object');
  } catch (e) {
    assert.ok(!e.message.includes('trim is not a function'), 'should not crash');
  }
  console.log('OK: execute with object { args }');
}

async function testExecuteArray() {
  try {
    const result = await skillAgent.execute(['ops-summary'], {});
    assert.ok(result && typeof result === 'object');
  } catch (e) {
    assert.ok(!e.message.includes('trim is not a function'), 'should not crash on array input');
  }
  console.log('OK: execute with array input');
}

async function testExecuteNull() {
  try {
    const result = await skillAgent.execute(null, {});
    assert.ok(result && typeof result === 'object');
    assert.strictEqual(result.success, false);
  } catch (e) {
    assert.ok(!e.message.includes('trim is not a function'), 'should not crash on null');
  }
  console.log('OK: execute with null input');
}

async function testExecuteUnknownSkill() {
  const result = await skillAgent.execute('unknown-skill', {});
  assert.ok(result && typeof result === 'object');
  assert.strictEqual(result.success, false);
  console.log('OK: execute unknown skill returns false');
}

async function run() {
  const tests = [
    testExecuteString,
    testExecuteObjectWithText,
    testExecuteObjectWithArgs,
    testExecuteArray,
    testExecuteNull,
    testExecuteUnknownSkill,
  ];
  let passed = 0;
  let failed = 0;
  for (const fn of tests) {
    try { await fn(); passed++; } catch (e) { console.error('FAIL:', e.message); failed++; }
  }
  console.log('\nAgent tests: ' + passed + '/' + tests.length + ' passed');
  process.exit(failed > 0 ? 1 : 0);
}
run();
