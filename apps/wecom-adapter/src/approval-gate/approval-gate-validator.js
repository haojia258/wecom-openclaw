/**
 * approval-gate-validator.js
 * P9.6.3 Approval Gate — Validation functions.
 *
 * Validates approval records, decisions, transitions, and session eligibility
 * for the approval gate workflow.
 */

'use strict';

var types = require('./approval-gate-types');

// ============================================================================
// Validation Error Constants
// ============================================================================

/**
 * @type {{ [code: string]: { code: string, field: string, message: string } }}
 */
var V = {};

// Approval record validation
V.INVALID_APPROVAL_OBJECT = { code: 'INVALID_APPROVAL_OBJECT', field: 'approval', message: 'Approval must be a non-null object' };
V.MISSING_APPROVAL_ID = { code: 'MISSING_APPROVAL_ID', field: 'approvalId', message: 'Approval ID is required' };
V.INVALID_APPROVAL_ID_FORMAT = { code: 'INVALID_APPROVAL_ID_FORMAT', field: 'approvalId', message: 'Approval ID must start with approval_' };
V.MISSING_SESSION_ID = { code: 'MISSING_SESSION_ID', field: 'sessionId', message: 'Session ID is required' };
V.INVALID_SESSION_ID = { code: 'INVALID_SESSION_ID', field: 'sessionId', message: 'Session ID must be a non-empty string' };
V.MISSING_TICKET_ID = { code: 'MISSING_TICKET_ID', field: 'ticketId', message: 'Ticket ID is required' };
V.INVALID_TICKET_ID_FORMAT = { code: 'INVALID_TICKET_ID_FORMAT', field: 'ticketId', message: 'Ticket ID must start with ticket_' };
V.INVALID_STATUS = { code: 'INVALID_STATUS', field: 'status', message: 'Invalid approval status' };
V.INVALID_DECISION = { code: 'INVALID_DECISION', field: 'decision', message: 'Invalid approval decision' };
V.MISSING_DECISION_REASON = { code: 'MISSING_DECISION_REASON', field: 'decisionReason', message: 'Decision reason is required for approve/reject' };
V.INVALID_DECISION_REASON = { code: 'INVALID_DECISION_REASON', field: 'decisionReason', message: 'Decision reason must be a non-empty string' };
V.MISSING_REVIEWER = { code: 'MISSING_REVIEWER', field: 'reviewer', message: 'Reviewer is required for decisions' };
V.INVALID_REVIEWER = { code: 'INVALID_REVIEWER', field: 'reviewer', message: 'Reviewer must be a non-empty string' };
V.INVALID_TRANSITION = { code: 'INVALID_TRANSITION', field: 'status', message: 'Invalid approval status transition' };
V.APPROVAL_ALREADY_CLOSED = { code: 'APPROVAL_ALREADY_CLOSED', field: 'status', message: 'Approval is already in a closed state' };

// Session eligibility validation
V.SESSION_NOT_FOUND = { code: 'SESSION_NOT_FOUND', field: 'sessionId', message: 'Session not found' };
V.INVALID_SESSION_STATUS = { code: 'INVALID_SESSION_STATUS', field: 'session.status', message: 'Session must be in PLANNED status for approval' };
V.SESSION_ALREADY_APPROVED = { code: 'SESSION_ALREADY_APPROVED', field: 'sessionId', message: 'Session already has an active approval' };

// Filter validation
V.INVALID_FILTER_STATUS = { code: 'INVALID_FILTER_STATUS', field: 'filter.status', message: 'Invalid filter status' };
V.INVALID_FILTER_PRIORITY = { code: 'INVALID_FILTER_PRIORITY', field: 'filter.priority', message: 'Invalid filter priority' };

// ============================================================================
// Core Validators
// ============================================================================

/**
 * Validates an approval record.
 *
 * @param {Object} record — Approval record to validate
 * @returns {{ valid: boolean, errors: Array<{field, code, message}> }}
 */
function validateApprovalRecord(record) {
  var errors = [];

  // Must be a non-null object
  if (!record || typeof record !== 'object') {
    errors.push(V.INVALID_APPROVAL_OBJECT);
    return { valid: false, errors: errors };
  }

  // approvalId
  if (!record.approvalId) {
    errors.push(V.MISSING_APPROVAL_ID);
  } else if (typeof record.approvalId !== 'string' || record.approvalId.indexOf('approval_') !== 0) {
    errors.push(V.INVALID_APPROVAL_ID_FORMAT);
  }

  // sessionId
  if (!record.sessionId) {
    errors.push(V.MISSING_SESSION_ID);
  } else if (typeof record.sessionId !== 'string' || record.sessionId.length === 0) {
    errors.push(V.INVALID_SESSION_ID);
  }

  // ticketId
  if (!record.ticketId) {
    errors.push(V.MISSING_TICKET_ID);
  } else if (typeof record.ticketId !== 'string' || record.ticketId.indexOf('ticket_') !== 0) {
    errors.push(V.INVALID_TICKET_ID_FORMAT);
  }

  // status
  if (!record.status || types.APPROVAL_STATUS_VALUES.indexOf(record.status) === -1) {
    errors.push(V.INVALID_STATUS);
  }

  return { valid: errors.length === 0, errors: errors };
}

/**
 * Validates an approval decision.
 *
 * @param {string} decision — 'approve', 'reject', or 'archive'
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateApprovalDecision(decision) {
  var errors = [];
  if (!decision || types.APPROVAL_DECISION_VALUES.indexOf(decision) === -1) {
    errors.push(V.INVALID_DECISION);
  }
  return { valid: errors.length === 0, errors: errors };
}

/**
 * Validates that a session is eligible for approval gate submission.
 *
 * The session must:
 *   1. Be a valid object with sessionId
 *   2. Be in PLANNED status (only planned sessions can be submitted for approval)
 *   3. Not already have an active (non-archived) approval
 *
 * @param {Object} session — Controlled dispatch session
 * @param {Function} [findExistingApproval] — Function(sessionId) → approval|null
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateSessionForApproval(session, findExistingApproval) {
  var errors = [];

  if (!session || typeof session !== 'object') {
    errors.push(V.SESSION_NOT_FOUND);
    return { valid: false, errors: errors };
  }

  if (!session.sessionId) {
    errors.push(V.SESSION_NOT_FOUND);
    return { valid: false, errors: errors };
  }

  // Session must be in PLANNED status
  if (session.status !== 'planned') {
    errors.push(V.INVALID_SESSION_STATUS);
  }

  // Check for existing active approval
  if (typeof findExistingApproval === 'function') {
    var existing = findExistingApproval(session.sessionId);
    if (existing && existing.status !== types.APPROVAL_STATUS.ARCHIVED) {
      errors.push(V.SESSION_ALREADY_APPROVED);
    }
  }

  return { valid: errors.length === 0, errors: errors };
}

/**
 * Validates an approval status transition.
 *
 * @param {Object} record — Current approval record
 * @param {string} targetStatus — Target status
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateApprovalTransition(record, targetStatus) {
  var errors = [];

  if (!record || typeof record !== 'object') {
    errors.push({ code: 'APPROVAL_NOT_FOUND', field: 'record', message: 'Approval record not found' });
    return { valid: false, errors: errors };
  }

  if (!targetStatus || types.APPROVAL_STATUS_VALUES.indexOf(targetStatus) === -1) {
    errors.push(V.INVALID_STATUS);
    return { valid: false, errors: errors };
  }

  // Check if already closed (before transition check for better error messages)
  if ((targetStatus === types.APPROVAL_STATUS.APPROVED || targetStatus === types.APPROVAL_STATUS.REJECTED) &&
      !types.canActOnApproval(record)) {
    errors.push(V.APPROVAL_ALREADY_CLOSED);
    return { valid: false, errors: errors };
  }

  if (!types.isValidApprovalTransition(record.status, targetStatus)) {
    errors.push(V.INVALID_TRANSITION);
  }

  return { valid: errors.length === 0, errors: errors };
}

/**
 * Validates a reviewer identifier.
 *
 * @param {string} reviewer — Human reviewer identifier
 * @param {string} action — 'approve', 'reject', or 'archive'
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateReviewer(reviewer, action) {
  var errors = [];

  // Archive doesn't strictly require a reviewer
  if (action === types.APPROVAL_DECISION.ARCHIVE) {
    return { valid: true, errors: [] };
  }

  if (!reviewer || typeof reviewer !== 'string' || reviewer.trim().length === 0) {
    errors.push(V.MISSING_REVIEWER);
  }

  return { valid: errors.length === 0, errors: errors };
}

/**
 * Validates a decision reason.
 *
 * @param {string} reason — Decision reason string
 * @param {string} action — 'approve', 'reject', or 'archive'
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateDecisionReason(reason, action) {
  var errors = [];

  // Archive doesn't strictly require a reason
  if (action === types.APPROVAL_DECISION.ARCHIVE) {
    return { valid: true, errors: [] };
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    errors.push(V.MISSING_DECISION_REASON);
  }

  return { valid: errors.length === 0, errors: errors };
}

/**
 * Validates approval list filter parameters.
 *
 * @param {Object} [filter]
 * @param {string} [filter.status]
 * @param {string} [filter.priority]
 * @param {string} [filter.sessionId]
 * @param {string} [filter.reviewer]
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateApprovalFilter(filter) {
  var errors = [];
  if (!filter) return { valid: true, errors: [] };

  if (filter.status && types.APPROVAL_STATUS_VALUES.indexOf(filter.status) === -1) {
    errors.push(V.INVALID_FILTER_STATUS);
  }

  if (filter.priority && ['low', 'medium', 'high', 'critical'].indexOf(filter.priority) === -1) {
    errors.push(V.INVALID_FILTER_PRIORITY);
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  V: V,
  validateApprovalRecord: validateApprovalRecord,
  validateApprovalDecision: validateApprovalDecision,
  validateSessionForApproval: validateSessionForApproval,
  validateApprovalTransition: validateApprovalTransition,
  validateReviewer: validateReviewer,
  validateDecisionReason: validateDecisionReason,
  validateApprovalFilter: validateApprovalFilter
};
