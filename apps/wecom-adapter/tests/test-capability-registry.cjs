'use strict';

/**
 * test-capability-registry.cjs - P10.4 Agent Capability Registry 测试
 *
 * 运行方式:
 *   NODE_OPTIONS="" node tests/test-capability-registry.cjs
 */

// ─── Test Framework ───────────────────────────────────────

var PASS = 0;
var FAIL = 0;
var tests = [];

function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

function assert(condition, msg) {
  if (!condition) throw new Error('ASSERT FAIL: ' + (msg || 'expected truthy'));
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error('ASSERT FAIL: ' + (msg || '') + '\n  expected: ' + JSON.stringify(expected) + '\n  actual:   ' + JSON.stringify(actual));
  }
}

function run() {
  console.log('=== P10.4 Agent Capability Registry Tests ===\n');

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

// ─── Module Import ─────────────────────────────────────────

var registry = require('../src/agent-governance/capability-registry');
var policy = require('../src/agent-governance/capability-policy');

// ─── Setup ─────────────────────────────────────────────────

registry.resetRegistry();

// ─── Test: Default Agents ──────────────────────────────────

test('Default agents: 4 agents registered', function() {
  var agents = registry.listAllAgents();
  assertEqual(agents.length, 4, 'should have 4 default agents');

  var names = agents.map(function(a) { return a.agent; });
  assert(names.indexOf('codex') !== -1, 'should have codex');
  assert(names.indexOf('workbuddy') !== -1, 'should have workbuddy');
  assert(names.indexOf('deepseek') !== -1, 'should have deepseek');
  assert(names.indexOf('doubao') !== -1, 'should have doubao');
});

test('Default agents: codex capabilities', function() {
  var result = registry.getAgentCapabilities('codex');
  assert(result.success, 'codex should exist');
  assert(result.agent.capabilities.indexOf('code.patch') !== -1, 'codex should have code.patch');
  assert(result.agent.capabilities.indexOf('test.run') !== -1, 'codex should have test.run');
  assert(result.agent.forbidden.indexOf('deploy.production') !== -1, 'codex should forbid deploy.production');
  assert(result.agent.requiresApproval.indexOf('git.merge') !== -1, 'codex should require approval for git.merge');
});

test('Default agents: workbuddy capabilities', function() {
  var result = registry.getAgentCapabilities('workbuddy');
  assert(result.success, 'workbuddy should exist');
  assert(result.agent.capabilities.indexOf('pm2.restart') !== -1, 'workbuddy should have pm2.restart');
  assert(result.agent.forbidden.indexOf('secrets.write') !== -1, 'workbuddy should forbid secrets.write');
  assert(result.agent.requiresApproval.indexOf('deploy.production') !== -1, 'workbuddy should require approval for deploy.production');
  assert(result.agent.requiresApproval.indexOf('pm2.restart') !== -1, 'workbuddy should require approval for pm2.restart');
});

test('Default agents: deepseek read-only', function() {
  var result = registry.getAgentCapabilities('deepseek');
  assert(result.success, 'deepseek should exist');
  assert(result.agent.capabilities.indexOf('reasoning.review') !== -1, 'deepseek should have reasoning.review');
  assert(result.agent.forbidden.indexOf('server.write') !== -1, 'deepseek should forbid server.write');
  assert(result.agent.forbidden.indexOf('git.merge') !== -1, 'deepseek should forbid git.merge');
  assertEqual(result.agent.requiresApproval.length, 0, 'deepseek should have no approval requirements');
});

test('Default agents: doubao content-only', function() {
  var result = registry.getAgentCapabilities('doubao');
  assert(result.success, 'doubao should exist');
  assert(result.agent.capabilities.indexOf('copy.write') !== -1, 'doubao should have copy.write');
  assert(result.agent.capabilities.indexOf('customer.reply') !== -1, 'doubao should have customer.reply');
  assert(result.agent.forbidden.indexOf('deploy.production') !== -1, 'doubao should forbid deploy.production');
});

// ─── Test: canAgentPerform ─────────────────────────────────

test('canAgentPerform: allowed capability', function() {
  assert(registry.canAgentPerform('codex', 'test.run'), 'codex should be able to test.run');
  assert(registry.canAgentPerform('workbuddy', 'server.audit'), 'workbuddy should be able to server.audit');
});

test('canAgentPerform: forbidden capability returns false', function() {
  assert(!registry.canAgentPerform('codex', 'deploy.production'), 'codex should NOT be able to deploy.production');
  assert(!registry.canAgentPerform('workbuddy', 'secrets.write'), 'workbuddy should NOT be able to secrets.write');
  assert(!registry.canAgentPerform('deepseek', 'git.merge'), 'deepseek should NOT be able to git.merge');
});

test('canAgentPerform: missing capability returns false', function() {
  assert(!registry.canAgentPerform('codex', 'pm2.restart'), 'codex should NOT have pm2.restart');
  assert(!registry.canAgentPerform('doubao', 'test.run'), 'doubao should NOT have test.run');
});

test('canAgentPerform: unregistered agent returns false', function() {
  assert(!registry.canAgentPerform('unknown', 'test.run'), 'unknown agent should return false');
});

// ─── Test: requiresApproval ────────────────────────────────

test('requiresApproval: deploy.production needs approval', function() {
  assert(registry.requiresApproval('workbuddy', 'deploy.production'), 'deploy.production should require approval');
  assert(registry.requiresApproval('workbuddy', 'pm2.restart'), 'pm2.restart should require approval');
});

test('requiresApproval: codex git.merge needs approval', function() {
  assert(registry.requiresApproval('codex', 'git.merge'), 'git.merge should require approval for codex');
});

test('requiresApproval: normal ops don not need approval', function() {
  assert(!registry.requiresApproval('codex', 'test.run'), 'test.run should not require approval');
  assert(!registry.requiresApproval('deepseek', 'reasoning.review'), 'reasoning.review should not require approval');
});

// ─── Test: isForbidden ─────────────────────────────────────

test('isForbidden: core forbidden operations', function() {
  assert(registry.isForbidden('codex', 'deploy.production'), 'deploy.production should be forbidden for codex');
  assert(registry.isForbidden('workbuddy', 'secrets.write'), 'secrets.write should be forbidden for workbuddy');
  assert(registry.isForbidden('deepseek', 'env.write'), 'env.write should be forbidden for deepseek');
  assert(registry.isForbidden('doubao', 'git.merge'), 'git.merge should be forbidden for doubao');
});

test('isForbidden: allowed operations are not forbidden', function() {
  assert(!registry.isForbidden('codex', 'test.run'), 'test.run should not be forbidden');
  assert(!registry.isForbidden('workbuddy', 'server.audit'), 'server.audit should not be forbidden');
});

test('isForbidden: unregistered agent returns true', function() {
  assert(registry.isForbidden('unknown', 'any.capability'), 'unregistered agent should be forbidden');
});

// ─── Test: selectAgentsForCapability ───────────────────────

test('selectAgentsForCapability: test.run', function() {
  var agents = registry.selectAgentsForCapability('test.run');
  assert(agents.indexOf('codex') !== -1, 'codex should be selected for test.run');
  assert(agents.indexOf('workbuddy') !== -1, 'workbuddy should be selected for test.run');
  assertEqual(agents.length, 2, '2 agents should have test.run');
});

test('selectAgentsForCapability: docs.write', function() {
  var agents = registry.selectAgentsForCapability('docs.write');
  assert(agents.indexOf('codex') !== -1, 'codex should have docs.write');
  assert(agents.indexOf('deepseek') !== -1, 'deepseek should have docs.write');
  assertEqual(agents.length, 2);
});

test('selectAgentsForCapability: deploy.production (none)', function() {
  var agents = registry.selectAgentsForCapability('deploy.production');
  assertEqual(agents.length, 0, 'no agent should be selectable for deploy.production (all forbidden)');
});

test('selectAgentsForCapability: nonexistent capability', function() {
  var agents = registry.selectAgentsForCapability('nonexistent.capability');
  assertEqual(agents.length, 0, 'should return empty');
});

// ─── Test: validateDispatch ────────────────────────────────

test('validateDispatch: allowed operation', function() {
  var result = registry.validateDispatch('codex', 'test.run');
  assert(result.allowed, 'test.run should be allowed for codex');
  assert(!result.requiresApproval, 'test.run should not require approval');
  assert(result.reason.indexOf('具备能力') !== -1, 'reason should mention capability');
  assert(result.checked_at, 'should have checked_at timestamp');
});

test('validateDispatch: forbidden operation', function() {
  var result = registry.validateDispatch('codex', 'deploy.production');
  assert(!result.allowed, 'deploy.production should be denied');
  assert(result.reason.indexOf('禁止') !== -1 || result.reason.indexOf('forbidden') !== -1,
    'reason should mention forbidden');
});

test('validateDispatch: requires approval', function() {
  var result = registry.validateDispatch('workbuddy', 'deploy.production');
  assert(!result.allowed, 'deploy.production should be denied for workbuddy (forbidden has priority)');
});

test('validateDispatch: pm2.restart requires approval', function() {
  var result = registry.validateDispatch('workbuddy', 'pm2.restart');
  assert(result.allowed, 'pm2.restart should be allowed');
  assert(result.requiresApproval, 'pm2.restart should require approval');
});

test('validateDispatch: missing capability', function() {
  var result = registry.validateDispatch('codex', 'pm2.restart');
  assert(!result.allowed, 'pm2.restart should not be allowed for codex');
  assert(result.reason.indexOf('不具备能力') !== -1, 'reason should mention missing capability');
});

test('validateDispatch: unregistered agent', function() {
  var result = registry.validateDispatch('unknown_bot', 'test.run');
  assert(!result.allowed, 'unregistered agent should be denied');
});

test('validateDispatch: forbidden priority > capabilities', function() {
  // deepseek has 'git.merge' in forbidden - even if we added it to capabilities
  var result = registry.validateDispatch('deepseek', 'git.merge');
  assert(!result.allowed, 'forbidden must override capabilities');
  assert(result.reason.indexOf('禁止') !== -1 || result.reason.indexOf('forbidden') !== -1,
    'reason should indicate forbidden');
});

// ─── Test: Policy Module ───────────────────────────────────

test('Policy: evaluatePolicy - normal allow', function() {
  var def = registry.DEFAULT_AGENTS.codex;
  var result = policy.evaluatePolicy('codex', 'test.run', def);
  assertEqual(result.action, 'allow', 'test.run should be allowed');
});

test('Policy: evaluatePolicy - agent forbidden', function() {
  var def = registry.DEFAULT_AGENTS.codex;
  var result = policy.evaluatePolicy('codex', 'deploy.production', def);
  assertEqual(result.action, 'deny', 'deploy.production should be denied');
  assertEqual(result.priority, 'agent_forbidden', 'priority should be agent_forbidden');
});

test('Policy: evaluatePolicy - no capability', function() {
  var def = registry.DEFAULT_AGENTS.doubao;
  var result = policy.evaluatePolicy('doubao', 'test.run', def);
  assertEqual(result.action, 'deny', 'missing capability should be denied');
});

test('Policy: evaluatePolicy - require approval', function() {
  var def = registry.DEFAULT_AGENTS.workbuddy;
  var result = policy.evaluatePolicy('workbuddy', 'pm2.restart', def);
  assertEqual(result.action, 'require_approval', 'pm2.restart should require approval');
});

test('Policy: global forbidden', function() {
  assert(policy.isGloballyForbidden('root.access'), 'root.access should be globally forbidden');
  assert(policy.isGloballyForbidden('system.destroy'), 'system.destroy should be globally forbidden');
  assert(!policy.isGloballyForbidden('test.run'), 'test.run should not be globally forbidden');
});

test('Policy: always require approval', function() {
  assert(policy.isAlwaysRequireApproval('deploy.production'), 'deploy.production should always require approval');
  assert(policy.isAlwaysRequireApproval('pm2.restart'), 'pm2.restart should always require approval');
  assert(policy.isAlwaysRequireApproval('nginx.modify'), 'nginx.modify should always require approval');
  assert(policy.isAlwaysRequireApproval('secrets.write'), 'secrets.write should always require approval');
});

test('Policy: capability intersection', function() {
  var a = ['test.run', 'code.patch', 'docs.write'];
  var b = ['test.run', 'pm2.restart', 'docs.write'];
  var intersection = policy.intersectCapabilities(a, b);
  assertEqual(intersection.length, 2);
  assert(intersection.indexOf('test.run') !== -1);
  assert(intersection.indexOf('docs.write') !== -1);
});

test('Policy: capability subtraction', function() {
  var a = ['test.run', 'code.patch', 'docs.write', 'pm2.restart'];
  var b = ['pm2.restart', 'deploy.production'];
  var diff = policy.subtractCapabilities(a, b);
  assertEqual(diff.length, 3);
  assert(diff.indexOf('pm2.restart') === -1);
  assert(diff.indexOf('deploy.production') === -1);
});

// ─── Test: Agent Registration ──────────────────────────────

test('registerAgent: dynamic registration', function() {
  var result = registry.registerAgent('testbot', {
    capabilities: ['test.run', 'docs.write'],
    forbidden: ['deploy.production'],
    requiresApproval: ['git.merge']
  });
  assert(result.success, 'register should succeed');

  var agent = registry.getAgentCapabilities('testbot');
  assert(agent.success, 'should be able to get testbot');
  assertEqual(agent.agent.capabilities.length, 2);
  assert(agent.agent.forbidden.indexOf('deploy.production') !== -1);

  // Cleanup
  registry.unregisterAgent('testbot');
});

test('registerAgent: case insensitive', function() {
  registry.registerAgent('CaseBot', {
    capabilities: ['test.run'],
    forbidden: [],
    requiresApproval: []
  });

  var lower = registry.getAgentCapabilities('casebot');
  assert(lower.success, 'should find by lowercase');
  assert(lower.agent.capabilities.indexOf('test.run') !== -1);

  registry.unregisterAgent('casebot');
});

// ─── Run ───────────────────────────────────────────────────

run();
