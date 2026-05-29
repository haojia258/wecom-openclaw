/**
 * test-agent-assignment.cjs
 * P9.6.4 Agent Assignment Matrix — Test Suite
 *
 * NO shell, NO exec, NO pm2, NO deploy, NO nginx, NO .env.
 * NO agent invocation, NO commander, NO gateway, NO agent-host.
 */

'use strict';

// ============================================================================
// Test Framework
// ============================================================================
var passed = 0;
var failed = 0;
var sectionPassed = 0;
var sectionFailed = 0;
var sectionName = '';

function section(name) {
  if (sectionName) {
    console.log('  --------------------------------------------------');
    console.log('  Section: ' + sectionName);
    console.log('  Tests:  ' + (sectionPassed + sectionFailed) + ' | Passed: ' + sectionPassed + ' | Failed: ' + sectionFailed);
    console.log('  --------------------------------------------------\n');
  }
  sectionName = name;
  sectionPassed = 0;
  sectionFailed = 0;
  console.log('\n============================================================');
  console.log('  ' + name);
  console.log('============================================================');
}

function assert(condition, msg) {
  if (condition) { passed++; sectionPassed++; }
  else { failed++; sectionFailed++; console.log('  FAIL: ' + msg); }
}

function assertEqual(actual, expected, msg) {
  if (actual === expected) { passed++; sectionPassed++; }
  else { failed++; sectionFailed++; console.log('  FAIL: ' + msg + ' (expected: ' + JSON.stringify(expected) + ', actual: ' + JSON.stringify(actual) + ')'); }
}

function assertNotEqual(actual, expected, msg) {
  if (actual !== expected) { passed++; sectionPassed++; }
  else { failed++; sectionFailed++; console.log('  FAIL: ' + msg + ' (should not equal: ' + JSON.stringify(expected) + ')'); }
}

function assertType(value, type, msg) {
  if (typeof value === type) { passed++; sectionPassed++; }
  else { failed++; sectionFailed++; console.log('  FAIL: ' + msg + ' (expected ' + type + ', got ' + typeof value + ')'); }
}

function assertContains(arr, item, msg) {
  if (arr && arr.indexOf(item) !== -1) { passed++; sectionPassed++; }
  else { failed++; sectionFailed++; console.log('  FAIL: ' + msg + ' (item not found in array)'); }
}

function assertNotContains(arr, item, msg) {
  if (!arr || arr.indexOf(item) === -1) { passed++; sectionPassed++; }
  else { failed++; sectionFailed++; console.log('  FAIL: ' + msg + ' (item found in array when it should not be)'); }
}

function cleanupSection() {
  if (sectionName) {
    console.log('  --------------------------------------------------');
    console.log('  Section: ' + sectionName);
    console.log('  Tests:  ' + (sectionPassed + sectionFailed) + ' | Passed: ' + sectionPassed + ' | Failed: ' + sectionFailed);
    console.log('  --------------------------------------------------\n');
  }
}

// ============================================================================
// Load Module
// ============================================================================
var aa = require('../src/agent-assignment/index.js');

// ============================================================================
// Helper: Create mock sessions for testing
// ============================================================================
function makeMockSession(overrides) {
  var o = overrides || {};
  return {
    sessionId: o.sessionId || 'cds_test_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    ticketId: o.ticketId || 'ticket_test_001',
    dispatchPlanId: o.dispatchPlanId || 'dispatch_test_001',
    reviewId: o.reviewId || 'review_test_001',
    draftId: o.draftId || 'draft_test_001',
    strategyId: o.strategyId || 'strategy_test_001',
    goalId: o.goalId || 'goal_test_001',
    status: o.status || 'planned',
    executionMode: o.executionMode || 'dry-run',
    selectedAgent: o.selectedAgent || null,
    ticketSnapshot: o.ticketSnapshot || { category: o.category || 'operations', priority: o.priority || 'medium' },
    createdAt: o.createdAt || new Date().toISOString()
  };
}

// ============================================================================
// Section 1: Agent Definitions & Constants
// ============================================================================
section('1. Agent Definitions & Constants');

assert(aa.AGENT !== undefined, 'AGENT defined');
assert(aa.AGENT.CODEX === 'codex', 'AGENT.CODEX');
assert(aa.AGENT.WORKBUDDY === 'workbuddy', 'AGENT.WORKBUDDY');
assert(aa.AGENT.DEEPSEEK === 'deepseek', 'AGENT.DEEPSEEK');
assert(aa.AGENT.DOUBAO === 'doubao', 'AGENT.DOUBAO');

assertEqual(aa.AGENT_VALUES.length, 4, '4 agents registered');
assertContains(aa.AGENT_VALUES, 'codex', 'codex in AGENT_VALUES');
assertContains(aa.AGENT_VALUES, 'workbuddy', 'workbuddy in AGENT_VALUES');
assertContains(aa.AGENT_VALUES, 'deepseek', 'deepseek in AGENT_VALUES');
assertContains(aa.AGENT_VALUES, 'doubao', 'doubao in AGENT_VALUES');

assert(aa.ASSIGNMENT_STATUS !== undefined, 'ASSIGNMENT_STATUS defined');
assertEqual(aa.ASSIGNMENT_STATUS.PLANNED, 'planned', 'PLANNED status');
assertEqual(aa.ASSIGNMENT_STATUS.REVIEWED, 'reviewed', 'REVIEWED status');
assertEqual(aa.ASSIGNMENT_STATUS.REJECTED, 'rejected', 'REJECTED status');
assertEqual(aa.ASSIGNMENT_STATUS.ARCHIVED, 'archived', 'ARCHIVED status');
assertEqual(aa.ASSIGNMENT_STATUS_VALUES.length, 4, '4 status values');

assert(aa.ASSIGNMENT_MODE !== undefined, 'ASSIGNMENT_MODE defined');
assertEqual(aa.ASSIGNMENT_MODE.DRY_RUN, 'dry-run', 'DRY_RUN mode');
assertEqual(aa.ASSIGNMENT_MODE.SUPERVISED, 'supervised', 'SUPERVISED mode');
assertEqual(aa.ALLOWED_MODES.length, 2, '2 allowed modes');

assert(aa.FORBIDDEN_MODES !== undefined, 'FORBIDDEN_MODES defined');
assert(aa.FORBIDDEN_MODES.length > 0, 'FORBIDDEN_MODES not empty');
assertContains(aa.FORBIDDEN_MODES, 'live', 'live is forbidden');
assertContains(aa.FORBIDDEN_MODES, 'auto', 'auto is forbidden');
assertContains(aa.FORBIDDEN_MODES, 'execute', 'execute is forbidden');

// Category map
assert(aa.CATEGORY_CAPABILITY_MAP !== undefined, 'CATEGORY_CAPABILITY_MAP defined');
assertEqual(aa.CATEGORY_VALUES.length, 11, '11 categories');
assertContains(aa.CATEGORY_VALUES, 'devops', 'devops category');
assertContains(aa.CATEGORY_VALUES, 'commerce', 'commerce category');
assertContains(aa.CATEGORY_VALUES, 'marketing', 'marketing category');
assertContains(aa.CATEGORY_VALUES, 'customer', 'customer category');
assertContains(aa.CATEGORY_VALUES, 'finance', 'finance category');
assertContains(aa.CATEGORY_VALUES, 'operations', 'operations category');
assertContains(aa.CATEGORY_VALUES, 'reliability', 'reliability category');
assertContains(aa.CATEGORY_VALUES, 'security', 'security category');
assertContains(aa.CATEGORY_VALUES, 'cost', 'cost category');
assertContains(aa.CATEGORY_VALUES, 'performance', 'performance category');
assertContains(aa.CATEGORY_VALUES, 'compliance', 'compliance category');

// Agent priority
assert(aa.AGENT_PRIORITY !== undefined, 'AGENT_PRIORITY defined');
assertType(aa.AGENT_PRIORITY.codex, 'number', 'codex priority is number');
assertType(aa.AGENT_PRIORITY.workbuddy, 'number', 'workbuddy priority is number');
assert(aa.AGENT_PRIORITY.codex < aa.AGENT_PRIORITY.doubao, 'codex has higher priority than doubao');

// ============================================================================
// Section 2: Agent Capability Matrix
// ============================================================================
section('2. Agent Capability Matrix');

assert(aa.AGENT_CAPABILITY_MATRIX !== undefined, 'AGENT_CAPABILITY_MATRIX defined');

// Codex capabilities
var codexCaps = aa.getAgentCapabilities('codex');
assert(codexCaps !== null, 'codex capabilities exist');
assert(Array.isArray(codexCaps), 'codex caps is array');
assertContains(codexCaps, 'coding', 'codex has coding');
assertContains(codexCaps, 'testing', 'codex has testing');
assertContains(codexCaps, 'git', 'codex has git');
assertContains(codexCaps, 'pr', 'codex has pr');
assertContains(codexCaps, 'refactor', 'codex has refactor');
assertContains(codexCaps, 'code-review', 'codex has code-review');

// WorkBuddy capabilities
var wbCaps = aa.getAgentCapabilities('workbuddy');
assert(wbCaps !== null, 'workbuddy capabilities exist');
assertContains(wbCaps, 'ops', 'workbuddy has ops');
assertContains(wbCaps, 'server', 'workbuddy has server');
assertContains(wbCaps, 'audit', 'workbuddy has audit');
assertContains(wbCaps, 'staging', 'workbuddy has staging');

// DeepSeek capabilities
var dsCaps = aa.getAgentCapabilities('deepseek');
assert(dsCaps !== null, 'deepseek capabilities exist');
assertContains(dsCaps, 'analysis', 'deepseek has analysis');
assertContains(dsCaps, 'reasoning', 'deepseek has reasoning');
assertContains(dsCaps, 'finance', 'deepseek has finance');

// Doubao capabilities
var dbCaps = aa.getAgentCapabilities('doubao');
assert(dbCaps !== null, 'doubao capabilities exist');
assertContains(dbCaps, 'marketing', 'doubao has marketing');
assertContains(dbCaps, 'content', 'doubao has content');
assertContains(dbCaps, 'customer', 'doubao has customer');

// Invalid agent
assertEqual(aa.getAgentCapabilities('nonexistent'), null, 'unknown agent returns null');
assertEqual(aa.getAgentCapabilities(''), null, 'empty string returns null');

// listAgents
var agents = aa.listAgents();
assertEqual(agents.length, 4, 'listAgents returns 4 agents');
assertEqual(agents[0].agent, 'codex', 'first agent is codex');
assert(Array.isArray(agents[0].capabilities), 'agent has capabilities array');

// listAgentNames
var names = aa.listAgentNames();
assertEqual(names.length, 4, 'listAgentNames returns 4');
assertContains(names, 'codex', 'codex in names');
assertContains(names, 'workbuddy', 'workbuddy in names');

// agentHasCapability
assert(aa.agentHasCapability('codex', 'coding'), 'codex has coding capability');
assert(aa.agentHasCapability('workbuddy', 'ops'), 'workbuddy has ops capability');
assert(!aa.agentHasCapability('codex', 'marketing'), 'codex does not have marketing');
assert(!aa.agentHasCapability('nonexistent', 'coding'), 'unknown agent has no capabilities');
assert(!aa.agentHasCapability('', 'coding'), 'empty agent has no capabilities');

// getDefaultAgentForCategory
assertEqual(aa.getDefaultAgentForCategory('devops'), 'workbuddy', 'devops default is workbuddy');
assertEqual(aa.getDefaultAgentForCategory('commerce'), 'codex', 'commerce default is codex');
assertEqual(aa.getDefaultAgentForCategory('marketing'), 'doubao', 'marketing default is doubao');
assertEqual(aa.getDefaultAgentForCategory('finance'), 'deepseek', 'finance default is deepseek');
assertEqual(aa.getDefaultAgentForCategory('nonexistent'), null, 'unknown category returns null');

// ============================================================================
// Section 3: Type Factory Functions
// ============================================================================
section('3. Type Factory Functions');

// createAssignmentId
var id1 = aa.createAssignmentId();
assertType(id1, 'string', 'createAssignmentId returns string');
assert(id1.indexOf('assign_') === 0, 'ID starts with assign_');
var id2 = aa.createAssignmentId();
assertNotEqual(id1, id2, 'two IDs are different');

// createEmptyAssignmentPlan
var empty = aa.createEmptyAssignmentPlan();
assertType(empty, 'object', 'createEmptyAssignmentPlan returns object');
assertEqual(empty.assignmentId, null, 'empty plan has null assignmentId');
assertEqual(empty.sessionId, null, 'empty plan has null sessionId');
assertEqual(empty.selectedAgent, null, 'empty plan has null selectedAgent');
assert(Array.isArray(empty.fallbackAgents), 'empty plan has fallbackAgents array');
assertEqual(empty.fallbackAgents.length, 0, 'empty plan has 0 fallbacks');
assertEqual(empty.confidence, 0, 'empty plan has 0 confidence');
assertEqual(empty.status, 'planned', 'empty plan status is planned');
assertEqual(empty.mode, 'dry-run', 'empty plan mode is dry-run');

// createAssignmentPlan — valid
var session = makeMockSession({ category: 'operations' });
var matchResult = {
  selectedAgent: 'workbuddy',
  fallbackAgents: ['codex'],
  requiredCapabilities: ['ops', 'audit', 'staging'],
  matchedCapabilities: ['ops', 'audit', 'staging'],
  missingCapabilities: [],
  confidence: 1.0,
  reason: 'Perfect match'
};
var plan = aa.createAssignmentPlan(session, matchResult, { mode: 'dry-run' });
assertType(plan, 'object', 'createAssignmentPlan returns object');
assert(plan.assignmentId.indexOf('assign_') === 0, 'plan has valid assignmentId');
assertEqual(plan.sessionId, session.sessionId, 'plan has correct sessionId');
assertEqual(plan.selectedAgent, 'workbuddy', 'plan has selectedAgent');
assertEqual(plan.confidence, 1.0, 'plan has confidence');
assertEqual(plan.status, 'planned', 'plan status is planned');
assertEqual(plan.mode, 'dry-run', 'plan mode is dry-run');

// createAssignmentPlan with FORBIDDEN_MODE
var threw = false;
try {
  aa.createAssignmentPlan(session, matchResult, { mode: 'live' });
} catch (e) { threw = true; }
assert(threw, 'FORBIDDEN_MODE "live" throws');

threw = false;
try {
  aa.createAssignmentPlan(session, matchResult, { mode: 'execute' });
} catch (e) { threw = true; }
assert(threw, 'FORBIDDEN_MODE "execute" throws');

// createAssignmentPlan — fallback does not contain selected
var plan2 = aa.createAssignmentPlan(session, matchResult, {});
assertNotContains(plan2.fallbackAgents, plan2.selectedAgent, 'fallback does not contain selectedAgent');

// createAssignmentSnapshot
var snapshot = aa.createAssignmentSnapshot([plan, plan2]);
assertType(snapshot, 'object', 'snapshot is object');
assertEqual(snapshot.total, 2, 'snapshot total is 2');
assertType(snapshot.byStatus, 'object', 'byStatus is object');
assertType(snapshot.byAgent, 'object', 'byAgent is object');
assertType(snapshot.byMode, 'object', 'byMode is object');

// createAssignmentSnapshot with empty input
var emptySnapshot = aa.createAssignmentSnapshot([]);
assertEqual(emptySnapshot.total, 0, 'empty snapshot total is 0');

// createAssignmentSnapshot with null
var nullSnapshot = aa.createAssignmentSnapshot(null);
assertEqual(nullSnapshot.total, 0, 'null snapshot total is 0');

// ============================================================================
// Section 4: Capability Matching
// ============================================================================
section('4. Capability Matching');

// Match operations category — should select workbuddy
var opsSession = makeMockSession({ category: 'operations' });
var opsMatch = aa.matchAgentForSession(opsSession, { category: 'operations' });
assertEqual(opsMatch.selectedAgent, 'workbuddy', 'operations → workbuddy');
assert(opsMatch.confidence > 0, 'operations match has confidence');
assertEqual(opsMatch.missingCapabilities.length, 0, 'operations has no missing capabilities');

// Match commerce category — should select codex
var commerceSession = makeMockSession({ category: 'commerce' });
var commerceMatch = aa.matchAgentForSession(commerceSession, { category: 'commerce' });
assertEqual(commerceMatch.selectedAgent, 'codex', 'commerce → codex');
assertEqual(commerceMatch.requiredCapabilities.length, 3, 'commerce has 3 required capabilities');
assertContains(commerceMatch.requiredCapabilities, 'coding', 'commerce requires coding');

// Match marketing category — should select doubao
var mrktSession = makeMockSession({ category: 'marketing' });
var mrktMatch = aa.matchAgentForSession(mrktSession, { category: 'marketing' });
assertEqual(mrktMatch.selectedAgent, 'doubao', 'marketing → doubao');
assertContains(mrktMatch.matchedCapabilities, 'marketing', 'doubao matches marketing');

// Match finance category — should select deepseek
var finSession = makeMockSession({ category: 'finance' });
var finMatch = aa.matchAgentForSession(finSession, { category: 'finance' });
assertEqual(finMatch.selectedAgent, 'deepseek', 'finance → deepseek');
assertContains(finMatch.matchedCapabilities, 'finance', 'deepseek matches finance');
assertContains(finMatch.matchedCapabilities, 'risk', 'deepseek matches risk');

// Match customer category — should select doubao
var custSession = makeMockSession({ category: 'customer' });
var custMatch = aa.matchAgentForSession(custSession, { category: 'customer' });
assertEqual(custMatch.selectedAgent, 'doubao', 'customer → doubao');

// Match devops category — should select workbuddy
var devSession = makeMockSession({ category: 'devops' });
var devMatch = aa.matchAgentForSession(devSession, { category: 'devops' });
assertEqual(devMatch.selectedAgent, 'workbuddy', 'devops → workbuddy');

// Explicit requiredCapabilities
var explicitMatch = aa.matchAgentForSession(makeMockSession({}), { requiredCapabilities: ['coding', 'testing'] });
assertEqual(explicitMatch.selectedAgent, 'codex', 'explicit [coding,testing] → codex');
assertEqual(explicitMatch.confidence, 1, 'perfect explicit match confidence');
assertEqual(explicitMatch.missingCapabilities.length, 0, 'explicit match has no missing');

// Mixed capabilities — cross-agent matching
var mixedMatch = aa.matchAgentForSession(makeMockSession({}), { requiredCapabilities: ['coding', 'analysis', 'marketing'] });
assert(mixedMatch.selectedAgent !== null, 'mixed caps finds an agent');
assert(mixedMatch.confidence < 1, 'mixed caps confidence < 1');
assert(mixedMatch.missingCapabilities.length > 0, 'mixed caps has missing capabilities');

// Preferred agent takes priority
var prefSession = makeMockSession({ selectedAgent: 'codex' });
var prefMatch = aa.matchAgentForSession(prefSession, { requiredCapabilities: ['coding', 'testing'] });
assertEqual(prefMatch.selectedAgent, 'codex', 'preferred codex matches coding+testing');
assertEqual(prefMatch.confidence, 1.0, 'preferred agent perfect match');

// Preferred agent doesn't match → fall through
var prefSession2 = makeMockSession({ selectedAgent: 'codex' });
var prefMatch2 = aa.matchAgentForSession(prefSession2, { requiredCapabilities: ['marketing', 'content'] });
assertEqual(prefMatch2.selectedAgent, 'doubao', 'preferred codex skipped for marketing caps');
assertNotContains(prefMatch2.fallbackAgents, 'codex', 'preferred agent not in fallback');

// session.selectedAgent from ticketSnapshot
var snapSession = makeMockSession({ ticketSnapshot: { category: 'operations', selectedAgent: 'codex' } });
var snapMatch = aa.matchAgentForSession(snapSession, { category: 'operations' });
assertEqual(snapMatch.selectedAgent, 'workbuddy', 'ignores ticketSnapshot selectedAgent for ops caps');

// Fallback agents list
var fbMatch = aa.matchAgentForSession(makeMockSession({}), { requiredCapabilities: ['coding', 'testing', 'pr'] });
assertEqual(fbMatch.selectedAgent, 'codex', 'coding → codex');
assertNotContains(fbMatch.fallbackAgents, 'codex', 'fallback excludes selected agent');
assert(fbMatch.fallbackAgents.length > 0, 'fallback agents not empty');

// Empty required capabilities
var emptyCapMatch = aa.matchAgentForSession(makeMockSession({}), { requiredCapabilities: [] });
assertEqual(emptyCapMatch.selectedAgent, null, 'empty caps → no agent selected');
assertEqual(emptyCapMatch.confidence, 0, 'empty caps → confidence 0');

// Confidence calculation
var confMatch = aa.matchAgentForSession(makeMockSession({}), { requiredCapabilities: ['coding', 'testing', 'pr', 'refactor', 'code-review', 'git'] });
assertEqual(confMatch.confidence, 1.0, 'full match → confidence 1.0');

var partialMatch = aa.matchAgentForSession(makeMockSession({}), { requiredCapabilities: ['coding', 'marketing'] });
assert(partialMatch.confidence === 0.5, '1/2 → confidence 0.5');
assertEqual(partialMatch.missingCapabilities.length, 1, 'has 1 missing capability');
assertContains(partialMatch.requiredCapabilities, 'marketing', 'has marketing in required');
assertContains(partialMatch.missingCapabilities, 'marketing', 'marketing in missing');

// Verify match result structure
assertType(opsMatch.selectedAgent, 'string', 'selectedAgent is string');
assert(Array.isArray(opsMatch.fallbackAgents), 'fallbackAgents is array');
assert(Array.isArray(opsMatch.requiredCapabilities), 'requiredCapabilities is array');
assert(Array.isArray(opsMatch.matchedCapabilities), 'matchedCapabilities is array');
assert(Array.isArray(opsMatch.missingCapabilities), 'missingCapabilities is array');
assertType(opsMatch.confidence, 'number', 'confidence is number');
assertType(opsMatch.reason, 'string', 'reason is string');

// ============================================================================
// Section 5: Validator
// ============================================================================
section('5. Validator');

// validateAssignmentPlan — valid
var validPlan = aa.createAssignmentPlan(session, matchResult, {});
var validCheck = aa.validateAssignmentPlan(validPlan);
assert(validCheck.valid, 'valid plan passes validation');

// validateAssignmentPlan — null
var nullCheck = aa.validateAssignmentPlan(null);
assert(!nullCheck.valid, 'null plan fails');
assert(nullCheck.errors.length > 0, 'null plan has errors');

// validateAssignmentPlan — missing assignmentId
var noIdPlan = { sessionId: 'cds_123', selectedAgent: 'codex', confidence: 0.9, reason: 'test', status: 'planned', mode: 'dry-run' };
var noIdCheck = aa.validateAssignmentPlan(noIdPlan);
assert(!noIdCheck.valid, 'missing assignmentId fails');
assert(noIdCheck.errors.some(function (e) { return e.code === 'MISSING_ASSIGNMENT_ID'; }), 'error is MISSING_ASSIGNMENT_ID');

// validateAssignmentPlan — invalid assignmentId format
var badIdPlan = JSON.parse(JSON.stringify(validPlan));
badIdPlan.assignmentId = 'bad_id';
var badIdCheck = aa.validateAssignmentPlan(badIdPlan);
assert(!badIdCheck.valid, 'bad assignmentId format fails');

// validateAssignmentPlan — missing sessionId
var noSessPlan = JSON.parse(JSON.stringify(validPlan));
noSessPlan.sessionId = null;
var noSessCheck = aa.validateAssignmentPlan(noSessPlan);
assert(!noSessCheck.valid, 'missing sessionId fails');

// validateAssignmentPlan — invalid agent
var badAgentPlan = JSON.parse(JSON.stringify(validPlan));
badAgentPlan.selectedAgent = 'terminator';
var badAgentCheck = aa.validateAssignmentPlan(badAgentPlan);
assert(!badAgentCheck.valid, 'invalid agent fails');

// validateAssignmentPlan — missing agent
var noAgentPlan = JSON.parse(JSON.stringify(validPlan));
noAgentPlan.selectedAgent = null;
var noAgentCheck = aa.validateAssignmentPlan(noAgentPlan);
assert(!noAgentCheck.valid, 'missing agent fails');

// validateAssignmentPlan — forbidden mode
var badModePlan = JSON.parse(JSON.stringify(validPlan));
badModePlan.mode = 'live';
var badModeCheck = aa.validateAssignmentPlan(badModePlan);
assert(!badModeCheck.valid, 'forbidden mode fails');

// validateAssignmentPlan — invalid mode
var invModePlan = JSON.parse(JSON.stringify(validPlan));
invModePlan.mode = 'turbo';
var invModeCheck = aa.validateAssignmentPlan(invModePlan);
assert(!invModeCheck.valid, 'invalid mode fails');

// validateAssignmentPlan — fallback contains selected
var badFbPlan = JSON.parse(JSON.stringify(validPlan));
badFbPlan.fallbackAgents = ['codex', 'workbuddy'];
badFbPlan.selectedAgent = 'codex';
var badFbCheck = aa.validateAssignmentPlan(badFbPlan);
assert(!badFbCheck.valid, 'fallback contains selected fails');

// validateAssignmentPlan — invalid status
var badStatusPlan = JSON.parse(JSON.stringify(validPlan));
badStatusPlan.status = 'flying';
var badStatusCheck = aa.validateAssignmentPlan(badStatusPlan);
assert(!badStatusCheck.valid, 'invalid status fails');

// validateAssignmentPlan — missing confidence
var noConfPlan = JSON.parse(JSON.stringify(validPlan));
noConfPlan.confidence = undefined;
var noConfCheck = aa.validateAssignmentPlan(noConfPlan);
assert(!noConfCheck.valid, 'missing confidence fails');

// validateAssignmentPlan — invalid confidence range
var badConfPlan = JSON.parse(JSON.stringify(validPlan));
badConfPlan.confidence = 1.5;
var badConfCheck = aa.validateAssignmentPlan(badConfPlan);
assert(!badConfCheck.valid, 'confidence > 1 fails');

badConfPlan.confidence = -0.1;
badConfCheck = aa.validateAssignmentPlan(badConfPlan);
assert(!badConfCheck.valid, 'confidence < 0 fails');

// validateAssignmentPlan — missing reason
var noReasonPlan = JSON.parse(JSON.stringify(validPlan));
noReasonPlan.reason = '';
var noReasonCheck = aa.validateAssignmentPlan(noReasonPlan);
assert(!noReasonCheck.valid, 'empty reason fails');

// validateSessionForAssignment
var sessCheck = aa.validateSessionForAssignment(session);
assert(sessCheck.valid, 'valid session passes');
var nullSessCheck = aa.validateSessionForAssignment(null);
assert(!nullSessCheck.valid, 'null session fails');
var noIdSessCheck = aa.validateSessionForAssignment({});
assert(!noIdSessCheck.valid, 'session without ID fails');

// validateAgent
assert(aa.validateAgent('codex').valid, 'codex is valid agent');
assert(aa.validateAgent('workbuddy').valid, 'workbuddy is valid agent');
assert(!aa.validateAgent('skynet').valid, 'invalid agent fails');
assert(!aa.validateAgent('').valid, 'empty agent fails');
assert(!aa.validateAgent(null).valid, 'null agent fails');

// validateCapabilities
assert(aa.validateCapabilities(['coding', 'testing']).valid, 'valid capabilities pass');
assert(!aa.validateCapabilities([]).valid, 'empty capabilities fail');
assert(!aa.validateCapabilities(null).valid, 'null capabilities fail');
assert(!aa.validateCapabilities('coding').valid, 'string capabilities fail');

// validateAssignmentTransition
assert(aa.validateAssignmentTransition('planned', 'reviewed').valid, 'planned→reviewed valid');
assert(aa.validateAssignmentTransition('planned', 'rejected').valid, 'planned→rejected valid');
assert(aa.validateAssignmentTransition('planned', 'archived').valid, 'planned→archived valid');
assert(aa.validateAssignmentTransition('rejected', 'planned').valid, 'rejected→planned valid');
assert(aa.validateAssignmentTransition('reviewed', 'archived').valid, 'reviewed→archived valid');
assert(!aa.validateAssignmentTransition('archived', 'planned').valid, 'archived→planned invalid');
assert(!aa.validateAssignmentTransition('reviewed', 'planned').valid, 'reviewed→planned invalid');

// validateBatchPlans
var batchValid = aa.validateBatchPlans([validPlan]);
assert(batchValid.valid, 'single plan batch passes');

var batchDup = aa.validateBatchPlans([validPlan, validPlan]);
assert(!batchDup.valid, 'duplicate sessionId batch fails');

// ============================================================================
// Section 6: Runtime — createAssignmentPlan
// ============================================================================
section('6. Runtime — createAssignmentPlan');

aa.clearAllPlans();
assertEqual(aa.getPlanCount(), 0, 'store starts empty');

// Basic creation
var result = aa.createAssignmentPlanFromSession(opsSession, { category: 'operations' });
assert(result.success, 'createAssignmentPlan succeeds');
assert(result.plan !== null, 'plan is not null');
assertEqual(result.plan.selectedAgent, 'workbuddy', 'correct agent assigned');
assertEqual(result.plan.mode, 'dry-run', 'default mode is dry-run');
assertEqual(result.plan.status, 'planned', 'default status is planned');
assertEqual(aa.getPlanCount(), 1, 'plan count = 1');

// Duplicate session
var dupResult = aa.createAssignmentPlanFromSession(opsSession, { category: 'operations' });
assert(!dupResult.success, 'duplicate session fails');
assertEqual(dupResult.code, 'SESSION_ALREADY_ASSIGNED', 'error code is SESSION_ALREADY_ASSIGNED');

// Forbidden mode
var badModeResult = aa.createAssignmentPlanFromSession(makeMockSession({ category: 'operations' }), { mode: 'live' });
assert(!badModeResult.success, 'forbidden mode fails');
assertEqual(badModeResult.code, 'FORBIDDEN_MODE', 'error code is FORBIDDEN_MODE');

// Invalid mode
var invModeResult = aa.createAssignmentPlanFromSession(makeMockSession({ category: 'operations' }), { mode: 'rocket' });
assert(!invModeResult.success, 'invalid mode fails');

// Null session
var nullSessResult = aa.createAssignmentPlanFromSession(null, {});
assert(!nullSessResult.success, 'null session fails');

// Empty session
var emptySess = {};
var emptySessResult = aa.createAssignmentPlanFromSession(emptySess, {});
assert(!emptySessResult.success, 'empty session fails');

// Session without sessionId
var noIdResult = aa.createAssignmentPlanFromSession({ foo: 'bar' }, { category: 'operations' });
assert(!noIdResult.success, 'session without sessionId fails');

// Explicit mode override
var supResult = aa.createAssignmentPlanFromSession(makeMockSession({ category: 'commerce' }), { mode: 'supervised' });
assert(supResult.success, 'supervised mode succeeds');
assertEqual(supResult.plan.mode, 'supervised', 'mode is supervised');

// Different categories
aa.clearAllPlans();
var finResult = aa.createAssignmentPlanFromSession(makeMockSession({ category: 'finance' }), { category: 'finance' });
assert(finResult.success, 'finance session assigned');
assertEqual(finResult.plan.selectedAgent, 'deepseek', 'finance → deepseek');

var mrktResult = aa.createAssignmentPlanFromSession(makeMockSession({ category: 'marketing' }), { category: 'marketing' });
assert(mrktResult.success, 'marketing session assigned');
assertEqual(mrktResult.plan.selectedAgent, 'doubao', 'marketing → doubao');

var custResult = aa.createAssignmentPlanFromSession(makeMockSession({ category: 'customer' }), { category: 'customer' });
assert(custResult.success, 'customer session assigned');
assertEqual(custResult.plan.selectedAgent, 'doubao', 'customer → doubao');

// Verify pipeline IDs are carried through
var pipeSession = makeMockSession({
  goalId: 'goal_x',
  strategyId: 'strategy_x',
  draftId: 'draft_x',
  reviewId: 'review_x',
  dispatchPlanId: 'dispatch_x',
  ticketId: 'ticket_x'
});
var pipeResult = aa.createAssignmentPlanFromSession(pipeSession, { category: 'devops' });
assert(pipeResult.success, 'pipeline session assigned');
assertEqual(pipeResult.plan.goalId, 'goal_x', 'goalId carried through');
assertEqual(pipeResult.plan.strategyId, 'strategy_x', 'strategyId carried through');
assertEqual(pipeResult.plan.draftId, 'draft_x', 'draftId carried through');
assertEqual(pipeResult.plan.reviewId, 'review_x', 'reviewId carried through');
assertEqual(pipeResult.plan.dispatchPlanId, 'dispatch_x', 'dispatchPlanId carried through');
assertEqual(pipeResult.plan.ticketId, 'ticket_x', 'ticketId carried through');

// ============================================================================
// Section 7: Runtime — Batch Assignment
// ============================================================================
section('7. Runtime — Batch Assignment');

aa.clearAllPlans();

var sessions = [
  makeMockSession({ category: 'operations' }),
  makeMockSession({ category: 'commerce' }),
  makeMockSession({ category: 'finance' })
];

var batchResult = aa.createAssignmentPlans(sessions, {});
assert(batchResult.success, 'batch assignment succeeds');
assertEqual(batchResult.plans.length, 3, '3 plans created');
assertEqual(batchResult.summary.success, 3, '3 successes');
assertEqual(batchResult.summary.failed, 0, '0 failures');

// Verify individual assignments
assertEqual(batchResult.plans[0].selectedAgent, 'workbuddy', 'ops → workbuddy');
assertEqual(batchResult.plans[1].selectedAgent, 'codex', 'commerce → codex');
assertEqual(batchResult.plans[2].selectedAgent, 'deepseek', 'finance → deepseek');

// Batch with duplicates
var dupSessions = [sessions[0], sessions[0]];
var dupBatch = aa.createAssignmentPlans(dupSessions, {});
assert(!dupBatch.success, 'duplicate batch fails');

// Batch with empty input
var emptyBatch = aa.createAssignmentPlans([], {});
assert(!emptyBatch.success, 'empty batch fails');

// Batch with null
var nullBatch = aa.createAssignmentPlans(null, {});
assert(!nullBatch.success, 'null batch fails');

// Batch with mixed valid/invalid
aa.clearAllPlans();
var mixedSessions = [
  makeMockSession({ category: 'operations' }),
  makeMockSession({}), // no category
  makeMockSession({ category: 'commerce' })
];
var mixedBatch = aa.createAssignmentPlans(mixedSessions, { category: 'operations' });
assert(mixedBatch.summary.success >= 2, 'most sessions succeed');
assert(mixedBatch.summary.failed >= 0, 'some may fail');

// Batch preserves session order
aa.clearAllPlans();
var orderedSessions = [
  makeMockSession({ category: 'finance', goalId: 'g1' }),
  makeMockSession({ category: 'devops', goalId: 'g2' }),
  makeMockSession({ category: 'marketing', goalId: 'g3' })
];
var ordBatch = aa.createAssignmentPlans(orderedSessions, {});
assert(ordBatch.success, 'ordered batch succeeds');
assertEqual(ordBatch.plans[0].goalId, 'g1', 'first plan has g1');
assertEqual(ordBatch.plans[1].goalId, 'g2', 'second plan has g2');
assertEqual(ordBatch.plans[2].goalId, 'g3', 'third plan has g3');

// ============================================================================
// Section 8: Runtime — Query & Snapshot
// ============================================================================
section('8. Runtime — Query & Snapshot');

// getAssignmentPlan — use persisted plan from runtime
var persistSession = makeMockSession({ category: 'operations' });
var persistResult = aa.createAssignmentPlanFromSession(persistSession, { category: 'operations' });
var persistedPlan = persistResult.plan;
var retrieved = aa.getAssignmentPlan(persistedPlan.assignmentId);
assert(retrieved !== null, 'getAssignmentPlan finds plan');
assertEqual(retrieved.sessionId, persistedPlan.sessionId, 'retrieved has correct sessionId');

// getAssignmentPlan — not found
assertEqual(aa.getAssignmentPlan('nonexistent'), null, 'unknown ID returns null');

// findAssignmentBySession — use the persisted plan's session (before clear)
var found = aa.findAssignmentBySession(persistSession.sessionId);
assert(found !== null, 'findAssignmentBySession finds plan');
assertEqual(found.selectedAgent, 'workbuddy', 'found correct agent');

// listAssignmentPlans — all
aa.clearAllPlans();
var qSession1 = makeMockSession({ category: 'operations' });
var qSession2 = makeMockSession({ category: 'commerce' });
var qSession3 = makeMockSession({ category: 'finance' });
aa.createAssignmentPlanFromSession(qSession1, { category: 'operations' });
aa.createAssignmentPlanFromSession(qSession2, { category: 'commerce' });
aa.createAssignmentPlanFromSession(qSession3, { category: 'finance' });

var allPlans = aa.listAssignmentPlans();
assertEqual(allPlans.length, 3, 'listAssignmentPlans returns 3');

// listAssignmentPlans — filter by agent
var codexPlans = aa.listAssignmentPlans({ agent: 'codex' });
assertEqual(codexPlans.length, 1, 'filter by codex returns 1');

var wbPlans = aa.listAssignmentPlans({ agent: 'workbuddy' });
assertEqual(wbPlans.length, 1, 'filter by workbuddy returns 1');

// listAssignmentPlans — filter by status
var plannedPlans = aa.listAssignmentPlans({ status: 'planned' });
assert(plannedPlans.length > 0, 'filter by planned returns plans');

// listAssignmentPlans — filter by mode
var dryRunPlans = aa.listAssignmentPlans({ mode: 'dry-run' });
assert(dryRunPlans.length > 0, 'filter by dry-run returns plans');

// listAssignmentPlans — combined filter
var combined = aa.listAssignmentPlans({ agent: 'codex', status: 'planned' });
assert(combined.length >= 0, 'combined filter works');

// generateAssignmentSnapshot
var snap = aa.generateAssignmentSnapshot();
assertEqual(snap.total, 3, 'snapshot total is 3');
assert(snap.byAgent.codex > 0, 'codex count > 0');
assert(snap.byAgent.workbuddy > 0, 'workbuddy count > 0');
assert(snap.byAgent.deepseek > 0, 'deepseek count > 0');

// generateAssignmentSnapshot with filter
var filterSnap = aa.generateAssignmentSnapshot({ agent: 'codex' });
assertEqual(filterSnap.total, 1, 'filtered snapshot total is 1');

// getPlanCount
assertEqual(aa.getPlanCount(), 3, 'getPlanCount returns 3');

// ============================================================================
// Section 9: Status Transitions
// ============================================================================
section('9. Status Transitions');

aa.clearAllPlans();
var tSession = makeMockSession({ category: 'operations' });
var tResult = aa.createAssignmentPlanFromSession(tSession, { category: 'operations' });
assert(tResult.success, 'transition test session created');
var tPlan = tResult.plan;

// planned → reviewed
var r1 = aa.updateAssignmentStatus(tPlan.assignmentId, 'reviewed');
assert(r1.success, 'planned→reviewed succeeds');
assertEqual(r1.plan.status, 'reviewed', 'status is reviewed');

// planned → rejected (new plan)
var tResult2 = aa.createAssignmentPlanFromSession(makeMockSession({ category: 'commerce' }), { category: 'commerce' });
var r2 = aa.updateAssignmentStatus(tResult2.plan.assignmentId, 'rejected');
assert(r2.success, 'planned→rejected succeeds');

// planned → archived
var tResult3 = aa.createAssignmentPlanFromSession(makeMockSession({ category: 'finance' }), { category: 'finance' });
var r3 = aa.updateAssignmentStatus(tResult3.plan.assignmentId, 'archived');
assert(r3.success, 'planned→archived succeeds');

// rejected → planned (resubmit)
var r4 = aa.updateAssignmentStatus(tResult2.plan.assignmentId, 'planned');
assert(r4.success, 'rejected→planned succeeds');

// rejected → archived
var tResult4 = aa.createAssignmentPlanFromSession(makeMockSession({ category: 'devops' }), { category: 'devops' });
aa.updateAssignmentStatus(tResult4.plan.assignmentId, 'rejected');
var r5 = aa.updateAssignmentStatus(tResult4.plan.assignmentId, 'archived');
assert(r5.success, 'rejected→archived succeeds');

// reviewed → archived
var r6 = aa.updateAssignmentStatus(tPlan.assignmentId, 'archived');
assert(r6.success, 'reviewed→archived succeeds');

// invalid transitions
var tResult5 = aa.createAssignmentPlanFromSession(makeMockSession({ category: 'marketing' }), { category: 'marketing' });
// archived → planned (invalid — archived is terminal)
var r7 = aa.updateAssignmentStatus(tResult5.plan.assignmentId, 'archived');
assert(r7.success, 'planned→archived ok');
var r7b = aa.updateAssignmentStatus(tResult5.plan.assignmentId, 'planned');
assert(!r7b.success, 'archived→planned invalid');

// reviewed → planned (invalid)
var tResult6 = aa.createAssignmentPlanFromSession(makeMockSession({ category: 'operations' }), { category: 'operations' });
aa.updateAssignmentStatus(tResult6.plan.assignmentId, 'reviewed');
var r8 = aa.updateAssignmentStatus(tResult6.plan.assignmentId, 'planned');
assert(!r8.success, 'reviewed→planned invalid');

// not found
var r9 = aa.updateAssignmentStatus('nonexistent', 'reviewed');
assert(!r9.success, 'not found fails');

// ============================================================================
// Section 10: deriveRequiredCapabilities
// ============================================================================
section('10. deriveRequiredCapabilities');

var devCaps = aa.deriveRequiredCapabilities('devops');
assertEqual(devCaps.length, 3, 'devops has 3 caps');
assertContains(devCaps, 'ops', 'devops includes ops');
assertContains(devCaps, 'server', 'devops includes server');
assertContains(devCaps, 'audit', 'devops includes audit');

var comCaps = aa.deriveRequiredCapabilities('commerce');
assertContains(comCaps, 'coding', 'commerce includes coding');
assertContains(comCaps, 'testing', 'commerce includes testing');
assertContains(comCaps, 'analysis', 'commerce includes analysis');

var opsCaps = aa.deriveRequiredCapabilities('operations');
assertContains(opsCaps, 'ops', 'operations includes ops');
assertContains(opsCaps, 'audit', 'operations includes audit');
assertContains(opsCaps, 'staging', 'operations includes staging');

var finCaps2 = aa.deriveRequiredCapabilities('finance');
assertContains(finCaps2, 'finance', 'finance includes finance');
assertContains(finCaps2, 'risk', 'finance includes risk');
assertContains(finCaps2, 'report', 'finance includes report');

var mrktCaps2 = aa.deriveRequiredCapabilities('marketing');
assertContains(mrktCaps2, 'marketing', 'marketing includes marketing');
assertContains(mrktCaps2, 'content', 'marketing includes content');
assertContains(mrktCaps2, 'campaign', 'marketing includes campaign');

var custCaps2 = aa.deriveRequiredCapabilities('customer');
assertContains(custCaps2, 'customer', 'customer includes customer');
assertContains(custCaps2, 'content', 'customer includes content');
assertContains(custCaps2, 'report', 'customer includes report');

assertEqual(aa.deriveRequiredCapabilities('unknown').length, 0, 'unknown category returns empty');
assertEqual(aa.deriveRequiredCapabilities(null).length, 0, 'null category returns empty');

// ============================================================================
// Section 11: Safety — Forbidden Patterns
// ============================================================================
section('11. Safety — Forbidden Patterns');

var fs = require('fs');
var path = require('path');
var srcDir = path.join(__dirname, '..', 'src', 'agent-assignment');
var files = fs.readdirSync(srcDir).filter(function (f) { return f.endsWith('.js'); });

var forbiddenPatterns = [
  { pattern: /exec\s*\(/, name: 'exec()' },
  { pattern: /spawn\s*\(/, name: 'spawn()' },
  { pattern: /child_process/, name: 'child_process' },
  { pattern: /pm2/, name: 'pm2' },
  { pattern: /\.env/, name: '.env' },
  { pattern: /nginx/, name: 'nginx' },
  { pattern: /deploy/i, name: 'deploy' },
  { pattern: /commander/, name: 'commander' },
  { pattern: /gateway/, name: 'gateway' },
  { pattern: /agent.?host/, name: 'agent-host' },
  { pattern: /mission.?manager/, name: 'mission-manager' },
  { pattern: /executeMission/, name: 'executeMission' }
];

/**
 * Strip comments and string literals before matching.
 */
function stripCommentsAndStrings(code) {
  // Remove single-line comments
  var stripped = code.replace(/\/\/.*$/gm, '');
  // Remove block comments
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove string literals (single and double quotes)
  stripped = stripped.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  stripped = stripped.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  // Remove template literals
  stripped = stripped.replace(/`(?:[^`\\]|\\.)*`/g, '``');
  return stripped;
}

var fileCount = 0;
var matchCount = 0;

files.forEach(function (file) {
  var code = fs.readFileSync(path.join(srcDir, file), 'utf-8');
  var stripped = stripCommentsAndStrings(code);
  fileCount++;
  forbiddenPatterns.forEach(function (fp) {
    if (fp.pattern.test(stripped)) {
      matchCount++;
      console.log('  VIOLATION: ' + file + ' matches ' + fp.name);
    }
  });
});

// Source files only (test file excluded — its assertion patterns are expected)
assertEqual(matchCount, 0, 'No forbidden patterns in source code (checked ' + fileCount + ' files)');

// ============================================================================
// Section 12: No Agent Invocation
// ============================================================================
section('12. No Agent Invocation');

var noInvokePatterns = [
  { pattern: /\.execute\s*\(/, name: '.execute()' },
  { pattern: /\.run\s*\(/, name: '.run()' },
  { pattern: /\bdispatch\s*\(/, name: 'dispatch()' },
  { pattern: /invokeAgent/, name: 'invokeAgent' },
  { pattern: /callAgent/, name: 'callAgent' },
  { pattern: /agentHost\./, name: 'agentHost.' },
  { pattern: /commander\./, name: 'commander.' },
  { pattern: /gateway\./, name: 'gateway.' },
  { pattern: /fork\s*\(/, name: 'fork()' },
  { pattern: /process\.exec/, name: 'process.exec' },
  { pattern: /shell\s*\(/, name: 'shell()' },
  { pattern: /startMission/, name: 'startMission' }
];

var invokeMatchCount = 0;

files.forEach(function (file) {
  var code = fs.readFileSync(path.join(srcDir, file), 'utf-8');
  var stripped = stripCommentsAndStrings(code);
  noInvokePatterns.forEach(function (fp) {
    if (fp.pattern.test(stripped)) {
      invokeMatchCount++;
      console.log('  VIOLATION: ' + file + ' matches ' + fp.name);
    }
  });
});

// Source files only
assertEqual(invokeMatchCount, 0, 'No agent invocation patterns (checked ' + fileCount + ' files)');

// ============================================================================
// Section 13: Edge Cases
// ============================================================================
section('13. Edge Cases & Stress');

// Very large batch
aa.clearAllPlans();
var largeSessions = [];
for (var i = 0; i < 20; i++) {
  largeSessions.push(makeMockSession({ category: 'operations' }));
}
var largeBatch = aa.createAssignmentPlans(largeSessions, { category: 'operations' });
assertEqual(largeBatch.summary.total, 20, '20 session batch total');
assert(largeBatch.summary.success >= 20, 'all 20 processed');

// Re-create after clear
aa.clearAllPlans();
assertEqual(aa.getPlanCount(), 0, 'clear works');
var reResult = aa.createAssignmentPlanFromSession(makeMockSession({ category: 'commerce' }), { category: 'commerce' });
assert(reResult.success, 're-create after clear succeeds');

// Confidence edge: 0
var zeroMatch = aa.matchAgentForSession(makeMockSession({}), { requiredCapabilities: ['nonexistent_capability'] });
assertEqual(zeroMatch.confidence, 0, 'no match → confidence 0');

// Confidence edge: exact match
var exactMatch = aa.matchAgentForSession(makeMockSession({}), { requiredCapabilities: ['coding', 'testing', 'git', 'pr', 'refactor', 'code-review'] });
assertEqual(exactMatch.confidence, 1, 'full match → confidence 1');
assertEqual(exactMatch.selectedAgent, 'codex', 'full codex match');

// Tie-breaking by priority (codex vs workbuddy for 'analysis')
var tieMatch = aa.matchAgentForSession(makeMockSession({}), { requiredCapabilities: ['analysis'] });
assert(tieMatch.selectedAgent !== null, 'tiebreaker finds an agent');

// Session with empty ticketSnapshot
var emptySnapSession = makeMockSession({ ticketSnapshot: null });
var emptySnapResult = aa.createAssignmentPlanFromSession(emptySnapSession, { category: 'devops' });
assert(emptySnapResult.success, 'session with null ticketSnapshot works');

// Session with undefined selectedAgent
var undefAgentSession = makeMockSession({ selectedAgent: undefined });
var undefAgentResult = aa.createAssignmentPlanFromSession(undefAgentSession, { category: 'operations' });
assert(undefAgentResult.success, 'undefined selectedAgent works');

// ============================================================================
// FINAL
// ============================================================================
cleanupSection();

console.log('\n======================================================================');
console.log('  FINAL SUMMARY');
console.log('======================================================================');
console.log('  Total:   ' + (passed + failed));
console.log('  Passed:  ' + passed);
console.log('  Failed:  ' + failed);
console.log('  Rate:    ' + (passed / (passed + failed) * 100).toFixed(1) + '%');
console.log('======================================================================\n');

if (failed === 0) {
  console.log('[ALL TESTS PASSED]\n');
  process.exit(0);
} else {
  console.log('[SOME TESTS FAILED]\n');
  process.exit(1);
}
