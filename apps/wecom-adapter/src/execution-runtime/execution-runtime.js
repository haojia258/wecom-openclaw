/**
 * execution-runtime.js
 * P9.7.1 Execution Session Runtime — Core Runtime API.
 *
 * Manages the lifecycle of execution sessions:
 *   created → ready → running → completed / failed
 *
 * Safety rules (MVP):
 *   - All methods ONLY update state, record audit, create checkpoints
 *   - NO real task execution
 *   - NO real rollback
 *   - NO real dispatch
 *   - Only dry-run and supervised modes
 *   - No shell, no exec, no spawn, no pm2, no deploy
 *   - No nginx, no .env, no gateway, no agent-host
 *   - No browser automation, no playwright
 */

'use strict';

var t = require('./execution-types');
var v = require('./execution-validator');
var sm = require('./execution-state-machine');
var cp = require('./execution-checkpoint');
var au = require('./execution-audit');
var st = require('./execution-store');

// ============================================================================
// Core: createExecutionSession()
// ============================================================================

/**
 * Create a new ExecutionSession from dispatch plan + assignment plan + approval.
 *
 * @param {Object} dispatchPlan    — dispatch plan (P9.5.5)
 * @param {Object} assignmentPlan  — assignment plan (P9.6.5)
 * @param {Object} approval        — approval record (P9.6.3)
 * @param {Object} [options]
 * @param {string} [options.mode]  — 'dry-run' | 'supervised'
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function createExecutionSession(dispatchPlan, assignmentPlan, approval, options) {
  options = options || {};

  // Validate mode FIRST (before creating session)
  var mode = options.mode || t.EXECUTION_MODE.DRY_RUN;
  var modeResult = v.validateExecutionMode(mode);
  if (!modeResult.valid) {
    return { success: false, error: modeResult.errors[0].message, code: modeResult.errors[0].code };
  }

  // Create session object
  var session;
  try {
    session = t.createExecutionSession(dispatchPlan, assignmentPlan, approval, {
      mode:     mode,
      metadata: options.metadata
    });
  } catch (e) {
    return { success: false, error: 'Failed to create session: ' + e.message, code: t.EXECUTION_ERROR_CODES.INVALID_SESSION };
  }

  // Validate session
  var result = v.validateExecutionSession(session);
  if (!result.valid) {
    return { success: false, error: result.errors[0].message, code: result.errors[0].code };
  }

  // Persist
  try {
    st.createSessionRecord(session);
  } catch (e) {
    return { success: false, error: 'Failed to persist session: ' + e.message, code: t.EXECUTION_ERROR_CODES.INVALID_SESSION };
  }

  // Record audit event
  au.recordAuditEvent(session.executionSessionId, t.AUDIT_EVENT_TYPE.SESSION_CREATED, t.ACTOR_TYPE.SYSTEM, {
    dispatchPlanId:    session.dispatchPlanId,
    assignmentPlanId: session.assignmentPlanId,
    approvalId:       session.approvalId,
    mode:             session.mode
  });

  return { success: true, session: session };
}

// ============================================================================
// Core: startExecutionSession(sessionId)
// ============================================================================

/**
 * Transition: created → ready → running
 * For MVP: only transitions state, does NOT execute real tasks.
 *
 * @param {string} sessionId
 * @param {string} [actor] — human | system | agent
 * @param {Object} [options]
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function startExecutionSession(sessionId, actor, options) {
  options = options || {};

  // Fetch session
  var session = st.getSessionRecord(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: t.EXECUTION_ERROR_CODES.SESSION_NOT_FOUND };
  }

  // Must be in 'created' or 'ready' status to start
  // created → ready (first start)
  // ready   → running (begin execution)
  var targetStatus;
  if (session.status === t.EXECUTION_STATUS.CREATED) {
    targetStatus = t.EXECUTION_STATUS.READY;
  } else if (session.status === t.EXECUTION_STATUS.READY) {
    targetStatus = t.EXECUTION_STATUS.RUNNING;
  } else {
    return {
      success: false,
      error: 'Session must be in "created" or "ready" status to start. Current: ' + session.status,
      code: t.EXECUTION_ERROR_CODES.INVALID_TRANSITION
    };
  }

  // Validate transition
  var transResult = sm.validateTransition(session.status, targetStatus);
  if (!transResult.valid) {
    return { success: false, error: transResult.error.message, code: transResult.error.code };
  }

  // Apply transition
  var trans = sm.transition(session, targetStatus, actor);
  if (!trans.success) {
    return { success: false, error: trans.error.message, code: trans.error.code };
  }

  var updated = trans.session;

  // If transitioning to RUNNING, also create a checkpoint
  if (targetStatus === t.EXECUTION_STATUS.RUNNING) {
    var cpResult = cp.createCheckpoint(updated, 'execution_start', {
      status:      updated.status,
      mode:        updated.mode,
      startedAt:   new Date().toISOString()
    });
    if (cpResult.success) {
      updated.checkpoints = (updated.checkpoints || []).concat([cpResult.checkpoint.checkpointId]);
      // Also push full checkpoint object to session.checkpoints array
      if (!updated.checkpoints) updated.checkpoints = [];
      // Store only ID refs in the session's checkpoint list
    }
  }

  // Record audit
  var evtType = targetStatus === t.EXECUTION_STATUS.READY
    ? t.AUDIT_EVENT_TYPE.SESSION_STARTED
    : t.AUDIT_EVENT_TYPE.SESSION_RESUMED;
  au.recordAuditEvent(sessionId, evtType, actor || t.ACTOR_TYPE.SYSTEM, {
    fromStatus: session.status,
    toStatus:   targetStatus
  });

  // Persist updated session
  try {
    st.updateSessionRecord(sessionId, {
      status:       updated.status,
      checkpoints:  updated.checkpoints,
      updatedAt:    updated.updatedAt
    });
  } catch (e) {
    return { success: false, error: 'Failed to persist: ' + e.message, code: t.EXECUTION_ERROR_CODES.INVALID_SESSION };
  }

  return { success: true, session: updated };
}

// ============================================================================
// Core: pauseExecutionSession(sessionId, actor, reason)
// ============================================================================

/**
 * Transition: running → paused
 *
 * @param {string} sessionId
 * @param {string} [actor]
 * @param {string} [reason]
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function pauseExecutionSession(sessionId, actor, reason) {
  var session = st.getSessionRecord(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: t.EXECUTION_ERROR_CODES.SESSION_NOT_FOUND };
  }

  var transResult = sm.validateTransition(session.status, t.EXECUTION_STATUS.PAUSED);
  if (!transResult.valid) {
    return { success: false, error: transResult.error.message, code: transResult.error.code };
  }

  var trans = sm.transition(session, t.EXECUTION_STATUS.PAUSED, actor);
  if (!trans.success) {
    return { success: false, error: trans.error.message, code: trans.error.code };
  }

  // Create checkpoint on pause
  cp.createCheckpoint(trans.session, 'pause', {
    status:    trans.session.status,
    reason:    reason || 'User paused',
    pausedAt:  new Date().toISOString()
  });

  au.recordAuditEvent(sessionId, t.AUDIT_EVENT_TYPE.SESSION_PAUSED, actor || t.ACTOR_TYPE.SYSTEM, {
    reason: reason || 'No reason provided'
  });

  st.updateSessionRecord(sessionId, {
    status:    trans.session.status,
    updatedAt: trans.session.updatedAt
  });

  return { success: true, session: trans.session };
}

// ============================================================================
// Core: resumeExecutionSession(sessionId, actor)
// ============================================================================

/**
 * Transition: paused → running
 *
 * @param {string} sessionId
 * @param {string} [actor]
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function resumeExecutionSession(sessionId, actor) {
  var session = st.getSessionRecord(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: t.EXECUTION_ERROR_CODES.SESSION_NOT_FOUND };
  }

  var transResult = sm.validateTransition(session.status, t.EXECUTION_STATUS.RUNNING);
  if (!transResult.valid) {
    return { success: false, error: transResult.error.message, code: transResult.error.code };
  }

  var trans = sm.transition(session, t.EXECUTION_STATUS.RUNNING, actor);
  if (!trans.success) {
    return { success: false, error: trans.error.message, code: trans.error.code };
  }

  au.recordAuditEvent(sessionId, t.AUDIT_EVENT_TYPE.SESSION_RESUMED, actor || t.ACTOR_TYPE.SYSTEM, {
    fromStatus: session.status,
    toStatus:   t.EXECUTION_STATUS.RUNNING
  });

  st.updateSessionRecord(sessionId, {
    status:    trans.session.status,
    updatedAt: trans.session.updatedAt
  });

  return { success: true, session: trans.session };
}

// ============================================================================
// Core: completeExecutionSession(sessionId, actor, summary)
// ============================================================================

/**
 * Transition: running → completed
 *
 * @param {string} sessionId
 * @param {string} [actor]
 * @param {Object} [summary] — execution summary (dry-run only)
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function completeExecutionSession(sessionId, actor, summary) {
  var session = st.getSessionRecord(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: t.EXECUTION_ERROR_CODES.SESSION_NOT_FOUND };
  }

  // Idempotent: already completed
  if (session.status === t.EXECUTION_STATUS.COMPLETED) {
    return { success: true, session: session };
  }

  // Can complete from running only
  if (session.status !== t.EXECUTION_STATUS.RUNNING) {
    return {
      success: false,
      error: 'Session must be in "running" status to complete. Current: ' + session.status,
      code: t.EXECUTION_ERROR_CODES.INVALID_TRANSITION
    };
  }

  var trans = sm.transition(session, t.EXECUTION_STATUS.COMPLETED, actor);
  if (!trans.success) {
    return { success: false, error: trans.error.message, code: trans.error.code };
  }

  au.recordAuditEvent(sessionId, t.AUDIT_EVENT_TYPE.SESSION_COMPLETED, actor || t.ACTOR_TYPE.SYSTEM, {
    summary: summary || 'Execution completed (dry-run)',
    completedAt: new Date().toISOString()
  });

  st.updateSessionRecord(sessionId, {
    status:    trans.session.status,
    updatedAt: trans.session.updatedAt
  });

  return { success: true, session: trans.session };
}

// ============================================================================
// Core: failExecutionSession(sessionId, actor, reason, errorDetails)
// ============================================================================

/**
 * Transition: running → failed
 *
 * @param {string} sessionId
 * @param {string} [actor]
 * @param {string} [reason]
 * @param {Object} [errorDetails]
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function failExecutionSession(sessionId, actor, reason, errorDetails) {
  var session = st.getSessionRecord(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: t.EXECUTION_ERROR_CODES.SESSION_NOT_FOUND };
  }

  var transResult = sm.validateTransition(session.status, t.EXECUTION_STATUS.FAILED);
  if (!transResult.valid) {
    return { success: false, error: transResult.error.message, code: transResult.error.code };
  }

  var trans = sm.transition(session, t.EXECUTION_STATUS.FAILED, actor);
  if (!trans.success) {
    return { success: false, error: trans.error.message, code: trans.error.code };
  }

  // Create checkpoint on failure (for later rollback planning)
  cp.createCheckpoint(trans.session, 'failure', {
    status:      trans.session.status,
    reason:      reason || 'Execution failed',
    errorDetails: errorDetails || {},
    failedAt:     new Date().toISOString()
  });

  au.recordAuditEvent(sessionId, t.AUDIT_EVENT_TYPE.SESSION_FAILED, actor || t.ACTOR_TYPE.SYSTEM, {
    reason:       reason || 'No reason provided',
    errorDetails: errorDetails || {}
  });

  st.updateSessionRecord(sessionId, {
    status:    trans.session.status,
    updatedAt: trans.session.updatedAt
  });

  return { success: true, session: trans.session };
}

// ============================================================================
// Core: rollbackExecutionSession(sessionId, actor, reason)
// ============================================================================

/**
 * Transition: failed → rolled_back
 * Generates a rollback PLAN (dry-run), does NOT execute real rollback.
 *
 * @param {string} sessionId
 * @param {string} [actor]
 * @param {string} [reason]
 * @returns {{ success: boolean, session?: Object, plan?: Object, error?: string, code?: string }}
 */
function rollbackExecutionSession(sessionId, actor, reason) {
  var session = st.getSessionRecord(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: t.EXECUTION_ERROR_CODES.SESSION_NOT_FOUND };
  }

  var transResult = sm.validateTransition(session.status, t.EXECUTION_STATUS.ROLLED_BACK);
  if (!transResult.valid) {
    return { success: false, error: transResult.error.message, code: transResult.error.code };
  }

  var trans = sm.transition(session, t.EXECUTION_STATUS.ROLLED_BACK, actor);
  if (!trans.success) {
    return { success: false, error: trans.error.message, code: trans.error.code };
  }

  // Generate rollback plan (dry-run ONLY)
  var plan = {
    planId:       'rollback_' + Date.now(),
    sessionId:     sessionId,
    rollbackType:  'dry-run',
    estimatedSteps: [
      { step: 1, action: 'notify_stakeholders', description: 'Notify stakeholders of rollback' },
      { step: 2, action: 'archive_session', description: 'Archive failed session' },
      { step: 3, action: 'generate_report', description: 'Generate failure report' }
    ],
    requiresApproval: true,
    createdAt:      new Date().toISOString(),
    reason:          reason || 'Rolled back from failure',
    metadata:       {}
  };

  au.recordAuditEvent(sessionId, t.AUDIT_EVENT_TYPE.ROLLBACK_PLANNED, actor || t.ACTOR_TYPE.SYSTEM, {
    reason:   reason || 'Rolled back from failure',
    planId:   plan.planId
  });

  st.updateSessionRecord(sessionId, {
    status:    trans.session.status,
    updatedAt: trans.session.updatedAt
  });

  return { success: true, session: trans.session, plan: plan };
}

// ============================================================================
// Core: archiveExecutionSession(sessionId, actor, reason)
// ============================================================================

/**
 * Transition: completed → archived
 *
 * @param {string} sessionId
 * @param {string} [actor]
 * @param {string} [reason]
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function archiveExecutionSession(sessionId, actor, reason) {
  var session = st.getSessionRecord(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: t.EXECUTION_ERROR_CODES.SESSION_NOT_FOUND };
  }

  var transResult = sm.validateTransition(session.status, t.EXECUTION_STATUS.ARCHIVED);
  if (!transResult.valid) {
    return { success: false, error: transResult.error.message, code: transResult.error.code };
  }

  var trans = sm.transition(session, t.EXECUTION_STATUS.ARCHIVED, actor);
  if (!trans.success) {
    return { success: false, error: trans.error.message, code: trans.error.code };
  }

  au.recordAuditEvent(sessionId, 'session_archived', actor || t.ACTOR_TYPE.SYSTEM, {
    reason: reason || 'Archived'
  });

  st.updateSessionRecord(sessionId, {
    status:    trans.session.status,
    updatedAt: trans.session.updatedAt
  });

  return { success: true, session: trans.session };
}

// ============================================================================
// Query: getExecutionSession(sessionId)
// ============================================================================

function getExecutionSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return null;
  return st.getSessionRecord(sessionId);
}

// ============================================================================
// Query: listExecutionSessions(filter)
// ============================================================================

function listExecutionSessions(filter) {
  return st.listSessionRecords(filter || {});
}

// ============================================================================
// Snapshot: generateExecutionSnapshot(sessionId)
// ============================================================================

/**
 * Generate an execution snapshot for a specific session.
 *
 * @param {string} sessionId
 * @returns {{ success: boolean, snapshot?: Object, error?: string }}
 */
function generateExecutionSnapshot(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return { success: false, error: 'sessionId is required', code: t.EXECUTION_ERROR_CODES.INVALID_SESSION_ID };
  }

  var session = st.getSessionRecord(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: t.EXECUTION_ERROR_CODES.SESSION_NOT_FOUND };
  }

  var snap = t.createExecutionSnapshot(session);
  if (!snap) {
    return { success: false, error: 'Failed to create snapshot', code: t.EXECUTION_ERROR_CODES.INVALID_SESSION };
  }

  // Enrich with checkpoint/audit counts
  var checkpoints = cp.listCheckpoints(sessionId);
  snap.checkpointCount = checkpoints.length;
  snap.checkpointIds   = checkpoints.map(function (c) { return c.checkpointId; });

  var events = au.listAuditEventsForSession(sessionId);
  snap.auditTrailLength = events.length;
  snap.recentAuditEvents = events.slice(-5).map(function (e) {
    return { event: e.event, createdAt: e.createdAt };
  });

  return { success: true, snapshot: snap };
}

// ============================================================================
// Batch: batchCreateExecutionSessions(requests, options)
// ============================================================================

/**
 * Batch-create multiple execution sessions.
 * Each request: { dispatchPlan, assignmentPlan, approval, options }
 *
 * @param {Object[]} requests
 * @param {Object} [options]
 * @returns {{ success: boolean, sessions?: Object[], errors?: Array, summary?: Object }}
 */
function batchCreateExecutionSessions(requests, options) {
  options = options || {};

  if (!Array.isArray(requests) || requests.length === 0) {
    return { success: false, error: 'At least one request is required', code: t.EXECUTION_ERROR_CODES.EMPTY_BATCH };
  }

  var sessions = [];
  var errors   = [];
  var successCount = 0;

  for (var i = 0; i < requests.length; i++) {
    var req = requests[i] || {};
    var result = createExecutionSession(req.dispatchPlan, req.assignmentPlan, req.approval, req.options);
    if (result.success) {
      sessions.push(result.session);
      successCount++;
    } else {
      errors.push({
        index:  i,
        sessionId: req.dispatchPlan ? (req.dispatchPlan.dispatchPlanId || 'unknown') : 'unknown',
        error:      result.error,
        code:       result.code
      });
    }
  }

  return {
    success:  errors.length === 0,
    sessions: sessions,
    errors:   errors.length > 0 ? errors : undefined,
    summary: {
      total:    requests.length,
      success:  successCount,
      failed:   errors.length
    }
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Core lifecycle
  createExecutionSession:      createExecutionSession,
  startExecutionSession:      startExecutionSession,
  pauseExecutionSession:     pauseExecutionSession,
  resumeExecutionSession:    resumeExecutionSession,
  completeExecutionSession:   completeExecutionSession,
  failExecutionSession:      failExecutionSession,
  rollbackExecutionSession:   rollbackExecutionSession,
  archiveExecutionSession:    archiveExecutionSession,

  // Query
  getExecutionSession:       getExecutionSession,
  listExecutionSessions:    listExecutionSessions,

  // Snapshot
  generateExecutionSnapshot:  generateExecutionSnapshot,

  // Batch
  batchCreateExecutionSessions: batchCreateExecutionSessions
};
