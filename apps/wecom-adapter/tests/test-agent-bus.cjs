'use strict';

/**
 * test-agent-bus.cjs - P11.3 Agent Bus 测试
 * NODE_OPTIONS="" node tests/test-agent-bus.cjs
 */

var PASS = 0, FAIL = 0, tests = [];
function test(n, fn) { tests.push({ name: n, fn: fn }); }
function assert(c, m) { if (!c) throw new Error('ASSERT: ' + (m || '')); }
function assertContains(t, s, m) { if (t.indexOf(s) === -1) throw new Error('ASSERT: ' + (m || 'contain ' + s)); }

var store = require('../src/agent-bus/agent-bus-store');
var policy = require('../src/agent-bus/agent-bus-policy');
var bus = require('../src/agent-bus/agent-bus');
var cb = require('../src/agent-bus/agent-bus-callback');

function run() {
  console.log('=== P11.3 Agent Bus Tests ===\n');
  tests.forEach(function(t) {
    try { t.fn(); PASS++; console.log('  PASS: ' + t.name); }
    catch(e) { FAIL++; console.log('  FAIL: ' + t.name + '\n        ' + e.message.replace(/\n/g,'\n        ')); }
  });
  console.log('\n=== Results: ' + PASS + '/' + (PASS + FAIL) + ' passed ===');
  if (FAIL) process.exit(1);
}

// ─── Group A: Agent Registry ──────────────────────────────

console.log('\n--- A: Agent Registry ---');

test('A1: register agent', function() {
  var r = store.registerAgent({ agent_id: 'wb-1', agent_type: 'workbuddy', name: 'WorkBuddy 1' });
  assert(r.success, 'should register');
});

test('A2: register codex agent', function() {
  var r = store.registerAgent({ agent_id: 'codex-1', agent_type: 'codex' });
  assert(r.success, 'should register codex');
});

test('A3: register deepseek agent', function() {
  assert(store.registerAgent({ agent_id: 'ds-1', agent_type: 'deepseek' }).success, 'should register');
});

test('A4: register doubao agent', function() {
  assert(store.registerAgent({ agent_id: 'db-1', agent_type: 'doubao' }).success, 'should register');
});

test('A5: register unknown agent type fails', function() {
  assert(!store.registerAgent({ agent_id: 'x', agent_type: 'unknown' }).success, 'should fail');
});

test('A6: list agents', function() {
  var list = store.listAgents();
  assert(list.length >= 4, 'should have 4+ agents');
});

test('A7: list agents filtered by type', function() {
  var list = store.listAgents({ agent_type: 'workbuddy' });
  assert(list.length >= 1, 'should find workbuddy');
});

test('A8: update agent status', function() {
  var r = store.updateAgentStatus('wb-1', 'degraded');
  assert(r.success, 'should update');
  assert(store.getAgent('wb-1').status === 'degraded', 'should be degraded');
});

test('A9: canDispatch offline blocks', function() {
  store.updateAgentStatus('wb-1', 'offline');
  assert(!store.canDispatch('wb-1').can_dispatch, 'offline should block');
  store.updateAgentStatus('wb-1', 'online');
});

test('A10: canDispatch degraded allows', function() {
  store.updateAgentStatus('wb-1', 'degraded');
  var r = store.canDispatch('wb-1');
  assert(r.can_dispatch, 'degraded should allow dispatch');
  assert(r.degraded, 'should flag degraded');
  store.updateAgentStatus('wb-1', 'online');
});

// ─── Group B: Policy Engine ───────────────────────────────

console.log('\n--- B: Policy Engine ---');

test('B1: allowed action for workbuddy', function() {
  var r = policy.validateAgentJob('workbuddy', 'test.run');
  assert(r.allowed, 'test.run should be allowed');
});

test('B2: allowed action for codex', function() {
  assert(policy.validateAgentJob('codex', 'code.patch').allowed, 'code.patch for codex');
});

test('B3: allowed action for deepseek', function() {
  assert(policy.validateAgentJob('deepseek', 'risk.analysis').allowed, 'risk.analysis for deepseek');
});

test('B4: allowed action for doubao', function() {
  assert(policy.validateAgentJob('doubao', 'summary.write').allowed, 'summary.write for doubao');
});

test('B5: env.write forbidden for all', function() {
  assert(policy.validateAgentJob('workbuddy', 'env.write').forbidden, 'workbuddy env.write');
  assert(policy.validateAgentJob('codex', 'env.write').forbidden, 'codex env.write');
  assert(policy.validateAgentJob('deepseek', 'env.write').forbidden, 'deepseek env.write');
});

test('B6: deploy.production requires approval', function() {
  assert(policy.validateAgentJob('workbuddy', 'deploy.production').requiresApproval, 'should require approval');
});

test('B7: git.merge requires approval', function() {
  assert(policy.requiresApproval('git.merge'), 'git.merge requires approval');
});

test('B8: pm2.restart requires approval', function() {
  assert(policy.requiresApproval('pm2.restart'), 'pm2.restart requires approval');
});

test('B9: degraded blocks production-sensitive', function() {
  var r = policy.validateAgentJob('workbuddy', 'deploy.production', {}, 'degraded');
  assert(r.forbidden, 'degraded should block production-sensitive');
});

test('B10: generate policy report', function() {
  var r = policy.generatePolicyReport('codex', 'code.patch');
  assert(r.agent_type === 'codex', 'should include agent_type');
  assert(!r.forbidden, 'should not be forbidden');
});

test('B11: isForbidden helper', function() {
  assert(policy.isForbidden('env.write'), 'env.write');
  assert(policy.isForbidden('rm.rf'), 'rm.rf');
  assert(!policy.isForbidden('test.run'), 'test.run not forbidden');
});

// ─── Group C: Agent Jobs ──────────────────────────────────

console.log('\n--- C: Agent Jobs ---');

test('C1: create workbuddy job', function() {
  var r = store.createAgentJob({ agent_type: 'workbuddy', action: 'test.run', mission_id: 'm1' });
  assert(r.success, 'should create');
  assertContains(r.job.job_id, 'ab_workbuddy_', 'job_id prefix');
});

test('C2: create codex job', function() {
  var r = store.createAgentJob({ agent_type: 'codex', action: 'code.patch', mission_id: 'm1' });
  assert(r.success, 'should create codex job');
  assertContains(r.job.job_id, 'ab_codex_', 'job_id prefix');
});

test('C3: create deepseek job', function() {
  var r = store.createAgentJob({ agent_type: 'deepseek', action: 'risk.analysis' });
  assert(r.success, 'should create');
});

test('C4: create doubao job', function() {
  assert(store.createAgentJob({ agent_type: 'doubao', action: 'summary.write' }).success, 'should create');
});

test('C5: list jobs by agent_type', function() {
  var r = store.listAgentJobs({ agent_type: 'workbuddy' });
  assert(r.jobs.length > 0, 'should find workbuddy jobs');
});

test('C6: list jobs by mission_id', function() {
  var r = store.listAgentJobs({ mission_id: 'm1' });
  assert(r.jobs.length >= 2, 'should find m1 jobs');
});

test('C7: get agent job', function() {
  var cr = store.createAgentJob({ agent_type: 'codex', action: 'code.review' });
  var r = store.getAgentJob(cr.job.job_id);
  assert(r.success, 'should find');
  assert(r.job.agent_type === 'codex', 'should be codex');
});

test('C8: update job status', function() {
  var cr = store.createAgentJob({ agent_type: 'workbuddy', action: 'test.run' });
  var r = store.updateAgentJob(cr.job.job_id, { status: 'queued' });
  assert(r.success && r.job.status === 'queued', 'should update');
});

// ─── Group D: Dispatch ────────────────────────────────────

console.log('\n--- D: Dispatch ---');

test('D1: dispatch workbuddy job', function() {
  store.updateAgentStatus('wb-1', 'online');
  var cr = store.createAgentJob({ agent_type: 'workbuddy', action: 'test.run' });
  store.updateAgentJob(cr.job.job_id, { status: 'queued' });
  var r = bus.dispatchJob(cr.job, { agent_id: 'wb-1' });
  assert(r.success, 'should dispatch');
  assert(r.queue_file, 'should have queue file');
});

test('D2: dispatch codex job', function() {
  store.registerAgent({ agent_id: 'codex-2', agent_type: 'codex' });
  var cr = store.createAgentJob({ agent_type: 'codex', action: 'code.patch' });
  store.updateAgentJob(cr.job.job_id, { status: 'queued' });
  assert(bus.dispatchJob(cr.job, { agent_id: 'codex-2' }).success, 'should dispatch');
});

test('D3: dispatch deepseek job', function() {
  store.registerAgent({ agent_id: 'ds-2', agent_type: 'deepseek' });
  var cr = store.createAgentJob({ agent_type: 'deepseek', action: 'risk.analysis' });
  store.updateAgentJob(cr.job.job_id, { status: 'queued' });
  assert(bus.dispatchJob(cr.job, { agent_id: 'ds-2' }).success, 'should dispatch');
});

test('D4: offline agent blocks dispatch', function() {
  store.updateAgentStatus('wb-1', 'offline');
  var cr = store.createAgentJob({ agent_type: 'workbuddy', action: 'test.run' });
  assert(!bus.dispatchJob(cr.job, { agent_id: 'wb-1' }).success, 'should block offline');
  store.updateAgentStatus('wb-1', 'online');
});

test('D5: degraded blocks production-sensitive', function() {
  store.updateAgentStatus('wb-1', 'degraded');
  var cr = store.createAgentJob({ agent_type: 'workbuddy', action: 'deploy.production' });
  assert(!bus.dispatchJob(cr.job, { agent_id: 'wb-1' }).success, 'degraded should block production');
  store.updateAgentStatus('wb-1', 'online');
});

// ─── Group E: Callback ────────────────────────────────────

console.log('\n--- E: Callback ---');

test('E1: callback update workbuddy job', function() {
  var cr = store.createAgentJob({ agent_type: 'workbuddy', action: 'test.run', status: 'dispatched' });
  var r = bus.processCallback(cr.job.job_id, { status: 'completed', result: { tests: 'passed' } });
  assert(r.success, 'callback should succeed');
  assert(r.job.status === 'completed', 'should be completed');
});

test('E2: callback update codex job', function() {
  var cr = store.createAgentJob({ agent_type: 'codex', action: 'code.patch', status: 'dispatched' });
  assert(bus.processCallback(cr.job.job_id, { status: 'completed' }).success, 'codex callback');
});

test('E3: callback nonexistent job fails', function() {
  assert(!bus.processCallback('nonexistent', {}).success, 'should fail');
});

// ─── Group F: Callback Formatting ─────────────────────────

console.log('\n--- F: Callback Formatting ---');

test('F1: format workbuddy result', function() {
  var r = cb.formatAgentResult({ agent_type: 'workbuddy', job_id: 'wb_x', action: 'test.run', status: 'completed', result: { tests: 'passed' } });
  assertContains(r, 'workbuddy', 'should contain agent type');
});

test('F2: format codex result', function() {
  var r = cb.formatAgentResult({ agent_type: 'codex', job_id: 'cx_1', action: 'code.patch', status: 'completed', result: { pr: 96 } });
  assertContains(r, 'codex', 'should contain codex');
});

test('F3: format agent list', function() {
  var agents = [{ agent_id: 'a1', agent_type: 'workbuddy', status: 'online' }, { agent_id: 'a2', agent_type: 'codex', status: 'online' }];
  var r = cb.formatAgentList(agents);
  assertContains(r, 'Agent Bus Registry', 'should contain title');
});

test('F4: sanitize', function() {
  assert(cb.sanitize('test ](evil)').indexOf('](') === -1, 'should sanitize');
});

// ─── Group G: Bus Stats ───────────────────────────────────

console.log('\n--- G: Bus Stats ---');

test('G1: get bus stats', function() {
  var s = store.getBusStats();
  assert(s.agents > 0, 'should have agents');
  assert(s.jobs > 0, 'should have jobs');
});

// ─── Run ──────────────────────────────────────────────────

run();
