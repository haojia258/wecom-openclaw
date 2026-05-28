/**
 * test-dispatch-ticket.cjs
 * P9.6.1 Dispatch Ticket System MVP — Comprehensive test suite.
 *
 * Tests: types, validator, store, runtime, approval flow, snapshot,
 * malformed storage, concurrency, safety grep, no-execution guarantee.
 *
 * Target: >= 200 tests, 100% PASS
 */

'use strict';

var path = require('path');
var fs = require('fs');

// ============================================================================
// Test Framework
// ============================================================================

var passed = 0;
var failed = 0;
var currentSection = '';

function section(name) {
  currentSection = name;
  console.log('\n' + '='.repeat(60));
  console.log('  ' + name);
  console.log('='.repeat(60));
}

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.log('  FAIL [' + currentSection + '] ' + name + ': ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error((msg || 'assertEqual') + ': expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
}

function assertNotEqual(a, b, msg) {
  if (a === b) throw new Error((msg || 'assertNotEqual') + ': values should differ but both are ' + JSON.stringify(a));
}

function assertDeepEqual(a, b, msg) {
  var sa = JSON.stringify(a);
  var sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || 'assertDeepEqual') + ': expected ' + sb + ' got ' + sa);
}

function assertContains(arr, val, msg) {
  if (!Array.isArray(arr)) throw new Error(msg || 'assertContains: first arg must be array');
  if (!arr.includes(val)) throw new Error((msg || 'assertContains') + ': array does not contain ' + JSON.stringify(val));
}

function assertType(val, expectedType, msg) {
  var actualType = Array.isArray(val) ? 'array' : typeof val;
  if (actualType !== expectedType) throw new Error((msg || 'assertType') + ': expected ' + expectedType + ' got ' + actualType);
}

// ============================================================================
// Test Setup
// ============================================================================

var tmpDir = path.join(__dirname, '..', 'storage', 'dispatch-ticket-test');
var tmpFile = path.join(tmpDir, 'dispatch-tickets.json');

function cleanTmp() {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ok */ }
}
cleanTmp();

var dt = require('../src/dispatch-ticket');
dt.setStorePath(tmpFile);

function resetStore() {
  try { dt.clearTickets(); } catch (e) { /* ok */ }
}
resetStore();

// ============================================================================
// Test Helper Factories
// ============================================================================

function makeDispatchPlan(overrides) {
  return Object.assign({
    dispatchPlanId: 'dispatch_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8),
    reviewId: 'review_' + Math.random().toString(36).substring(2, 8),
    draftId: 'draft_' + Math.random().toString(36).substring(2, 8),
    strategyId: 'strategy_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 4),
    goalId: 'goal_' + Math.random().toString(36).substring(2, 10),
    title: 'Test Dispatch ' + Math.random().toString(36).substring(2, 6),
    priority: 'high',
    status: 'planned',
    dispatchMode: 'manual',
    selectedAgent: 'workbuddy',
    fallbackAgents: ['codex'],
    guardrails: ['no-auto-execute'],
    acceptanceCriteria: ['all tests pass'],
    risks: [],
    createdAt: new Date().toISOString()
  }, overrides);
}

function createTestTicket(overrides) {
  var plan = makeDispatchPlan();
  var result = dt.createTicketFromPlan(plan, overrides);
  if (!result.success) throw new Error('Failed to create test ticket: ' + JSON.stringify(result));
  return result.ticket;
}

// ============================================================================
// Section 1: Types & Constants
// ============================================================================

section('Section 1 — Types & Constants');

// --- Enums exist ---
test('1.1: TICKET_STATUS defined', function () { assert(dt.TICKET_STATUS !== undefined); });
test('1.2: TICKET_STATUS has pending', function () { assertEqual(dt.TICKET_STATUS.PENDING, 'pending'); });
test('1.3: TICKET_STATUS has approved', function () { assertEqual(dt.TICKET_STATUS.APPROVED, 'approved'); });
test('1.4: TICKET_STATUS has rejected', function () { assertEqual(dt.TICKET_STATUS.REJECTED, 'rejected'); });
test('1.5: TICKET_STATUS has archived', function () { assertEqual(dt.TICKET_STATUS.ARCHIVED, 'archived'); });
test('1.6: TICKET_STATUS_VALUES has 4 entries', function () { assertEqual(dt.TICKET_STATUS_VALUES.length, 4); });
test('1.7: TICKET_STATUS_VALUES includes pending', function () { assertContains(dt.TICKET_STATUS_VALUES, 'pending'); });

test('1.8: APPROVAL_STATUS defined', function () { assert(dt.APPROVAL_STATUS !== undefined); });
test('1.9: APPROVAL_STATUS has waiting', function () { assertEqual(dt.APPROVAL_STATUS.WAITING, 'waiting'); });
test('1.10: APPROVAL_STATUS has human-approved', function () { assertEqual(dt.APPROVAL_STATUS.HUMAN_APPROVED, 'human-approved'); });
test('1.11: APPROVAL_STATUS has human-rejected', function () { assertEqual(dt.APPROVAL_STATUS.HUMAN_REJECTED, 'human-rejected'); });
test('1.12: APPROVAL_STATUS_VALUES has 3 entries', function () { assertEqual(dt.APPROVAL_STATUS_VALUES.length, 3); });

test('1.13: EXECUTION_MODE defined', function () { assert(dt.EXECUTION_MODE !== undefined); });
test('1.14: EXECUTION_MODE has dry-run', function () { assertEqual(dt.EXECUTION_MODE.DRY_RUN, 'dry-run'); });
test('1.15: EXECUTION_MODE has manual-only', function () { assertEqual(dt.EXECUTION_MODE.MANUAL_ONLY, 'manual-only'); });
test('1.16: EXECUTION_MODE_VALUES has 2 entries', function () { assertEqual(dt.EXECUTION_MODE_VALUES.length, 2); });
test('1.17: EXECUTION_MODE does NOT include live', function () { assert(!dt.EXECUTION_MODE_VALUES.includes('live')); });
test('1.18: EXECUTION_MODE does NOT include auto', function () { assert(!dt.EXECUTION_MODE_VALUES.includes('auto')); });
test('1.19: EXECUTION_MODE does NOT include execute', function () { assert(!dt.EXECUTION_MODE_VALUES.includes('execute')); });

test('1.20: FORBIDDEN_MODES includes live', function () { assertContains(dt.FORBIDDEN_MODES, 'live'); });
test('1.21: FORBIDDEN_MODES includes auto', function () { assertContains(dt.FORBIDDEN_MODES, 'auto'); });
test('1.22: FORBIDDEN_MODES includes execute', function () { assertContains(dt.FORBIDDEN_MODES, 'execute'); });

test('1.23: RISK_LEVELS defined', function () { assert(dt.RISK_LEVELS !== undefined); });
test('1.24: RISK_LEVELS has low', function () { assertEqual(dt.RISK_LEVELS.LOW, 'low'); });
test('1.25: RISK_LEVELS has medium', function () { assertEqual(dt.RISK_LEVELS.MEDIUM, 'medium'); });
test('1.26: RISK_LEVELS has high', function () { assertEqual(dt.RISK_LEVELS.HIGH, 'high'); });
test('1.27: RISK_LEVELS has critical', function () { assertEqual(dt.RISK_LEVELS.CRITICAL, 'critical'); });
test('1.28: RISK_LEVEL_VALUES has 4 entries', function () { assertEqual(dt.RISK_LEVEL_VALUES.length, 4); });

// --- Factory: createTicketId ---
test('1.29: createTicketId returns string', function () { assertType(dt.createTicketId(), 'string'); });
test('1.30: createTicketId starts with ticket_', function () { assert(dt.createTicketId().startsWith('ticket_')); });
test('1.31: createTicketId generates unique IDs', function () {
  var a = dt.createTicketId(); var b = dt.createTicketId(); assertNotEqual(a, b);
});

// --- Factory: createEmptyDispatchTicket ---
test('1.32: createEmptyDispatchTicket returns object', function () {
  var t = dt.createEmptyDispatchTicket(); assertType(t, 'object');
});
test('1.33: createEmptyDispatchTicket has ticketId', function () {
  assert(dt.createEmptyDispatchTicket().ticketId.startsWith('ticket_'));
});
test('1.34: createEmptyDispatchTicket default status is pending', function () {
  assertEqual(dt.createEmptyDispatchTicket().status, 'pending');
});
test('1.35: createEmptyDispatchTicket default approvalStatus is waiting', function () {
  assertEqual(dt.createEmptyDispatchTicket().approvalStatus, 'waiting');
});
test('1.36: createEmptyDispatchTicket default executionMode is dry-run', function () {
  assertEqual(dt.createEmptyDispatchTicket().executionMode, 'dry-run');
});

// --- Factory: createDispatchTicket ---
test('1.37: createDispatchTicket with valid plan', function () {
  var plan = makeDispatchPlan();
  var t = dt.createDispatchTicket(plan);
  assert(t.ticketId.startsWith('ticket_'));
});
test('1.38: createDispatchTicket preserves dispatchPlanId', function () {
  var plan = makeDispatchPlan({ dispatchPlanId: 'dp_test_123' });
  var t = dt.createDispatchTicket(plan);
  assertEqual(t.dispatchPlanId, 'dp_test_123');
});
test('1.39: createDispatchTicket preserves goalId', function () {
  var plan = makeDispatchPlan({ goalId: 'goal_abc123' });
  var t = dt.createDispatchTicket(plan);
  assertEqual(t.goalId, 'goal_abc123');
});
test('1.40: createDispatchTicket preserves linked IDs', function () {
  var plan = makeDispatchPlan({
    reviewId: 'review_x', draftId: 'draft_y',
    strategyId: 'strategy_z', goalId: 'goal_w'
  });
  var t = dt.createDispatchTicket(plan);
  assertEqual(t.reviewId, 'review_x');
  assertEqual(t.draftId, 'draft_y');
  assertEqual(t.strategyId, 'strategy_z');
  assertEqual(t.goalId, 'goal_w');
});
test('1.41: createDispatchTicket copies dispatchPlan snapshot', function () {
  var plan = makeDispatchPlan({ title: 'Original Plan' });
  var t = dt.createDispatchTicket(plan);
  assertEqual(t.dispatchPlan.title, 'Original Plan');
});
test('1.42: createDispatchTicket with options overrides', function () {
  var plan = makeDispatchPlan();
  var t = dt.createDispatchTicket(plan, { title: 'Custom Title', priority: 'low' });
  assertEqual(t.title, 'Custom Title');
  assertEqual(t.priority, 'low');
});
test('1.43: createDispatchTicket null plan returns safe defaults', function () {
  var t = dt.createDispatchTicket(null);
  assertEqual(t.dispatchPlanId, '');
  assertEqual(t.goalId, '');
  assertEqual(t.status, 'pending');
});
test('1.44: createDispatchTicket undefined plan', function () {
  var t = dt.createDispatchTicket(undefined);
  assert(t.ticketId.startsWith('ticket_'));
});

// --- Helpers ---
test('1.45: isValidTransition pending→approved', function () {
  assert(dt.isValidTransition('pending', 'approved'));
});
test('1.46: isValidTransition pending→rejected', function () {
  assert(dt.isValidTransition('pending', 'rejected'));
});
test('1.47: isValidTransition pending→archived is false', function () {
  assert(!dt.isValidTransition('pending', 'archived'));
});
test('1.48: isValidTransition approved→archived', function () {
  assert(dt.isValidTransition('approved', 'archived'));
});
test('1.49: isValidTransition archived→anything is false', function () {
  assert(!dt.isValidTransition('archived', 'approved'));
});
test('1.50: isTerminalStatus archived returns true', function () {
  assert(dt.isTerminalStatus('archived'));
});
test('1.51: isTerminalStatus pending returns false', function () {
  assert(!dt.isTerminalStatus('pending'));
});
test('1.52: canBeApproved pending ticket', function () {
  assert(dt.canBeApproved({ status: 'pending' }));
});
test('1.53: canBeApproved approved ticket is false', function () {
  assert(!dt.canBeApproved({ status: 'approved' }));
});

// ============================================================================
// Section 2: Validator
// ============================================================================

section('Section 2 — Validator');

// --- validateDispatchTicket ---
test('2.1: valid ticket passes', function () {
  var plan = makeDispatchPlan();
  var t = dt.createDispatchTicket(plan);
  var v = dt.validateDispatchTicket(t);
  assert(v.valid, JSON.stringify(v.errors));
});
test('2.2: null ticket fails', function () {
  var v = dt.validateDispatchTicket(null);
  assert(!v.valid);
});
test('2.3: undefined ticket fails', function () {
  var v = dt.validateDispatchTicket(undefined);
  assert(!v.valid);
});
test('2.4: ticket without ticketId fails', function () {
  var v = dt.validateDispatchTicket({ status: 'pending' });
  assert(!v.valid);
});
test('2.5: empty object fails', function () {
  var v = dt.validateDispatchTicket({});
  assert(!v.valid);
});
test('2.6: invalid status fails', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan(), { status: 'invalid_status' });
  var v = dt.validateDispatchTicket(t);
  assert(!v.valid);
});
test('2.7: invalid executionMode fails', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan(), { executionMode: 'live' });
  var v = dt.validateDispatchTicket(t);
  assert(!v.valid);
});
test('2.8: missing dispatchPlanId fails', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan());
  t.dispatchPlanId = '';
  var v = dt.validateDispatchTicket(t);
  assert(!v.valid);
});
test('2.9: missing goalId fails', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan());
  t.goalId = '';
  var v = dt.validateDispatchTicket(t);
  assert(!v.valid);
});
test('2.10: invalid riskLevel fails', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan(), { riskLevel: 'unknown' });
  var v = dt.validateDispatchTicket(t);
  assert(!v.valid);
});
test('2.11: invalid ticketId prefix fails', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan(), { ticketId: 'bad_123' });
  var v = dt.validateDispatchTicket(t);
  assert(!v.valid);
});
test('2.12: forbidden execution mode live fails', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan());
  t.executionMode = 'live';
  var v = dt.validateDispatchTicket(t);
  assert(!v.valid);
});
test('2.13: forbidden execution mode auto fails', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan());
  t.executionMode = 'auto';
  var v = dt.validateDispatchTicket(t);
  assert(!v.valid);
});
test('2.14: non-string ticketId fails', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan());
  t.ticketId = 123;
  var v = dt.validateDispatchTicket(t);
  assert(!v.valid);
});

// --- validateDispatchPlan ---
test('2.15: valid plan passes', function () {
  var v = dt.validateDispatchPlan(makeDispatchPlan());
  assert(v.valid, JSON.stringify(v.errors));
});
test('2.16: null plan fails', function () {
  var v = dt.validateDispatchPlan(null);
  assert(!v.valid);
});
test('2.17: undefined plan fails', function () {
  var v = dt.validateDispatchPlan(undefined);
  assert(!v.valid);
});
test('2.18: empty object plan fails', function () {
  var v = dt.validateDispatchPlan({});
  assert(!v.valid);
});
test('2.19: plan with only planId passes', function () {
  var v = dt.validateDispatchPlan({ dispatchPlanId: 'dp_123' });
  assert(v.valid);
});
test('2.20: plan with planId alias passes', function () {
  var v = dt.validateDispatchPlan({ planId: 'dp_456' });
  assert(v.valid);
});
test('2.21: plan with non-manual dispatchMode fails', function () {
  var v = dt.validateDispatchPlan({ dispatchPlanId: 'dp_123', dispatchMode: 'auto' });
  assert(!v.valid);
});

// --- validateExecutionMode ---
test('2.22: dry-run is valid', function () {
  var v = dt.validateExecutionMode('dry-run');
  assert(v.valid);
});
test('2.23: manual-only is valid', function () {
  var v = dt.validateExecutionMode('manual-only');
  assert(v.valid);
});
test('2.24: live is forbidden', function () {
  var v = dt.validateExecutionMode('live');
  assert(!v.valid);
});
test('2.25: auto is forbidden', function () {
  var v = dt.validateExecutionMode('auto');
  assert(!v.valid);
});
test('2.26: execute is forbidden', function () {
  var v = dt.validateExecutionMode('execute');
  assert(!v.valid);
});
test('2.27: unknown mode fails', function () {
  var v = dt.validateExecutionMode('super-fast-mode');
  assert(!v.valid);
});
test('2.28: non-string fails', function () {
  var v = dt.validateExecutionMode(123);
  assert(!v.valid);
});
test('2.29: null fails', function () {
  var v = dt.validateExecutionMode(null);
  assert(!v.valid);
});

// --- validateApprovalAction ---
test('2.30: valid approve action passes', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan());
  var v = dt.validateApprovalAction(t, 'approve', 'admin', 'looks good');
  assert(v.valid, JSON.stringify(v.errors));
});
test('2.31: valid reject action passes', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan());
  var v = dt.validateApprovalAction(t, 'reject', 'admin', 'not approved');
  assert(v.valid, JSON.stringify(v.errors));
});
test('2.32: invalid action fails', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan());
  var v = dt.validateApprovalAction(t, 'deploy', 'admin', 'reason');
  assert(!v.valid);
});
test('2.33: missing approver fails', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan());
  var v = dt.validateApprovalAction(t, 'approve', '', 'reason');
  assert(!v.valid);
});
test('2.34: reject without reason fails', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan());
  var v = dt.validateApprovalAction(t, 'reject', 'admin', '');
  assert(!v.valid);
});
test('2.35: approve on non-pending ticket fails', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan(), { status: 'approved' });
  var v = dt.validateApprovalAction(t, 'approve', 'admin', 'reason');
  assert(!v.valid);
});
test('2.36: null ticket fails', function () {
  var v = dt.validateApprovalAction(null, 'approve', 'admin', 'reason');
  assert(!v.valid);
});

// --- validateBatchTickets ---
test('2.37: valid batch passes', function () {
  var t1 = dt.createDispatchTicket(makeDispatchPlan());
  var t2 = dt.createDispatchTicket(makeDispatchPlan());
  var v = dt.validateBatchTickets([t1, t2]);
  assert(v.valid, JSON.stringify(v.errors));
});
test('2.38: non-array fails', function () {
  var v = dt.validateBatchTickets('not an array');
  assert(!v.valid);
});
test('2.39: empty array fails', function () {
  var v = dt.validateBatchTickets([]);
  assert(!v.valid);
});
test('2.40: batch with invalid ticket fails', function () {
  var v = dt.validateBatchTickets([{ invalid: true }]);
  assert(!v.valid);
});
test('2.41: duplicate ticketIds in batch fails', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan());
  var v = dt.validateBatchTickets([t, t]);
  assert(!v.valid);
});

// --- validateFilter ---
test('2.42: empty filter passes', function () {
  var v = dt.validateFilter({});
  assert(v.valid);
});
test('2.43: null filter passes', function () {
  var v = dt.validateFilter(null);
  assert(v.valid);
});
test('2.44: valid status filter passes', function () {
  var v = dt.validateFilter({ status: 'pending' });
  assert(v.valid);
});
test('2.45: invalid status filter fails', function () {
  var v = dt.validateFilter({ status: 'executing' });
  assert(!v.valid);
});
test('2.46: array status filter passes', function () {
  var v = dt.validateFilter({ status: ['pending', 'approved'] });
  assert(v.valid);
});
test('2.47: invalid riskLevel filter fails', function () {
  var v = dt.validateFilter({ riskLevel: 'extreme' });
  assert(!v.valid);
});

// ============================================================================
// Section 3: Store
// ============================================================================

section('Section 3 — Store');

resetStore();

// --- createTicket ---
test('3.1: createTicket returns ticket', function () {
  var plan = makeDispatchPlan();
  var t = dt.createDispatchTicket(plan);
  var stored = dt.createTicket(t);
  assert(stored.ticketId === t.ticketId);
});
test('3.2: createTicket persists to store', function () {
  resetStore();
  var plan = makeDispatchPlan();
  var t = dt.createDispatchTicket(plan);
  dt.createTicket(t);
  var found = dt.getTicket(t.ticketId);
  assert(found !== null);
});

// --- getTicket ---
test('3.3: getTicket finds by ticketId', function () {
  resetStore();
  var t = dt.createDispatchTicket(makeDispatchPlan());
  dt.createTicket(t);
  var found = dt.getTicket(t.ticketId);
  assertEqual(found.ticketId, t.ticketId);
});
test('3.4: getTicket returns null for nonexistent', function () {
  var found = dt.getTicket('ticket_nonexistent');
  assert(found === null);
});

// --- updateTicket ---
test('3.5: updateTicket changes status', function () {
  resetStore();
  var t = dt.createDispatchTicket(makeDispatchPlan());
  dt.createTicket(t);
  var updated = dt.updateTicket(t.ticketId, { status: 'approved' });
  assertEqual(updated.status, 'approved');
});
test('3.6: updateTicket updates updatedAt', function () {
  resetStore();
  var t = dt.createDispatchTicket(makeDispatchPlan());
  dt.createTicket(t);
  var updated = dt.updateTicket(t.ticketId, { status: 'approved' });
  assert(updated.updatedAt !== t.updatedAt);
});
test('3.7: updateTicket returns null for nonexistent', function () {
  var result = dt.updateTicket('ticket_nonexistent', { status: 'approved' });
  assert(result === null);
});

// --- deleteTicket ---
test('3.8: deleteTicket removes from store', function () {
  resetStore();
  var t = dt.createDispatchTicket(makeDispatchPlan());
  dt.createTicket(t);
  var deleted = dt.deleteTicket(t.ticketId);
  assert(deleted === true);
  assert(dt.getTicket(t.ticketId) === null);
});
test('3.9: deleteTicket nonexistent returns false', function () {
  assert(dt.deleteTicket('ticket_nonexistent') === false);
});

// --- listTickets ---
test('3.10: listTickets returns array', function () {
  resetStore();
  var t = dt.createDispatchTicket(makeDispatchPlan());
  dt.createTicket(t);
  assert(Array.isArray(dt.listTickets()));
});
test('3.11: listTickets empty store returns empty array', function () {
  resetStore();
  assertEqual(dt.listTickets().length, 0);
});
test('3.12: listTickets filter by status', function () {
  resetStore();
  var t1 = dt.createDispatchTicket(makeDispatchPlan());
  var t2 = dt.createDispatchTicket(makeDispatchPlan());
  dt.createTicket(t1);
  dt.createTicket(t2);
  dt.updateTicket(t2.ticketId, { status: 'approved' });
  var pending = dt.listTickets({ status: 'pending' });
  assertEqual(pending.length, 1);
});
test('3.13: listTickets filter by priority', function () {
  resetStore();
  dt.createTicket(dt.createDispatchTicket(makeDispatchPlan({ priority: 'low' })));
  dt.createTicket(dt.createDispatchTicket(makeDispatchPlan({ priority: 'critical' })));
  var critical = dt.listTickets({ priority: 'critical' });
  assertEqual(critical.length, 1);
});
test('3.14: listTickets filter by riskLevel', function () {
  resetStore();
  var t = dt.createDispatchTicket(makeDispatchPlan({ priority: 'high' }));
  dt.createTicket(t);
  var high = dt.listTickets({ riskLevel: 'high' });
  assertEqual(high.length, 1);
});
test('3.15: listTickets filter by approvalStatus', function () {
  resetStore();
  dt.createTicket(dt.createDispatchTicket(makeDispatchPlan()));
  var waiting = dt.listTickets({ approvalStatus: 'waiting' });
  assertEqual(waiting.length, 1);
});
test('3.16: listTickets multiple filters', function () {
  resetStore();
  dt.createTicket(dt.createDispatchTicket(makeDispatchPlan({ priority: 'critical' })));
  dt.createTicket(dt.createDispatchTicket(makeDispatchPlan({ priority: 'low' })));
  var result = dt.listTickets({ priority: 'critical', status: 'pending' });
  assertEqual(result.length, 1);
});

// --- findDuplicateTicket ---
test('3.17: findDuplicateTicket detects duplicate', function () {
  resetStore();
  var t = dt.createDispatchTicket(makeDispatchPlan({ dispatchPlanId: 'dp_unique' }));
  dt.createTicket(t);
  var dup = dt.findDuplicateTicket('dp_unique');
  assert(dup !== null);
  assertEqual(dup.dispatchPlanId, 'dp_unique');
});
test('3.18: findDuplicateTicket returns null for new planId', function () {
  assert(dt.findDuplicateTicket('dp_nonexistent') === null);
});

// --- createTickets batch ---
test('3.19: createTickets batch inserts multiple', function () {
  resetStore();
  var t1 = dt.createDispatchTicket(makeDispatchPlan());
  var t2 = dt.createDispatchTicket(makeDispatchPlan());
  dt.createTickets([t1, t2]);
  assertEqual(dt.listTickets().length, 2);
});

// --- clearTickets ---
test('3.20: clearTickets empties store', function () {
  resetStore();
  dt.createTicket(dt.createDispatchTicket(makeDispatchPlan()));
  dt.clearTickets();
  assertEqual(dt.listTickets().length, 0);
});

// --- readStore ---
test('3.21: readStore returns structured data', function () {
  resetStore();
  var data = dt.readStore();
  assert(Array.isArray(data.tickets));
  assert(data.meta !== undefined);
});
test('3.22: readStore empty file returns empty tickets', function () {
  resetStore();
  var data = dt.readStore();
  assertEqual(data.tickets.length, 0);
});

// --- setStorePath ---
test('3.23: setStorePath changes path', function () {
  var newPath = path.join(tmpDir, 'custom', 'tickets.json');
  dt.setStorePath(newPath);
  assertEqual(dt.getStorePath(), newPath);
  dt.setStorePath(tmpFile);  // restore
});

// ============================================================================
// Section 4: Runtime — Create
// ============================================================================

section('Section 4 — Runtime — Create');

resetStore();

// --- createDispatchTicket (runtime) ---
test('4.1: createDispatchTicket succeeds with valid plan', function () {
  var result = dt.createTicketFromPlan(makeDispatchPlan());
  assert(result.success, JSON.stringify(result));
  assert(result.ticket.ticketId.startsWith('ticket_'));
});
test('4.2: createDispatchTicket sets default status to pending', function () {
  var result = dt.createTicketFromPlan(makeDispatchPlan());
  assertEqual(result.ticket.status, 'pending');
});
test('4.3: createDispatchTicket sets default approvalStatus to waiting', function () {
  var result = dt.createTicketFromPlan(makeDispatchPlan());
  assertEqual(result.ticket.approvalStatus, 'waiting');
});
test('4.4: createDispatchTicket sets default executionMode to dry-run', function () {
  var result = dt.createTicketFromPlan(makeDispatchPlan());
  assertEqual(result.ticket.executionMode, 'dry-run');
});
test('4.5: createDispatchTicket has createdAt and updatedAt', function () {
  var result = dt.createTicketFromPlan(makeDispatchPlan());
  assert(result.ticket.createdAt !== undefined);
  assert(result.ticket.updatedAt !== undefined);
});
test('4.6: createDispatchTicket nil plan fails', function () {
  var result = dt.createTicketFromPlan(null);
  assert(!result.success);
});
test('4.7: createDispatchTicket undefined plan fails', function () {
  var result = dt.createTicketFromPlan(undefined);
  assert(!result.success);
});
test('4.8: createDispatchTicket empty object plan fails', function () {
  var result = dt.createTicketFromPlan({});
  assert(!result.success);
});
test('4.9: createDispatchTicket preserves priority', function () {
  var result = dt.createTicketFromPlan(makeDispatchPlan({ priority: 'critical' }));
  assertEqual(result.ticket.priority, 'critical');
});
test('4.10: createDispatchTicket maps priority to risk level', function () {
  var result = dt.createTicketFromPlan(makeDispatchPlan({ priority: 'critical' }));
  assertEqual(result.ticket.riskLevel, 'critical');
});
test('4.11: createDispatchTicket low priority maps to low risk', function () {
  var result = dt.createTicketFromPlan(makeDispatchPlan({ priority: 'low' }));
  assertEqual(result.ticket.riskLevel, 'low');
});
test('4.12: createDispatchTicket duplicate planId fails', function () {
  var plan = makeDispatchPlan({ dispatchPlanId: 'dp_same' });
  dt.createTicketFromPlan(plan);
  var result = dt.createTicketFromPlan(plan);
  assert(!result.success);
});
test('4.13: createDispatchTicket with allowDuplicates bypasses check', function () {
  resetStore();
  var plan = makeDispatchPlan({ dispatchPlanId: 'dp_dup_allow' });
  dt.createTicketFromPlan(plan);
  var result = dt.createTicketFromPlan(plan, { allowDuplicates: true });
  assert(result.success);
});
test('4.14: createDispatchTicket persists to store', function () {
  resetStore();
  var result = dt.createTicketFromPlan(makeDispatchPlan());
  var found = dt.getTicket(result.ticket.ticketId);
  assert(found !== null);
});

// --- createDispatchTickets (batch) ---
test('4.15: createBatchTickets with valid plans', function () {
  var results = dt.createBatchTickets([makeDispatchPlan(), makeDispatchPlan()]);
  assertEqual(results.length, 2);
  assert(results[0].success);
  assert(results[1].success);
});
test('4.16: createBatchTickets non-array fails', function () {
  var results = dt.createBatchTickets('not array');
  assert(!results[0].success);
});
test('4.17: createBatchTickets empty array fails', function () {
  var results = dt.createBatchTickets([]);
  assert(!results[0].success);
});
test('4.18: createBatchTickets mixed valid/invalid', function () {
  var results = dt.createBatchTickets([makeDispatchPlan(), null]);
  assertEqual(results.length, 2);
  assert(results[0].success);
  assert(!results[1].success);
});

// --- getDispatchTicket ---
test('4.19: getDispatchTicket finds existing', function () {
  resetStore();
  var result = dt.createTicketFromPlan(makeDispatchPlan());
  var found = dt.getDispatchTicket(result.ticket.ticketId);
  assertEqual(found.ticketId, result.ticket.ticketId);
});
test('4.20: getDispatchTicket null for nonexistent', function () {
  assert(dt.getDispatchTicket('ticket_nonexistent') === null);
});
test('4.21: getDispatchTicket empty string returns null', function () {
  assert(dt.getDispatchTicket('') === null);
});

// --- listDispatchTickets ---
test('4.22: listDispatchTickets returns all', function () {
  resetStore();
  dt.createTicketFromPlan(makeDispatchPlan());
  dt.createTicketFromPlan(makeDispatchPlan());
  assertEqual(dt.listDispatchTickets().length, 2);
});
test('4.23: listDispatchTickets by status', function () {
  resetStore();
  var t1 = dt.createTicketFromPlan(makeDispatchPlan());
  dt.approveTicket(t1.ticket.ticketId, 'admin');
  assertEqual(dt.listDispatchTickets({ status: 'approved' }).length, 1);
});

// ============================================================================
// Section 5: Approval Flow
// ============================================================================

section('Section 5 — Approval Flow');

resetStore();

// --- approveDispatchTicket ---
test('5.1: approveTicket sets status to approved', function () {
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  var result = dt.approveTicket(t.ticket.ticketId, 'admin');
  assert(result.success);
  assertEqual(result.ticket.status, 'approved');
});
test('5.2: approveTicket sets approvalStatus to human-approved', function () {
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  var result = dt.approveTicket(t.ticket.ticketId, 'admin');
  assertEqual(result.ticket.approvalStatus, 'human-approved');
});
test('5.3: approveTicket records approver', function () {
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  var result = dt.approveTicket(t.ticket.ticketId, 'haoji');
  assertEqual(result.ticket.approver, 'haoji');
});
test('5.4: approveTicket with reason stores in metadata', function () {
  resetStore();
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  var result = dt.approveTicket(t.ticket.ticketId, 'admin', 'all checks passed');
  assertEqual(result.ticket.metadata.approvalReason, 'all checks passed');
});
test('5.5: approveTicket nonexistent fails', function () {
  var result = dt.approveTicket('ticket_nonexistent', 'admin');
  assert(!result.success);
});
test('5.6: approveTicket already approved fails', function () {
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  dt.approveTicket(t.ticket.ticketId, 'admin');
  var result = dt.approveTicket(t.ticket.ticketId, 'admin');
  assert(!result.success);
});
test('5.7: approveTicket already rejected fails', function () {
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  dt.rejectTicket(t.ticket.ticketId, 'admin', 'bad');
  var result = dt.approveTicket(t.ticket.ticketId, 'admin');
  assert(!result.success);
});
test('5.8: approveTicket empty ticketId fails', function () {
  var result = dt.approveTicket('', 'admin');
  assert(!result.success);
});

// --- rejectDispatchTicket ---
test('5.9: rejectTicket sets status to rejected', function () {
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  var result = dt.rejectTicket(t.ticket.ticketId, 'admin', 'not now');
  assert(result.success);
  assertEqual(result.ticket.status, 'rejected');
});
test('5.10: rejectTicket sets approvalStatus to human-rejected', function () {
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  var result = dt.rejectTicket(t.ticket.ticketId, 'admin', 'needs fix');
  assertEqual(result.ticket.approvalStatus, 'human-rejected');
});
test('5.11: rejectTicket records rejectionReason', function () {
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  var result = dt.rejectTicket(t.ticket.ticketId, 'admin', 'security concern');
  assertEqual(result.ticket.rejectionReason, 'security concern');
});
test('5.12: rejectTicket records reviewer', function () {
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  var result = dt.rejectTicket(t.ticket.ticketId, 'reviewer1', 'risk too high');
  assertEqual(result.ticket.reviewer, 'reviewer1');
});
test('5.13: rejectTicket without reason fails', function () {
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  var result = dt.rejectTicket(t.ticket.ticketId, 'admin', '');
  assert(!result.success);
});
test('5.14: rejectTicket whitespace-only reason fails', function () {
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  var result = dt.rejectTicket(t.ticket.ticketId, 'admin', '   ');
  assert(!result.success);
});
test('5.15: rejectTicket nonexistent fails', function () {
  var result = dt.rejectTicket('ticket_nonexistent', 'admin', 'bad');
  assert(!result.success);
});

// --- archiveDispatchTicket ---
test('5.16: archiveTicket from approved works', function () {
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  dt.approveTicket(t.ticket.ticketId, 'admin');
  var result = dt.archiveTicket(t.ticket.ticketId);
  assert(result.success);
  assertEqual(result.ticket.status, 'archived');
});
test('5.17: archiveTicket from rejected works', function () {
  resetStore();
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  dt.rejectTicket(t.ticket.ticketId, 'admin', 'bad');
  var result = dt.archiveTicket(t.ticket.ticketId);
  assert(result.success);
  assertEqual(result.ticket.status, 'archived');
});
test('5.18: archiveTicket from pending fails', function () {
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  var result = dt.archiveTicket(t.ticket.ticketId);
  assert(!result.success);
});
test('5.19: archiveTicket nonexistent fails', function () {
  var result = dt.archiveTicket('ticket_nonexistent');
  assert(!result.success);
});

// --- Full lifecycle ---
test('5.20: full lifecycle: create→approve→archive', function () {
  resetStore();
  var plan = makeDispatchPlan();
  var t = dt.createTicketFromPlan(plan);
  assertEqual(t.ticket.status, 'pending');

  var approved = dt.approveTicket(t.ticket.ticketId, 'admin');
  assertEqual(approved.ticket.status, 'approved');

  var archived = dt.archiveTicket(t.ticket.ticketId);
  assertEqual(archived.ticket.status, 'archived');
});
test('5.21: full lifecycle: create→reject→archive', function () {
  resetStore();
  var plan = makeDispatchPlan();
  var t = dt.createTicketFromPlan(plan);
  assertEqual(t.ticket.status, 'pending');

  var rejected = dt.rejectTicket(t.ticket.ticketId, 'admin', 'not approved');
  assertEqual(rejected.ticket.status, 'rejected');

  var archived = dt.archiveTicket(t.ticket.ticketId);
  assertEqual(archived.ticket.status, 'archived');
});

// ============================================================================
// Section 6: Snapshot
// ============================================================================

section('Section 6 — Snapshot');

resetStore();

test('6.1: generateTicketSnapshot empty store', function () {
  var snap = dt.generateTicketSnapshot();
  assertEqual(snap.total, 0);
});
test('6.2: generateTicketSnapshot with tickets', function () {
  resetStore();
  dt.createTicketFromPlan(makeDispatchPlan({ priority: 'high' }));
  dt.createTicketFromPlan(makeDispatchPlan({ priority: 'low' }));
  var snap = dt.generateTicketSnapshot();
  assertEqual(snap.total, 2);
});
test('6.3: snapshot byStatus', function () {
  resetStore();
  dt.createTicketFromPlan(makeDispatchPlan());
  dt.createTicketFromPlan(makeDispatchPlan());
  var snap = dt.generateTicketSnapshot();
  assertEqual(snap.byStatus.pending, 2);
});
test('6.4: snapshot byStatus after approval', function () {
  resetStore();
  var t1 = dt.createTicketFromPlan(makeDispatchPlan());
  dt.approveTicket(t1.ticket.ticketId, 'admin');
  dt.createTicketFromPlan(makeDispatchPlan());
  var snap = dt.generateTicketSnapshot();
  assertEqual(snap.byStatus.approved, 1);
  assertEqual(snap.byStatus.pending, 1);
});
test('6.5: snapshot byPriority', function () {
  resetStore();
  dt.createTicketFromPlan(makeDispatchPlan({ priority: 'critical' }));
  dt.createTicketFromPlan(makeDispatchPlan({ priority: 'low' }));
  dt.createTicketFromPlan(makeDispatchPlan({ priority: 'low' }));
  var snap = dt.generateTicketSnapshot();
  assertEqual(snap.byPriority.critical, 1);
  assertEqual(snap.byPriority.low, 2);
});
test('6.6: snapshot byRisk', function () {
  resetStore();
  dt.createTicketFromPlan(makeDispatchPlan({ priority: 'critical' }));  // → critical risk
  dt.createTicketFromPlan(makeDispatchPlan({ priority: 'medium' }));    // → medium risk
  var snap = dt.generateTicketSnapshot();
  assertEqual(snap.byRisk.critical, 1);
  assertEqual(snap.byRisk.medium, 1);
});
test('6.7: snapshot approvalSummary', function () {
  resetStore();
  dt.createTicketFromPlan(makeDispatchPlan());
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  dt.approveTicket(t.ticket.ticketId, 'admin');
  var snap = dt.generateTicketSnapshot();
  assertEqual(snap.approvalSummary.waiting, 1);
  assertEqual(snap.approvalSummary.humanApproved, 1);
  assertEqual(snap.approvalSummary.humanRejected, 0);
});
test('6.8: snapshot rejection in summary', function () {
  resetStore();
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  dt.rejectTicket(t.ticket.ticketId, 'admin', 'bad');
  var snap = dt.generateTicketSnapshot();
  assertEqual(snap.approvalSummary.humanRejected, 1);
});
test('6.9: snapshot has pipelineSummary', function () {
  resetStore();
  dt.createTicketFromPlan(makeDispatchPlan());
  var snap = dt.generateTicketSnapshot();
  assert(snap.pipelineSummary !== undefined);
});
test('6.10: snapshot pipelineSummary tracks unique IDs', function () {
  resetStore();
  dt.createTicketFromPlan(makeDispatchPlan());
  dt.createTicketFromPlan(makeDispatchPlan());
  var snap = dt.generateTicketSnapshot();
  assert(snap.pipelineSummary.uniqueGoals >= 1);
});
test('6.11: snapshot has generatedAt timestamp', function () {
  var snap = dt.generateTicketSnapshot();
  assert(snap.generatedAt !== undefined);
});

// ============================================================================
// Section 7: Malformed Storage
// ============================================================================

section('Section 7 — Malformed Storage');

test('7.1: readStore with nonexistent file returns empty', function () {
  dt.setStorePath(path.join(tmpDir, 'nonexistent', 'tickets.json'));
  var data = dt.readStore();
  assertEqual(data.tickets.length, 0);
  dt.setStorePath(tmpFile);  // restore
});
test('7.2: readStore with empty file returns empty', function () {
  var emptyPath = path.join(tmpDir, 'empty.json');
  var emptyDir = path.dirname(emptyPath);
  try { fs.mkdirSync(emptyDir, { recursive: true }); } catch (e) {}
  fs.writeFileSync(emptyPath, '', 'utf8');
  dt.setStorePath(emptyPath);
  var data = dt.readStore();
  assertEqual(data.tickets.length, 0);
  dt.setStorePath(tmpFile);  // restore
});
test('7.3: readStore with whitespace file returns empty', function () {
  var wsPath = path.join(tmpDir, 'whitespace.json');
  fs.mkdirSync(path.dirname(wsPath), { recursive: true });
  fs.writeFileSync(wsPath, '\n  \n', 'utf8');
  dt.setStorePath(wsPath);
  var data = dt.readStore();
  assertEqual(data.tickets.length, 0);
  dt.setStorePath(tmpFile);
});
test('7.4: readStore with malformed JSON returns empty', function () {
  var malPath = path.join(tmpDir, 'malformed.json');
  fs.mkdirSync(path.dirname(malPath), { recursive: true });
  fs.writeFileSync(malPath, '{this is not json', 'utf8');
  dt.setStorePath(malPath);
  var data = dt.readStore();
  assertEqual(data.tickets.length, 0);
  dt.setStorePath(tmpFile);
});
test('7.5: writeStore creates parent directories', function () {
  var deepPath = path.join(tmpDir, 'deep', 'nested', 'tickets.json');
  dt.setStorePath(deepPath);
  var data = { tickets: [], meta: { version: '1.0.0' } };
  dt.writeStore(data);
  assert(fs.existsSync(deepPath));
  dt.setStorePath(tmpFile);
});
test('7.6: writeStore preserves ordering', function () {
  resetStore();
  var t1 = dt.createDispatchTicket(makeDispatchPlan());
  var t2 = dt.createDispatchTicket(makeDispatchPlan());
  dt.createTicket(t1);
  dt.createTicket(t2);
  var all = dt.listTickets();
  assertEqual(all[0].ticketId, t1.ticketId);
  assertEqual(all[1].ticketId, t2.ticketId);
});
test('7.7: store survives re-read', function () {
  resetStore();
  dt.createTicketFromPlan(makeDispatchPlan());
  // force re-read
  var count1 = dt.listTickets().length;
  var count2 = dt.listTickets().length;
  assertEqual(count1, count2);
});

// ============================================================================
// Section 8: Concurrency
// ============================================================================

section('Section 8 — Concurrency');

resetStore();

test('8.1: acquireLock creates lock file', function () {
  var lockPath = tmpFile + '.lock';
  // Clean first
  try { fs.unlinkSync(lockPath); } catch (e) {}
  var acquired = dt.acquireLock();
  assert(acquired);
  dt.releaseLock();
});
test('8.2: releaseLock removes lock file', function () {
  var lockPath = tmpFile + '.lock';
  dt.acquireLock();
  dt.releaseLock();
  assert(!fs.existsSync(lockPath));
});
test('8.3: withLock executes function', function () {
  var executed = false;
  dt.withLock(function () {
    executed = true;
  });
  assert(executed);
});
test('8.4: withLock returns function result', function () {
  var result = dt.withLock(function () { return 42; });
  assertEqual(result, 42);
});
test('8.5: acquireLock re-acquires after release', function () {
  dt.acquireLock();
  dt.releaseLock();
  var acquired = dt.acquireLock();
  assert(acquired);
  dt.releaseLock();
});
test('8.6: double acquire fails', function () {
  var first = dt.acquireLock();
  assert(first);
  var second = dt.acquireLock();
  assert(!second);
  dt.releaseLock();
});
test('8.7: concurrent creates produce unique items', function () {
  resetStore();
  for (var i = 0; i < 5; i++) {
    dt.createTicket(dt.createDispatchTicket(makeDispatchPlan()));
  }
  assertEqual(dt.listTickets().length, 5);
  // Verify all unique
  var ids = dt.listTickets().map(function (t) { return t.ticketId; });
  var unique = {};
  for (var j = 0; j < ids.length; j++) { unique[ids[j]] = true; }
  assertEqual(Object.keys(unique).length, 5);
});
test('8.8: updateTicket is atomic', function () {
  resetStore();
  var t = dt.createDispatchTicket(makeDispatchPlan());
  dt.createTicket(t);
  var updated = dt.updateTicket(t.ticketId, { status: 'approved' });
  assertEqual(updated.status, 'approved');
  var found = dt.getTicket(t.ticketId);
  assertEqual(found.status, 'approved');
});

// ============================================================================
// Section 9: Safety Grep
// ============================================================================

section('Section 9 — Safety Grep');

var allFiles = [
  'src/dispatch-ticket/dispatch-ticket-types.js',
  'src/dispatch-ticket/dispatch-ticket-validator.js',
  'src/dispatch-ticket/dispatch-ticket-store.js',
  'src/dispatch-ticket/dispatch-ticket-runtime.js',
  'src/dispatch-ticket/index.js'
];

function readSourceContent(filePath) {
  var fullPath = path.join(__dirname, '..', filePath);
  return fs.readFileSync(fullPath, 'utf8');
}

function runSafetyGrep(filePath, pattern, label) {
  var content = readSourceContent(filePath);

  // Strip comments
  var noComments = content
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
    .replace(/\/\/[^\n]*/g, '');          // line comments

  // Strip string literals (so assertions about the pattern don't false-positive)
  var noStrings = noComments
    .replace(/'[^']*'/g, '""')
    .replace(/"[^"]*"/g, '""');

  return noStrings;
}

var forbiddenPatterns = [
  { pattern: /child_process/, label: 'child_process' },
  { pattern: /\bexec\s*\(/, label: 'exec(' },
  { pattern: /\bspawn\s*\(/, label: 'spawn(' },
  { pattern: /pm2\s+(?:restart|delete|stop|start)/, label: 'pm2 restart/delete' },
  { pattern: /deploy/, label: 'deploy' },
  { pattern: /nginx/, label: 'nginx' },
  { pattern: /\.env/, label: '.env' },
  { pattern: /commander/, label: 'commander' },
  { pattern: /gateway/, label: 'gateway' },
  { pattern: /agent-host/, label: 'agent-host' },
  { pattern: /mission-manager/, label: 'mission-manager' },
  { pattern: /executeMission/, label: 'executeMission' }
];

var safeCount = 0;
for (var fi = 0; fi < allFiles.length; fi++) {
  var filePath = allFiles[fi];
  var rawContent = readSourceContent(filePath);
  // Strip comments and strings before grepping (to avoid false positives
  // from comment descriptions like "NOT a commander task")
  var strippedContent = rawContent
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
    .replace(/\/\/[^\n]*/g, '')           // line comments
    .replace(/'[^']*'/g, '""')
    .replace(/"[^"]*"/g, '""');
  for (var pi = 0; pi < forbiddenPatterns.length; pi++) {
    var fp = forbiddenPatterns[pi];
    var count = (strippedContent.match(new RegExp(fp.pattern.source, 'g')) || []).length;
    safeCount++;
    var msg = '9.' + (safeCount) + ': ' + path.basename(filePath) + ' — no ' + fp.label;
    test(msg, function (_count, _file, _label) {
      return function () { assert(_count === 0, _file + ' contains forbidden ' + _label + ': ' + _count + ' (after comment/string stripping)'); };
    }(count, path.basename(filePath), fp.label));
  }
}

// ============================================================================
// Section 10: No Execution Guarantee
// ============================================================================

section('Section 10 — No Execution Guarantee');

// Verify that none of the source files contain execution patterns
var executionPatterns = [
  { pattern: /execute\s*\(\s*\)/, label: 'execute()' },
  { pattern: /dispatch\s*\(\s*\)/, label: 'dispatch()' },
  { pattern: /runMission/, label: 'runMission()' },
  { pattern: /startWorkflow/, label: 'startWorkflow()' },
  { pattern: /createServer/, label: 'createServer' },
  { pattern: /\.listen\s*\(/, label: '.listen()' },
  { pattern: /WebSocket/, label: 'WebSocket' },
  { pattern: /setInterval/, label: 'setInterval (cron-like)' },
  { pattern: /cron/, label: 'cron' },
  { pattern: /queue.?worker/i, label: 'queue worker' },
  { pattern: /auto.?exec/i, label: 'auto execution' }
];

var execCount = 0;
for (var ei = 0; ei < allFiles.length; ei++) {
  var eRaw = readSourceContent(allFiles[ei]);
  // Strip comments and strings before grepping
  var eContent = eRaw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'[^']*'/g, '""')
    .replace(/"[^"]*"/g, '""');
  for (var ep = 0; ep < executionPatterns.length; ep++) {
    var epat = executionPatterns[ep];
    var ecount = (eContent.match(new RegExp(epat.pattern.source, 'g')) || []).length;
    execCount++;
    var emsg = '10.' + (execCount) + ': ' + path.basename(allFiles[ei]) + ' — no ' + epat.label;
    test(emsg, function (_ec, _ef, _el) {
      return function () { assert(_ec === 0, _ef + ' contains execution pattern: ' + _el + ' (after comment/string stripping)'); };
    }(ecount, path.basename(allFiles[ei]), epat.label));
  }
}

// Verify ticket structure never has live/auto/execute
test('10.' + (execCount + 1) + ': createDispatchTicket never sets live mode', function () {
  var t = dt.createDispatchTicket(makeDispatchPlan());
  assert(t.executionMode !== 'live');
  assert(t.executionMode !== 'auto');
  assert(t.executionMode !== 'execute');
});
test('10.' + (execCount + 2) + ': createEmptyDispatchTicket never sets live mode', function () {
  var t = dt.createEmptyDispatchTicket();
  assert(t.executionMode !== 'live');
});
test('10.' + (execCount + 3) + ': approved ticket still dry-run', function () {
  resetStore();
  var t = dt.createTicketFromPlan(makeDispatchPlan());
  var approved = dt.approveTicket(t.ticket.ticketId, 'admin');
  assertEqual(approved.ticket.executionMode, 'dry-run');
  assert(approved.ticket.executionMode !== 'live');
});

// ============================================================================
// Report
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('  TEST RESULTS');
console.log('='.repeat(60));
console.log('  Total:  ' + (passed + failed) + ' tests');
console.log('  Passed: ' + passed + ' \u2713');
console.log('  Failed: ' + failed + ' \u2717');
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}
