/**
 * index.js
 * P9.6.3 Approval Gate — Barrel export.
 *
 * The Approval Gate is the human approval layer for Controlled Dispatch Sessions.
 * Before a session can move from PLANNED to RUNNING, it must receive human approval
 * through the approval gate.
 *
 * This module manages:
 *   - Creating approval records linked to dispatch sessions
 *   - Human approve/reject decisions with reviewer attribution
 *   - Approval archival and audit trails
 *   - Resubmission of rejected approvals
 *
 * Safety: approval gate manages approval records ONLY. It does NOT modify sessions,
 * execute commands, or interact with external systems.
 */

'use strict';

var types = require('./approval-gate-types');
var validator = require('./approval-gate-validator');
var store = require('./approval-gate-store');
var runtime = require('./approval-gate-runtime');

// ============================================================================
// Types & Constants
// ============================================================================
var APPROVAL_STATUS = types.APPROVAL_STATUS;
var APPROVAL_STATUS_VALUES = types.APPROVAL_STATUS_VALUES;
var APPROVAL_DECISION = types.APPROVAL_DECISION;
var APPROVAL_DECISION_VALUES = types.APPROVAL_DECISION_VALUES;
var ALLOWED_APPROVAL_TRANSITIONS = types.ALLOWED_APPROVAL_TRANSITIONS;
var APPROVAL_ERROR_CODES = types.APPROVAL_ERROR_CODES;
var REVIEWER_ROLE = types.REVIEWER_ROLE;
var REVIEWER_ROLE_VALUES = types.REVIEWER_ROLE_VALUES;
var PRIORITY_REVIEWER_MAP = types.PRIORITY_REVIEWER_MAP;

// Factory
var createApprovalId = types.createApprovalId;
var createApprovalRecord = types.createApprovalRecord;
var createEmptyApprovalRecord = types.createEmptyApprovalRecord;
var createApprovalSnapshot = types.createApprovalSnapshot;

// Helpers
var _validateApprovalBasic = types._validateApprovalBasic;
var isValidApprovalTransition = types.isValidApprovalTransition;
var isTerminalApprovalStatus = types.isTerminalApprovalStatus;
var canActOnApproval = types.canActOnApproval;

// ============================================================================
// Validators
// ============================================================================
var V = validator.V;
var validateApprovalRecord = validator.validateApprovalRecord;
var validateApprovalDecision = validator.validateApprovalDecision;
var validateSessionForApproval = validator.validateSessionForApproval;
var validateApprovalTransition = validator.validateApprovalTransition;
var validateReviewer = validator.validateReviewer;
var validateDecisionReason = validator.validateDecisionReason;
var validateApprovalFilter = validator.validateApprovalFilter;

// ============================================================================
// Store
// ============================================================================
var _storeCreateApproval = store.createApproval;
var _storeCreateApprovals = store.createApprovals;
var _storeGetApproval = store.getApproval;
var _storeFindApprovalBySessionId = store.findApprovalBySessionId;
var _storeFindApprovalsBySessionId = store.findApprovalsBySessionId;
var _storeUpdateApproval = store.updateApproval;
var _storeDeleteApproval = store.deleteApproval;
var _storeListApprovals = store.listApprovals;
var _storeGetApprovalCount = store.getApprovalCount;
var _storeClearAllApprovals = store.clearAllApprovals;
var setStorePath = store.setStorePath;
var getStorePath = store.getStorePath;
var resetStorePath = store.resetStorePath;
var resetStore = store.resetStore;

// ============================================================================
// Runtime
// ============================================================================
var _runtimeSubmitForApproval = runtime.submitForApproval;
var _runtimeApproveSession = runtime.approveSession;
var _runtimeRejectSession = runtime.rejectSession;
var _runtimeArchiveApproval = runtime.archiveApproval;
var _runtimeGetApprovalForSession = runtime.getApprovalForSession;
var _runtimeIsSessionApproved = runtime.isSessionApproved;
var _runtimeListApprovals = runtime.listApprovals;
var _runtimeSubmitBatchForApproval = runtime.submitBatchForApproval;
var _runtimeResubmitApproval = runtime.resubmitApproval;
var _runtimeGenerateApprovalSnapshot = runtime.generateApprovalSnapshot;

// ============================================================================
// Convenience aliases
// ============================================================================
var submitSessionForApproval = _runtimeSubmitForApproval;
var approveDispatchSession = _runtimeApproveSession;
var rejectDispatchSession = _runtimeRejectSession;
var getApproval = _runtimeGetApprovalForSession;

// ============================================================================
// Combined export
// ============================================================================
var index = {
  // --- Types & Constants ---
  APPROVAL_STATUS: APPROVAL_STATUS,
  APPROVAL_STATUS_VALUES: APPROVAL_STATUS_VALUES,
  APPROVAL_DECISION: APPROVAL_DECISION,
  APPROVAL_DECISION_VALUES: APPROVAL_DECISION_VALUES,
  ALLOWED_APPROVAL_TRANSITIONS: ALLOWED_APPROVAL_TRANSITIONS,
  APPROVAL_ERROR_CODES: APPROVAL_ERROR_CODES,
  REVIEWER_ROLE: REVIEWER_ROLE,
  REVIEWER_ROLE_VALUES: REVIEWER_ROLE_VALUES,
  PRIORITY_REVIEWER_MAP: PRIORITY_REVIEWER_MAP,

  // --- Factory ---
  createApprovalId: createApprovalId,
  createApprovalRecordObj: createApprovalRecord,
  createEmptyApprovalRecord: createEmptyApprovalRecord,
  createApprovalSnapshot: createApprovalSnapshot,

  // --- Helpers ---
  _validateApprovalBasic: _validateApprovalBasic,
  isValidApprovalTransition: isValidApprovalTransition,
  isTerminalApprovalStatus: isTerminalApprovalStatus,
  canActOnApproval: canActOnApproval,

  // --- Validators ---
  V: V,
  validateApprovalRecord: validateApprovalRecord,
  validateApprovalDecision: validateApprovalDecision,
  validateSessionForApproval: validateSessionForApproval,
  validateApprovalTransition: validateApprovalTransition,
  validateReviewer: validateReviewer,
  validateDecisionReason: validateDecisionReason,
  validateApprovalFilter: validateApprovalFilter,

  // --- Store ---
  createApproval: _storeCreateApproval,
  createApprovals: _storeCreateApprovals,
  getApproval: getApproval,
  getApprovalById: _storeGetApproval,
  findApprovalBySessionId: _storeFindApprovalBySessionId,
  findApprovalsBySessionId: _storeFindApprovalsBySessionId,
  updateApproval: _storeUpdateApproval,
  deleteApproval: _storeDeleteApproval,
  listApprovals: _runtimeListApprovals,
  listApprovalsRaw: _storeListApprovals,
  getApprovalCount: _storeGetApprovalCount,
  clearAllApprovals: _storeClearAllApprovals,
  setStorePath: setStorePath,
  getStorePath: getStorePath,
  resetStorePath: resetStorePath,
  resetStore: resetStore,
  acquireLock: store.acquireLock,
  releaseLock: store.releaseLock,
  withLock: store.withLock,

  // --- Runtime ---
  submitForApproval: _runtimeSubmitForApproval,
  approveSession: _runtimeApproveSession,
  rejectSession: _runtimeRejectSession,
  archiveApproval: _runtimeArchiveApproval,
  getApprovalForSession: _runtimeGetApprovalForSession,
  isSessionApproved: _runtimeIsSessionApproved,
  submitBatchForApproval: _runtimeSubmitBatchForApproval,
  resubmitApproval: _runtimeResubmitApproval,
  generateApprovalSnapshot: _runtimeGenerateApprovalSnapshot,

  // --- Aliases ---
  submitSessionForApproval: submitSessionForApproval,
  approveDispatchSession: approveDispatchSession,
  rejectDispatchSession: rejectDispatchSession,

  // --- Sub-module references (for testing) ---
  types: types,
  validator: validator,
  store: store,
  runtime: runtime
};

module.exports = index;
