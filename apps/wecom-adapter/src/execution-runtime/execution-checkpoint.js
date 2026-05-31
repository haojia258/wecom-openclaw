/**
 * execution-checkpoint.js
 * P9.7.1 Execution Session Runtime — Checkpoint Runtime.
 *
 * Implements checkpoint create / list / restore-plan (dry-run only).
 *
 * Safety rules:
 *   - restoreCheckpointPlan() ONLY generates a recovery plan
 *   - it does NOT actually restore state
 *   - no shell, no exec, no pm2, no deploy, no nginx, no .env
 *   - no real rollback, no real dispatch, no real browser
 */

'use strict';

var t = require('./execution-types');
var v = require('./execution-validator');
var store = require('./execution-store');

// ============================================================================
// createCheckpoint(session, step, snapshot) → { success, checkpoint?, error? }
// ============================================================================

/**
 * Create a checkpoint for a running session.
 *
 * @param {Object} session   — execution session object
 * @param {string} step      — stage name (e.g., 'assignment', 'dispatch', 'execution')
 * @param {Object} snapshot  — state snapshot at checkpoint time
 * @param {Object} [options]
 * @returns {{ success: boolean, checkpoint?: Object, error?: string, code?: string }}
 */
function createCheckpoint(session, step, snapshot, options) {
  options = options || {};

  // Validate session — only require executionSessionId + status
  if (!session || typeof session !== 'object') {
    return {
      success: false,
      error: 'session must be a valid execution session object',
      code:  t.EXECUTION_ERROR_CODES.INVALID_SESSION
    };
  }
  if (!session.executionSessionId || typeof session.executionSessionId !== 'string') {
    return {
      success: false,
      error: 'session.executionSessionId is required and must be a string',
      code:  t.EXECUTION_ERROR_CODES.INVALID_SESSION_ID
    };
  }
  if (session.executionSessionId.indexOf('exec_') !== 0) {
    return {
      success: false,
      error: 'session.executionSessionId must start with "exec_"',
      code:  t.EXECUTION_ERROR_CODES.INVALID_SESSION_ID
    };
  }
  if (!session.status || typeof session.status !== 'string') {
    return {
      success: false,
      error: 'session.status is required and must be a string',
      code:  t.EXECUTION_ERROR_CODES.INVALID_STATUS
    };
  }

  // Create checkpoint object
  var cp;
  try {
    cp = t.createCheckpoint(session.executionSessionId, step, snapshot, {
      checkpointId: options.checkpointId,
      metadata:     options.metadata
    });
  } catch (e) {
    return {
      success: false,
      error: 'Failed to create checkpoint: ' + e.message,
      code:  t.EXECUTION_ERROR_CODES.INVALID_CHECKPOINT
    };
  }

  // Validate checkpoint
  var cpResult = v.validateCheckpoint(cp);
  if (!cpResult.valid) {
    return {
      success: false,
      error: cpResult.errors[0].message,
      code:  cpResult.errors[0].code
    };
  }

  // Persist
  try {
    store.createCheckpointRecord(cp);
  } catch (e) {
    return {
      success: false,
      error: 'Failed to persist checkpoint: ' + e.message,
      code:  t.EXECUTION_ERROR_CODES.INVALID_CHECKPOINT
    };
  }

  return { success: true, checkpoint: cp };
}

// ============================================================================
// listCheckpoints(sessionId) → checkpoint[]
// ============================================================================

/**
 * List all checkpoints for a given session, sorted by creation time (oldest first).
 *
 * @param {string} sessionId
 * @returns {Object[]}
 */
function listCheckpoints(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return [];
  }

  var all = store.listCheckpointRecords({ sessionId: sessionId });
  return all;
}

// ============================================================================
// getCheckpoint(checkpointId) → checkpoint | null
// ============================================================================

/**
 * Get a single checkpoint by its ID.
 *
 * @param {string} checkpointId
 * @returns {Object|null}
 */
function getCheckpoint(checkpointId) {
  if (!checkpointId || typeof checkpointId !== 'string') {
    return null;
  }
  return store.getCheckpointRecord(checkpointId);
}

// ============================================================================
// restoreCheckpointPlan(sessionId, checkpointId) → { success, plan?, error? }
// ============================================================================

/**
 * Generate a restore/recovery PLAN from a checkpoint.
 *
 * IMPORTANT: This does NOT actually restore state.
 * It only generates a plan describing what a restore would look like.
 * This is a dry-run / supervised-only operation.
 *
 * @param {string} sessionId
 * @param {string} checkpointId
 * @param {Object} [options]
 * @returns {{ success: boolean, plan?: Object, error?: string, code?: string }}
 */
function restoreCheckpointPlan(sessionId, checkpointId, options) {
  options = options || {};

  // Validate sessionId
  if (!sessionId || typeof sessionId !== 'string') {
    return {
      success: false,
      error: 'sessionId is required and must be a string',
      code:  t.EXECUTION_ERROR_CODES.INVALID_SESSION_ID
    };
  }

  // Fetch checkpoint
  var cp = store.getCheckpointRecord(checkpointId);
  if (!cp) {
    return {
      success: false,
      error: 'Checkpoint not found: ' + checkpointId,
      code:  t.EXECUTION_ERROR_CODES.CHECKPOINT_NOT_FOUND
    };
  }

  // Verify checkpoint belongs to session
  if (cp.sessionId !== sessionId) {
    return {
      success: false,
      error: 'Checkpoint ' + checkpointId + ' does not belong to session ' + sessionId,
      code:  t.EXECUTION_ERROR_CODES.SESSION_MISMATCH
    };
  }

  // Generate recovery plan (dry-run — no actual state change)
  var plan = {
    type:         'restore-checkpoint',
    sessionId:    sessionId,
    checkpointId:  checkpointId,
    snapshot:     cp.snapshot || {},
    dryRun:       true
  };

  return { success: true, plan: plan };
}

// ============================================================================
// deleteCheckpoint(checkpointId) → boolean
// ============================================================================

/**
 * Delete a checkpoint record.
 *
 * @param {string} checkpointId
 * @returns {boolean}
 */
function deleteCheckpoint(checkpointId) {
  return store.deleteCheckpointRecord(checkpointId);
}

// ============================================================================
// listAllCheckpoints(filter) → checkpoint[]
// ============================================================================

/**
 * List all checkpoints across all sessions, with optional filtering.
 *
 * @param {Object} [filter] — { sessionId?, step? }
 * @returns {Object[]}
 */
function listAllCheckpoints(filter) {
  return store.listCheckpointRecords(filter || {});
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  createCheckpoint:     createCheckpoint,
  listCheckpoints:      listCheckpoints,
  getCheckpoint:        getCheckpoint,
  restoreCheckpointPlan:restoreCheckpointPlan,
  deleteCheckpoint:     deleteCheckpoint,
  listAllCheckpoints:   listAllCheckpoints
};
