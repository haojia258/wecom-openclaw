/**
 * test-controlled-dispatch.cjs
 * P9.6.2 Controlled Dispatch Runtime — Test Suite
 *
 * Tests: types, validators, store, runtime, lifecycle, snapshot,
 *        malformed storage, concurrency, safety grep, no-execution guarantee.
 *
 * Self-contained — no external test framework dependencies.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');

// ============================================================================
// Test Framework
// ============================================================================
var passed = 0;
var failed = 0;
var sectionName = '';

function section(name) {
  sectionName = name;
  console.log('');
  console.log('============================================================');
  console.log('  ' + name);
  console.log('============================================================');
}

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log('  FAIL: [' + sectionName + '] ' + (message || 'assertion failed'));
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.log('  FAIL: [' + sectionName + '] ' + (message || 'equality check'));
    console.log('    expected: ' + JSON.stringify(expected));
    console.log('    actual:   ' + JSON.stringify(actual));
  }
}

function assertNotEqual(actual, unexpected, message) {
  if (actual !== unexpected) {
    passed++;
  } else {
    failed++;
    console.log('  FAIL: [' + sectionName + '] ' + (message || 'inequality check'));
    console.log('    unexpected match: ' + JSON.stringify(unexpected));
  }
}

function assertDeepEqual(actual, expected, message) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log('  FAIL: [' + sectionName + '] ' + (message || 'deep equality check'));
    console.log('    expected: ' + e);
    console.log('    actual:   ' + a);
  }
}

function assertContains(haystack, needle, message) {
  if (haystack && haystack.indexOf(needle) !== -1) {
    passed++;
  } else {
    failed++;
    console.log('  FAIL: [' + sectionName + '] ' + (message || 'contains check'));
    console.log('    expected to contain: ' + JSON.stringify(needle));
    console.log('    haystack: ' + JSON.stringify(haystack));
  }
}

function assertType(value, expectedType, message) {
  var actualType = Array.isArray(value) ? 'array' : typeof value;
  if (actualType === expectedType) {
    passed++;
  } else {
    failed++;
    console.log('  FAIL: [' + sectionName + '] ' + (message || 'type check'));
    console.log('    expected type: ' + expectedType);
    console.log('    actual type: ' + actualType);
  }
}

// ============================================================================
// Test Setup
// ============================================================================

// Load module under test
var cd = require('../src/controlled-dispatch');
var types = cd.types;
var validator = cd.validator;
var store = cd.store;
var runtime = cd.runtime;

// Create temp directory for test storage
var tmpDir = path.join(os.tmpdir(), 'test-controlled-dispatch-' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
var tmpFile = path.join(tmpDir, 'sessions.json');

// Override store path for tests
cd.setStorePath(tmpFile);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Creates a mock approved dispatch ticket for testing.
 */
function makeApprovedTicket(overrides) {
  var base = {
    ticketId: 'ticket_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
    dispatchPlanId: 'plan_test_001',
    reviewId: 'review_test_001',
    draftId: 'draft_test_001',
    strategyId: 'strategy_test_001',
    goalId: 'goal_test_001',
    title: 'Test Ticket',
    type: 'operations',
    priority: 'medium',
    status: 'approved',
    approvalStatus: 'human-approved',
    executionMode: 'dry-run',
    riskLevel: 'medium',
    recommendedAgent: 'workbuddy',
    selectedAgent: 'workbuddy',
    fallbackAgents: ['codex'],
    objective: 'Test objective',
    inputs: {},
    guardrails: {},
    acceptanceCriteria: [],
    risks: [],
    approvalHistory: [{ action: 'approve', approver: 'test-user', reason: 'Test approval', timestamp: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (overrides) {
    Object.keys(overrides).forEach(function (k) {
      base[k] = overrides[k];
    });
  }

  return base;
}

function resetStore() {
  // Clear all sessions from store
  if (typeof cd.clearAllSessions === 'function') {
    cd.clearAllSessions();
  }
}

/**
 * Helper: creates a session via the runtime API and extracts the session object.
 * Used in Sections 3-8 where the runtime version (which also persists) is the right API.
 */
function rt(ticket, options) {
  var result = cd.createDispatchSession(ticket, options);
  if (!result.success) throw new Error('rt failed: ' + result.error);
  return result.session;
}

// ============================================================================
// Section 1 — Types & Constants
// ============================================================================
section('Section 1 — Types & Constants');

// 1.1 SESSION_STATUS defined
assert(cd.SESSION_STATUS !== undefined, '1.1 SESSION_STATUS defined');
assertEqual(typeof cd.SESSION_STATUS, 'object', '1.2 SESSION_STATUS is object');

// 1.3 SESSION_STATUS values
assertEqual(cd.SESSION_STATUS.PLANNED, 'planned', '1.3 PLANNED');
assertEqual(cd.SESSION_STATUS.RUNNING, 'running', '1.4 RUNNING');
assertEqual(cd.SESSION_STATUS.COMPLETED, 'completed', '1.5 COMPLETED');
assertEqual(cd.SESSION_STATUS.FAILED, 'failed', '1.6 FAILED');
assertEqual(cd.SESSION_STATUS.CANCELLED, 'cancelled', '1.7 CANCELLED');

// 1.8 SESSION_STATUS_VALUES array
assert(cd.SESSION_STATUS_VALUES !== undefined, '1.8 SESSION_STATUS_VALUES defined');
assert(Array.isArray(cd.SESSION_STATUS_VALUES), '1.9 SESSION_STATUS_VALUES is array');
assertEqual(cd.SESSION_STATUS_VALUES.length, 5, '1.10 SESSION_STATUS_VALUES has 5 entries');

// 1.11 ALLOWED_SESSION_TRANSITIONS
assert(cd.ALLOWED_SESSION_TRANSITIONS !== undefined, '1.11 ALLOWED_SESSION_TRANSITIONS defined');
assert(Array.isArray(cd.ALLOWED_SESSION_TRANSITIONS.planned), '1.12 planned has transitions');
assertContains(cd.ALLOWED_SESSION_TRANSITIONS.planned, 'running', '1.13 planned→running allowed');
assertContains(cd.ALLOWED_SESSION_TRANSITIONS.planned, 'cancelled', '1.14 planned→cancelled allowed');
assert(Array.isArray(cd.ALLOWED_SESSION_TRANSITIONS.running), '1.15 running has transitions');
assertContains(cd.ALLOWED_SESSION_TRANSITIONS.running, 'completed', '1.16 running→completed allowed');
assertContains(cd.ALLOWED_SESSION_TRANSITIONS.running, 'failed', '1.17 running→failed allowed');
assertEqual(cd.ALLOWED_SESSION_TRANSITIONS.completed.length, 0, '1.18 completed is terminal');
assertEqual(cd.ALLOWED_SESSION_TRANSITIONS.cancelled.length, 0, '1.19 cancelled is terminal');

// 1.20 EXECUTION_MODE
assertEqual(cd.EXECUTION_MODE.DRY_RUN, 'dry-run', '1.20 DRY_RUN');
assertEqual(cd.EXECUTION_MODE.SUPERVISED, 'supervised', '1.21 SUPERVISED');
assertEqual(cd.EXECUTION_MODE_VALUES.length, 2, '1.22 EXECUTION_MODE_VALUES has 2 entries');

// 1.23 FORBIDDEN_MODES
assert(Array.isArray(cd.FORBIDDEN_MODES), '1.23 FORBIDDEN_MODES is array');
assertContains(cd.FORBIDDEN_MODES, 'live', '1.24 live is forbidden');
assertContains(cd.FORBIDDEN_MODES, 'auto', '1.25 auto is forbidden');
assertContains(cd.FORBIDDEN_MODES, 'execute', '1.26 execute is forbidden');
assert(cd.FORBIDDEN_MODES.length >= 3, '1.27 FORBIDDEN_MODES has at least 3 entries');

// 1.28 SAFETY_LEVEL
assertEqual(cd.SAFETY_LEVEL.LOW, 'low', '1.28 LOW');
assertEqual(cd.SAFETY_LEVEL.MEDIUM, 'medium', '1.29 MEDIUM');
assertEqual(cd.SAFETY_LEVEL.HIGH, 'high', '1.30 HIGH');
assertEqual(cd.SAFETY_LEVEL.CRITICAL, 'critical', '1.31 CRITICAL');
assertEqual(cd.SAFETY_LEVEL_VALUES.length, 4, '1.32 SAFETY_LEVEL_VALUES has 4 entries');

// 1.33 CAPABILITY
assertEqual(cd.CAPABILITY.READ, 'read', '1.33 READ');
assertEqual(cd.CAPABILITY.ANALYZE, 'analyze', '1.34 ANALYZE');
assertEqual(cd.CAPABILITY.PLAN, 'plan', '1.35 PLAN');
assertEqual(cd.CAPABILITY.REPORT, 'report', '1.36 REPORT');
assertEqual(cd.CAPABILITY_VALUES.length, 4, '1.37 CAPABILITY_VALUES has 4 entries');

// 1.38 DEFAULT_CAPABILITIES
assert(Array.isArray(cd.DEFAULT_CAPABILITIES), '1.38 DEFAULT_CAPABILITIES is array');
assert(cd.DEFAULT_CAPABILITIES.length >= 4, '1.39 DEFAULT_CAPABILITIES has at least 4 entries');

// 1.40 SESSION_ERROR_CODES
assert(cd.SESSION_ERROR_CODES !== undefined, '1.40 SESSION_ERROR_CODES defined');
assertEqual(typeof cd.SESSION_ERROR_CODES.FORBIDDEN_EXECUTION_MODE, 'string', '1.41 FORBIDDEN_EXECUTION_MODE code defined');
assertEqual(typeof cd.SESSION_ERROR_CODES.TICKET_NOT_APPROVED, 'string', '1.42 TICKET_NOT_APPROVED code defined');
assertEqual(typeof cd.SESSION_ERROR_CODES.TICKET_ALREADY_DISPATCHED, 'string', '1.43 TICKET_ALREADY_DISPATCHED code defined');

// 1.44 PRIORITY_SAFETY_MAP
assert(cd.PRIORITY_SAFETY_MAP !== undefined, '1.44 PRIORITY_SAFETY_MAP defined');
assertEqual(cd.PRIORITY_SAFETY_MAP.low, 'low', '1.45 low→low');
assertEqual(cd.PRIORITY_SAFETY_MAP.medium, 'medium', '1.46 medium→medium');
assertEqual(cd.PRIORITY_SAFETY_MAP.high, 'high', '1.47 high→high');
assertEqual(cd.PRIORITY_SAFETY_MAP.critical, 'critical', '1.48 critical→critical');

// 1.49 createSessionId
assertEqual(typeof cd.createSessionId, 'function', '1.49 createSessionId is function');
var id1 = cd.createSessionId();
assert(id1.indexOf('session_') === 0, '1.50 session ID starts with session_');
var id2 = cd.createSessionId();
assertNotEqual(id1, id2, '1.51 each session ID is unique');

// 1.52 createDispatchSessionObj factory (raw object)
var ticket = makeApprovedTicket();
var session = cd.createDispatchSessionObj(ticket, { executionMode: 'dry-run' });
assertEqual(session.status, 'planned', '1.52 factory creates planned session');
assertEqual(session.executionMode, 'dry-run', '1.53 factory sets executionMode');
assert(session.sessionId.indexOf('session_') === 0, '1.54 factory generates sessionId');
assertEqual(session.ticketId, ticket.ticketId, '1.55 factory links ticketId');
assertNotEqual(session.ticketId, null, '1.56 ticketId not null');

// 1.57 createDispatchSessionObj with forbidden mode throws
try {
  cd.createDispatchSessionObj(ticket, { executionMode: 'live' });
  assert(false, '1.57 factory should throw on forbidden mode');
} catch (e) {
  assert(true, '1.57 factory throws on forbidden mode');
}

// 1.58 createEmptyDispatchSession
var empty = cd.createEmptyDispatchSession();
assertEqual(empty.status, 'planned', '1.58 empty session has planned status');

// 1.59 createEmptyDispatchSession with overrides
var overridden = cd.createEmptyDispatchSession({ title: 'Custom', status: 'running' });
assertEqual(overridden.title, 'Custom', '1.59 overridden title');
assertEqual(overridden.status, 'running', '1.60 overridden status');

// 1.61 Factory pipeline trace
assertEqual(session.dispatchPlanId, ticket.dispatchPlanId, '1.61 dispatchPlanId traced');
assertEqual(session.goalId, ticket.goalId, '1.62 goalId traced');

// 1.62-1.65 Factory defaults
assertEqual(typeof session.ticketSnapshot, 'object', '1.63 ticketSnapshot is object');
assertEqual(session.dryRunResult, null, '1.64 dryRunResult is null');
assert(Array.isArray(session.capabilities), '1.65 capabilities is array');

// 1.66-1.70 Helpers
assertEqual(typeof cd.isValidSessionTransition, 'function', '1.66 isValidSessionTransition exists');
assertEqual(cd.isValidSessionTransition('planned', 'running'), true, '1.67 planned→running valid');
assertEqual(cd.isValidSessionTransition('running', 'completed'), true, '1.68 running→completed valid');
assertEqual(cd.isValidSessionTransition('completed', 'running'), false, '1.69 completed→running invalid');
assertEqual(cd.isTerminalSessionStatus('completed'), true, '1.70 completed is terminal');

// 1.71-1.75 More helpers
assertEqual(cd.isTerminalSessionStatus('cancelled'), true, '1.71 cancelled is terminal');
assertEqual(cd.isTerminalSessionStatus('running'), false, '1.72 running is not terminal');
assertEqual(cd.isTerminalSessionStatus('planned'), false, '1.73 planned is not terminal');
assertEqual(cd.canStartSession({ status: 'planned' }), true, '1.74 planned can start');
assertEqual(cd.canStartSession({ status: 'running' }), false, '1.75 running cannot start');

// ============================================================================
// Section 2 — Validator
// ============================================================================
section('Section 2 — Validator');

// 2.1 validateDispatchSession null
var r1 = cd.validateDispatchSession(null);
assertEqual(r1.valid, false, '2.1 null session invalid');
assert(r1.errors.length > 0, '2.2 null has errors');

// 2.3 validateDispatchSession empty
var r3 = cd.validateDispatchSession({});
assertEqual(r3.valid, false, '2.3 empty session invalid');

// 2.4 validateDispatchSession valid
resetStore();
var ticket2 = makeApprovedTicket();
var validSession = cd.createDispatchSessionObj(ticket2, { executionMode: 'dry-run' });
var r4 = cd.validateDispatchSession(validSession);
assertEqual(r4.valid, true, '2.4 valid session passes');

// 2.5 validateDispatchSession missing sessionId
var r5 = cd.validateDispatchSession({ ticketId: 'ticket_test' });
assertEqual(r5.valid, false, '2.5 missing sessionId invalid');

// 2.6 validateDispatchSession bad sessionId format
var r6 = cd.validateDispatchSession({ sessionId: 'bad_id', ticketId: 'ticket_test' });
assertEqual(r6.valid, false, '2.6 bad sessionId format invalid');

// 2.7 validateDispatchSession missing ticketId
var r7 = cd.validateDispatchSession({ sessionId: 'session_123_abc' });
assertEqual(r7.valid, false, '2.7 missing ticketId invalid');

// 2.8 validateDispatchSession missing title
var r8 = cd.validateDispatchSession({ sessionId: 'session_123_abc', ticketId: 'ticket_123_abc', title: '' });
assertEqual(r8.valid, false, '2.8 missing title invalid');

// 2.9 validateExecutionMode valid
var em1 = cd.validateExecutionMode('dry-run');
assertEqual(em1.valid, true, '2.9 dry-run valid');

// 2.10 validateExecutionMode supervised
var em2 = cd.validateExecutionMode('supervised');
assertEqual(em2.valid, true, '2.10 supervised valid');

// 2.11 validateExecutionMode forbidden
var em3 = cd.validateExecutionMode('live');
assertEqual(em3.valid, false, '2.11 live forbidden');

// 2.12 validateExecutionMode auto
var em4 = cd.validateExecutionMode('auto');
assertEqual(em4.valid, false, '2.12 auto forbidden');

// 2.13 validateExecutionMode execute
var em5 = cd.validateExecutionMode('execute');
assertEqual(em5.valid, false, '2.13 execute forbidden');

// 2.14 validateExecutionMode unknown
var em6 = cd.validateExecutionMode('unknown_mode');
assertEqual(em6.valid, false, '2.14 unknown mode invalid');

// 2.15 validateExecutionMode null
var em7 = cd.validateExecutionMode(null);
assertEqual(em7.valid, false, '2.15 null mode invalid');

// 2.16 validateExecutionMode empty
var em8 = cd.validateExecutionMode('');
assertEqual(em8.valid, false, '2.16 empty mode invalid');

// 2.17 validateTicketForDispatch valid
var td1 = cd.validateTicketForDispatch(makeApprovedTicket());
assertEqual(td1.valid, true, '2.17 approved ticket valid');

// 2.18 validateTicketForDispatch not approved
var td2 = cd.validateTicketForDispatch(makeApprovedTicket({ status: 'pending' }));
assertEqual(td2.valid, false, '2.18 pending ticket invalid');

// 2.19 validateTicketForDispatch rejected
var td3 = cd.validateTicketForDispatch(makeApprovedTicket({ status: 'rejected' }));
assertEqual(td3.valid, false, '2.19 rejected ticket invalid');

// 2.20 validateTicketForDispatch wrong approval
var td4 = cd.validateTicketForDispatch(makeApprovedTicket({ approvalStatus: 'waiting' }));
assertEqual(td4.valid, false, '2.20 waiting approval invalid');

// 2.21 validateTicketForDispatch null
var td5 = cd.validateTicketForDispatch(null);
assertEqual(td5.valid, false, '2.21 null ticket invalid');

// 2.22 validateTicketForDispatch undefined
var td6 = cd.validateTicketForDispatch(undefined);
assertEqual(td6.valid, false, '2.22 undefined ticket invalid');

// 2.23 validateTicketForDispatch missing ticketId
var td7 = cd.validateTicketForDispatch({ status: 'approved', approvalStatus: 'human-approved' });
assertEqual(td7.valid, false, '2.23 missing ticketId invalid');

// 2.24 validateSessionTransition valid
var st1 = cd.validateSessionTransition({ status: 'planned' }, 'running');
assertEqual(st1.valid, true, '2.24 planned→running valid');

// 2.25 validateSessionTransition running→completed
var st2 = cd.validateSessionTransition({ status: 'running' }, 'completed');
assertEqual(st2.valid, true, '2.25 running→completed valid');

// 2.26 validateSessionTransition invalid
var st3 = cd.validateSessionTransition({ status: 'completed' }, 'running');
assertEqual(st3.valid, false, '2.26 completed→running invalid');

// 2.27 validateSessionTransition terminal
var st4 = cd.validateSessionTransition({ status: 'completed' }, 'planned');
assertEqual(st4.valid, false, '2.27 completed→planned invalid');

// 2.28 validateSessionTransition bad target
var st5 = cd.validateSessionTransition({ status: 'planned' }, 'unknown');
assertEqual(st5.valid, false, '2.28 unknown target invalid');

// 2.29 validateSessionTransition null session
var st6 = cd.validateSessionTransition(null, 'running');
assertEqual(st6.valid, false, '2.29 null session invalid');

// 2.30-2.35 validateCapabilities
var cap1 = cd.validateCapabilities(['read', 'analyze']);
assertEqual(cap1.valid, true, '2.30 valid capabilities');

var cap2 = cd.validateCapabilities(['read', 'plan', 'report', 'analyze']);
assertEqual(cap2.valid, true, '2.31 full capabilities');

var cap3 = cd.validateCapabilities([]);
assertEqual(cap3.valid, false, '2.32 empty capabilities');

var cap4 = cd.validateCapabilities(['invalid_cap']);
assertEqual(cap4.valid, false, '2.33 invalid capability');

var cap5 = cd.validateCapabilities(null);
assertEqual(cap5.valid, false, '2.34 null capabilities');

var cap6 = cd.validateCapabilities('not_array');
assertEqual(cap6.valid, false, '2.35 non-array capabilities');

// 2.36-2.42 validateBatchSessions
var bt1 = cd.validateBatchSessions([makeApprovedTicket()]);
assertEqual(bt1.valid, true, '2.36 single approved ticket batch valid');

var bt2 = cd.validateBatchSessions([makeApprovedTicket(), makeApprovedTicket()]);
assertEqual(bt2.valid, true, '2.37 two approved tickets batch valid');

var bt3 = cd.validateBatchSessions([]);
assertEqual(bt3.valid, false, '2.38 empty batch invalid');

var bt4 = cd.validateBatchSessions([makeApprovedTicket({ status: 'pending' })]);
assertEqual(bt4.valid, false, '2.39 batch with pending ticket invalid');

var bt5 = cd.validateBatchSessions([makeApprovedTicket(), makeApprovedTicket({ status: 'rejected' })]);
assertEqual(bt5.valid, false, '2.40 batch with one rejected ticket invalid');

// Duplicate check
var dupTicket = makeApprovedTicket();
var bt6 = cd.validateBatchSessions([dupTicket, dupTicket]);
assertEqual(bt6.valid, false, '2.41 duplicate tickets in batch invalid');

var bt7 = cd.validateBatchSessions(null);
assertEqual(bt7.valid, false, '2.42 null batch invalid');

// 2.43-2.47 validateSessionFilter
var sf1 = cd.validateSessionFilter(null);
assertEqual(sf1.valid, true, '2.43 null filter valid');

var sf2 = cd.validateSessionFilter({});
assertEqual(sf2.valid, true, '2.44 empty filter valid');

var sf3 = cd.validateSessionFilter({ status: ['planned'] });
assertEqual(sf3.valid, true, '2.45 status filter valid');

var sf4 = cd.validateSessionFilter({ status: 'planned' });
assertEqual(sf4.valid, false, '2.46 non-array status invalid');

var sf5 = cd.validateSessionFilter({ executionMode: 'dry-run' });
assertEqual(sf5.valid, false, '2.47 non-array executionMode invalid');

// ============================================================================
// Section 3 — Store CRUD
// ============================================================================
section('Section 3 — Store CRUD');

resetStore();
cd.setStorePath(tmpFile);

// 3.1 getSessionCount empty
assertEqual(cd.getSessionCount(), 0, '3.1 empty store has 0 count');

// 3.2 createSession (raw object via factory)
var t3 = makeApprovedTicket();
var s3a = cd.createDispatchSessionObj(t3, { executionMode: 'dry-run' });
cd.createSession(s3a);
assertEqual(cd.getSessionCount(), 1, '3.2 count after create is 1');

// 3.3 createSession duplicate
try {
  cd.createSession(s3a);
  assert(false, '3.3 duplicate session should throw');
} catch (e) {
  assert(true, '3.3 duplicate session throws');
}

// 3.4 getSession
var fetched = cd.getSession(s3a.sessionId);
assertEqual(fetched.sessionId, s3a.sessionId, '3.4 getSession returns correct session');
assertEqual(fetched.ticketId, t3.ticketId, '3.5 getSession ticketId matches');

// 3.6 getSession non-existent
assertEqual(cd.getSession('nonexistent'), null, '3.6 getSession returns null for missing');

// 3.7 updateSession
var updated = cd.updateSession(s3a.sessionId, { title: 'Updated Title', priority: 'high' });
assertEqual(updated.title, 'Updated Title', '3.7 updateSession changes title');
assertEqual(updated.priority, 'high', '3.8 updateSession changes priority');

// 3.9 updateSession non-existent
assertEqual(cd.updateSession('nonexistent', { title: 'x' }), null, '3.9 updateSession returns null for missing');

// 3.10 listSessions all
var all = cd.listSessions();
assertEqual(all.length, 1, '3.10 listSessions returns 1');

// 3.11 listSessions with status filter
var filtered1 = cd.listSessions({ status: ['planned'] });
assertEqual(filtered1.length, 1, '3.11 status filter returns 1');
var filtered2 = cd.listSessions({ status: ['running'] });
assertEqual(filtered2.length, 0, '3.12 running filter returns 0');

// 3.13 listSessions with executionMode filter
var filtered3 = cd.listSessions({ executionMode: ['dry-run'] });
assert(filtered3.length >= 1, '3.13 executionMode filter works');

// 3.14 listSessions with ticketId filter
var filtered4 = cd.listSessions({ ticketId: t3.ticketId });
assertEqual(filtered4.length, 1, '3.14 ticketId filter returns 1');

// 3.15 findSessionByTicket
var byTicket = cd.findSessionByTicket(t3.ticketId);
assertEqual(byTicket.sessionId, s3a.sessionId, '3.15 findSessionByTicket works');

// 3.16 findSessionByTicket non-existent
var byTicket2 = cd.findSessionByTicket('ticket_nonexistent');
assertEqual(byTicket2, null, '3.16 findSessionByTicket returns null for missing');

// 3.17-3.18 createSessions batch
resetStore();
var t31 = makeApprovedTicket();
var t32 = makeApprovedTicket();
var s31 = cd.createDispatchSessionObj(t31, { executionMode: 'dry-run' });
var s32 = cd.createDispatchSessionObj(t32, { executionMode: 'supervised' });
cd.createSessions([s31, s32]);
assertEqual(cd.getSessionCount(), 2, '3.17 two sessions created');
assertEqual(cd.listSessions({ executionMode: ['supervised'] }).length, 1, '3.18 supervised filter works');

// 3.19-3.20 deleteSession
resetStore();
var t33 = makeApprovedTicket();
var s33 = cd.createDispatchSessionObj(t33, { executionMode: 'dry-run' });
cd.createSession(s33);
assertEqual(cd.getSessionCount(), 1, '3.19 before delete count 1');
cd.deleteSession(s33.sessionId);
assertEqual(cd.getSessionCount(), 0, '3.20 after delete count 0');

// 3.21 deleteSession non-existent
assertEqual(cd.deleteSession('nonexistent'), false, '3.21 delete non-existent returns false');

// 3.22-3.25 Multiple sessions filter
resetStore();
var sessions = [];
for (var i = 0; i < 5; i++) {
  var tX = makeApprovedTicket();
  var sX = cd.createDispatchSessionObj(tX, { executionMode: i % 2 === 0 ? 'dry-run' : 'supervised' });
  cd.createSession(sX);
  sessions.push(sX);
}
var allSessions = cd.listSessions();
assertEqual(allSessions.length, 5, '3.22 5 sessions in store');
assertEqual(cd.listSessions({ executionMode: ['dry-run'] }).length, 3, '3.23 3 dry-run sessions');
assertEqual(cd.listSessions({ executionMode: ['supervised'] }).length, 2, '3.24 2 supervised sessions');
assertEqual(cd.getSessionCount(), 5, '3.25 getSessionCount returns 5');

// ============================================================================
// Section 4 — Runtime: Create Dispatch Session
// ============================================================================
section('Section 4 — Runtime: Create Dispatch Session');

resetStore();

// 4.1 createDispatchSession with approved ticket
var t4a = makeApprovedTicket();
var r4a = cd.createDispatchSession(t4a, { executionMode: 'dry-run' });
assertEqual(r4a.success, true, '4.1 create from approved ticket succeeds');
assert(r4a.session !== undefined, '4.2 session returned');
assertEqual(r4a.session.status, 'planned', '4.3 session is planned');

// 4.4 createDispatchSession with supervised mode
resetStore();
var t4b = makeApprovedTicket();
var r4b = cd.createDispatchSession(t4b, { executionMode: 'supervised' });
assertEqual(r4b.success, true, '4.4 supervised mode succeeds');
assertEqual(r4b.session.executionMode, 'supervised', '4.5 session is supervised');

// 4.6 createDispatchSession defaults to dry-run
resetStore();
var t4c = makeApprovedTicket();
var r4c = cd.createDispatchSession(t4c);
assertEqual(r4c.success, true, '4.6 create without mode succeeds');
assertEqual(r4c.session.executionMode, 'dry-run', '4.7 defaults to dry-run');

// 4.8 createDispatchSession with unapproved ticket
resetStore();
var t4d = makeApprovedTicket({ status: 'pending' });
var r4d = cd.createDispatchSession(t4d);
assertEqual(r4d.success, false, '4.8 create from pending ticket fails');
assertEqual(r4d.code, 'TICKET_NOT_APPROVED', '4.9 error code TICKET_NOT_APPROVED');

// 4.10 createDispatchSession with rejected ticket
var t4e = makeApprovedTicket({ status: 'rejected', approvalStatus: 'human-rejected' });
var r4e = cd.createDispatchSession(t4e);
assertEqual(r4e.success, false, '4.10 create from rejected ticket fails');

// 4.11 createDispatchSession with forbidden mode
var t4f = makeApprovedTicket();
var r4f = cd.createDispatchSession(t4f, { executionMode: 'live' });
assertEqual(r4f.success, false, '4.11 create with live mode fails');
assertEqual(r4f.code, 'FORBIDDEN_EXECUTION_MODE', '4.12 code FORBIDDEN_EXECUTION_MODE');

// 4.13 createDispatchSession with auto mode
var r4g = cd.createDispatchSession(makeApprovedTicket(), { executionMode: 'auto' });
assertEqual(r4g.success, false, '4.13 auto mode fails');

// 4.14 createDispatchSession with execute mode
var r4h = cd.createDispatchSession(makeApprovedTicket(), { executionMode: 'execute' });
assertEqual(r4h.success, false, '4.14 execute mode fails');

// 4.15 createDispatchSession duplicate ticket
resetStore();
var t4i = makeApprovedTicket();
cd.createDispatchSession(t4i, { executionMode: 'dry-run' });
var r4i = cd.createDispatchSession(t4i, { executionMode: 'dry-run' });
assertEqual(r4i.success, false, '4.15 duplicate ticket fails');
assertEqual(r4i.code, 'TICKET_ALREADY_DISPATCHED', '4.16 code TICKET_ALREADY_DISPATCHED');

// 4.17-4.20 Pipeline trace in session
resetStore();
var t4j = makeApprovedTicket({
  dispatchPlanId: 'plan_xyz_001',
  reviewId: 'review_xyz_001',
  draftId: 'draft_xyz_001',
  strategyId: 'strategy_xyz_001',
  goalId: 'goal_xyz_001'
});
var r4j = cd.createDispatchSession(t4j, { executionMode: 'dry-run' });
assertEqual(r4j.session.dispatchPlanId, 'plan_xyz_001', '4.17 dispatchPlanId traced');
assertEqual(r4j.session.reviewId, 'review_xyz_001', '4.18 reviewId traced');
assertEqual(r4j.session.draftId, 'draft_xyz_001', '4.19 draftId traced');
assertEqual(r4j.session.goalId, 'goal_xyz_001', '4.20 goalId traced');

// 4.21-4.25 createDispatchSessions batch
resetStore();
var tb1 = makeApprovedTicket();
var tb2 = makeApprovedTicket();
var rb = cd.createDispatchSessions([tb1, tb2], { executionMode: 'dry-run' });
assertEqual(rb.success, true, '4.21 batch create succeeds');
assertEqual(rb.sessions.length, 2, '4.22 2 sessions created');
assertEqual(rb.summary.success, 2, '4.23 summary success count 2');

// 4.24 batch with mixed approved/rejected
resetStore();
var rb2 = cd.createDispatchSessions([
  makeApprovedTicket(),
  makeApprovedTicket({ status: 'pending' })
]);
assertEqual(rb2.success, false, '4.24 mixed batch fails');
assertEqual(rb2.summary.success, 1, '4.25 1 succeeded, 1 failed');

// 4.26 batch empty
var rb3 = cd.createDispatchSessions([]);
assertEqual(rb3.success, false, '4.26 empty batch fails');

// 4.27-4.28 Capabilities in session
resetStore();
var t4k = makeApprovedTicket();
var r4k = cd.createDispatchSession(t4k, { capabilities: ['read', 'analyze'] });
assert(Array.isArray(r4k.session.capabilities), '4.27 capabilities is array');
assertEqual(r4k.session.capabilities.length, 2, '4.28 capabilities length 2');

// ============================================================================
// Section 5 — Session Lifecycle
// ============================================================================
section('Section 5 — Session Lifecycle');

resetStore();

// 5.1-5.3 startSession
var t5 = makeApprovedTicket();
var s5 = cd.createDispatchSession(t5, { executionMode: 'dry-run' });
assertEqual(s5.session.status, 'planned', '5.1 session starts planned');

var start = cd.startSession(s5.session.sessionId);
assertEqual(start.success, true, '5.2 startSession succeeds');
assertEqual(start.session.status, 'running', '5.3 status becomes running');

// 5.4 startSession already running
var start2 = cd.startSession(s5.session.sessionId);
assertEqual(start2.success, false, '5.4 cannot start already running session');

// 5.5 startSession non-existent
var start3 = cd.startSession('nonexistent');
assertEqual(start3.success, false, '5.5 start non-existent fails');

// 5.6-5.7 completeSession
var complete = cd.completeSession(s5.session.sessionId, { result: 'dry-run completed' });
assertEqual(complete.success, true, '5.6 completeSession succeeds');
assertEqual(complete.session.status, 'completed', '5.7 status becomes completed');

// 5.8 completeSession already completed
var complete2 = cd.completeSession(s5.session.sessionId);
assertEqual(complete2.success, false, '5.8 cannot complete already completed');

// 5.9 completeSession non-existent
var complete3 = cd.completeSession('nonexistent');
assertEqual(complete3.success, false, '5.9 complete non-existent fails');

// 5.10 dryRunResult stored
assert(complete.session.dryRunResult !== null, '5.10 dryRunResult stored');
assertEqual(complete.session.dryRunResult.result, 'dry-run completed', '5.11 dryRunResult correct');

// 5.12-5.14 failSession
resetStore();
var t5b = makeApprovedTicket();
var s5b = cd.createDispatchSession(t5b, { executionMode: 'dry-run' });
cd.startSession(s5b.session.sessionId);
var failResult = cd.failSession(s5b.session.sessionId, 'Test failure reason');
assertEqual(failResult.success, true, '5.12 failSession succeeds');
assertEqual(failResult.session.status, 'failed', '5.13 status becomes failed');
assert(failResult.session.dryRunResult.error.indexOf('Test failure') !== -1, '5.14 failure reason stored');

// 5.15 failSession from planned (invalid transition)
resetStore();
var t5c = makeApprovedTicket();
var s5c = cd.createDispatchSession(t5c, { executionMode: 'dry-run' });
var fail2 = cd.failSession(s5c.session.sessionId, 'cannot fail planned');
assertEqual(fail2.success, false, '5.15 cannot fail planned session');

// 5.16-5.18 cancelSession
resetStore();
var t5d = makeApprovedTicket();
var s5d = cd.createDispatchSession(t5d, { executionMode: 'dry-run' });
var cancel = cd.cancelSession(s5d.session.sessionId, 'No longer needed');
assertEqual(cancel.success, true, '5.16 cancelSession succeeds');
assertEqual(cancel.session.status, 'cancelled', '5.17 status becomes cancelled');

// 5.18 cancelSession already cancelled
var cancel2 = cd.cancelSession(s5d.session.sessionId, 'again');
assertEqual(cancel2.success, false, '5.18 cannot cancel already cancelled');

// 5.19 cancelSession non-existent
var cancel3 = cd.cancelSession('nonexistent', 'reason');
assertEqual(cancel3.success, false, '5.19 cancel non-existent fails');

// 5.20-5.22 Full lifecycle: planned→running→completed
resetStore();
var t5e = makeApprovedTicket();
var s5e = cd.createDispatchSession(t5e, { executionMode: 'dry-run' });
assertEqual(s5e.session.status, 'planned', '5.20 step 1: planned');
var st5e = cd.startSession(s5e.session.sessionId);
assertEqual(st5e.session.status, 'running', '5.21 step 2: running');
var cp5e = cd.completeSession(s5e.session.sessionId, { data: 'ok' });
assertEqual(cp5e.session.status, 'completed', '5.22 step 3: completed');

// ============================================================================
// Section 6 — Snapshot
// ============================================================================
section('Section 6 — Snapshot');

resetStore();

// 6.1 empty store snapshot
var snap1 = cd.generateSessionSnapshot();
assertEqual(snap1.totalSessions, 0, '6.1 empty snapshot total 0');

// 6.2-6.7 populated snapshot
var tickets = [];
for (var i = 0; i < 3; i++) {
  var t = makeApprovedTicket({ priority: i === 0 ? 'low' : i === 1 ? 'medium' : 'high' });
  tickets.push(t);
  var s = cd.createDispatchSession(t, { executionMode: i < 2 ? 'dry-run' : 'supervised' });
  if (i === 0) cd.startSession(s.session.sessionId);
  if (i === 0) cd.completeSession(s.session.sessionId, { ok: true });
}

var snap2 = cd.generateSessionSnapshot();
assertEqual(snap2.totalSessions, 3, '6.2 snapshot total 3');
assert(snap2.statusBreakdown.running !== undefined || snap2.statusBreakdown.planned !== undefined, '6.3 status breakdown exists');
assert(snap2.executionModeBreakdown['dry-run'] >= 2, '6.4 dry-run count >= 2');
assert(snap2.executionModeBreakdown['supervised'] >= 1, '6.5 supervised count >= 1');
assertEqual(typeof snap2.snapshotId, 'string', '6.6 snapshotId is string');
assertEqual(typeof snap2.pipelineSummary, 'object', '6.7 pipelineSummary exists');

// 6.8 pipeline summary has unique counts
assert(snap2.pipelineSummary.uniqueTickets >= 1, '6.8 uniqueTickets >= 1');

// 6.9-6.10 snapshot ID changes
var snap3 = cd.generateSessionSnapshot();
assertNotEqual(snap2.snapshotId, snap3.snapshotId, '6.9 snapshot IDs are unique');

// ============================================================================
// Section 7 — Malformed Storage
// ============================================================================
section('Section 7 — Malformed Storage');

resetStore();
cd.setStorePath(path.join(tmpDir, 'malformed_sessions.json'));

// 7.1 missing file returns empty
var l1 = cd.listSessions();
assertEqual(l1.length, 0, '7.1 missing file returns empty');

// 7.2 write malformed JSON
fs.writeFileSync(cd.getStorePath(), 'this is not valid json {', 'utf8');
var l2 = cd.listSessions();
assertEqual(l2.length, 0, '7.2 malformed JSON returns empty');

// 7.3 create after malformed file works
var t7 = makeApprovedTicket();
var r7 = cd.createDispatchSession(t7, { executionMode: 'dry-run' });
assertEqual(r7.success, true, '7.3 create works after malformed file');

// 7.4 empty object file
fs.writeFileSync(cd.getStorePath(), '{}', 'utf8');
var l4 = cd.listSessions();
assertEqual(l4.length, 0, '7.4 empty object returns empty');

// 7.5 valid JSON without sessions key
fs.writeFileSync(cd.getStorePath(), '{"other": "data"}', 'utf8');
var l5 = cd.listSessions();
assertEqual(l5.length, 0, '7.5 no sessions key returns empty');

// 7.6-7.7 restore normal operation
cd.setStorePath(tmpFile);
resetStore();
var t76 = makeApprovedTicket();
var r76 = cd.createDispatchSession(t76, { executionMode: 'dry-run' });
assertEqual(r76.success, true, '7.6 restore normal after malformed');
assertEqual(cd.getSessionCount(), 1, '7.7 count 1 after restore');

// ============================================================================
// Section 8 — Concurrency (Mutex)
// ============================================================================
section('Section 8 — Concurrency');

resetStore();
cd.setStorePath(path.join(tmpDir, 'concurrent_sessions.json'));

// 8.1 acquireLock
var lock1 = cd.acquireLock();
assertEqual(lock1, true, '8.1 acquireLock succeeds');

// 8.2 second lock fails (lock held)
var lock2 = cd.acquireLock();
assertEqual(lock2, false, '8.2 second acquireLock fails while held');

// 8.3 releaseLock
cd.releaseLock();

// 8.4 acquire after release
var lock3 = cd.acquireLock();
assertEqual(lock3, true, '8.4 acquireLock succeeds after release');
cd.releaseLock();

// 8.5 withLock works
var wlResult = null;
try {
  cd.withLock(function () {
    wlResult = 'executed';
  });
} catch (e) {
  // ignore
}
assertEqual(wlResult, 'executed', '8.5 withLock executes callback');

// 8.6-8.8 store operations use mutex
resetStore();
var t81 = makeApprovedTicket();
var r81;

try {
  r81 = cd.createDispatchSession(t81, { executionMode: 'dry-run' });
  assertEqual(r81.success, true, '8.6 store create with mutex succeeds');
} catch (e) {
  assert(false, '8.7 store create with mutex should not throw: ' + e.message);
}

// ============================================================================
// Section 9 — Safety Grep
// ============================================================================
section('Section 9 — Safety Grep');

// Source files to check
var sourceFiles = [
  'src/controlled-dispatch/controlled-dispatch-types.js',
  'src/controlled-dispatch/controlled-dispatch-validator.js',
  'src/controlled-dispatch/controlled-dispatch-store.js',
  'src/controlled-dispatch/controlled-dispatch-runtime.js',
  'src/controlled-dispatch/index.js'
];

var baseDir = path.join(__dirname, '..');

// Helper: strip comments AND string literals before grepping
function stripCommentsAndStrings(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'[^']*'/g, '""')
    .replace(/"[^"]*"/g, '""');
}

// Patterns that MUST NOT appear in code (after stripping comments/strings)
var forbiddenPatterns = [
  { name: 'child_process', pattern: /child_process/ },
  { name: 'exec(', pattern: /exec\s*\(/ },
  { name: 'execSync', pattern: /execSync/ },
  { name: 'spawn(', pattern: /spawn\s*\(/ },
  { name: 'spawnSync', pattern: /spawnSync/ },
  { name: 'pm2', pattern: /pm2/ },
  { name: 'deploy', pattern: /\bdeploy\b/ },
  { name: 'nginx', pattern: /nginx/ },
  { name: '.env', pattern: /\.env/ },
  { name: 'executeMission', pattern: /executeMission/ },
  { name: 'dispatchMission', pattern: /\bdispatchMission\b/ },
  { name: 'runWorkflow', pattern: /\brunWorkflow\b/ }
];

sourceFiles.forEach(function (relPath) {
  var fullPath = path.join(baseDir, relPath);
  var content;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch (e) {
    return; // File not found — skip
  }
  var stripped = stripCommentsAndStrings(content);

  forbiddenPatterns.forEach(function (fp) {
    var label = '9.sg ' + path.basename(relPath) + ':' + fp.name;
    var found = fp.pattern.test(stripped);
    assert(!found, label + ' NOT FOUND');
  });
});

// ============================================================================
// Section 10 — No Execution Guarantee
// ============================================================================
section('Section 10 — No Execution Guarantee');

// Patterns that indicate execution capability — MUST NOT appear in code
var executionPatterns = [
  { name: 'execute(', pattern: /\bexecute\s*\(/ },
  { name: 'dispatch(', pattern: /\bdispatch\s*\(/ },
  { name: 'runMission', pattern: /\brunMission\b/ },
  { name: 'startWorkflow', pattern: /\bstartWorkflow\b/ },
  { name: 'autoExecute', pattern: /\bautoExecute\b/ },
  { name: 'liveMode', pattern: /\bliveMode\b/ },
  { name: 'autoMode', pattern: /\bautoMode\b/ },
  { name: 'executeDirect', pattern: /\bexecuteDirect\b/ },
  { name: 'shellExec', pattern: /\bshellExec\b/ },
  { name: 'runCommand', pattern: /\brunCommand\b/ }
];

sourceFiles.forEach(function (relPath) {
  var fullPath = path.join(baseDir, relPath);
  var content;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch (e) {
    return;
  }
  var stripped = stripCommentsAndStrings(content);

  executionPatterns.forEach(function (ep) {
    var label = '10.ne ' + path.basename(relPath) + ':' + ep.name;
    var found = ep.pattern.test(stripped);
    assert(!found, label + ' NOT FOUND');
  });
});

// 10.ne-extra: verify runtime has no execute function
assertEqual(typeof cd.execute, 'undefined', '10.ne no execute() on index');
assertEqual(typeof cd.dispatch, 'undefined', '10.ne no dispatch() on index');
assertEqual(typeof cd.runMission, 'undefined', '10.ne no runMission() on index');
assertEqual(typeof cd.startWorkflow, 'undefined', '10.ne no startWorkflow() on index');

// ============================================================================
// Test Results
// ============================================================================
console.log('');
console.log('============================================================');
console.log('  TEST RESULTS');
console.log('============================================================');
console.log('  Total:  ' + (passed + failed) + ' tests');
console.log('  Passed: ' + passed + ' \u2713');
console.log('  Failed: ' + failed + ' \u2717');
console.log('============================================================');

if (failed > 0) {
  process.exit(1);
}
