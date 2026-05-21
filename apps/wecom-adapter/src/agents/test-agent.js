'use strict';

const assert = require('assert');
const skillAgent = require('./skill-agent');

async function testAgentExecuteKnownSkill() {
  const result = await skillAgent.execute('ops-summary', { mock: true });
  assert.ok(result, 'should return a result');
  assert.strictEqual(result.success, true);
  console.log('OK: execute ops-summary');
}

async function testAgentExecuteUnknownSkill() {
  const result = await skillAgent.execute('unknown-skill', {});
  assert.ok(result, 'should return a result');
  assert.strictEqual(result.success, false);
  console.log('OK: execute unknown skill returns false');
}

async function run() {
  const tests = [testAgentExecuteKnownSkill, testAgentExecuteUnknownSkill];
  let passed = 0;
  let failed = 0;
  for (const fn of tests) {
    try { await fn(); passed++; } catch (e) { console.error('FAIL:', e.message); failed++; }
  }
  console.log('\nAgent tests: ' + passed + '/' + tests.length + ' passed');
  process.exit(failed > 0 ? 1 : 0);
}
run();
