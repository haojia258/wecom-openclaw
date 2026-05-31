/**
 * execution-sandbox-runtime.js
 * P9.7.2 Execution Sandbox — Core sandbox execution logic.
 *
 * Provides the main API for sandbox session lifecycle management.
 * All operations are dry-run / read-only — no real task execution.
 *
 * Safety constraints:
 *   - No real task execution, no shell/exec/spawn, no pm2/deploy/nginx
 *   - No HTTP/WebSocket, no gateway/agent-host
 *   - Dry-run only
 */

'use strict';

var t   = require('./execution-sandbox-types');
var v   = require('./execution-sandbox-validator');
var st  = require('./execution-sandbox-store');

// ============================================================================
// Core: createSandboxSession
// ============================================================================

/**
 * Create a new sandbox session from a plan and agent assignment.
 *
 * @param {Object} plan   — dispatchPlan-like object
 * @param {Object} agent  — assigned agent info
 * @param {Object} [options]
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function createSandboxSession(plan, agent, options) {
  // Validate plan
  var planResult = v.validatePlan(plan);
  if (!planResult.valid) {
    return { success: false, error: planResult.errors[0].message, code: planResult.errors[0].code };
  }

  // Validate agent
  var agentResult = v.validateAgent(agent || { name: 'sandbox-agent', type: 'dry-run' });
  if (!agentResult.valid) {
    return { success: false, error: agentResult.errors[0].message, code: agentResult.errors[0].code };
  }

  // Create session object
  var session = t.createSandboxSession(plan, agent, options);

  // Persist
  var stored = st.createSession(session);
  if (!stored) {
    return { success: false, error: 'Session already exists or store write failed', code: t.ERROR_CODES.SESSION_ALREADY_EXISTS };
  }

  // Record audit
  st.recordAudit(t.createAuditEvent(session.sessionId, t.AUDIT_EVENT.SESSION_CREATED, {
    planId: session.planId,
    agent:  session.assignedAgent
  }));

  return { success: true, session: stored };
}

// ============================================================================
// Core: startSandboxSession
// ============================================================================

/**
 * Start a sandbox session: created → running.
 *
 * @param {string} sessionId
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function startSandboxSession(sessionId) {
  var session = st.getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: t.ERROR_CODES.SESSION_NOT_FOUND };
  }

  if (session.status === t.SANDBOX_STATUS.RUNNING) {
    return { success: true, session: session };
  }

  var transResult = v.validateTransition(session.status, t.SANDBOX_STATUS.RUNNING);
  if (!transResult.valid) {
    return { success: false, error: transResult.errors[0].message, code: transResult.errors[0].code };
  }

  session.status = t.SANDBOX_STATUS.RUNNING;
  session.updatedAt = new Date().toISOString();
  st.updateSession(sessionId, { status: session.status, updatedAt: session.updatedAt });

  st.recordAudit(t.createAuditEvent(sessionId, t.AUDIT_EVENT.SESSION_STARTED, {
    fromStatus: transResult.errors.length === 0 ? 'created' : session.status
  }));

  return { success: true, session: session };
}

// ============================================================================
// Core: pauseSandboxSession
// ============================================================================

/**
 * Pause a sandbox session: running → paused.
 *
 * @param {string} sessionId
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function pauseSandboxSession(sessionId) {
  var session = st.getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: t.ERROR_CODES.SESSION_NOT_FOUND };
  }

  var transResult = v.validateTransition(session.status, t.SANDBOX_STATUS.PAUSED);
  if (!transResult.valid) {
    return { success: false, error: transResult.errors[0].message, code: transResult.errors[0].code };
  }

  session.status = t.SANDBOX_STATUS.PAUSED;
  session.updatedAt = new Date().toISOString();
  st.updateSession(sessionId, { status: session.status, updatedAt: session.updatedAt });

  st.recordAudit(t.createAuditEvent(sessionId, t.AUDIT_EVENT.SESSION_PAUSED, {}));

  return { success: true, session: session };
}

// ============================================================================
// Core: resumeSandboxSession
// ============================================================================

/**
 * Resume a sandbox session: paused → running.
 *
 * @param {string} sessionId
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function resumeSandboxSession(sessionId) {
  var session = st.getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: t.ERROR_CODES.SESSION_NOT_FOUND };
  }

  var transResult = v.validateTransition(session.status, t.SANDBOX_STATUS.RUNNING);
  if (!transResult.valid) {
    return { success: false, error: transResult.errors[0].message, code: transResult.errors[0].code };
  }

  session.status = t.SANDBOX_STATUS.RUNNING;
  session.updatedAt = new Date().toISOString();
  st.updateSession(sessionId, { status: session.status, updatedAt: session.updatedAt });

  st.recordAudit(t.createAuditEvent(sessionId, t.AUDIT_EVENT.SESSION_RESUMED, {}));

  return { success: true, session: session };
}

// ============================================================================
// Core: completeSandboxSession
// ============================================================================

/**
 * Complete a sandbox session: running → completed.
 *
 * @param {string} sessionId
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function completeSandboxSession(sessionId) {
  var session = st.getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: t.ERROR_CODES.SESSION_NOT_FOUND };
  }

  // Idempotent
  if (session.status === t.SANDBOX_STATUS.COMPLETED) {
    return { success: true, session: session };
  }

  var transResult = v.validateTransition(session.status, t.SANDBOX_STATUS.COMPLETED);
  if (!transResult.valid) {
    return { success: false, error: transResult.errors[0].message, code: transResult.errors[0].code };
  }

  session.status = t.SANDBOX_STATUS.COMPLETED;
  session.updatedAt = new Date().toISOString();
  st.updateSession(sessionId, { status: session.status, updatedAt: session.updatedAt });

  st.recordAudit(t.createAuditEvent(sessionId, t.AUDIT_EVENT.SESSION_COMPLETED, {}));

  return { success: true, session: session };
}

// ============================================================================
// Core: archiveSandboxSession
// ============================================================================

/**
 * Archive a sandbox session: completed → archived.
 *
 * @param {string} sessionId
 * @returns {{ success: boolean, session?: Object, error?: string, code?: string }}
 */
function archiveSandboxSession(sessionId) {
  var session = st.getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: t.ERROR_CODES.SESSION_NOT_FOUND };
  }

  var transResult = v.validateTransition(session.status, t.SANDBOX_STATUS.ARCHIVED);
  if (!transResult.valid) {
    return { success: false, error: transResult.errors[0].message, code: transResult.errors[0].code };
  }

  session.status = t.SANDBOX_STATUS.ARCHIVED;
  session.updatedAt = new Date().toISOString();
  st.updateSession(sessionId, { status: session.status, updatedAt: session.updatedAt });

  st.recordAudit(t.createAuditEvent(sessionId, t.AUDIT_EVENT.SESSION_ARCHIVED, {}));

  return { success: true, session: session };
}

// ============================================================================
// Checkpoint
// ============================================================================

/**
 * Create a checkpoint for a sandbox session.
 *
 * @param {string} sessionId
 * @param {boolean} [dryRun] — default: true
 * @returns {{ success: boolean, checkpoint?: Object, error?: string, code?: string }}
 */
function checkpointSession(sessionId, dryRun) {
  var session = st.getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found: ' + sessionId, code: t.ERROR_CODES.SESSION_NOT_FOUND };
  }

  if (!session.sessionId || session.sessionId.indexOf('exec_') !== 0) {
    return { success: false, error: 'Invalid session ID format', code: t.ERROR_CODES.INVALID_SESSION_ID };
  }

  var cp = t.createCheckpoint(sessionId, session.status, {
    status:      session.status,
    planId:      session.planId,
    agent:       session.assignedAgent
  }, { dryRun: dryRun !== undefined ? dryRun : true });

  var stored = st.createCheckpointRecord(cp);
  if (!stored) {
    return { success: false, error: 'Failed to store checkpoint', code: t.ERROR_CODES.STORE_WRITE_FAILED };
  }

  // Update session's checkpoint list
  session.checkpointIds = (session.checkpointIds || []).concat([cp.checkpointId]);
  st.updateSession(sessionId, { checkpointIds: session.checkpointIds, updatedAt: new Date().toISOString() });

  st.recordAudit(t.createAuditEvent(sessionId, t.AUDIT_EVENT.CHECKPOINT_CREATED, {
    checkpointId: cp.checkpointId,
    dryRun:       cp.dryRun
  }));

  return { success: true, checkpoint: cp };
}

/**
 * Generate a restore plan for a checkpoint (dry-run only).
 *
 * @param {string} sessionId
 * @param {string} checkpointId
 * @returns {{ success: boolean, plan?: Object, error?: string, code?: string }}
 */
function restoreCheckpointPlan(sessionId, checkpointId) {
  var cp = st.getCheckpoint(checkpointId);
  if (!cp) {
    return { success: false, error: 'Checkpoint not found: ' + checkpointId, code: t.ERROR_CODES.CHECKPOINT_NOT_FOUND };
  }

  if (cp.sessionId !== sessionId) {
    return { success: false, error: 'Checkpoint does not belong to session', code: t.ERROR_CODES.CHECKPOINT_MISMATCH };
  }

  st.recordAudit(t.createAuditEvent(sessionId, t.AUDIT_EVENT.RESTORE_PLANNED, {
    checkpointId: checkpointId,
    dryRun:       true
  }));

  return {
    success: true,
    plan: {
      type:         'restore-checkpoint',
      sessionId:    sessionId,
      checkpointId: checkpointId,
      snapshot:     cp.snapshot || {},
      dryRun:       true
    }
  };
}

// ============================================================================
// Snapshot
// ============================================================================

/**
 * Generate a sandbox snapshot with sessions, checkpoints, and metrics.
 *
 * @returns {{ sessions: Object[], checkpoints: Object[], metrics: Object }}
 */
function generateSandboxSnapshot() {
  var sessions    = st.listSessions();
  var checkpointsList = st.listCheckpoints();
  var audit       = st.listAudit();

  return {
    sessions:    sessions,
    checkpoints: checkpointsList,
    metrics: {
      totalSessions:     sessions.length,
      runningSessions:   sessions.filter(function (s) { return s.status === t.SANDBOX_STATUS.RUNNING; }).length,
      pausedSessions:    sessions.filter(function (s) { return s.status === t.SANDBOX_STATUS.PAUSED; }).length,
      completedSessions: sessions.filter(function (s) { return s.status === t.SANDBOX_STATUS.COMPLETED; }).length,
      archivedSessions:  sessions.filter(function (s) { return s.status === t.SANDBOX_STATUS.ARCHIVED; }).length,
      totalCheckpoints:  checkpointsList.length,
      totalAuditEvents:  audit.length,
      generatedAt:       new Date().toISOString()
    }
  };
}

// ============================================================================
// Query
// ============================================================================

function getSandboxSession(sessionId) {
  return st.getSession(sessionId);
}

function listSandboxSessions(filter) {
  return st.listSessions(filter);
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  createSandboxSession:    createSandboxSession,
  startSandboxSession:    startSandboxSession,
  pauseSandboxSession:    pauseSandboxSession,
  resumeSandboxSession:   resumeSandboxSession,
  completeSandboxSession:  completeSandboxSession,
  archiveSandboxSession:   archiveSandboxSession,
  checkpointSession:       checkpointSession,
  restoreCheckpointPlan:   restoreCheckpointPlan,
  generateSandboxSnapshot: generateSandboxSnapshot,
  getSandboxSession:       getSandboxSession,
  listSandboxSessions:    listSandboxSessions
};
