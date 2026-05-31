/**
 * test-approval-gate.cjs
 * P9.6.3 Approval Gate — Comprehensive test suite.
 *
 * Self-contained test framework. Tests all modules:
 *   types → validator → store → runtime → safety grep → no-exec guarantee
 *
 * ── Security Disclaimer ──
 * NO shell, NO exec, NO pm2, NO deploy, NO nginx, NO .env, NO auto-approval.
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
var failures = [];
var currentSection = '';

function section(name) {
  currentSection = name;
  passed = 0;
  failed = 0;
  failures = [];
  console.log('\n' + '='.repeat(60));
  console.log('  ' + name);
  console.log('='.repeat(60));
}

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; failures.push({ section: currentSection, msg: msg }); console.log('  FAIL: ' + msg); }
}

function assertEqual(actual, expected, msg) {
  if (actual === expected) { passed++; }
  else { failed++; failures.push({ section: currentSection, msg: msg + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')' }); console.log('  FAIL: ' + msg + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

function assertNotEqual(actual, expected, msg) {
  if (actual !== expected) { passed++; }
  else { failed++; failures.push({ section: currentSection, msg: msg }); console.log('  FAIL: ' + msg); }
}

function assertDeepEqual(actual, expected, msg) {
  var a = JSON.stringify(actual);
  var b = JSON.stringify(expected);
  if (a === b) { passed++; }
  else { failed++; failures.push({ section: currentSection, msg: msg }); console.log('  FAIL: ' + msg + ' — expected ' + b + ', got ' + a); }
}

function assertContains(haystack, needle, msg) {
  if (haystack && haystack.indexOf(needle) !== -1) { passed++; }
  else { failed++; failures.push({ section: currentSection, msg: msg }); console.log('  FAIL: ' + msg); }
}

function assertType(val, expectedType, msg) {
  if (typeof val === expectedType) { passed++; }
  else { failed++; failures.push({ section: currentSection, msg: msg + ' (expected ' + expectedType + ', got ' + typeof val + ')' }); console.log('  FAIL: ' + msg); }
}

function summary() {
  var total = passed + failed;
  console.log('\n  ' + '-'.repeat(50));
  console.log('  Section: ' + currentSection);
  console.log('  Tests:  ' + total + ' | Passed: ' + passed + ' | Failed: ' + failed);
  console.log('  ' + '-'.repeat(50));
  if (failures.length > 0) {
    console.log('  Failures:');
    failures.forEach(function (f) { console.log('    - [' + f.section + '] ' + f.msg); });
  }
  return { passed: passed, failed: failed, total: total };
}

// ============================================================================
// Setup
// ============================================================================
var tmpDir = path.join(os.tmpdir(), 'test-approval-gate-' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
var tmpFile = path.join(tmpDir, 'approvals.json');

var ag = require('../src/approval-gate/index');
ag.setStorePath(tmpFile);

function resetStore() {
  try {
    ag.clearAllApprovals();
  } catch (e) {
    // May fail if store not initialized — that's ok
  }
  ag.setStorePath(tmpFile);
}

function makePlannedSession(overrides) {
  var base = {
    sessionId: 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
    ticketId: 'ticket_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    title: 'Test Session',
    type: 'operations',
    priority: 'medium',
    status: 'planned',
    executionMode: 'dry-run',
    safetyLevel: 'medium',
    dispatchPlanId: 'plan_test_001',
    reviewId: 'review_test_001',
    draftId: 'draft_test_001',
    strategyId: 'strategy_test_001',
    goalId: 'goal_test_001'
  };
  if (overrides) {
    Object.keys(overrides).forEach(function (k) { base[k] = overrides[k]; });
  }
  return base;
}

var totalPassed = 0;
var totalFailed = 0;

// ============================================================================
// Section 1: Type Definitions & Constants
// ============================================================================
section('1. Type Definitions & Constants');

assert(ag.APPROVAL_STATUS !== undefined, 'APPROVAL_STATUS is defined');
assertEqual(ag.APPROVAL_STATUS.PENDING, 'pending', 'PENDING equals pending');
assertEqual(ag.APPROVAL_STATUS.APPROVED, 'approved', 'APPROVED equals approved');
assertEqual(ag.APPROVAL_STATUS.REJECTED, 'rejected', 'REJECTED equals rejected');
assertEqual(ag.APPROVAL_STATUS.ARCHIVED, 'archived', 'ARCHIVED equals archived');

assert(ag.APPROVAL_STATUS_VALUES !== undefined, 'APPROVAL_STATUS_VALUES is defined');
assertEqual(ag.APPROVAL_STATUS_VALUES.length, 4, '4 status values');
assertContains(ag.APPROVAL_STATUS_VALUES, 'pending', 'VALUES contains pending');
assertContains(ag.APPROVAL_STATUS_VALUES, 'approved', 'VALUES contains approved');
assertContains(ag.APPROVAL_STATUS_VALUES, 'rejected', 'VALUES contains rejected');
assertContains(ag.APPROVAL_STATUS_VALUES, 'archived', 'VALUES contains archived');

assert(ag.APPROVAL_DECISION !== undefined, 'APPROVAL_DECISION is defined');
assertEqual(ag.APPROVAL_DECISION.APPROVE, 'approve', 'APPROVE equals approve');
assertEqual(ag.APPROVAL_DECISION.REJECT, 'reject', 'REJECT equals reject');
assertEqual(ag.APPROVAL_DECISION.ARCHIVE, 'archive', 'ARCHIVE equals archive');

assertEqual(ag.APPROVAL_DECISION_VALUES.length, 3, '3 decision values');

assert(ag.ALLOWED_APPROVAL_TRANSITIONS !== undefined, 'ALLOWED_APPROVAL_TRANSITIONS is defined');
assert(Array.isArray(ag.ALLOWED_APPROVAL_TRANSITIONS.pending), 'pending has transitions');
assertContains(ag.ALLOWED_APPROVAL_TRANSITIONS.pending, 'approved', 'pending → approved');
assertContains(ag.ALLOWED_APPROVAL_TRANSITIONS.pending, 'rejected', 'pending → rejected');
assertContains(ag.ALLOWED_APPROVAL_TRANSITIONS.pending, 'archived', 'pending → archived');
assert(Array.isArray(ag.ALLOWED_APPROVAL_TRANSITIONS.approved), 'approved has transitions');
assertContains(ag.ALLOWED_APPROVAL_TRANSITIONS.approved, 'archived', 'approved → archived');
assert(Array.isArray(ag.ALLOWED_APPROVAL_TRANSITIONS.rejected), 'rejected has transitions');
assertContains(ag.ALLOWED_APPROVAL_TRANSITIONS.rejected, 'archived', 'rejected → archived');
assertContains(ag.ALLOWED_APPROVAL_TRANSITIONS.rejected, 'pending', 'rejected → pending (resubmit)');
assertEqual(ag.ALLOWED_APPROVAL_TRANSITIONS.archived.length, 0, 'archived has no transitions');

assert(ag.APPROVAL_ERROR_CODES !== undefined, 'APPROVAL_ERROR_CODES is defined');
assert(ag.APPROVAL_ERROR_CODES.INVALID_APPROVAL_ID, 'INVALID_APPROVAL_ID exists');
assert(ag.APPROVAL_ERROR_CODES.DUPLICATE_APPROVAL, 'DUPLICATE_APPROVAL exists');
assert(ag.APPROVAL_ERROR_CODES.APPROVAL_NOT_FOUND, 'APPROVAL_NOT_FOUND exists');

assert(ag.REVIEWER_ROLE !== undefined, 'REVIEWER_ROLE is defined');
assertEqual(ag.REVIEWER_ROLE.HUMAN, 'human', 'HUMAN role');
assertEqual(ag.REVIEWER_ROLE.MANAGER, 'manager', 'MANAGER role');
assertEqual(ag.REVIEWER_ROLE.ADMIN, 'admin', 'ADMIN role');

assert(ag.PRIORITY_REVIEWER_MAP !== undefined, 'PRIORITY_REVIEWER_MAP is defined');
assertEqual(ag.PRIORITY_REVIEWER_MAP.low, 'human', 'low → human');
assertEqual(ag.PRIORITY_REVIEWER_MAP.critical, 'admin', 'critical → admin');

var s1 = summary();
totalPassed += s1.passed;
totalFailed += s1.failed;

// ============================================================================
// Section 2: Factory Functions
// ============================================================================
section('2. Factory Functions');

// createApprovalId
var aid1 = ag.createApprovalId();
assertType(aid1, 'string', 'createApprovalId returns string');
assertContains(aid1, 'approval_', 'approvalId starts with approval_');
var aid2 = ag.createApprovalId();
assertNotEqual(aid1, aid2, 'each approvalId is unique');

// createApprovalRecordObj
var session = makePlannedSession({ title: 'Test Approval Session', priority: 'high' });
var record = ag.createApprovalRecordObj(session);
assert(record !== undefined, 'createApprovalRecordObj returns object');
assertType(record.approvalId, 'string', 'has approvalId');
assertContains(record.approvalId, 'approval_', 'approvalId format correct');
assertEqual(record.sessionId, session.sessionId, 'sessionId matches');
assertEqual(record.ticketId, session.ticketId, 'ticketId matches');
assertEqual(record.title, 'Test Approval Session', 'title matches');
assertEqual(record.status, 'pending', 'status is pending');
assertEqual(record.priority, 'high', 'priority is high');
assertEqual(record.requiredReviewerRole, 'manager', 'high priority requires manager');
assertEqual(record.decision, null, 'decision is null initially');
assertEqual(record.decisionReason, null, 'decisionReason is null');
assertEqual(record.decisionAt, null, 'decisionAt is null');
assertEqual(record.reviewer, null, 'reviewer is null initially');

// Pipeline trace
assertEqual(record.dispatchPlanId, 'plan_test_001', 'dispatchPlanId inherited');
assertEqual(record.reviewId, 'review_test_001', 'reviewId inherited');
assertEqual(record.draftId, 'draft_test_001', 'draftId inherited');
assertEqual(record.strategyId, 'strategy_test_001', 'strategyId inherited');
assertEqual(record.goalId, 'goal_test_001', 'goalId inherited');

// Session snapshot
assert(record.sessionSnapshot !== undefined, 'has sessionSnapshot');
assertEqual(record.sessionSnapshot.sessionId, session.sessionId, 'snapshot sessionId matches');

// Audit log
assert(Array.isArray(record.auditLog), 'auditLog is array');
assertEqual(record.auditLog.length, 1, 'auditLog has one entry (created)');
assertEqual(record.auditLog[0].action, 'created', 'first audit entry is created');

// Metadata
assert(record.metadata !== undefined, 'has metadata');
assertEqual(record.metadata.pipelineStage, 'P9.6.3', 'pipelineStage is P9.6.3');

// Timestamps
assertType(record.createdAt, 'string', 'createdAt is string');
assertType(record.updatedAt, 'string', 'updatedAt is string');

// Custom options
var record2 = ag.createApprovalRecordObj(makePlannedSession(), {
  approvalId: 'approval_custom_001',
  reviewer: 'alice',
  notes: 'Test notes'
});
assertEqual(record2.approvalId, 'approval_custom_001', 'custom approvalId');
assertEqual(record2.reviewer, 'alice', 'custom reviewer');
assertEqual(record2.notes, 'Test notes', 'custom notes');

// createEmptyApprovalRecord
var empty = ag.createEmptyApprovalRecord();
assert(empty !== undefined, 'createEmptyApprovalRecord returns object');
assertEqual(empty.title, 'Test Approval', 'empty record has default title');
assertEqual(empty.status, 'pending', 'empty record is pending');

var overridden = ag.createEmptyApprovalRecord({ status: 'approved', reviewer: 'bob' });
assertEqual(overridden.status, 'approved', 'empty record overrides work');
assertEqual(overridden.reviewer, 'bob', 'reviewer override works');

var s2 = summary();
totalPassed += s2.passed;
totalFailed += s2.failed;

// ============================================================================
// Section 3: Helper Functions
// ============================================================================
section('3. Helper Functions');

// _validateApprovalBasic
assertEqual(ag._validateApprovalBasic(null), false, 'null is invalid');
assertEqual(ag._validateApprovalBasic(undefined), false, 'undefined is invalid');
assertEqual(ag._validateApprovalBasic({}), false, 'empty object is invalid');
assertEqual(ag._validateApprovalBasic('string'), false, 'string is invalid');

var validRecord = ag.createApprovalRecordObj(makePlannedSession());
assertEqual(ag._validateApprovalBasic(validRecord), true, 'valid record passes basic check');

var noApprovalId = ag.createApprovalRecordObj(makePlannedSession());
noApprovalId.approvalId = '';
assertEqual(ag._validateApprovalBasic(noApprovalId), false, 'empty approvalId fails');

var noSessionId = ag.createApprovalRecordObj(makePlannedSession());
noSessionId.sessionId = null;
assertEqual(ag._validateApprovalBasic(noSessionId), false, 'null sessionId fails');

// isValidApprovalTransition
assertEqual(ag.isValidApprovalTransition('pending', 'approved'), true, 'pending → approved valid');
assertEqual(ag.isValidApprovalTransition('pending', 'rejected'), true, 'pending → rejected valid');
assertEqual(ag.isValidApprovalTransition('pending', 'archived'), true, 'pending → archived valid');
assertEqual(ag.isValidApprovalTransition('approved', 'archived'), true, 'approved → archived valid');
assertEqual(ag.isValidApprovalTransition('rejected', 'archived'), true, 'rejected → archived valid');
assertEqual(ag.isValidApprovalTransition('rejected', 'pending'), true, 'rejected → pending valid');
assertEqual(ag.isValidApprovalTransition('approved', 'rejected'), false, 'approved → rejected invalid');
assertEqual(ag.isValidApprovalTransition('approved', 'pending'), false, 'approved → pending invalid');
assertEqual(ag.isValidApprovalTransition('archived', 'pending'), false, 'archived → pending invalid');
assertEqual(ag.isValidApprovalTransition('archived', 'approved'), false, 'archived → approved invalid');
assertEqual(ag.isValidApprovalTransition('unknown', 'pending'), false, 'unknown → pending invalid');

// isTerminalApprovalStatus
assertEqual(ag.isTerminalApprovalStatus('approved'), true, 'approved is terminal');
assertEqual(ag.isTerminalApprovalStatus('rejected'), true, 'rejected is terminal');
assertEqual(ag.isTerminalApprovalStatus('pending'), false, 'pending is not terminal');
assertEqual(ag.isTerminalApprovalStatus('archived'), false, 'archived is not terminal');

// canActOnApproval
assertEqual(ag.canActOnApproval({ status: 'pending' }), true, 'pending is actionable');
assertEqual(ag.canActOnApproval({ status: 'approved' }), false, 'approved is not actionable');
assertEqual(ag.canActOnApproval({ status: 'rejected' }), false, 'rejected is not actionable');
assertEqual(ag.canActOnApproval({ status: 'archived' }), false, 'archived is not actionable');
assertEqual(ag.canActOnApproval(null), false, 'null is not actionable');
assertEqual(ag.canActOnApproval(undefined), false, 'undefined is not actionable');

var s3 = summary();
totalPassed += s3.passed;
totalFailed += s3.failed;

// ============================================================================
// Section 4: Validators
// ============================================================================
section('4. Validators');

// V constants
assert(ag.V !== undefined, 'V constants exist');
assert(ag.V.INVALID_APPROVAL_OBJECT !== undefined, 'V.INVALID_APPROVAL_OBJECT exists');
assert(ag.V.MISSING_APPROVAL_ID !== undefined, 'V.MISSING_APPROVAL_ID exists');
assert(ag.V.MISSING_SESSION_ID !== undefined, 'V.MISSING_SESSION_ID exists');
assert(ag.V.INVALID_STATUS !== undefined, 'V.INVALID_STATUS exists');
assert(ag.V.INVALID_DECISION !== undefined, 'V.INVALID_DECISION exists');
assert(ag.V.MISSING_REVIEWER !== undefined, 'V.MISSING_REVIEWER exists');
assert(ag.V.INVALID_TRANSITION !== undefined, 'V.INVALID_TRANSITION exists');

// validateApprovalRecord — valid
var vRecord = ag.createApprovalRecordObj(makePlannedSession());
var vrResult = ag.validateApprovalRecord(vRecord);
assertEqual(vrResult.valid, true, 'valid record passes');
assertEqual(vrResult.errors.length, 0, 'no errors for valid record');

// validateApprovalRecord — null
var nullResult = ag.validateApprovalRecord(null);
assertEqual(nullResult.valid, false, 'null record fails');
assert(nullResult.errors.length > 0, 'null has errors');

// validateApprovalRecord — missing approvalId
var missingAid = ag.createApprovalRecordObj(makePlannedSession());
delete missingAid.approvalId;
var maResult = ag.validateApprovalRecord(missingAid);
assertEqual(maResult.valid, false, 'missing approvalId fails');

// validateApprovalRecord — invalid approvalId format
var badAid = ag.createApprovalRecordObj(makePlannedSession());
badAid.approvalId = 'bad_format';
var baResult = ag.validateApprovalRecord(badAid);
assertEqual(baResult.valid, false, 'bad approvalId format fails');

// validateApprovalRecord — missing sessionId
var missingSid = ag.createApprovalRecordObj(makePlannedSession());
delete missingSid.sessionId;
var msResult = ag.validateApprovalRecord(missingSid);
assertEqual(msResult.valid, false, 'missing sessionId fails');

// validateApprovalRecord — invalid sessionId (empty string)
var emptySid = ag.createApprovalRecordObj(makePlannedSession());
emptySid.sessionId = '';
var esResult = ag.validateApprovalRecord(emptySid);
assertEqual(esResult.valid, false, 'empty sessionId fails');

// validateApprovalRecord — missing ticketId
var missingTid = ag.createApprovalRecordObj(makePlannedSession());
delete missingTid.ticketId;
var mtResult = ag.validateApprovalRecord(missingTid);
assertEqual(mtResult.valid, false, 'missing ticketId fails');

// validateApprovalRecord — invalid ticketId format
var badTid = ag.createApprovalRecordObj(makePlannedSession());
badTid.ticketId = 'bad_ticket';
var btResult = ag.validateApprovalRecord(badTid);
assertEqual(btResult.valid, false, 'bad ticketId format fails');

// validateApprovalRecord — invalid status
var badStatus = ag.createApprovalRecordObj(makePlannedSession());
badStatus.status = 'invalid_status';
var bsResult = ag.validateApprovalRecord(badStatus);
assertEqual(bsResult.valid, false, 'invalid status fails');

// validateApprovalDecision
assertEqual(ag.validateApprovalDecision('approve').valid, true, 'approve decision valid');
assertEqual(ag.validateApprovalDecision('reject').valid, true, 'reject decision valid');
assertEqual(ag.validateApprovalDecision('archive').valid, true, 'archive decision valid');
assertEqual(ag.validateApprovalDecision(null).valid, false, 'null decision invalid');
assertEqual(ag.validateApprovalDecision('').valid, false, 'empty decision invalid');
assertEqual(ag.validateApprovalDecision('execute').valid, false, 'execute decision invalid');

// validateSessionForApproval — valid session
var vSession = makePlannedSession();
var vsResult = ag.validateSessionForApproval(vSession, function () { return null; });
assertEqual(vsResult.valid, true, 'planned session valid for approval');

// validateSessionForApproval — null session
var nsResult = ag.validateSessionForApproval(null);
assertEqual(nsResult.valid, false, 'null session invalid');

// validateSessionForApproval — missing sessionId
var ns2Result = ag.validateSessionForApproval({});
assertEqual(ns2Result.valid, false, 'no sessionId invalid');

// validateSessionForApproval — wrong status
var wrongStatus = makePlannedSession({ status: 'running' });
var wsResult = ag.validateSessionForApproval(wrongStatus, function () { return null; });
assertEqual(wsResult.valid, false, 'non-planned session invalid');

// validateSessionForApproval — already has approval
var hasApproval = makePlannedSession();
var haResult = ag.validateSessionForApproval(hasApproval, function () { return { status: 'pending' }; });
assertEqual(haResult.valid, false, 'already has active approval');

// validateSessionForApproval — has archived approval (should be valid)
var archivedApproval = makePlannedSession();
var aaResult = ag.validateSessionForApproval(archivedApproval, function () { return { status: 'archived' }; });
assertEqual(aaResult.valid, true, 'archived approval allows resubmit');

// validateApprovalTransition
var pendingRecord = ag.createApprovalRecordObj(makePlannedSession());
assertEqual(ag.validateApprovalTransition(pendingRecord, 'approved').valid, true, 'pending→approved valid');
assertEqual(ag.validateApprovalTransition(pendingRecord, 'rejected').valid, true, 'pending→rejected valid');
assertEqual(ag.validateApprovalTransition({ status: 'approved' }, 'archived').valid, true, 'approved→archived valid');
assertEqual(ag.validateApprovalTransition({ status: 'rejected' }, 'archived').valid, true, 'rejected→archived valid');
assertEqual(ag.validateApprovalTransition({ status: 'approved' }, 'rejected').valid, false, 'approved→rejected invalid');
assertEqual(ag.validateApprovalTransition(null, 'approved').valid, false, 'null record invalid');
assertEqual(ag.validateApprovalTransition({ status: 'pending' }, 'invalid').valid, false, 'invalid target status');

// validateReviewer
assertEqual(ag.validateReviewer('alice', 'approve').valid, true, 'reviewer alice valid for approve');
assertEqual(ag.validateReviewer('bob', 'reject').valid, true, 'reviewer bob valid for reject');
assertEqual(ag.validateReviewer(null, 'approve').valid, false, 'null reviewer invalid for approve');
assertEqual(ag.validateReviewer('', 'approve').valid, false, 'empty reviewer invalid for approve');
assertEqual(ag.validateReviewer('   ', 'approve').valid, false, 'whitespace reviewer invalid');
assertEqual(ag.validateReviewer(null, 'archive').valid, true, 'archive does not require reviewer');

// validateDecisionReason
assertEqual(ag.validateDecisionReason('Looks good', 'approve').valid, true, 'reason valid for approve');
assertEqual(ag.validateDecisionReason('Not ready', 'reject').valid, true, 'reason valid for reject');
assertEqual(ag.validateDecisionReason(null, 'approve').valid, false, 'null reason invalid');
assertEqual(ag.validateDecisionReason('', 'approve').valid, false, 'empty reason invalid');
assertEqual(ag.validateDecisionReason(null, 'archive').valid, true, 'archive does not require reason');

// validateApprovalFilter
assertEqual(ag.validateApprovalFilter(null).valid, true, 'null filter valid');
assertEqual(ag.validateApprovalFilter({}).valid, true, 'empty filter valid');
assertEqual(ag.validateApprovalFilter({ status: 'pending' }).valid, true, 'filter by pending valid');
assertEqual(ag.validateApprovalFilter({ priority: 'high' }).valid, true, 'filter by high valid');
assertEqual(ag.validateApprovalFilter({ status: 'invalid' }).valid, false, 'invalid filter status');
assertEqual(ag.validateApprovalFilter({ priority: 'urgent' }).valid, false, 'invalid filter priority');

var s4 = summary();
totalPassed += s4.passed;
totalFailed += s4.failed;

// ============================================================================
// Section 5: Store CRUD
// ============================================================================
section('5. Store CRUD');

resetStore();

// createApproval
var sess = makePlannedSession();
var rec = ag.createApprovalRecordObj(sess);
var created = ag.createApproval(rec);
assert(created !== undefined, 'createApproval returns record');
assertEqual(created.approvalId, rec.approvalId, 'approvalId preserved');
assertEqual(ag.getApprovalCount(), 1, 'count is 1 after create');

// getApprovalById
var fetched = ag.getApprovalById(rec.approvalId);
assert(fetched !== null, 'getApprovalById returns record');
assertEqual(fetched.sessionId, sess.sessionId, 'fetched sessionId matches');

// getApproval (by approvalId via getApprovalById)
var fetched2 = ag.getApprovalById(rec.approvalId);
assertEqual(fetched2.sessionId, sess.sessionId, 'getApprovalById works');

// findApprovalBySessionId
var bySession = ag.findApprovalBySessionId(sess.sessionId);
assert(bySession !== null, 'findApprovalBySessionId finds record');
assertEqual(bySession.approvalId, rec.approvalId, 'found approvalId matches');

// findApprovalBySessionId — not found
var notFound = ag.findApprovalBySessionId('nonexistent');
assertEqual(notFound, null, 'findApprovalBySessionId returns null for unknown');

// updateApproval
var updated = ag.updateApproval(rec.approvalId, { status: 'approved', reviewer: 'alice' });
assertEqual(updated.status, 'approved', 'status updated');
assertEqual(updated.reviewer, 'alice', 'reviewer updated');
assertNotEqual(updated.updatedAt, rec.updatedAt, 'updatedAt changed after update');

// Verify persisted
var refetched = ag.getApprovalById(rec.approvalId);
assertEqual(refetched.status, 'approved', 'persisted status');
assertEqual(refetched.reviewer, 'alice', 'persisted reviewer');

// updateApproval — not found throws
try {
  ag.updateApproval('nonexistent', { status: 'approved' });
  assert(false, 'should have thrown');
} catch (e) {
  assert(e.message.indexOf('not found') !== -1, 'update unknown throws');
}

// listApprovals
var all = ag.listApprovalsRaw();
assert(Array.isArray(all), 'listApprovalsRaw returns array');
assertEqual(all.length, 1, 'list has 1 record');

// listApprovals with filter
var byStatus = ag.listApprovalsRaw({ status: 'approved' });
assertEqual(byStatus.length, 1, 'filter by approved returns 1');

var byStatusNone = ag.listApprovalsRaw({ status: 'rejected' });
assertEqual(byStatusNone.length, 0, 'filter by rejected returns 0');

// createApprovals batch
ag.clearAllApprovals();
var s2 = makePlannedSession();
var s3 = makePlannedSession();
var batch = ag.createApprovals([
  ag.createApprovalRecordObj(s2),
  ag.createApprovalRecordObj(s3)
]);
assertEqual(batch.length, 2, 'batch created 2 records');
assertEqual(ag.getApprovalCount(), 2, 'count is 2 after batch');

// deleteApproval
var aid = batch[0].approvalId;
var deleted = ag.deleteApproval(aid);
assertEqual(deleted, true, 'deleteApproval returns true');
assertEqual(ag.getApprovalCount(), 1, 'count is 1 after delete');

var delAgain = ag.deleteApproval(aid);
assertEqual(delAgain, false, 're-delete returns false');

// clearAllApprovals
ag.clearAllApprovals();
assertEqual(ag.getApprovalCount(), 0, 'count is 0 after clear');

// Malformed JSON tolerance
fs.writeFileSync(tmpFile, 'this is not json', 'utf8');
assertEqual(ag.getApprovalCount(), 0, 'malformed JSON returns count 0');
resetStore();

var s5 = summary();
totalPassed += s5.passed;
totalFailed += s5.failed;

// ============================================================================
// Section 6: Store Mutex
// ============================================================================
section('6. Store Mutex');

resetStore();

assertType(ag.acquireLock, 'function', 'acquireLock is function');
assertType(ag.releaseLock, 'function', 'releaseLock is function');
assertType(ag.withLock, 'function', 'withLock is function');

// acquire + release
assertEqual(ag.acquireLock(), true, 'acquireLock succeeds');
assertEqual(ag.acquireLock(), false, 'acquireLock fails when held');
assertEqual(ag.releaseLock(), true, 'releaseLock succeeds');
assertEqual(ag.acquireLock(), true, 'acquireLock succeeds after release');
ag.releaseLock();

// withLock
var lockResult = ag.withLock(function () {
  // Inside lock: should not be able to re-acquire
  assertEqual(ag.acquireLock(), false, 'cannot acquire within withLock');
  ag.releaseLock();
  return 'result';
});
// FIX: withLock internally calls releaseLock, so we need to re-acquire to check
// The inner releaseLock released it, but withLock's finally also calls releaseLock
// So we need a fresh test
ag.releaseLock(); // Clean up any stale lock

// withLock with exception
try {
  ag.withLock(function () {
    throw new Error('test-error');
  });
} catch (e) {
  assertEqual(e.message, 'test-error', 'exception propagates');
}

// Reset for cleanup
try { ag.releaseLock(); } catch (e) { /* ok */ }

var s6 = summary();
totalPassed += s6.passed;
totalFailed += s6.failed;

// ============================================================================
// Section 7: Runtime — submitForApproval
// ============================================================================
section('7. Runtime — submitForApproval');

resetStore();

// Valid submission
var sess7 = makePlannedSession({ title: 'Submit Test' });
var result7 = ag.submitForApproval(sess7);
assertEqual(result7.success, true, 'submitForApproval succeeds');
assert(result7.approval !== undefined, 'approval returned');
assertEqual(result7.approval.status, 'pending', 'approval is pending');
assertEqual(result7.approval.sessionId, sess7.sessionId, 'sessionId matches');
assertEqual(result7.approval.ticketId, sess7.ticketId, 'ticketId matches');

// Duplicate submission (same session)
var dupResult = ag.submitForApproval(sess7);
assertEqual(dupResult.success, false, 'duplicate submission fails');
assertEqual(dupResult.code, 'SESSION_ALREADY_APPROVED', 'correct error code');

// Submission of non-planned session
var runningSess = makePlannedSession({ status: 'running' });
var rsResult = ag.submitForApproval(runningSess);
assertEqual(rsResult.success, false, 'non-planned session submission fails');
assertEqual(rsResult.code, 'INVALID_SESSION_STATUS', 'correct error code');

// Submission of null session
var nullResult = ag.submitForApproval(null);
assertEqual(nullResult.success, false, 'null session fails');

// Submission with notes
var sessWithNotes = makePlannedSession({ title: 'Notes Test' });
var notesResult = ag.submitForApproval(sessWithNotes, { notes: 'Review carefully' });
assertEqual(notesResult.success, true, 'submission with notes succeeds');
assertEqual(notesResult.approval.notes, 'Review carefully', 'notes preserved');

// Submission with pre-assigned reviewer
var sessWithRev = makePlannedSession({ title: 'Reviewer Test' });
var revResult = ag.submitForApproval(sessWithRev, { reviewer: 'charlie' });
assertEqual(revResult.success, true, 'submission with reviewer succeeds');
assertEqual(revResult.approval.reviewer, 'charlie', 'reviewer preserved');

// Submission of session with priority critical → admin reviewer required
var criticalSess = makePlannedSession({ title: 'Critical Test', priority: 'critical' });
var critResult = ag.submitForApproval(criticalSess);
assertEqual(critResult.success, true, 'critical priority submission succeeds');
assertEqual(critResult.approval.requiredReviewerRole, 'admin', 'critical requires admin');

// Session with pipeline trace
var pipelineSess = makePlannedSession({
  goalId: 'goal_abc',
  strategyId: 'strat_def',
  draftId: 'draft_ghi'
});
var pipeResult = ag.submitForApproval(pipelineSess);
assertEqual(pipeResult.success, true, 'pipeline trace submission succeeds');
assertEqual(pipeResult.approval.goalId, 'goal_abc', 'goalId inherited');
assertEqual(pipeResult.approval.strategyId, 'strat_def', 'strategyId inherited');
assertEqual(pipeResult.approval.draftId, 'draft_ghi', 'draftId inherited');

var s7 = summary();
totalPassed += s7.passed;
totalFailed += s7.failed;

// ============================================================================
// Section 8: Runtime — approve / reject / archive
// ============================================================================
section('8. Runtime — approve / reject / archive');

resetStore();

// Setup: submit session for approval
var sess8 = makePlannedSession({ title: 'Decision Test' });
var subResult = ag.submitForApproval(sess8);
assertEqual(subResult.success, true, 'setup: submit succeeds');
var approvalId = subResult.approval.approvalId;

// approveSession — success
var approveResult = ag.approveSession(sess8.sessionId, 'alice', 'Approved for dry-run');
assertEqual(approveResult.success, true, 'approveSession succeeds');
assertEqual(approveResult.approval.status, 'approved', 'status is approved');
assertEqual(approveResult.approval.reviewer, 'alice', 'reviewer is alice');
assertEqual(approveResult.approval.decision, 'approve', 'decision is approve');
assertEqual(approveResult.approval.decisionReason, 'Approved for dry-run', 'reason matches');
assertType(approveResult.approval.decisionAt, 'string', 'decisionAt is set');
assertEqual(approveResult.approval.auditLog.length, 2, 'audit log has 2 entries');
assertEqual(approveResult.approval.auditLog[1].action, 'approved', 'second audit entry is approved');

// approveSession — already approved (should fail)
var doubleApprove = ag.approveSession(sess8.sessionId, 'bob', 'Double approve');
assertEqual(doubleApprove.success, false, 'double approve fails');
assertEqual(doubleApprove.code, 'APPROVAL_ALREADY_CLOSED', 'correct error code');

// approveSession — missing reviewer
var noReviewer = ag.approveSession('session_999', null, 'reason');
assertEqual(noReviewer.success, false, 'null reviewer fails');
assertEqual(noReviewer.code, 'MISSING_REVIEWER', 'correct error code');

// approveSession — missing reason
var noReason = ag.approveSession('session_999', 'alice', null);
assertEqual(noReason.success, false, 'null reason fails');

// approveSession — non-existent session
var noSession = ag.approveSession('session_999_nonexist', 'alice', 'reason');
assertEqual(noSession.success, false, 'non-existent session fails');
assertEqual(noSession.code, 'APPROVAL_NOT_FOUND', 'correct error code');

// Reject test
var sess8b = makePlannedSession({ title: 'Reject Test' });
var sub8b = ag.submitForApproval(sess8b);
assertEqual(sub8b.success, true, 'setup reject: submit succeeds');

var rejectResult = ag.rejectSession(sess8b.sessionId, 'alice', 'Needs more review');
assertEqual(rejectResult.success, true, 'rejectSession succeeds');
assertEqual(rejectResult.approval.status, 'rejected', 'status is rejected');
assertEqual(rejectResult.approval.decision, 'reject', 'decision is reject');
assertEqual(rejectResult.approval.decisionReason, 'Needs more review', 'rejection reason matches');
assertEqual(rejectResult.approval.auditLog.length, 2, 'audit log has 2 entries');

// Reject — missing reviewer
var rejectNoRev = ag.rejectSession(sess8b.sessionId, null, 'reason');
assertEqual(rejectNoRev.success, false, 'reject without reviewer fails');

// Reject — missing reason
var rejectNoReason = ag.rejectSession(sess8b.sessionId, 'alice', '');
assertEqual(rejectNoReason.success, false, 'reject without reason fails');

// Archive test
var sess8c = makePlannedSession({ title: 'Archive Test' });
var sub8c = ag.submitForApproval(sess8c);
var appr8c = ag.approveSession(sess8c.sessionId, 'bob', 'Looks good');
assertEqual(appr8c.success, true, 'setup archive: approve succeeds');

var archResult8c = ag.archiveApproval(sub8c.approval.approvalId, 'No longer needed');
assertEqual(archResult8c.success, true, 'archiveApproval succeeds');
assertEqual(archResult8c.approval.status, 'archived', 'status is archived');

// Archive — unknown approvalId
var archUnknown = ag.archiveApproval('approval_nonexist', 'reason');
assertEqual(archUnknown.success, false, 'archive unknown fails');
assertEqual(archUnknown.code, 'APPROVAL_NOT_FOUND', 'correct error code');

// Archive — already archived
var archAgain = ag.archiveApproval(sub8c.approval.approvalId, 'again');
assertEqual(archAgain.success, false, 're-archive fails');

// Archive from pending (should work)
var sess8d = makePlannedSession({ title: 'Archive from Pending' });
var sub8d = ag.submitForApproval(sess8d);
var arch8d = ag.archiveApproval(sub8d.approval.approvalId);
assertEqual(arch8d.success, true, 'archive from pending succeeds');

var s8 = summary();
totalPassed += s8.passed;
totalFailed += s8.failed;

// ============================================================================
// Section 9: Runtime — query, batch, resubmit
// ============================================================================
section('9. Runtime — query, batch, resubmit');

resetStore();

// isSessionApproved
var sess9 = makePlannedSession({ title: 'Query Test' });
var sub9 = ag.submitForApproval(sess9);
assertEqual(ag.isSessionApproved(sess9.sessionId), false, 'not approved before decision');

ag.approveSession(sess9.sessionId, 'alice', 'OK');
assertEqual(ag.isSessionApproved(sess9.sessionId), true, 'approved after decision');

var unknownSession = 'session_999_xxxxxx';
assertEqual(ag.isSessionApproved(unknownSession), false, 'unknown session is not approved');

// getApprovalForSession
var fmt9 = ag.getApprovalForSession(sess9.sessionId);
assert(fmt9 !== null, 'getApprovalForSession returns record');
assertEqual(fmt9.decision, 'approve', 'decision is approve');

var fmtUnknown = ag.getApprovalForSession(unknownSession);
assertEqual(fmtUnknown, null, 'unknown session returns null');

// listApprovals with filter
var all9 = ag.listApprovals();
assertEqual(all9.length, 1, 'listApprovals returns 1');

var pending9 = ag.listApprovals({ status: 'pending' });
assertEqual(pending9.length, 0, 'no pending approvals');

var approved9 = ag.listApprovals({ status: 'approved' });
assertEqual(approved9.length, 1, '1 approved');

// submitBatchForApproval
resetStore();
var batchSession1 = makePlannedSession({ title: 'Batch 1' });
var batchSession2 = makePlannedSession({ title: 'Batch 2' });
var batchSession3 = makePlannedSession({ title: 'Batch 3', status: 'running' }); // invalid

var batchResult = ag.submitBatchForApproval([batchSession1, batchSession2, batchSession3]);
assertEqual(batchResult.success, false, 'batch has 1 failure');
assertEqual(batchResult.approvals.length, 2, '2 successes');
assertEqual(batchResult.errors.length, 1, '1 error');
assertEqual(batchResult.summary.total, 3, 'total 3');
assertEqual(batchResult.summary.success, 2, '2 succeeded');
assertEqual(batchResult.summary.failed, 1, '1 failed');

// Empty batch
var emptyBatch = ag.submitBatchForApproval([]);
assertEqual(emptyBatch.success, false, 'empty batch fails');

// Null batch
var nullBatch = ag.submitBatchForApproval(null);
assertEqual(nullBatch.success, false, 'null batch fails');

// resubmitApproval
resetStore();
var sessRes = makePlannedSession({ title: 'Resubmit Test' });
var subRes = ag.submitForApproval(sessRes);
var rejRes = ag.rejectSession(sessRes.sessionId, 'alice', 'Needs work');
assertEqual(rejRes.success, true, 'reject for resubmit test');

var resubResult = ag.resubmitApproval(subRes.approval.approvalId, 'Fixed issues');
assertEqual(resubResult.success, true, 'resubmitApproval succeeds');
assertEqual(resubResult.approval.status, 'pending', 'status back to pending');
assertEqual(resubResult.approval.reviewer, null, 'reviewer cleared');
assertEqual(resubResult.approval.decision, null, 'decision cleared');
assertEqual(resubResult.approval.decisionReason, null, 'reason cleared');
assertEqual(resubResult.approval.auditLog.length, 3, 'audit log has 3 entries (create + reject + resubmit)');

// Resubmit non-rejected approval
var resubApproved = ag.resubmitApproval(subRes.approval.approvalId, 'try');
assertEqual(resubApproved.success, false, 'cannot resubmit non-rejected');
assertEqual(resubApproved.code, 'INVALID_TRANSITION', 'correct error code');

// Resubmit non-existent
var resubNone = ag.resubmitApproval('approval_nonexist', 'try');
assertEqual(resubNone.success, false, 'resubmit non-existent fails');

var s9 = summary();
totalPassed += s9.passed;
totalFailed += s9.failed;

// ============================================================================
// Section 10: Snapshot
// ============================================================================
section('10. Snapshot');

resetStore();

// Setup approvals in different states
var s10a = makePlannedSession({ title: 'Critical Alert', priority: 'critical' });
var s10b = makePlannedSession({ title: 'Routine Check', priority: 'low' });
var s10c = makePlannedSession({ title: 'High Priority', priority: 'high' });

var a10a = ag.submitForApproval(s10a);
var a10b = ag.submitForApproval(s10b);
var a10c = ag.submitForApproval(s10c);

ag.approveSession(s10a.sessionId, 'admin1', 'Critical approved');
ag.rejectSession(s10b.sessionId, 'human1', 'Not needed');

var snap = ag.generateApprovalSnapshot();
assert(snap !== undefined, 'snapshot is defined');
assertType(snap.snapshotId, 'string', 'snapshotId is string');
assertContains(snap.snapshotId, 'approval_snapshot_', 'snapshotId has prefix');
assertEqual(snap.totalApprovals, 3, 'totalApprovals is 3');

// Status breakdown
assert(snap.statusBreakdown !== undefined, 'has statusBreakdown');
assertEqual(snap.statusBreakdown.approved, 1, '1 approved');
assertEqual(snap.statusBreakdown.rejected, 1, '1 rejected');
assertEqual(snap.statusBreakdown.pending, 1, '1 pending');

// Decision breakdown
assertEqual(snap.decisionBreakdown.approve, 1, '1 approve decision');
assertEqual(snap.decisionBreakdown.reject, 1, '1 reject decision');

// Pipeline summary
assertEqual(snap.pipelineSummary.uniqueSessions, 3, '3 unique sessions');

// Pending approvals sorted by priority
assertEqual(snap.pendingApprovals.length, 1, '1 pending approval');
assertEqual(snap.pendingApprovals[0].priority, 'high', 'pending sorted by priority (high first)');

// Recent decisions
assertEqual(snap.recentDecisions.length, 2, '2 recent decisions');

var s10 = summary();
totalPassed += s10.passed;
totalFailed += s10.failed;

// ============================================================================
// Section 11: Safety Grep — No Forbidden Operations
// ============================================================================
section('11. Safety Grep');

var srcDir = path.join(__dirname, '..', 'src', 'approval-gate');
var srcFiles = ['approval-gate-types.js', 'approval-gate-validator.js', 'approval-gate-store.js', 'approval-gate-runtime.js', 'index.js'];

var forbiddenPatterns = [
  { pattern: /exec\s*\(/, name: 'exec()' },
  { pattern: /spawn\s*\(/, name: 'spawn()' },
  { pattern: /child_process/, name: 'child_process' },
  { pattern: /pm2/, name: 'pm2' },
  { pattern: /\.env/, name: '.env' },
  { pattern: /nginx/, name: 'nginx' },
  { pattern: /deploy/i, name: 'deploy' },
  { pattern: /restart/, name: 'restart' },
  { pattern: /require\s*\(\s*['"]shelljs['"]/, name: 'shelljs' },
  { pattern: /auto.?approv/i, name: 'auto-approve' },
  { pattern: /bypass.*approv/i, name: 'bypass approval' },
  { pattern: /skip.*approv/i, name: 'skip approval' }
];

srcFiles.forEach(function (file) {
  var filePath = path.join(srcDir, file);
  var content = fs.readFileSync(filePath, 'utf8');

  // Strip comments and strings before matching
  var stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
    .replace(/\/\/.*$/gm, '')            // line comments
    .replace(/'[^']*'/g, '""')           // single-quoted strings
    .replace(/"[^"]*"/g, '""')           // double-quoted strings
    .replace(/`[^`]*`/g, '""');          // template literals

  forbiddenPatterns.forEach(function (fp) {
    var match = fp.pattern.test(stripped);
    assert(!match, file + ': no ' + fp.name);
  });
});

var s11 = summary();
totalPassed += s11.passed;
totalFailed += s11.failed;

// ============================================================================
// Section 12: No Execution Guarantee
// ============================================================================
section('12. No Execution Guarantee');

var allSrcContent = '';
srcFiles.forEach(function (file) {
  allSrcContent += fs.readFileSync(path.join(srcDir, file), 'utf8') + '\n';
});

// Strip comments and strings
var strippedAll = allSrcContent
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
  .replace(/'[^']*'/g, '""')
  .replace(/"[^"]*"/g, '""')
  .replace(/`[^`]*`/g, '""');

var noExecPatterns = [
  { pattern: /\.execute\s*\(/, name: '.execute()' },
  { pattern: /\.run\s*\(/, name: '.run()' },
  { pattern: /executeSession/, name: 'executeSession' },
  { pattern: /runMission/, name: 'runMission' },
  { pattern: /\bdispatch\s*\(/, name: 'dispatch()' },
  { pattern: /startWorkflow/, name: 'startWorkflow' },
  { pattern: /\.start\s*\(/, name: '.start()' },
  { pattern: /fork\s*\(/, name: 'fork()' },
  { pattern: /process\.exec/, name: 'process.exec' },
  { pattern: /shell\s*\(/, name: 'shell()' }
];

noExecPatterns.forEach(function (np) {
  assert(!np.pattern.test(strippedAll), 'no ' + np.name);
});

var s12 = summary();
totalPassed += s12.passed;
totalFailed += s12.failed;

// ============================================================================
// Final Summary
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('  FINAL SUMMARY');
console.log('='.repeat(70));
var grandTotal = totalPassed + totalFailed;
console.log('  Total:   ' + grandTotal);
console.log('  Passed:  ' + totalPassed);
console.log('  Failed:  ' + totalFailed);
console.log('  Rate:    ' + (grandTotal > 0 ? (totalPassed / grandTotal * 100).toFixed(1) : 'N/A') + '%');
console.log('='.repeat(70));

// Cleanup
try {
  fs.unlinkSync(tmpFile);
  var lockPath = path.join(path.dirname(tmpFile), '.approvals.lock');
  if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  fs.rmdirSync(tmpDir);
} catch (e) { /* ignore */ }

// Exit with appropriate code
if (totalFailed > 0) {
  console.log('\n[SOME TESTS FAILED]');
  process.exit(1);
} else {
  console.log('\n[ALL TESTS PASSED]');
  process.exit(0);
}
