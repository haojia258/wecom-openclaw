/**
 * test-agent-registry.cjs — Agent Capability Registry tests
 */
'use strict';

var tests = [];
var passed = 0;
var failed = 0;
var errors = [];

function test(name, fn) { tests.push({ name: name, fn: fn }); }
function assert(condition, message) {
  if (!condition) { throw new Error(message || 'Assertion failed'); }
}

var path = require('path');
var registry = require('../src/skills/agent-registry/agent-registry.js');

// Set test path (local json)
registry.setRegistryPath(path.join(__dirname, '..', 'storage', 'agent-registry', 'agent-capabilities.json'));

test('R1: listAgents returns 4 agents', function () {
  var list = registry.listAgents();
  assert(list.length === 4);
  var ids = list.map(function (a) { return a.id; });
  assert(ids.indexOf('codex') !== -1);
  assert(ids.indexOf('workbuddy') !== -1);
  assert(ids.indexOf('deepseek') !== -1);
  assert(ids.indexOf('doubao') !== -1);
});

test('R2: agentExists for codex', function () {
  assert(registry.agentExists('codex') === true);
});

test('R3: agentExists for unknown', function () {
  assert(registry.agentExists('nonexistent') === false);
});

test('R4: getAgent returns codex data', function () {
  var a = registry.getAgent('codex');
  assert(a.provider === 'OpenAI');
  assert(a.model === 'gpt-4o');
  assert(a.status === 'online');
});

test('R5: getProvider for codex', function () {
  assert(registry.getProvider('codex') === 'OpenAI');
});

test('R6: getModel for doubao', function () {
  assert(registry.getModel('doubao') === 'doubao-pro');
});

test('R7: getAgentStatus for deepseek', function () {
  assert(registry.getAgentStatus('deepseek') === 'online');
});

test('R8: hasCapability code_generation for codex', function () {
  assert(registry.hasCapability('codex', 'code_generation') === true);
});

test('R9: hasCapability not present', function () {
  assert(registry.hasCapability('workbuddy', 'code_generation') === false);
});

test('R10: hasPermission for workbuddy', function () {
  assert(registry.hasPermission('workbuddy', 'generate_report') === true);
});

test('R11: formatAgentForWecom returns markdown', function () {
  var md = registry.formatAgentForWecom('codex');
  assert(md.indexOf('# Agent: Codex') !== -1);
  assert(md.indexOf('gpt-4o') !== -1);
  assert(md.indexOf('OpenAI') !== -1);
});

test('R12: formatAllForWecom returns list', function () {
  var md = registry.formatAllForWecom();
  assert(md.indexOf('# Agent List') !== -1);
  assert(md.indexOf('codex') !== -1);
  assert(md.indexOf('doubao') !== -1);
});

test('R13: doubao capabilities include copywriting', function () {
  assert(registry.hasCapability('doubao', 'copywriting') === true);
});

test('R14: deepseek capabilities include risk_assessment', function () {
  assert(registry.hasCapability('deepseek', 'risk_assessment') === true);
});

test('R15: workbuddy permissions include schedule_jobs', function () {
  assert(registry.hasPermission('workbuddy', 'schedule_jobs') === true);
});

// Run
console.log('Running ' + tests.length + ' agent registry tests...\n');
tests.forEach(function (t) {
  try { t.fn(); passed++; process.stdout.write('.'); }
  catch (e) { failed++; errors.push({ name: t.name, error: e.message }); process.stdout.write('F'); }
});
console.log('\n\n' + '='.repeat(50));
console.log('Total:  ' + tests.length + '  Passed: ' + passed + '  Failed: ' + failed);
console.log('='.repeat(50));
if (failed > 0) { console.log('\nFAILED:'); errors.forEach(function(e){console.log('  '+e.name+': '+e.error);}); process.exit(1); }
console.log('\nAll tests passed!\n');
process.exit(0);
