'use strict';

const assert = require('assert');
const skillAgent = require('./skill-agent');

async function testExecuteStringInput() {
  // ops-summary with mock: true → should return string via extractText
  const result = await skillAgent.execute('ops-summary', { mock: true });
  assert.strictEqual(typeof result, 'string', 'execute(string) should return string');
  console.log('OK: execute with string input returns string');
}

async function testExecuteObjectWithText() {
  const result = await skillAgent.execute({ text: 'ops-summary' }, { mock: true });
  assert.strictEqual(typeof result, 'string', 'execute({text}) should return string');
  console.log('OK: execute with object { text } returns string');
}

async function testExecuteObjectWithArgs() {
  const result = await skillAgent.execute({ args: 'ops-summary' }, { mock: true });
  assert.strictEqual(typeof result, 'string', 'execute({args}) should return string');
  console.log('OK: execute with object { args } returns string');
}

async function testExecuteArray() {
  const result = await skillAgent.execute(['ops-summary'], { mock: true });
  assert.strictEqual(typeof result, 'string', 'execute(array) should return string');
  console.log('OK: execute with array input returns string');
}

async function testExecuteNull() {
  const result = await skillAgent.execute(null, {});
  assert.strictEqual(typeof result, 'string', 'execute(null) should return string');
  console.log('OK: execute with null input returns string');
}

async function testExecuteUnknownSkill() {
  const result = await skillAgent.execute('unknown-skill', {});
  assert.strictEqual(typeof result, 'string', 'execute(unknown) should return string');
  console.log('OK: execute unknown skill returns string');
}

async function run() {
  const tests = [
    testExecuteStringInput,
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
