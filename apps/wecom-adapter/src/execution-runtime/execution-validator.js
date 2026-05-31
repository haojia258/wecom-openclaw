/**
 * execution-validator.js
 * P9.7.1 Execution Session Runtime — Input validation utilities.
 *
 * Validates sessions, transitions, checkpoints, audit events, and execution modes.
 * No I/O, no side effects.
 */

'use strict';

var types = require('./execution-types');

var EXECUTION_STATUS_VALUES = types.EXECUTION_STATUS_VALUES;
var EXECUTION_MODE_VALUES  = types.EXECUTION_MODE_VALUES;
var FORBIDDEN_MODES        = types.FORBIDDEN_MODES;
var AUDIT_EVENT_TYPE_VALUES  = types.AUDIT_EVENT_TYPE_VALUES;
var ACTOR_TYPE_VALUES       = types.ACTOR_TYPE_VALUES;
var EXECUTION_ERROR_CODES    = types.EXECUTION_ERROR_CODES;
var ALLOWED_TRANSITIONS     = types.ALLOWED_TRANSITIONS;

// ============================================================================
// validateExecutionSession — full session validation
// ============================================================================

function validateExecutionSession(session) {
  var errors = [];

  if (!session || typeof session !== 'object') {
    errors.push({ field: 'session', code: EXECUTION_ERROR_CODES.INVALID_SESSION, message: 'Session must be an object' });
    return { valid: false, errors: errors };
  }

  // executionSessionId
  if (!session.executionSessionId || typeof session.executionSessionId !== 'string') {
    errors.push({ field: 'executionSessionId', code: EXECUTION_ERROR_CODES.INVALID_SESSION_ID, message: 'executionSessionId is required and must be a string' });
  } else if (!session.executionSessionId.startsWith('exec_')) {
    errors.push({ field: 'executionSessionId', code: EXECUTION_ERROR_CODES.INVALID_SESSION_ID, message: 'executionSessionId must start with "exec_"' });
  }

  // status
  if (EXECUTION_STATUS_VALUES.indexOf(session.status) === -1) {
    errors.push({ field: 'status', code: EXECUTION_ERROR_CODES.INVALID_STATUS, message: 'Invalid execution status: ' + session.status });
  }

  // mode
  if (EXECUTION_MODE_VALUES.indexOf(session.mode) === -1) {
    errors.push({ field: 'mode', code: EXECUTION_ERROR_CODES.INVALID_MODE, message: 'Invalid execution mode: ' + session.mode });
  }

  // forbidden mode check
  if (FORBIDDEN_MODES.indexOf(session.mode) !== -1) {
    errors.push({ field: 'mode', code: EXECUTION_ERROR_CODES.FORBIDDEN_EXECUTION_MODE, message: 'Forbidden execution mode: ' + session.mode });
  }

  // approvalId (must exist for ready/running)
  if (session.status !== types.EXECUTION_STATUS.CREATED &&
      session.status !== types.EXECUTION_STATUS.ARCHIVED) {
    if (!session.approvalId || typeof session.approvalId !== 'string') {
      errors.push({ field: 'approvalId', code: EXECUTION_ERROR_CODES.INVALID_APPROVAL, message: 'approvalId is required for non-created sessions' });
    }
  }

  // dispatchPlanId
  if (!session.dispatchPlanId || typeof session.dispatchPlanId !== 'string') {
    errors.push({ field: 'dispatchPlanId', code: EXECUTION_ERROR_CODES.INVALID_DISPATCH_PLAN, message: 'dispatchPlanId is required' });
  }

  // assignmentPlanId
  if (!session.assignmentPlanId || typeof session.assignmentPlanId !== 'string') {
    errors.push({ field: 'assignmentPlanId', code: EXECUTION_ERROR_CODES.INVALID_ASSIGNMENT_PLAN, message: 'assignmentPlanId is required' });
  }

  // executionSteps must be array
  if (session.executionSteps && !Array.isArray(session.executionSteps)) {
    errors.push({ field: 'executionSteps', code: EXECUTION_ERROR_CODES.INVALID_SESSION, message: 'executionSteps must be an array' });
  }

  // checkpoints must be array
  if (session.checkpoints && !Array.isArray(session.checkpoints)) {
    errors.push({ field: 'checkpoints', code: EXECUTION_ERROR_CODES.INVALID_CHECKPOINT, message: 'checkpoints must be an array' });
  }

  // auditTrail must be array
  if (session.auditTrail && !Array.isArray(session.auditTrail)) {
    errors.push({ field: 'auditTrail', code: EXECUTION_ERROR_CODES.AUDIT_EVENT_INVALID, message: 'auditTrail must be an array' });
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// validateTransition — state machine transition validation
// ============================================================================

function validateTransition(fromStatus, toStatus) {
  var errors = [];

  if (EXECUTION_STATUS_VALUES.indexOf(fromStatus) === -1) {
    errors.push({ field: 'fromStatus', code: EXECUTION_ERROR_CODES.INVALID_STATUS, message: 'Invalid fromStatus: ' + fromStatus });
    return { valid: false, errors: errors };
  }

  if (EXECUTION_STATUS_VALUES.indexOf(toStatus) === -1) {
    errors.push({ field: 'toStatus', code: EXECUTION_ERROR_CODES.INVALID_STATUS, message: 'Invalid toStatus: ' + toStatus });
    return { valid: false, errors: errors };
  }

  var allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed) {
    errors.push({ field: 'transition', code: EXECUTION_ERROR_CODES.INVALID_TRANSITION, message: 'No transitions allowed from status: ' + fromStatus });
    return { valid: false, errors: errors };
  }

  if (allowed.indexOf(toStatus) === -1) {
    errors.push({
      field: 'transition',
      code: EXECUTION_ERROR_CODES.INVALID_TRANSITION,
      message: 'Invalid transition: ' + fromStatus + ' → ' + toStatus + '. Allowed: ' + allowed.join(', ')
    });
    return { valid: false, errors: errors };
  }

  return { valid: true, errors: [] };
}

// ============================================================================
// validateExecutionMode — strict mode validation
// ============================================================================

function validateExecutionMode(mode) {
  var errors = [];

  if (typeof mode !== 'string') {
    errors.push({ field: 'mode', code: EXECUTION_ERROR_CODES.INVALID_MODE, message: 'Execution mode must be a string' });
    return { valid: false, errors: errors };
  }

  // Check forbidden first
  if (FORBIDDEN_MODES.indexOf(mode) !== -1) {
    errors.push({
      field: 'mode',
      code: EXECUTION_ERROR_CODES.FORBIDDEN_EXECUTION_MODE,
      message: 'Execution mode "' + mode + '" is FORBIDDEN. Only dry-run and supervised are allowed.'
    });
    return { valid: false, errors: errors };
  }

  if (EXECUTION_MODE_VALUES.indexOf(mode) === -1) {
    errors.push({
      field: 'mode',
      code: EXECUTION_ERROR_CODES.INVALID_MODE,
      message: 'Invalid execution mode: ' + mode + '. Must be one of: ' + EXECUTION_MODE_VALUES.join(', ')
    });
    return { valid: false, errors: errors };
  }

  return { valid: true, errors: [] };
}

// ============================================================================
// validateCheckpoint
// ============================================================================

function validateCheckpoint(checkpoint) {
  var errors = [];

  if (!checkpoint || typeof checkpoint !== 'object') {
    errors.push({ field: 'checkpoint', code: EXECUTION_ERROR_CODES.INVALID_CHECKPOINT, message: 'Checkpoint must be an object' });
    return { valid: false, errors: errors };
  }

  if (!checkpoint.checkpointId || typeof checkpoint.checkpointId !== 'string') {
    errors.push({ field: 'checkpointId', code: EXECUTION_ERROR_CODES.INVALID_CHECKPOINT, message: 'checkpointId is required' });
  }

  if (!checkpoint.sessionId || typeof checkpoint.sessionId !== 'string') {
    errors.push({ field: 'sessionId', code: EXECUTION_ERROR_CODES.INVALID_SESSION_ID, message: 'sessionId is required on checkpoint' });
  }

  if (!checkpoint.step || typeof checkpoint.step !== 'string') {
    errors.push({ field: 'step', code: EXECUTION_ERROR_CODES.INVALID_CHECKPOINT, message: 'step is required and must be a string' });
  }

  if (checkpoint.snapshot !== undefined && checkpoint.snapshot !== null && typeof checkpoint.snapshot !== 'object') {
    errors.push({ field: 'snapshot', code: EXECUTION_ERROR_CODES.INVALID_CHECKPOINT, message: 'snapshot must be an object if provided' });
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// validateAuditEvent
// ============================================================================

function validateAuditEvent(event) {
  var errors = [];

  if (!event || typeof event !== 'object') {
    errors.push({ field: 'event', code: EXECUTION_ERROR_CODES.AUDIT_EVENT_INVALID, message: 'Audit event must be an object' });
    return { valid: false, errors: errors };
  }

  if (!event.eventId || typeof event.eventId !== 'string') {
    errors.push({ field: 'eventId', code: EXECUTION_ERROR_CODES.AUDIT_EVENT_INVALID, message: 'eventId is required' });
  }

  if (!event.sessionId || typeof event.sessionId !== 'string') {
    errors.push({ field: 'sessionId', code: EXECUTION_ERROR_CODES.INVALID_SESSION_ID, message: 'sessionId is required on audit event' });
  }

  if (AUDIT_EVENT_TYPE_VALUES.indexOf(event.event) === -1) {
    errors.push({ field: 'event', code: EXECUTION_ERROR_CODES.AUDIT_EVENT_INVALID, message: 'Invalid audit event type: ' + event.event });
  }

  if (event.actor && ACTOR_TYPE_VALUES.indexOf(event.actor) === -1) {
    errors.push({ field: 'actor', code: EXECUTION_ERROR_CODES.INVALID_ACTOR, message: 'Invalid actor type: ' + event.actor });
  }

  if (event.details !== undefined && event.details !== null && typeof event.details !== 'object') {
    errors.push({ field: 'details', code: EXECUTION_ERROR_CODES.AUDIT_EVENT_INVALID, message: 'details must be an object if provided' });
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// validateBatchSessions — batch validation
// ============================================================================

function validateBatchSessions(sessions) {
  var errors = [];

  if (!Array.isArray(sessions)) {
    errors.push({ field: 'sessions', code: EXECUTION_ERROR_CODES.EMPTY_BATCH, message: 'Batch sessions must be an array' });
    return { valid: false, errors: errors };
  }

  if (sessions.length === 0) {
    errors.push({ field: 'sessions', code: EXECUTION_ERROR_CODES.EMPTY_BATCH, message: 'Batch sessions array must not be empty' });
    return { valid: false, errors: errors };
  }

  var seenIds = {};
  for (var i = 0; i < sessions.length; i++) {
    var result = validateExecutionSession(sessions[i]);
    if (!result.valid) {
      for (var j = 0; j < result.errors.length; j++) {
        errors.push({
          index: i,
          field: 'sessions[' + i + '].' + result.errors[j].field,
          code: result.errors[j].code,
          message: result.errors[j].message
        });
      }
    }

    // Check duplicates
    if (sessions[i] && sessions[i].executionSessionId) {
      if (seenIds[sessions[i].executionSessionId]) {
        errors.push({
          index: i,
          field: 'sessions[' + i + '].executionSessionId',
          code: EXECUTION_ERROR_CODES.DUPLICATE_SESSION,
          message: 'Duplicate executionSessionId in batch: ' + sessions[i].executionSessionId
        });
      }
      seenIds[sessions[i].executionSessionId] = true;
    }
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  validateExecutionSession:  validateExecutionSession,
  validateTransition:          validateTransition,
  validateExecutionMode:      validateExecutionMode,
  validateCheckpoint:         validateCheckpoint,
  validateAuditEvent:         validateAuditEvent,
  validateBatchSessions:     validateBatchSessions
};
