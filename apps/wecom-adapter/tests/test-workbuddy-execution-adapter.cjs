'use strict';

/**
 * test-workbuddy-execution-adapter.cjs - P11.2 WorkBuddy Execution Adapter 测试
 *
 * 运行方式:
 *   NODE_OPTIONS="" node tests/test-workbuddy-execution-adapter.cjs
 */

// ─── Test Framework ───────────────────────────────────────

var PASS = 0;
var FAIL = 0;
var tests = [];

function test(name, fn) { tests.push({ name: name, fn: fn }); }

function assert(condition, msg) {
  if (!condition) throw new Error('ASSERT FAIL: ' + (msg || 'expected truthy'));
}

function assertContains(text, substr, msg) {
  if (text.indexOf(substr) === -1) {
    throw new Error('ASSERT FAIL: ' + (msg || 'expected to contain: ' + substr));
  }
}

function assertNotContains(text, substr, msg) {
  if (text.indexOf(substr) !== -1) {
    throw new Error('ASSERT FAIL: ' + (msg || 'expected NOT to contain: ' + substr));
  }
}

function run() {
  console.log('=== P11.2 WorkBuddy Execution Adapter Tests ===\n');
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    try {
      t.fn();
      PASS++;
      console.log('  PASS: ' + t.name);
    } catch (e) {
      FAIL++;
      console.log('  FAIL: ' + t.name);
      console.log('        ' + e.message.replace(/\n/g, '\n        '));
    }
  }
  console.log('\n=== Results: ' + PASS + '/' + (PASS + FAIL) + ' passed ===');
  if (FAIL > 0) process.exit(1);
}

// ─── Module Imports ───────────────────────────────────────

var path = require('path');
var fs = require('fs');
var jobStore = require('../src/execution/workbuddy-job-store');
var policy = require('../src/execution/workbuddy-policy');
var callback = require('../src/execution/workbuddy-callback');

// ─── Group A: Job Store CRUD ──────────────────────────────

console.log('\n--- Group A: Job Store CRUD ---');

test('A1: create job with valid params', function() {
  var result = jobStore.createWorkBuddyJob({
    mission_id: 'test_mission_01',
    action: 'test.run'
  });
  assert(result.success, 'job should be created');
  assert(result.job.job_id, 'job_id should exist');
  assertContains(result.job.job_id, 'wb_', 'job_id should start with wb_');
  assert(result.job.status === 'created', 'initial status should be created');
  assert(result.job.mission_id === 'test_mission_01', 'mission_id should match');
});

test('A2: get job by id', function() {
  var created = jobStore.createWorkBuddyJob({
    mission_id: 'test_mission_02',
    action: 'git.branch.create'
  });
  var result = jobStore.getWorkBuddyJob(created.job.job_id);
  assert(result.success, 'job should be found');
  assert(result.job.action === 'git.branch.create', 'action should match');
});

test('A3: get nonexistent job returns error', function() {
  var result = jobStore.getWorkBuddyJob('wb_nonexistent');
  assert(!result.success, 'should not find nonexistent job');
});

test('A4: list jobs without filter', function() {
  var result = jobStore.listWorkBuddyJobs(null);
  assert(result.success, 'list should succeed');
  assert(result.total > 0, 'should have at least 1 job');
});

test('A5: list jobs with mission_id filter', function() {
  var result = jobStore.listWorkBuddyJobs({ mission_id: 'test_mission_01' });
  assert(result.success, 'filtered list should succeed');
  assert(result.jobs.length > 0, 'should find jobs for mission');
});

test('A6: list jobs with status filter', function() {
  var result = jobStore.listWorkBuddyJobs({ status: 'created' });
  assert(result.success, 'status filter should work');
});

test('A7: update job status (valid transition)', function() {
  var created = jobStore.createWorkBuddyJob({
    mission_id: 'test_mission_03',
    action: 'code.patch'
  });
  var result = jobStore.updateWorkBuddyJob(created.job.job_id, { status: 'queued' });
  assert(result.success, 'status update should succeed');
  assert(result.job.status === 'queued', 'status should be queued');
});

test('A8: update job status (invalid transition)', function() {
  var created = jobStore.createWorkBuddyJob({
    mission_id: 'test_mission_04',
    action: 'report.write'
  });
  var result = jobStore.updateWorkBuddyJob(created.job.job_id, { status: 'dispatched' });
  assert(!result.success, 'invalid transition should fail');
});

test('A9: append event', function() {
  var created = jobStore.createWorkBuddyJob({
    mission_id: 'test_mission_05',
    action: 'test.run'
  });
  var result = jobStore.appendWorkBuddyEvent(created.job.job_id, {
    type: 'test_event',
    data: 'test'
  });
  assert(result.success, 'event should be appended');
});

test('A10: get events', function() {
  var events = jobStore.getJobEvents('wb_nonexistent');
  assert(!events.success, 'nonexistent job events should fail');
});

// ─── Group B: Policy Engine ───────────────────────────────

console.log('\n--- Group B: Policy Engine ---');

test('B1: allowed action passes', function() {
  var result = policy.validateWorkBuddyAction('test.run');
  assert(result.valid, 'should be valid');
  assert(result.allowed, 'should be allowed');
  assert(!result.forbidden, 'should not be forbidden');
  assert(!result.requiresApproval, 'should not require approval');
});

test('B2: git.branch.create is allowed', function() {
  var result = policy.validateWorkBuddyAction('git.branch.create');
  assert(result.allowed, 'git.branch.create should be allowed');
});

test('B3: git.pr.create is allowed', function() {
  var result = policy.validateWorkBuddyAction('git.pr.create');
  assert(result.allowed, 'git.pr.create should be allowed');
});

test('B4: audit.run is allowed', function() {
  var result = policy.validateWorkBuddyAction('audit.run');
  assert(result.allowed, 'audit.run should be allowed');
});

test('B5: staging.shadow is allowed', function() {
  var result = policy.validateWorkBuddyAction('staging.shadow');
  assert(result.allowed, 'staging.shadow should be allowed');
});

test('B6: git.merge requires approval', function() {
  var result = policy.validateWorkBuddyAction('git.merge');
  assert(!result.allowed, 'git.merge should not be allowed');
  assert(result.requiresApproval, 'git.merge should require approval');
  assert(!result.forbidden, 'git.merge should not be forbidden');
});

test('B7: pm2.restart requires approval', function() {
  var result = policy.validateWorkBuddyAction('pm2.restart');
  assert(result.requiresApproval, 'pm2.restart should require approval');
});

test('B8: deploy.production requires approval', function() {
  var result = policy.validateWorkBuddyAction('deploy.production');
  assert(result.requiresApproval, 'deploy.production should require approval');
});

test('B9: server.write requires approval', function() {
  var result = policy.validateWorkBuddyAction('server.write');
  assert(result.requiresApproval, 'server.write should require approval');
});

test('B10: env.write is forbidden', function() {
  var result = policy.validateWorkBuddyAction('env.write');
  assert(result.forbidden, 'env.write should be forbidden');
  assert(!result.valid, 'env.write should be invalid');
});

test('B11: nginx.modify is forbidden', function() {
  var result = policy.validateWorkBuddyAction('nginx.modify');
  assert(result.forbidden, 'nginx.modify should be forbidden');
});

test('B12: secrets.write is forbidden', function() {
  var result = policy.validateWorkBuddyAction('secrets.write');
  assert(result.forbidden, 'secrets.write should be forbidden');
});

test('B13: vault.modify is forbidden', function() {
  var result = policy.validateWorkBuddyAction('vault.modify');
  assert(result.forbidden, 'vault.modify should be forbidden');
});

test('B14: rm.rf is forbidden', function() {
  var result = policy.validateWorkBuddyAction('rm.rf');
  assert(result.forbidden, 'rm.rf should be forbidden');
});

test('B15: shell.dangerous is forbidden', function() {
  var result = policy.validateWorkBuddyAction('shell.dangerous');
  assert(result.forbidden, 'shell.dangerous should be forbidden');
});

test('B16: docker.prune is forbidden', function() {
  var result = policy.validateWorkBuddyAction('docker.prune');
  assert(result.forbidden, 'docker.prune should be forbidden');
});

test('B17: forbidden has highest priority over requiresApproval', function() {
  // Even if action name has 'modify', env.write is explicitly forbidden
  var result = policy.validateWorkBuddyAction('env.write');
  assert(result.forbidden, 'forbidden should take priority');
  assert(!result.requiresApproval, 'should not require approval when forbidden');
});

test('B18: generate policy report', function() {
  var report = policy.generatePolicyReport('test.run', {});
  assert(report.action === 'test.run', 'report should include action');
  assert(report.policy_version === 'v0.1', 'report should include version');
  assert(!report.forbidden, 'report should reflect allowed');
});

test('B19: validate payload size (small OK)', function() {
  var result = policy.validatePayloadSize({ key: 'value' });
  assert(result.valid, 'small payload should be valid');
});

test('B20: isAllowed / isForbidden / requiresApproval helpers', function() {
  assert(policy.isAllowed('test.run'), 'test.run should be allowed');
  assert(policy.isForbidden('env.write'), 'env.write should be forbidden');
  assert(policy.requiresApproval('git.merge'), 'git.merge should require approval');
});

// ─── Group C: Job Lifecycle ───────────────────────────────

console.log('\n--- Group C: Job Lifecycle ---');

test('C1: created → queued transition', function() {
  var created = jobStore.createWorkBuddyJob({
    mission_id: 'test_c1',
    action: 'test.run'
  });
  var result = jobStore.updateWorkBuddyJob(created.job.job_id, { status: 'queued' });
  assert(result.success, 'transition should succeed');
});

test('C2: queued → dispatched transition', function() {
  var created = jobStore.createWorkBuddyJob({
    mission_id: 'test_c2',
    action: 'test.run',
    status: 'queued'
  });
  var result = jobStore.updateWorkBuddyJob(created.job.job_id, { status: 'dispatched' });
  assert(result.success, 'dispatched should succeed');
});

test('C3: dispatched → running transition', function() {
  var created = jobStore.createWorkBuddyJob({
    mission_id: 'test_c3',
    action: 'test.run',
    status: 'dispatched'
  });
  var result = jobStore.updateWorkBuddyJob(created.job.job_id, { status: 'running' });
  assert(result.success, 'running transition should succeed');
});

test('C4: running → completed transition', function() {
  var created = jobStore.createWorkBuddyJob({
    mission_id: 'test_c4',
    action: 'test.run',
    status: 'running'
  });
  var result = jobStore.updateWorkBuddyJob(created.job.job_id, { status: 'completed' });
  assert(result.success, 'completed transition should succeed');
});

test('C5: running → failed transition', function() {
  var created = jobStore.createWorkBuddyJob({
    mission_id: 'test_c5',
    action: 'test.run',
    status: 'running'
  });
  var result = jobStore.updateWorkBuddyJob(created.job.job_id, { status: 'failed' });
  assert(result.success, 'failed transition should succeed');
});

test('C6: requiresApproval → waiting_approval on create', function() {
  var created = jobStore.createWorkBuddyJob({
    mission_id: 'test_c6',
    action: 'git.merge',
    status: 'waiting_approval',
    requiresApproval: true
  });
  assert(created.job.requiresApproval, 'should be marked requiresApproval');
  assert(created.job.status === 'waiting_approval', 'should be waiting_approval');
});

test('C7: approve waiting_approval → queued', function() {
  var created = jobStore.createWorkBuddyJob({
    mission_id: 'test_c7',
    action: 'git.merge',
    status: 'waiting_approval',
    requiresApproval: true
  });
  var result = jobStore.approveJob(created.job.job_id, { operator: 'admin' });
  assert(result.success, 'approve should succeed');
  assert(result.job.status === 'queued', 'status should be queued after approve');
});

test('C8: reject waiting_approval → cancelled', function() {
  var created = jobStore.createWorkBuddyJob({
    mission_id: 'test_c8',
    action: 'pm2.restart',
    status: 'waiting_approval',
    requiresApproval: true
  });
  var result = jobStore.rejectJob(created.job.job_id, { operator: 'admin' });
  assert(result.success, 'reject should succeed');
  assert(result.job.status === 'cancelled', 'status should be cancelled after reject');
});

test('C9: approve non-waiting job fails', function() {
  var created = jobStore.createWorkBuddyJob({
    mission_id: 'test_c9',
    action: 'test.run'
  });
  var result = jobStore.approveJob(created.job.job_id, { operator: 'admin' });
  assert(!result.success, 'approving non-waiting job should fail');
});

test('C10: reject non-waiting job fails', function() {
  var created = jobStore.createWorkBuddyJob({
    mission_id: 'test_c10',
    action: 'test.run'
  });
  var result = jobStore.rejectJob(created.job.job_id, { operator: 'admin' });
  assert(!result.success, 'rejecting non-waiting job should fail');
});

// ─── Group D: Input Validation ────────────────────────────

console.log('\n--- Group D: Input Validation ---');

test('D1: invalid mission_id rejected', function() {
  var result = jobStore.createWorkBuddyJob({
    mission_id: '../escape',
    action: 'test.run'
  });
  assert(!result.success, 'should reject path traversal in mission_id');
});

test('D2: empty mission_id rejected', function() {
  var result = jobStore.createWorkBuddyJob({
    mission_id: '',
    action: 'test.run'
  });
  assert(!result.success, 'should reject empty mission_id');
});

test('D3: invalid action rejected', function() {
  var result = jobStore.createWorkBuddyJob({
    mission_id: 'test_d3',
    action: '../escape'
  });
  assert(!result.success, 'should reject invalid action');
});

test('D4: invalid job_id for get', function() {
  var result = jobStore.getWorkBuddyJob('');
  assert(!result.success, 'should reject empty job_id');
});

test('D5: valid job_id pattern accepted', function() {
  assert(jobStore.validateJobId('wb_abc123_xyz'), 'valid job_id should pass');
});

test('D6: invalid job_id pattern rejected', function() {
  assert(!jobStore.validateJobId('not-wb-prefix'), 'should reject non-wb prefix');
  assert(!jobStore.validateJobId('wb_@invalid'), 'should reject special chars');
  assert(!jobStore.validateJobId(''), 'should reject empty');
});

// ─── Group E: Callback Formatting ─────────────────────────

console.log('\n--- Group E: Callback Formatting ---');

test('E1: format completed result', function() {
  var job = {
    job_id: 'wb_test1',
    mission_id: 'cmd_test1',
    action: 'test.run',
    status: 'completed',
    result: { tests: 'passed', pr: 96, commit: 'abc123' }
  };
  var formatted = callback.formatWorkBuddyResult(job);
  assertContains(formatted, 'WorkBuddy Execution Result', 'should contain title');
  assertContains(formatted, 'wb_test1', 'should contain job_id');
  assertContains(formatted, 'PR', 'should contain PR info');
});

test('E2: format failed result', function() {
  var job = {
    job_id: 'wb_test2',
    mission_id: 'cmd_test2',
    action: 'test.run',
    status: 'failed',
    result: { message: 'Tests failed' }
  };
  var formatted = callback.formatWorkBuddyResult(job);
  assertContains(formatted, 'Tests failed', 'should contain error message');
});

test('E3: format dispatch notification', function() {
  var job = {
    job_id: 'wb_test3',
    mission_id: 'cmd_test3',
    action: 'git.branch.create',
    queue_path: '/tmp/queue/wb_test3.json'
  };
  var formatted = callback.formatDispatchNotification(job);
  assertContains(formatted, 'WorkBuddy Job Dispatched', 'should contain dispatch title');
  assertContains(formatted, 'Queue', 'should show queue path');
});

test('E4: format approval required', function() {
  var job = {
    job_id: 'wb_test4',
    mission_id: 'cmd_test4',
    action: 'git.merge'
  };
  var formatted = callback.formatApprovalRequired(job);
  assertContains(formatted, 'Requires Approval', 'should contain approval title');
  assertContains(formatted, '/审批', 'should show approval command');
});

test('E5: sanitize removes link injection', function() {
  var input = 'Check [this](http://evil.com)';
  var output = callback.sanitize(input);
  assertNotContains(output, '](' + 'http', 'should break markdown links');
});

test('E6: sanitize truncates long text', function() {
  var long = 'x'.repeat(2500);
  var output = callback.sanitize(long);
  assert(output.length <= 2003, 'should be truncated to ~2000 + ...');
});

// ─── Group F: Job Store Stats ─────────────────────────────

console.log('\n--- Group F: Job Store Stats ---');

test('F1: get stats', function() {
  var stats = jobStore.getJobStoreStats();
  assert(stats.total > 0, 'should have jobs');
  assert(stats.by_status, 'should have by_status');
});

// ─── Group G: Queue File Dispatch ─────────────────────────

console.log('\n--- Group G: Queue File Dispatch ---');

test('G1: getQueueDir respects ARTIFACT_WORKSPACE_ROOT', function() {
  var adapter = require('../src/execution/workbuddy-adapter');
  var dir = adapter.getQueueDir();
  assert(dir.indexOf('workbuddy') !== -1 || dir.indexOf('WorkBuddy') !== -1, 'queue dir should reference workbuddy');
  assert(dir.indexOf('queue') !== -1, 'queue dir should contain queue subdir');
});

// ─── Run ──────────────────────────────────────────────────

run();
