/**
 * controlled-dispatch-runtime.js
 * P9.6.2 Controlled Dispatch Runtime — Core API.
 *
 * Converts approved Dispatch Tickets into Controlled Dispatch Sessions.
 *
 * Rules:
 *   - executionMode MUST be dry-run or supervised (NEVER live/auto/execute)
 *   - Only approved tickets can be dispatched
 *   - Sessions are created in PLANNED status
 *   - NO execute(), dispatch(), runMission(), startWorkflow()
 *   - NO shell, exec, spawn, pm2, deploy, nginx, .env
 *
 * This is a SAFETY GATE, not an executor.
 */

'use strict';

var types = require('./controlled-dispatch-types');
var validator = require('./controlled-dispatch-validator');
var store = require('./controlled-dispatch-store');

// ============================================================================
// Core: createDispatchSession
// ============================================================================

/**
 * Creates a Controlled Dispatch Session from an approved dispatch ticket.
 *
 * Flow:
 *   1. Validate ticket is approved
 *   2. Validate execution mode (forbid live/auto/execute)
 *   3. Check for duplicate session (same ticket)
 *   4. Create session object (PLANNED, dry-run/supervised)
 *   5. Persist to store
 *
 * @param {Object} ticket — Approved dispatch ticket
 * @param {Object} [options]
 * @param {string} [options.executionMode] — 'dry-run' (default) or 'supervised'
 * @param {string[]} [options.capabilities] — Override default capabilities
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function createDispatchSession(ticket, options) {
  var opts = options || {};

  // Step 1: Validate ticket
  var ticketResult = validator.validateTicketForDispatch(ticket);
  if (!ticketResult.valid) {
    return {
      success: false,
      error: ticketResult.errors[0].message,
      code: ticketResult.errors[0].code
    };
  }

  // Step 1.5: Validate execution mode
  var execMode = opts.executionMode || types.EXECUTION_MODE.DRY_RUN;
  var modeResult = validator.validateExecutionMode(execMode);
  if (!modeResult.valid) {
    return {
      success: false,
      error: modeResult.errors[0].message,
      code: modeResult.errors[0].code
    };
  }

  // Step 2: Check for duplicate (one ticket → one session)
  try {
    var existing = store.findSessionByTicket(ticket.ticketId);
    if (existing) {
      return {
        success: false,
        error: 'Ticket already has a dispatch session: ' + ticket.ticketId,
        code: types.SESSION_ERROR_CODES.TICKET_ALREADY_DISPATCHED
      };
    }
  } catch (e) {
    // Store may not exist yet — proceed
  }

  // Step 3: Create session
  var session;
  try {
    session = types.createDispatchSession(ticket, {
      executionMode: execMode,
      capabilities: opts.capabilities || undefined
    });
  } catch (e) {
    return {
      success: false,
      error: e.message,
      code: types.SESSION_ERROR_CODES.FORBIDDEN_EXECUTION_MODE
    };
  }

  // Step 4: Validate the created session
  var sessionResult = validator.validateDispatchSession(session);
  if (!sessionResult.valid) {
    return {
      success: false,
      error: sessionResult.errors[0].message,
      code: sessionResult.errors[0].code,
      details: sessionResult.errors
    };
  }

  // Step 5: Persist
  try {
    store.createSession(session);
  } catch (e) {
    return {
      success: false,
      error: 'Failed to persist session: ' + e.message,
      code: types.SESSION_ERROR_CODES.DUPLICATE_SESSION
    };
  }

  return { success: true, session: session };
}

// ============================================================================
// Batch: createDispatchSessions
// ============================================================================

/**
 * Creates dispatch sessions for multiple approved tickets.
 * Each ticket is processed independently.
 *
 * @param {Object[]} tickets — Array of approved dispatch tickets
 * @param {Object} [options]
 * @returns {{ success: boolean, sessions?: Object[], errors?: Array, summary?: Object }}
 */
function createDispatchSessions(tickets, options) {
  if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
    return { success: false, error: 'At least one ticket is required', code: types.SESSION_ERROR_CODES.EMPTY_BATCH };
  }

  // Check for duplicates within batch
  var seenIds = {};
  var dupError = null;
  tickets.forEach(function (t) {
    if (t && t.ticketId) {
      if (seenIds[t.ticketId]) {
        dupError = 'Duplicate ticket in batch: ' + t.ticketId;
      }
      seenIds[t.ticketId] = true;
    }
  });
  if (dupError) {
    return { success: false, error: dupError, code: 'DUPLICATE_TICKET_IN_BATCH' };
  }

  // Process each ticket individually
  var sessions = [];
  var errors = [];
  var successCount = 0;

  tickets.forEach(function (ticket) {
    var result = createDispatchSession(ticket, options);
    if (result.success) {
      sessions.push(result.session);
      successCount++;
    } else {
      errors.push({ ticketId: ticket ? ticket.ticketId : undefined, error: result.error, code: result.code });
    }
  });

  return {
    success: errors.length === 0,
    sessions: sessions,
    errors: errors.length > 0 ? errors : undefined,
    summary: {
      total: tickets.length,
      success: successCount,
      failed: errors.length
    }
  };
}

// ============================================================================
// Session Lifecycle
// ============================================================================

/**
 * Starts a session (PLANNED → RUNNING).
 * Only transitions status; does NOT execute anything.
 *
 * @param {string} sessionId
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function startSession(sessionId) {
  var session = store.getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: types.SESSION_ERROR_CODES.SESSION_NOT_FOUND };
  }

  var transResult = validator.validateSessionTransition(session, types.SESSION_STATUS.RUNNING);
  if (!transResult.valid) {
    return { success: false, error: transResult.errors[0].message, code: transResult.errors[0].code };
  }

  var updated = store.updateSession(sessionId, {
    status: types.SESSION_STATUS.RUNNING,
    updatedAt: new Date().toISOString()
  });

  return { success: true, session: updated };
}

/**
 * Completes a session (RUNNING → COMPLETED).
 * Does NOT execute; only updates status.
 *
 * @param {string} sessionId
 * @param {Object} [result] — Optional dry-run result data
 * @returns {{ success: boolean, session?: Object, error?: string }}
 */
function completeSession(sessionId, result) {
  var session = store.getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: types.SESSION_ERROR_CODES.SESSION_NOT_FOUND };
  }

  var transResult = validator.validateSessionTransition(session, types.SESSION_STATUS.COMPLETED);
  if (!transResult.valid) {
    return { success: false, error: transResult.errors[0].message, code: transResult.errors[0].code };
  }

  var updates = {
    status: types.SESSION_STATUS.COMPLETED,
    updatedAt: new Date().toISOString()
  };

  if (result) {
    updates.dryRunResult = result;
  }

  var updated = store.updateSession(sessionId, updates);
  return { success: true, session: updated };
}

/**
 * Fails a session (RUNNING → FAILED).
 *
 * @param {string} sessionId
 * @param {string} reason
 * @returns {{ success: boolean, session?: Object, error?: string }}
 */
function failSession(sessionId, reason) {
  var session = store.getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: types.SESSION_ERROR_CODES.SESSION_NOT_FOUND };
  }

  var transResult = validator.validateSessionTransition(session, types.SESSION_STATUS.FAILED);
  if (!transResult.valid) {
    return { success: false, error: transResult.errors[0].message, code: transResult.errors[0].code };
  }

  var updated = store.updateSession(sessionId, {
    status: types.SESSION_STATUS.FAILED,
    updatedAt: new Date().toISOString(),
    dryRunResult: { error: reason || 'Unknown failure' }
  });

  return { success: true, session: updated };
}

/**
 * Cancels a session.
 *
 * @param {string} sessionId
 * @param {string} reason
 * @returns {{ success: boolean, session?: Object, error?: string }}
 */
function cancelSession(sessionId, reason) {
  var session = store.getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: types.SESSION_ERROR_CODES.SESSION_NOT_FOUND };
  }

  var transResult = validator.validateSessionTransition(session, types.SESSION_STATUS.CANCELLED);
  if (!transResult.valid) {
    return { success: false, error: transResult.errors[0].message, code: transResult.errors[0].code };
  }

  var updated = store.updateSession(sessionId, {
    status: types.SESSION_STATUS.CANCELLED,
    updatedAt: new Date().toISOString(),
    dryRunResult: { reason: reason || 'Cancelled' }
  });

  return { success: true, session: updated };
}

// ============================================================================
// Query
// ============================================================================

/**
 * Gets a session by ID.
 * @param {string} sessionId
 * @returns {Object|null}
 */
function getDispatchSession(sessionId) {
  return store.getSession(sessionId);
}

/**
 * Lists sessions with optional filtering.
 * @param {Object} [filter]
 * @returns {Object[]}
 */
function listDispatchSessions(filter) {
  return store.listSessions(filter);
}

// ============================================================================
// Snapshot
// ============================================================================

/**
 * Generates a snapshot summary of all sessions in the store.
 * @returns {Object} Snapshot
 */
function generateSessionSnapshot() {
  var sessions = store.listSessions();
  return types.createSessionSnapshot(sessions);
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  // Core
  createDispatchSession: createDispatchSession,
  createDispatchSessions: createDispatchSessions,

  // Lifecycle
  startSession: startSession,
  completeSession: completeSession,
  failSession: failSession,
  cancelSession: cancelSession,

  // Query
  getDispatchSession: getDispatchSession,
  listDispatchSessions: listDispatchSessions,

  // Snapshot
  generateSessionSnapshot: generateSessionSnapshot
};
