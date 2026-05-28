/**
 * controlled-dispatch-validator.js
 * P9.6.2 Controlled Dispatch Runtime — Validation functions.
 *
 * Validates controlled dispatch sessions, execution modes, ticket references,
 * capabilities, and state transitions.
 *
 * All validators are pure functions — no I/O, no side effects.
 * Return format: { valid: boolean, errors: Array<{field, message, code}> }
 */

'use strict';

var types = require('./controlled-dispatch-types');

// ============================================================================
// Validation Error Constants
// ============================================================================
var V = {
  INVALID_SESSION_OBJECT: 'INVALID_SESSION_OBJECT',
  MISSING_SESSION_ID: 'MISSING_SESSION_ID',
  INVALID_SESSION_ID_FORMAT: 'INVALID_SESSION_ID_FORMAT',
  MISSING_TICKET_ID: 'MISSING_TICKET_ID',
  INVALID_TICKET_ID_FORMAT: 'INVALID_TICKET_ID_FORMAT',
  MISSING_TITLE: 'MISSING_TITLE',
  INVALID_STATUS: 'INVALID_STATUS',
  INVALID_EXECUTION_MODE: 'INVALID_EXECUTION_MODE',
  FORBIDDEN_EXECUTION_MODE: 'FORBIDDEN_EXECUTION_MODE',
  INVALID_SAFETY_LEVEL: 'INVALID_SAFETY_LEVEL',
  INVALID_CAPABILITY: 'INVALID_CAPABILITY',
  INVALID_PRIORITY: 'INVALID_PRIORITY',
  INVALID_TYPE: 'INVALID_TYPE',
  MISSING_CAPABILITIES: 'MISSING_CAPABILITIES',
  INVALID_TIMESTAMP_FORMAT: 'INVALID_TIMESTAMP_FORMAT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  MISSING_APPROVED_TICKET: 'MISSING_APPROVED_TICKET',
  TICKET_NOT_APPROVED: 'TICKET_NOT_APPROVED',
  TICKET_WRONG_STATUS: 'TICKET_WRONG_STATUS',
  EMPTY_BATCH: 'EMPTY_BATCH',
  DUPLICATE_TICKET_IN_BATCH: 'DUPLICATE_TICKET_IN_BATCH',
  SESSION_ALREADY_STARTED: 'SESSION_ALREADY_STARTED',
  SESSION_ALREADY_ENDED: 'SESSION_ALREADY_ENDED',
  DUPLICATE_SESSION: 'DUPLICATE_SESSION'
};

// ============================================================================
// Validator: validateDispatchSession
// ============================================================================

/**
 * Validates a full controlled dispatch session object.
 * Checks all 16+ fields for validity.
 *
 * @param {Object} session
 * @returns {{ valid: boolean, errors: Array<{field, code, message}> }}
 */
function validateDispatchSession(session) {
  var errors = [];
  if (!session || typeof session !== 'object') {
    errors.push({ field: 'session', code: V.INVALID_SESSION_OBJECT, message: 'Session must be an object' });
    return { valid: false, errors: errors };
  }

  // sessionId
  if (!session.sessionId) {
    errors.push({ field: 'sessionId', code: V.MISSING_SESSION_ID, message: 'sessionId is required' });
  } else if (typeof session.sessionId !== 'string' || !/^session_\d+_[a-z0-9]+$/.test(session.sessionId)) {
    errors.push({ field: 'sessionId', code: V.INVALID_SESSION_ID_FORMAT, message: 'sessionId must match session_<ts>_<rand>' });
  }

  // ticketId
  if (!session.ticketId) {
    errors.push({ field: 'ticketId', code: V.MISSING_TICKET_ID, message: 'ticketId is required' });
  } else if (typeof session.ticketId !== 'string' || !/^ticket_\d+_[a-z0-9]+$/.test(session.ticketId)) {
    errors.push({ field: 'ticketId', code: V.INVALID_TICKET_ID_FORMAT, message: 'ticketId must match ticket_<ts>_<rand>' });
  }

  // title
  if (!session.title || typeof session.title !== 'string' || session.title.trim() === '') {
    errors.push({ field: 'title', code: V.MISSING_TITLE, message: 'title is required and must be non-empty' });
  }

  // type
  if (session.type && typeof session.type !== 'string') {
    errors.push({ field: 'type', code: V.INVALID_TYPE, message: 'type must be a string' });
  }

  // priority
  if (session.priority) {
    var validPriorities = ['low', 'medium', 'high', 'critical'];
    if (validPriorities.indexOf(session.priority) === -1) {
      errors.push({ field: 'priority', code: V.INVALID_PRIORITY, message: 'priority must be one of: low, medium, high, critical' });
    }
  }

  // status
  if (session.status) {
    if (types.SESSION_STATUS_VALUES.indexOf(session.status) === -1) {
      errors.push({ field: 'status', code: V.INVALID_STATUS, message: 'status must be one of: ' + types.SESSION_STATUS_VALUES.join(', ') });
    }
  }

  // executionMode
  if (session.executionMode) {
    if (types.FORBIDDEN_MODES.indexOf(session.executionMode) !== -1) {
      errors.push({ field: 'executionMode', code: V.FORBIDDEN_EXECUTION_MODE, message: 'executionMode is forbidden: ' + session.executionMode });
    } else if (types.EXECUTION_MODE_VALUES.indexOf(session.executionMode) === -1) {
      errors.push({ field: 'executionMode', code: V.INVALID_EXECUTION_MODE, message: 'executionMode must be one of: ' + types.EXECUTION_MODE_VALUES.join(', ') });
    }
  }

  // safetyLevel
  if (session.safetyLevel && types.SAFETY_LEVEL_VALUES.indexOf(session.safetyLevel) === -1) {
    errors.push({ field: 'safetyLevel', code: V.INVALID_SAFETY_LEVEL, message: 'safetyLevel must be one of: ' + types.SAFETY_LEVEL_VALUES.join(', ') });
  }

  // capabilities
  if (session.capabilities) {
    if (!Array.isArray(session.capabilities)) {
      errors.push({ field: 'capabilities', code: V.INVALID_CAPABILITY, message: 'capabilities must be an array' });
    } else if (session.capabilities.length === 0) {
      errors.push({ field: 'capabilities', code: V.MISSING_CAPABILITIES, message: 'capabilities must not be empty' });
    } else {
      session.capabilities.forEach(function (c, i) {
        if (types.CAPABILITY_VALUES.indexOf(c) === -1) {
          errors.push({ field: 'capabilities[' + i + ']', code: V.INVALID_CAPABILITY, message: 'Invalid capability: ' + c + '. Must be one of: ' + types.CAPABILITY_VALUES.join(', ') });
        }
      });
    }
  }

  // Timestamps
  if (session.createdAt && isNaN(Date.parse(session.createdAt))) {
    errors.push({ field: 'createdAt', code: V.INVALID_TIMESTAMP_FORMAT, message: 'createdAt must be a valid ISO 8601 timestamp' });
  }
  if (session.updatedAt && isNaN(Date.parse(session.updatedAt))) {
    errors.push({ field: 'updatedAt', code: V.INVALID_TIMESTAMP_FORMAT, message: 'updatedAt must be a valid ISO 8601 timestamp' });
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// Validator: validateExecutionMode
// ============================================================================

/**
 * Validates that the execution mode is allowed.
 * Strict: FORBIDDEN_MODES are rejected immediately.
 *
 * @param {string} mode
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateExecutionMode(mode) {
  var errors = [];

  if (!mode || typeof mode !== 'string') {
    errors.push({ field: 'executionMode', code: V.INVALID_EXECUTION_MODE, message: 'executionMode is required' });
    return { valid: false, errors: errors };
  }

  if (types.FORBIDDEN_MODES.indexOf(mode) !== -1) {
    errors.push({ field: 'executionMode', code: V.FORBIDDEN_EXECUTION_MODE, message: 'Forbidden execution mode: ' + mode + '. Only dry-run and supervised are allowed.' });
    return { valid: false, errors: errors };
  }

  if (types.EXECUTION_MODE_VALUES.indexOf(mode) === -1) {
    errors.push({ field: 'executionMode', code: V.INVALID_EXECUTION_MODE, message: 'executionMode must be one of: ' + types.EXECUTION_MODE_VALUES.join(', ') });
    return { valid: false, errors: errors };
  }

  return { valid: true, errors: [] };
}

// ============================================================================
// Validator: validateTicketForDispatch
// ============================================================================

/**
 * Validates that a dispatch ticket is eligible for creating a controlled dispatch session.
 * The ticket must:
 *   - Exist and be an object
 *   - Have status 'approved'
 *   - Have a valid ticketId
 *
 * @param {Object} ticket — Dispatch ticket object
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateTicketForDispatch(ticket) {
  var errors = [];

  if (!ticket || typeof ticket !== 'object') {
    errors.push({ field: 'ticket', code: V.MISSING_APPROVED_TICKET, message: 'A valid ticket object is required' });
    return { valid: false, errors: errors };
  }

  if (!ticket.ticketId || typeof ticket.ticketId !== 'string') {
    errors.push({ field: 'ticket.ticketId', code: V.MISSING_TICKET_ID, message: 'ticket.ticketId is required' });
  }

  if (ticket.status !== 'approved') {
    errors.push({
      field: 'ticket.status',
      code: V.TICKET_NOT_APPROVED,
      message: 'Only approved tickets can be dispatched. Current status: ' + (ticket.status || 'undefined')
    });
  }

  if (ticket.approvalStatus && ticket.approvalStatus !== 'human-approved') {
    errors.push({
      field: 'ticket.approvalStatus',
      code: V.TICKET_WRONG_STATUS,
      message: 'Ticket approval status must be human-approved. Current: ' + ticket.approvalStatus
    });
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// Validator: validateSessionTransition
// ============================================================================

/**
 * Validates a session status transition.
 *
 * @param {Object} session — Current session
 * @param {string} targetStatus — Desired target status
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateSessionTransition(session, targetStatus) {
  var errors = [];

  if (!session || !session.status) {
    errors.push({ field: 'session', code: V.INVALID_SESSION_OBJECT, message: 'Session must have a valid status' });
    return { valid: false, errors: errors };
  }

  if (!targetStatus || types.SESSION_STATUS_VALUES.indexOf(targetStatus) === -1) {
    errors.push({ field: 'targetStatus', code: V.INVALID_STATUS, message: 'Target status must be one of: ' + types.SESSION_STATUS_VALUES.join(', ') });
    return { valid: false, errors: errors };
  }

  if (!types.isValidSessionTransition(session.status, targetStatus)) {
    errors.push({
      field: 'status',
      code: V.INVALID_TRANSITION,
      message: 'Cannot transition from ' + session.status + ' to ' + targetStatus
    });
  }

  if (types.isTerminalSessionStatus(session.status)) {
    errors.push({
      field: 'status',
      code: V.SESSION_ALREADY_ENDED,
      message: 'Session is already in terminal state: ' + session.status
    });
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// Validator: validateCapabilities
// ============================================================================

/**
 * Validates that all capabilities are allowed.
 *
 * @param {string[]} capabilities
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateCapabilities(capabilities) {
  var errors = [];

  if (!capabilities || !Array.isArray(capabilities)) {
    errors.push({ field: 'capabilities', code: V.MISSING_CAPABILITIES, message: 'capabilities must be a non-empty array' });
    return { valid: false, errors: errors };
  }

  if (capabilities.length === 0) {
    errors.push({ field: 'capabilities', code: V.MISSING_CAPABILITIES, message: 'capabilities must have at least one entry' });
  }

  capabilities.forEach(function (c, i) {
    if (types.CAPABILITY_VALUES.indexOf(c) === -1) {
      errors.push({ field: 'capabilities[' + i + ']', code: V.INVALID_CAPABILITY, message: 'Invalid capability: ' + c });
    }
  });

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// Validator: validateBatchSessions
// ============================================================================

/**
 * Validates a batch of tickets for session creation.
 *
 * @param {Object[]} tickets — Array of approved dispatch tickets
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateBatchSessions(tickets) {
  var errors = [];

  if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
    errors.push({ code: V.EMPTY_BATCH, message: 'At least one ticket is required for batch dispatch' });
    return { valid: false, errors: errors };
  }

  var seenTicketIds = {};
  tickets.forEach(function (ticket, i) {
    var result = validateTicketForDispatch(ticket);
    result.errors.forEach(function (e) {
      errors.push({ index: i, field: 'tickets[' + i + '].' + e.field, code: e.code, message: e.message });
    });

    if (ticket && ticket.ticketId) {
      if (seenTicketIds[ticket.ticketId]) {
        errors.push({ index: i, code: V.DUPLICATE_TICKET_IN_BATCH, message: 'Duplicate ticket in batch: ' + ticket.ticketId });
      }
      seenTicketIds[ticket.ticketId] = true;
    }
  });

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// Validator: validateFilter
// ============================================================================

/**
 * Validates filter options for listing sessions.
 *
 * @param {Object} filter
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateSessionFilter(filter) {
  var errors = [];
  if (!filter) return { valid: true, errors: [] };

  if (filter.status && !Array.isArray(filter.status)) {
    errors.push({ field: 'filter.status', code: V.INVALID_STATUS, message: 'filter.status must be an array' });
  }
  if (filter.executionMode && !Array.isArray(filter.executionMode)) {
    errors.push({ field: 'filter.executionMode', code: V.INVALID_EXECUTION_MODE, message: 'filter.executionMode must be an array' });
  }
  if (filter.safetyLevel && !Array.isArray(filter.safetyLevel)) {
    errors.push({ field: 'filter.safetyLevel', code: V.INVALID_SAFETY_LEVEL, message: 'filter.safetyLevel must be an array' });
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  V: V,

  // Validators
  validateDispatchSession: validateDispatchSession,
  validateExecutionMode: validateExecutionMode,
  validateTicketForDispatch: validateTicketForDispatch,
  validateSessionTransition: validateSessionTransition,
  validateCapabilities: validateCapabilities,
  validateBatchSessions: validateBatchSessions,
  validateSessionFilter: validateSessionFilter
};
