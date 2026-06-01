'use strict';

/**
 * test-agent-capability-registry.cjs — P12 Agent Capability Registry test suite
 */

const registry = require('./agent-capability-registry');
const assert = require('assert');

var passed = 0;
function ok(name) { passed++; console.log('  ✅ ' + name); }
function fail(name, e) { console.log('  ❌ ' + name + ': ' + e.message); process.exit(1); }

// ═══ 1. Load agents ═══
console.log('── Load Agents ──');
const list = registry.listAgents();
assert(list.length >= 4, 'At least 4 agents loaded'); ok('4 agents loaded: ' + list.length);

// ═══ 2. listAgents ═══
console.log('── listAgents ──');
assert(Array.isArray(list)); ok('listAgents returns array');
list.forEach(function(a) {
  assert(a.agentId); assert(a.name); assert(a.role);
});
ok('All agents have required fields');

// ═══ 3. getAgent ═══
console.log('── getAgent ──');
var codex = registry.getAgent('codex');
assert(codex !== null); ok('getAgent codex returns agent');
assert(codex.role === 'development'); ok('codex role is development');

// ═══ 4. getAgent nonexistent ═══
var nx = registry.getAgent('nonexistent');
assert(nx === null); ok('getAgent nonexistent returns null');

// ═══ 5-8. findByCapability ═══
console.log('── findByCapability ──');
assert(registry.findAgentsByCapability('code_generation').some(function(a) { return a.agentId === 'codex'; }));
ok('code_generation → codex');

assert(registry.findAgentsByCapability('server_execution').some(function(a) { return a.agentId === 'workbuddy'; }));
ok('server_execution → workbuddy');

assert(registry.findAgentsByCapability('roi_analysis').some(function(a) { return a.agentId === 'deepseek'; }));
ok('roi_analysis → deepseek');

assert(registry.findAgentsByCapability('smoke_test').some(function(a) { return a.agentId === 'node-a'; }));
ok('smoke_test → node-a');

// ═══ 9-11. findByTaskType ═══
console.log('── findByTaskType ──');
assert(registry.findAgentsByTaskType('development').some(function(a) { return a.agentId === 'codex'; }));
ok('development → codex');

assert(registry.findAgentsByTaskType('roi').some(function(a) { return a.agentId === 'deepseek'; }));
ok('roi → deepseek');

assert(registry.findAgentsByTaskType('audit').some(function(a) { return a.agentId === 'workbuddy'; }));
ok('audit → workbuddy');

// ═══ 12. canHandleTask true ═══
console.log('── canHandleTask ──');
assert(registry.canHandleTask('codex', { taskType: 'development' }) === true);
ok('codex can handle development');

// ═══ 13. forbiddenAction blocks ═══
assert(registry.canHandleTask('codex', { taskType: 'development', action: 'deploy' }) === false);
ok('codex blocked on deploy action');

// ═══ 14. disabled agent unavailable ═══
console.log('── Disabled Agent ──');
var orig = registry.getAgent('codex');
orig.enabled = false;
assert(registry.canHandleTask('codex', { taskType: 'development' }) === false);
ok('disabled codex cannot handle tasks');
orig.enabled = true;

// ═══ 15-18. selectBestAgent ═══
console.log('── selectBestAgent ──');
assert(registry.selectBestAgent({ taskType: 'development' }) === 'codex');
ok('development → codex (priority 10)');

assert(registry.selectBestAgent({ taskType: 'validation' }) === 'workbuddy');
ok('validation → workbuddy');

assert(registry.selectBestAgent({ taskType: 'roi' }) === 'deepseek');
ok('roi → deepseek');

assert(registry.selectBestAgent({ taskType: 'smoke_test' }) === 'node-a');
ok('smoke_test → node-a');

// ═══ 19. No match returns null ═══
var noMatch = registry.selectBestAgent({ taskType: 'nonexistent_task_type' });
assert(noMatch === null); ok('no match → null');

// ═══ 20. validateAgentConfig ═══
console.log('── validateAgentConfig ──');
var valid = registry.validateAgentConfig({
  agentId: 'test', name: 'Test', role: 'test',
  capabilities: ['test'], allowedTaskTypes: ['test'],
  forbiddenActions: [], requiresHumanApproval: true, reviewOnly: true
});
assert(valid.valid === true); ok('valid config passes');

// ═══ 21. Missing fields ─═
var invalid = registry.validateAgentConfig({ agentId: 'bad' });
assert(invalid.valid === false); ok('invalid config fails');
assert(invalid.errors.length > 0); ok('invalid config has errors');

// ═══ 22. reviewOnly must be true ═══
var noReview = registry.validateAgentConfig({
  agentId: 'test2', name: 'Test2', role: 'test',
  capabilities: ['test'], allowedTaskTypes: ['test'],
  forbiddenActions: [], requiresHumanApproval: true, reviewOnly: false
});
assert(noReview.valid === false); ok('reviewOnly=false rejected');

// ═══ 23. requiresHumanApproval must be true ═══
var noApproval = registry.validateAgentConfig({
  agentId: 'test3', name: 'Test3', role: 'test',
  capabilities: ['test'], allowedTaskTypes: ['test'],
  forbiddenActions: [], requiresHumanApproval: false, reviewOnly: true
});
assert(noApproval.valid === false); ok('requiresHumanApproval=false rejected');

// ═══ 24. reloadAgents ═══
console.log('── reloadAgents ──');
var count = registry.reloadAgents();
assert(count >= 4); ok('reloadAgents returns ' + count + ' agents');

// ═══ Agent Capability Table ═══
console.log('\n══════ Agent Capability Table ══════');
console.log('agentId   | role         | provider   | reviewOnly | approval');
console.log('----------|--------------|------------|------------|---------');
registry.listAgents().forEach(function(a) {
  console.log(
    (a.agentId || '').padEnd(10) + '| ' +
    (a.role || '').padEnd(13) + '| ' +
    (a.provider || '').padEnd(11) + '| ' +
    String(a.reviewOnly).padEnd(11) + '| ' +
    a.requiresHumanApproval
  );
});

console.log('\n✅ All P12 Agent Capability Registry tests passed (' + passed + ' assertions)');
