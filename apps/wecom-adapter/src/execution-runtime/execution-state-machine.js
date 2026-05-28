/**
 * execution-state-machine.js
 * P9.7.1 Execution Session Runtime — 7-state Finite State Machine.
 *
 * Allowed transitions:
 *   created     → ready
 *   ready       → running
 *   running     → paused
 *   paused      → running
 *   running     → completed
 *   running     → failed
 *   failed      → rolled_back
 *   completed   → archived
 *
 * Forbidden transitions:
 *   created     → completed  ❌
 *   created     → running    ❌
 *   completed   → running    ❌
 *   failed      → ready      ❌
 *   rolled_back → anything   ❌
 *   archived    → anything   ❌
 *
 * No I/O, no side effects — pure state machine.
 */

'use strict';

var types = require('./execution-types');

var EXECUTION_STATUS       = types.EXECUTION_STATUS;
var ALLOWED_TRANSITIONS   = types.ALLOWED_TRANSITIONS;
var EXECUTION_ERROR_CODES  = types.EXECUTION_ERROR_CODES;

// ============================================================================
// validateTransition(fromStatus, toStatus) → { valid, error }
// ============================================================================

function validateTransition(fromStatus, toStatus) {
  // Both states must be valid
  var allStatuses = [
    EXECUTION_STATUS.CREATED,
    EXECUTION_STATUS.READY,
    EXECUTION_STATUS.RUNNING,
    EXECUTION_STATUS.PAUSED,
    EXECUTION_STATUS.COMPLETED,
    EXECUTION_STATUS.FAILED,
    EXECUTION_STATUS.ROLLED_BACK,
    EXECUTION_STATUS.ARCHIVED
  ];

  var fromValid = allStatuses.indexOf(fromStatus) !== -1;
  var toValid   = allStatuses.indexOf(toStatus) !== -1;

  if (!fromValid) {
    return {
      valid: false,
      error: {
        code: EXECUTION_ERROR_CODES.INVALID_STATUS,
        message: 'Invalid fromStatus: ' + fromStatus
      }
    };
  }

  if (!toValid) {
    return {
      valid: false,
      error: {
        code: EXECUTION_ERROR_CODES.INVALID_STATUS,
        message: 'Invalid toStatus: ' + toStatus
      }
    };
  }

  // Self-transition is never allowed
  if (fromStatus === toStatus) {
    return {
      valid: false,
      error: {
        code: EXECUTION_ERROR_CODES.INVALID_TRANSITION,
        message: 'Self-transition not allowed: ' + fromStatus + ' → ' + toStatus
      }
    };
  }

  // Look up allowed transitions
  var allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed) {
    return {
      valid: false,
      error: {
        code: EXECUTION_ERROR_CODES.INVALID_TRANSITION,
        message: 'No transitions allowed from status: ' + fromStatus
      }
    };
  }

  if (allowed.indexOf(toStatus) === -1) {
    return {
      valid: false,
      error: {
        code: EXECUTION_ERROR_CODES.INVALID_TRANSITION,
        message: 'Invalid transition: ' + fromStatus + ' → ' + toStatus + '. Allowed: ' + allowed.join(', ')
      }
    };
  }

  return { valid: true, error: null };
}

// ============================================================================
// transition(session, toStatus) → { success, session?, error? }
// ============================================================================

/**
 * Apply a state transition to a session object (mutable update).
 *
 * Mutates session.status and session.updatedAt in-place.
 * Returns { success, session } on success, { success, error } on failure.
 *
 * @param {Object} session  — execution session object (mutated in place)
 * @param {string} toStatus — target status
 * @param {string} [actor]  — optional, for audit context (not used here)
 * @returns {{ success: boolean, session?: Object, error?: Object }}
 */
function transition(session, toStatus, actor) {
  if (!session || !session.status) {
    return {
      success: false,
      error: { code: EXECUTION_ERROR_CODES.INVALID_SESSION, message: 'Invalid session object' }
    };
  }

  var result = validateTransition(session.status, toStatus);
  if (!result.valid) {
    return { success: false, error: result.error };
  }

  // Mutable update — modify session in-place
  session.status    = toStatus;
  session.updatedAt = new Date().toISOString();

  return { success: true, session: session };
}

// ============================================================================
// getAllowedTransitions(fromStatus) → string[]
// ============================================================================

function getAllowedTransitions(fromStatus) {
  var allowed = ALLOWED_TRANSITIONS[fromStatus];
  return allowed ? allowed.slice() : [];
}

// ============================================================================
// isTerminalStatus(status) → boolean
// ============================================================================

function isTerminalStatus(status) {
  return status === EXECUTION_STATUS.ARCHIVED ||
         status === EXECUTION_STATUS.ROLLED_BACK;
}

// ============================================================================
// canTransition(session, toStatus) → boolean
// ============================================================================

function canTransition(session, toStatus) {
  if (!session || !session.status) return false;
  var result = validateTransition(session.status, toStatus);
  return result.valid;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  validateTransition:    validateTransition,
  transition:           transition,
  getAllowedTransitions: getAllowedTransitions,
  isTerminalStatus:     isTerminalStatus,
  canTransition:        canTransition
};
