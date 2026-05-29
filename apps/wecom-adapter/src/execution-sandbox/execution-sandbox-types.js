/**
 * execution-sandbox-types.js
 * P9.7.2 Execution Sandbox — Type definitions, constants, and factory functions.
 *
 * Defines SandboxSession, SandboxPlan, SandboxCheckpoint structures,
 * status enums, state transitions, and error codes.
 *
 * Safety constraints:
 *   - No real task execution, no shell/exec/spawn, no pm2/deploy/nginx
 *   - No HTTP/WebSocket, no gateway/agent-host
 *   - Dry-run only
 */

'use strict';

// ============================================================================
// Sandbox Session Status — 5-state lifecycle
// ============================================================================
const SANDBOX_STATUS = {
  CREATED:   'created',
  RUNNING:   'running',
  PAUSED:    'paused',
  COMPLETED: 'completed',
  ARCHIVED:  'archived'
};

const SANDBOX_STATUS_VALUES = Object.values(SANDBOX_STATUS);

// ============================================================================
// Allowed State Transitions
// ============================================================================
const ALLOWED_TRANSITIONS = {};
ALLOWED_TRANSITIONS[SANDBOX_STATUS.CREATED]   = [SANDBOX_STATUS.RUNNING];
ALLOWED_TRANSITIONS[SANDBOX_STATUS.RUNNING]   = [SANDBOX_STATUS.PAUSED, SANDBOX_STATUS.COMPLETED];
ALLOWED_TRANSITIONS[SANDBOX_STATUS.PAUSED]    = [SANDBOX_STATUS.RUNNING];
ALLOWED_TRANSITIONS[SANDBOX_STATUS.COMPLETED] = [SANDBOX_STATUS.ARCHIVED];
ALLOWED_TRANSITIONS[SANDBOX_STATUS.ARCHIVED]  = [];

// ============================================================================
// Error Codes
// ============================================================================
const ERROR_CODES = {
  INVALID_SESSION:       'INVALID_SESSION',
  INVALID_SESSION_ID:    'INVALID_SESSION_ID',
  INVALID_STATUS:        'INVALID_STATUS',
  INVALID_TRANSITION:    'INVALID_TRANSITION',
  INVALID_PLAN:          'INVALID_PLAN',
  INVALID_AGENT:         'INVALID_AGENT',
  SESSION_NOT_FOUND:     'SESSION_NOT_FOUND',
  SESSION_ALREADY_EXISTS:'SESSION_ALREADY_EXISTS',
  CHECKPOINT_NOT_FOUND:  'CHECKPOINT_NOT_FOUND',
  CHECKPOINT_MISMATCH:   'CHECKPOINT_MISMATCH',
  STORE_WRITE_FAILED:    'STORE_WRITE_FAILED',
  STORE_READ_FAILED:     'STORE_READ_FAILED',
  IDEMPOTENT_REJECTED:   'IDEMPOTENT_REJECTED'
};

// ============================================================================
// Audit Event Types
// ============================================================================
const AUDIT_EVENT = {
  SESSION_CREATED:   'sandbox_session_created',
  SESSION_STARTED:   'sandbox_session_started',
  SESSION_PAUSED:    'sandbox_session_paused',
  SESSION_RESUMED:   'sandbox_session_resumed',
  SESSION_COMPLETED: 'sandbox_session_completed',
  SESSION_ARCHIVED:  'sandbox_session_archived',
  CHECKPOINT_CREATED:'sandbox_checkpoint_created',
  RESTORE_PLANNED:   'sandbox_restore_planned'
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Generate a unique sandbox session ID.
 * @returns {string}
 */
function createSessionId() {
  return 'exec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

/**
 * Generate a unique checkpoint ID.
 * @returns {string}
 */
function createCheckpointId() {
  return 'cp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * Generate a unique audit event ID.
 * @returns {string}
 */
function createAuditEventId() {
  return 'audit_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * Create a new SandboxSession object.
 *
 * @param {Object} plan   — dispatchPlan-like object
 * @param {Object} agent  — assigned agent info
 * @param {Object} [options]
 * @param {string} [options.sessionId]  — override session ID
 * @param {string} [options.status]     — override initial status
 * @returns {Object}
 */
function createSandboxSession(plan, agent, options) {
  options = options || {};
  var now = new Date().toISOString();

  return {
    sessionId:       options.sessionId || createSessionId(),
    planId:          (plan && plan.planId) || (plan && plan.dispatchPlanId) || null,
    reviewId:        (plan && plan.reviewId) || null,
    dispatchPlanId:  (plan && plan.dispatchPlanId) || null,
    status:          options.status || SANDBOX_STATUS.CREATED,
    assignedAgent:   agent || { name: 'sandbox-agent', type: 'dry-run' },
    checkpointIds:   [],
    auditTrail:      [],
    createdAt:       now,
    updatedAt:       now,
    metadata:        options.metadata || {}
  };
}

/**
 * Create a sandbox checkpoint object.
 *
 * @param {string} sessionId
 * @param {string} step
 * @param {Object} snapshot
 * @param {Object} [options]
 * @returns {Object}
 */
function createCheckpoint(sessionId, step, snapshot, options) {
  options = options || {};
  return {
    checkpointId: createCheckpointId(),
    sessionId:    sessionId,
    step:         step || 'unknown',
    snapshot:     snapshot || {},
    dryRun:       options.dryRun !== undefined ? options.dryRun : true,
    createdAt:    new Date().toISOString()
  };
}

/**
 * Create an audit event object.
 *
 * @param {string} sessionId
 * @param {string} eventType
 * @param {Object} [details]
 * @returns {Object}
 */
function createAuditEvent(sessionId, eventType, details) {
  return {
    eventId:   createAuditEventId(),
    sessionId: sessionId,
    event:     eventType,
    details:   details || {},
    createdAt: new Date().toISOString()
  };
}

/**
 * Check if a transition is valid.
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
function isValidTransition(fromStatus, toStatus) {
  var allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed) return false;
  return allowed.indexOf(toStatus) !== -1;
}

/**
 * Check if a status is terminal (cannot transition further).
 *
 * @param {string} status
 * @returns {boolean}
 */
function isTerminalStatus(status) {
  var allowed = ALLOWED_TRANSITIONS[status];
  return !allowed || allowed.length === 0;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  SANDBOX_STATUS:          SANDBOX_STATUS,
  SANDBOX_STATUS_VALUES:   SANDBOX_STATUS_VALUES,
  ALLOWED_TRANSITIONS:     ALLOWED_TRANSITIONS,
  ERROR_CODES:             ERROR_CODES,
  AUDIT_EVENT:             AUDIT_EVENT,

  createSessionId:         createSessionId,
  createCheckpointId:       createCheckpointId,
  createAuditEventId:     createAuditEventId,
  createSandboxSession:   createSandboxSession,
  createCheckpoint:        createCheckpoint,
  createAuditEvent:       createAuditEvent,
  isValidTransition:       isValidTransition,
  isTerminalStatus:        isTerminalStatus
};
