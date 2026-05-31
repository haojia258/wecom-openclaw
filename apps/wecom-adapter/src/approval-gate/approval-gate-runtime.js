/**
 * approval-gate-runtime.js
 * P9.6.3 Approval Gate — Core Runtime API.
 *
 * Manages the human approval workflow for Controlled Dispatch Sessions.
 *
 * Flow:
 *   1. submitForApproval(session) → creates PENDING approval record
 *   2. approveSession(sessionId, reviewer, reason) → PENDING → APPROVED
 *   3. rejectSession(sessionId, reviewer, reason) → PENDING → REJECTED
 *   4. archiveApproval(approvalId, reason) → APPROVED/REJECTED → ARCHIVED
 *
 * Rules:
 *   - Only sessions in PLANNED status can be submitted for approval
 *   - One active approval per session (dedup)
 *   - Approval requires reviewer + reason
 *   - Rejection requires reviewer + reason
 *   - Rejected sessions can be resubmitted (REJECTED → PENDING)
 *   - NO shell, exec, spawn, pm2, deploy, nginx, .env
 *   - Approval gate manages approval records ONLY — does NOT modify sessions
 */

'use strict';

var types = require('./approval-gate-types');
var validator = require('./approval-gate-validator');
var store = require('./approval-gate-store');

// ============================================================================
// Core: submitForApproval
// ============================================================================

/**
 * Submits a Controlled Dispatch Session for human approval.
 *
 * Creates a PENDING approval record linked to the session.
 *
 * Flow:
 *   1. Validate session eligibility (PLANNED, no existing active approval)
 *   2. Check for duplicate (same sessionId with non-archived status)
 *   3. Create approval record (PENDING)
 *   4. Persist to store
 *
 * @param {Object} session — Controlled dispatch session
 * @param {Object} [options]
 * @param {string} [options.notes] — Review notes
 * @param {string} [options.reviewer] — Expected reviewer
 * @returns {{ success: boolean, approval?: Object, error?: string, code?: string }}
 */
function submitForApproval(session, options) {
  var opts = options || {};

  // Step 1: Validate session
  var sessionResult = validator.validateSessionForApproval(session, function (sid) {
    // Find existing active approval
    var existing = store.findApprovalBySessionId(sid);
    if (existing && existing.status !== types.APPROVAL_STATUS.ARCHIVED) {
      return existing;
    }
    return null;
  });

  if (!sessionResult.valid) {
    return {
      success: false,
      error: sessionResult.errors[0].message,
      code: sessionResult.errors[0].code
    };
  }

  // Step 2: Create approval record
  var approval;
  try {
    approval = types.createApprovalRecord(session, {
      reviewer: opts.reviewer,
      notes: opts.notes
    });
  } catch (e) {
    return {
      success: false,
      error: e.message,
      code: 'APPROVAL_CREATION_FAILED'
    };
  }

  // Step 3: Validate created record
  var recordResult = validator.validateApprovalRecord(approval);
  if (!recordResult.valid) {
    return {
      success: false,
      error: recordResult.errors[0].message,
      code: recordResult.errors[0].code
    };
  }

  // Step 4: Persist
  try {
    store.createApproval(approval);
  } catch (e) {
    return {
      success: false,
      error: 'Failed to persist approval: ' + e.message,
      code: types.APPROVAL_ERROR_CODES.DUPLICATE_APPROVAL
    };
  }

  return { success: true, approval: approval };
}

// ============================================================================
// Core: approveSession
// ============================================================================

/**
 * Approves a session's pending approval.
 *
 * Transitions approval record from PENDING → APPROVED.
 *
 * @param {string} sessionId — Session ID
 * @param {string} reviewer — Human reviewer identifier
 * @param {string} reason — Approval reason
 * @returns {{ success: boolean, approval?: Object, error?: string, code?: string }}
 */
function approveSession(sessionId, reviewer, reason) {
  // Validate inputs
  var reviewerResult = validator.validateReviewer(reviewer, types.APPROVAL_DECISION.APPROVE);
  if (!reviewerResult.valid) {
    return { success: false, error: reviewerResult.errors[0].message, code: reviewerResult.errors[0].code };
  }

  var reasonResult = validator.validateDecisionReason(reason, types.APPROVAL_DECISION.APPROVE);
  if (!reasonResult.valid) {
    return { success: false, error: reasonResult.errors[0].message, code: reasonResult.errors[0].code };
  }

  // Find approval
  var approval = store.findApprovalBySessionId(sessionId);
  if (!approval) {
    return { success: false, error: 'Approval not found for session: ' + sessionId, code: types.APPROVAL_ERROR_CODES.APPROVAL_NOT_FOUND };
  }

  // Validate transition
  var transResult = validator.validateApprovalTransition(approval, types.APPROVAL_STATUS.APPROVED);
  if (!transResult.valid) {
    return { success: false, error: transResult.errors[0].message, code: transResult.errors[0].code };
  }

  // Apply decision
  var decisionAt = new Date().toISOString();
  var auditEntry = {
    action: 'approved',
    reviewer: reviewer,
    reason: reason,
    timestamp: decisionAt,
    previousStatus: approval.status
  };

  var auditLog = (approval.auditLog || []).concat([auditEntry]);

  var updated = store.updateApproval(approval.approvalId, {
    status: types.APPROVAL_STATUS.APPROVED,
    reviewer: reviewer,
    decision: types.APPROVAL_DECISION.APPROVE,
    decisionReason: reason,
    decisionAt: decisionAt,
    auditLog: auditLog,
    updatedAt: decisionAt
  });

  return { success: true, approval: updated };
}

// ============================================================================
// Core: rejectSession
// ============================================================================

/**
 * Rejects a session's pending approval.
 *
 * Transitions approval record from PENDING → REJECTED.
 *
 * @param {string} sessionId — Session ID
 * @param {string} reviewer — Human reviewer identifier
 * @param {string} reason — Rejection reason
 * @returns {{ success: boolean, approval?: Object, error?: string, code?: string }}
 */
function rejectSession(sessionId, reviewer, reason) {
  // Validate inputs
  var reviewerResult = validator.validateReviewer(reviewer, types.APPROVAL_DECISION.REJECT);
  if (!reviewerResult.valid) {
    return { success: false, error: reviewerResult.errors[0].message, code: reviewerResult.errors[0].code };
  }

  var reasonResult = validator.validateDecisionReason(reason, types.APPROVAL_DECISION.REJECT);
  if (!reasonResult.valid) {
    return { success: false, error: reasonResult.errors[0].message, code: reasonResult.errors[0].code };
  }

  // Find approval
  var approval = store.findApprovalBySessionId(sessionId);
  if (!approval) {
    return { success: false, error: 'Approval not found for session: ' + sessionId, code: types.APPROVAL_ERROR_CODES.APPROVAL_NOT_FOUND };
  }

  // Validate transition
  var transResult = validator.validateApprovalTransition(approval, types.APPROVAL_STATUS.REJECTED);
  if (!transResult.valid) {
    return { success: false, error: transResult.errors[0].message, code: transResult.errors[0].code };
  }

  // Apply decision
  var decisionAt = new Date().toISOString();
  var auditEntry = {
    action: 'rejected',
    reviewer: reviewer,
    reason: reason,
    timestamp: decisionAt,
    previousStatus: approval.status
  };

  var auditLog = (approval.auditLog || []).concat([auditEntry]);

  var updated = store.updateApproval(approval.approvalId, {
    status: types.APPROVAL_STATUS.REJECTED,
    reviewer: reviewer,
    decision: types.APPROVAL_DECISION.REJECT,
    decisionReason: reason,
    decisionAt: decisionAt,
    auditLog: auditLog,
    updatedAt: decisionAt
  });

  return { success: true, approval: updated };
}

// ============================================================================
// Core: archiveApproval
// ============================================================================

/**
 * Archives an approval record.
 *
 * Can archive from APPROVED, REJECTED, or PENDING status.
 *
 * @param {string} approvalId — Approval record ID
 * @param {string} [reason] — Archive reason (optional)
 * @returns {{ success: boolean, approval?: Object, error?: string, code?: string }}
 */
function archiveApproval(approvalId, reason) {
  // Find approval by ID (not session ID)
  var approval = store.getApproval(approvalId);
  if (!approval) {
    return { success: false, error: 'Approval not found: ' + approvalId, code: types.APPROVAL_ERROR_CODES.APPROVAL_NOT_FOUND };
  }

  // Validate transition
  var transResult = validator.validateApprovalTransition(approval, types.APPROVAL_STATUS.ARCHIVED);
  if (!transResult.valid) {
    return { success: false, error: transResult.errors[0].message, code: transResult.errors[0].code };
  }

  var decisionAt = new Date().toISOString();
  var auditEntry = {
    action: 'archived',
    reason: reason || 'Archived',
    timestamp: decisionAt,
    previousStatus: approval.status
  };

  var auditLog = (approval.auditLog || []).concat([auditEntry]);

  var updated = store.updateApproval(approval.approvalId, {
    status: types.APPROVAL_STATUS.ARCHIVED,
    decision: approval.decision || types.APPROVAL_DECISION.ARCHIVE,
    decisionReason: approval.decisionReason || reason || 'Archived',
    decisionAt: approval.decisionAt || decisionAt,
    auditLog: auditLog,
    updatedAt: decisionAt
  });

  return { success: true, approval: updated };
}

// ============================================================================
// Query
// ============================================================================

/**
 * Gets approval details for a session.
 *
 * @param {string} sessionId
 * @returns {Object|null}
 */
function getApprovalForSession(sessionId) {
  return store.findApprovalBySessionId(sessionId);
}

/**
 * Checks if a session has been approved.
 *
 * @param {string} sessionId
 * @returns {boolean}
 */
function isSessionApproved(sessionId) {
  var approval = store.findApprovalBySessionId(sessionId);
  return !!(approval && approval.status === types.APPROVAL_STATUS.APPROVED);
}

/**
 * Lists approval records with optional filtering.
 *
 * @param {Object} [filter]
 * @returns {Object[]}
 */
function listApprovals(filter) {
  var filterResult = validator.validateApprovalFilter(filter);
  if (!filterResult.valid) {
    return [];
  }
  return store.listApprovals(filter);
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Submits multiple sessions for approval.
 * Each session is processed independently.
 *
 * @param {Object[]} sessions
 * @param {Object} [options]
 * @returns {{ success: boolean, approvals?: Object[], errors?: Array, summary?: Object }}
 */
function submitBatchForApproval(sessions, options) {
  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
    return { success: false, error: 'At least one session is required', code: 'EMPTY_BATCH' };
  }

  var approvals = [];
  var errors = [];
  var successCount = 0;

  sessions.forEach(function (session) {
    var result = submitForApproval(session, options);
    if (result.success) {
      approvals.push(result.approval);
      successCount++;
    } else {
      errors.push({ sessionId: session ? session.sessionId : undefined, error: result.error, code: result.code });
    }
  });

  return {
    success: errors.length === 0,
    approvals: approvals,
    errors: errors.length > 0 ? errors : undefined,
    summary: {
      total: sessions.length,
      success: successCount,
      failed: errors.length
    }
  };
}

// ============================================================================
// Resubmission
// ============================================================================

/**
 * Resubmits a rejected approval back to PENDING status.
 * This allows a rejected session to be re-reviewed.
 *
 * @param {string} approvalId — Approval record ID
 * @param {string} reason — Resubmission reason
 * @returns {{ success: boolean, approval?: Object, error?: string, code?: string }}
 */
function resubmitApproval(approvalId, reason) {
  var approval = store.getApproval(approvalId);
  if (!approval) {
    return { success: false, error: 'Approval not found: ' + approvalId, code: types.APPROVAL_ERROR_CODES.APPROVAL_NOT_FOUND };
  }

  // Only REJECTED can be resubmitted
  if (approval.status !== types.APPROVAL_STATUS.REJECTED) {
    return { success: false, error: 'Only rejected approvals can be resubmitted', code: types.APPROVAL_ERROR_CODES.INVALID_TRANSITION };
  }

  var now = new Date().toISOString();
  var auditEntry = {
    action: 'resubmitted',
    reason: reason || 'Resubmitted for review',
    timestamp: now,
    previousStatus: approval.status
  };

  var auditLog = (approval.auditLog || []).concat([auditEntry]);

  var updated = store.updateApproval(approval.approvalId, {
    status: types.APPROVAL_STATUS.PENDING,
    reviewer: null,
    decision: null,
    decisionReason: null,
    decisionAt: null,
    auditLog: auditLog,
    updatedAt: now
  });

  return { success: true, approval: updated };
}

// ============================================================================
// Snapshot
// ============================================================================

/**
 * Generates a snapshot summary of all approvals.
 *
 * @returns {Object} Snapshot
 */
function generateApprovalSnapshot() {
  var approvals = store.listApprovals();
  return types.createApprovalSnapshot(approvals);
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  // Core
  submitForApproval: submitForApproval,
  approveSession: approveSession,
  rejectSession: rejectSession,
  archiveApproval: archiveApproval,

  // Query
  getApprovalForSession: getApprovalForSession,
  isSessionApproved: isSessionApproved,
  listApprovals: listApprovals,

  // Batch
  submitBatchForApproval: submitBatchForApproval,

  // Resubmission
  resubmitApproval: resubmitApproval,

  // Snapshot
  generateApprovalSnapshot: generateApprovalSnapshot
};
