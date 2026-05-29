/**
 * execution-types.js
 * P9.7.1 Execution Session Runtime — Type definitions, constants, and factory functions.
 *
 * Defines the ExecutionSession structure, status enums, execution modes,
 * checkpoint structure, audit event types, and factory functions.
 *
 * Safety constraints:
 *   - No shell, no exec, no spawn, no pm2, no deploy, no nginx, no .env
 *   - No real task execution, no real rollback, no real dispatch
 *   - No browser automation, no playwright, no gateway, no agent-host
 *   - Only dry-run and supervised modes allowed
 */

'use strict';

// ============================================================================
// Execution Status — 7-state lifecycle
// ============================================================================
const EXECUTION_STATUS = {
  CREATED:   'created',
  READY:     'ready',
  RUNNING:   'running',
  PAUSED:    'paused',
  COMPLETED: 'completed',
  FAILED:    'failed',
  ROLLED_BACK:'rolled_back',
  ARCHIVED:  'archived'
};

const EXECUTION_STATUS_VALUES = Object.values(EXECUTION_STATUS);

// ============================================================================
// Allowed State Transitions
// ============================================================================
const ALLOWED_TRANSITIONS = {};
ALLOWED_TRANSITIONS[EXECUTION_STATUS.CREATED]    = [EXECUTION_STATUS.READY];
ALLOWED_TRANSITIONS[EXECUTION_STATUS.READY]      = [EXECUTION_STATUS.RUNNING];
ALLOWED_TRANSITIONS[EXECUTION_STATUS.RUNNING]    = [EXECUTION_STATUS.PAUSED, EXECUTION_STATUS.COMPLETED, EXECUTION_STATUS.FAILED];
ALLOWED_TRANSITIONS[EXECUTION_STATUS.PAUSED]     = [EXECUTION_STATUS.RUNNING];
ALLOWED_TRANSITIONS[EXECUTION_STATUS.COMPLETED]  = [EXECUTION_STATUS.ARCHIVED];
ALLOWED_TRANSITIONS[EXECUTION_STATUS.FAILED]      = [EXECUTION_STATUS.ROLLED_BACK];
ALLOWED_TRANSITIONS[EXECUTION_STATUS.ROLLED_BACK] = [];
ALLOWED_TRANSITIONS[EXECUTION_STATUS.ARCHIVED]   = [];

// Illegal transitions (explicitly forbidden):
//   created     → completed  ❌
//   created     → running    ❌
//   completed   → running    ❌
//   failed      → ready      ❌
//   rolled_back  → anything  ❌
//   archived    → anything  ❌

// ============================================================================
// Execution Modes — MVP: dry-run and supervised only
// ============================================================================
const EXECUTION_MODE = {
  DRY_RUN:   'dry-run',
  SUPERVISED: 'supervised'
};

const EXECUTION_MODE_VALUES = Object.values(EXECUTION_MODE);

// Forbidden modes — MUST NOT appear in any session
const FORBIDDEN_MODES = ['live', 'auto', 'autonomous', 'execute_now', 'auto_execute'];

// ============================================================================
// Audit Event Types
// ============================================================================
const AUDIT_EVENT_TYPE = {
  SESSION_CREATED:   'session_created',
  SESSION_STARTED:   'session_started',
  SESSION_PAUSED:    'session_paused',
  SESSION_RESUMED:   'session_resumed',
  SESSION_FAILED:     'session_failed',
  SESSION_COMPLETED: 'session_completed',
  ROLLBACK_PLANNED:  'rollback_planned',
  CHECKPOINT_CREATED:'checkpoint_created'
};

const AUDIT_EVENT_TYPE_VALUES = Object.values(AUDIT_EVENT_TYPE);

// ============================================================================
// Actor Types
// ============================================================================
const ACTOR_TYPE = {
  HUMAN:    'human',
  SYSTEM:    'system',
  AGENT:     'agent'
};

const ACTOR_TYPE_VALUES = Object.values(ACTOR_TYPE);

// ============================================================================
// Error Codes — 15+ codes
// ============================================================================
const EXECUTION_ERROR_CODES = {
  INVALID_SESSION:              'INVALID_SESSION',
  INVALID_SESSION_ID:           'INVALID_SESSION_ID',
  INVALID_STATUS:               'INVALID_STATUS',
  INVALID_TRANSITION:           'INVALID_TRANSITION',
  INVALID_MODE:                 'INVALID_MODE',
  INVALID_APPROVAL:            'INVALID_APPROVAL',
  INVALID_DISPATCH_PLAN:       'INVALID_DISPATCH_PLAN',
  INVALID_ASSIGNMENT_PLAN:     'INVALID_ASSIGNMENT_PLAN',
  SESSION_ALREADY_COMPLETED:   'SESSION_ALREADY_COMPLETED',
  SESSION_ALREADY_ARCHIVED:    'SESSION_ALREADY_ARCHIVED',
  CHECKPOINT_NOT_FOUND:         'CHECKPOINT_NOT_FOUND',
  AUDIT_EVENT_INVALID:         'AUDIT_EVENT_INVALID',
  FORBIDDEN_EXECUTION_MODE:    'FORBIDDEN_EXECUTION_MODE',
  SESSION_NOT_FOUND:           'SESSION_NOT_FOUND',
  INVALID_ACTOR:               'INVALID_ACTOR',
  DUPLICATE_SESSION:           'DUPLICATE_SESSION',
  EMPTY_BATCH:                 'EMPTY_BATCH',
  INVALID_CHECKPOINT:           'INVALID_CHECKPOINT',
  INVALID_METADATA:            'INVALID_METADATA',
  SESSION_MISMATCH:            'SESSION_MISMATCH'
};

// ============================================================================
// ID Generator
// ============================================================================

function createExecutionSessionId() {
  var ts = Date.now();
  var rand = Math.random().toString(36).substring(2, 8);
  return 'exec_' + ts + '_' + rand;
}

function createCheckpointId() {
  var ts = Date.now();
  var rand = Math.random().toString(36).substring(2, 8);
  return 'checkpoint_' + ts + '_' + rand;
}

function createAuditEventId() {
  var ts = Date.now();
  var rand = Math.random().toString(36).substring(2, 8);
  return 'audit_' + ts + '_' + rand;
}

// ============================================================================
// Factory: createExecutionSession
// ============================================================================

/**
 * Create an ExecutionSession object.
 *
 * @param {Object} dispatchPlan    — dispatch plan from P9.5.5
 * @param {Object} assignmentPlan  — assignment plan from P9.6.5
 * @param {Object} approval        — approval record from P9.6.3
 * @param {Object} [options]      — optional overrides
 * @returns {Object} new ExecutionSession
 */
function createExecutionSession(dispatchPlan, assignmentPlan, approval, options) {
  options = options || {};
  var now = options.createdAt || new Date().toISOString();

  var sessionId = options.sessionId || createExecutionSessionId();
  var mode = options.mode || EXECUTION_MODE.DRY_RUN;

  // Validate mode against forbidden list
  if (FORBIDDEN_MODES.indexOf(mode) !== -1) {
    throw new Error('Forbidden execution mode: ' + mode);
  }

  var session = {
    // --- Identity ---
    executionSessionId:  sessionId,
    dispatchPlanId:      (dispatchPlan && dispatchPlan.dispatchPlanId) || (dispatchPlan && dispatchPlan.planId) || '',
    assignmentPlanId:     (assignmentPlan && assignmentPlan.assignmentPlanId) || '',
    approvalId:           (approval && approval.approvalId) || '',

    // --- Pipeline trace ---
    reviewId:   (dispatchPlan && dispatchPlan.reviewId) || '',
    draftId:     (dispatchPlan && dispatchPlan.draftId) || '',
    strategyId:  (dispatchPlan && dispatchPlan.strategyId) || '',
    goalId:      (dispatchPlan && dispatchPlan.goalId) || '',

    // --- Execution config ---
    mode:                   mode,
    status:                 EXECUTION_STATUS.CREATED,

    // --- Linked objects (snapshots) ---
    dispatchPlanSnapshot:    (dispatchPlan && typeof dispatchPlan === 'object') ? JSON.parse(JSON.stringify(dispatchPlan)) : {},
    assignmentPlanSnapshot:  (assignmentPlan && typeof assignmentPlan === 'object') ? JSON.parse(JSON.stringify(assignmentPlan)) : {},
    approvalSnapshot:       (approval && typeof approval === 'object') ? JSON.parse(JSON.stringify(approval)) : {},

    // --- Runtime state ---
    executionSteps:   [],
    checkpoints:      [],
    auditTrail:       [],

    // --- Metadata ---
    createdAt:  now,
    updatedAt:  now,
    metadata:   options.metadata || {},

    // --- Pipeline stage marker ---
    pipelineStage: 'P9.7.1',
    module:       'execution-runtime'
  };

  return session;
}

// ============================================================================
// Factory: createEmptyExecutionSession (for testing)
// ============================================================================

function createEmptyExecutionSession(overrides) {
  var base = createExecutionSession(
    { dispatchPlanId: 'plan_0_empty', reviewId: '', draftId: '', strategyId: '', goalId: '' },
    { assignmentPlanId: 'assign_0_empty' },
    { approvalId: 'approval_0_empty' },
    { sessionId: 'exec_0_empty', mode: EXECUTION_MODE.DRY_RUN }
  );
  if (overrides && typeof overrides === 'object') {
    Object.keys(overrides).forEach(function (key) {
      base[key] = overrides[key];
    });
  }
  return base;
}

// ============================================================================
// Factory: createCheckpoint
// ============================================================================

/**
 * Create a checkpoint object.
 *
 * @param {string} sessionId
 * @param {string} step       — stage name (e.g., 'assignment', 'dispatch', 'execution')
 * @param {Object} snapshot  — state snapshot at checkpoint time
 * @param {Object} [options]
 * @returns {Object}
 */
function createCheckpoint(sessionId, step, snapshot, options) {
  options = options || {};
  var now = new Date().toISOString();

  return {
    checkpointId:  options.checkpointId || createCheckpointId(),
    sessionId:     sessionId,
    step:           step || '',
    snapshot:       (snapshot && typeof snapshot === 'object') ? JSON.parse(JSON.stringify(snapshot)) : {},
    createdAt:      now,
    metadata:       options.metadata || {}
  };
}

// ============================================================================
// Factory: createAuditEvent
// ============================================================================

/**
 * Create an audit event object.
 *
 * @param {string} sessionId
 * @param {string} event       — one of AUDIT_EVENT_TYPE
 * @param {string} actor       — who triggered the event (human|system|agent)
 * @param {Object} [details]  — event-specific details
 * @param {Object} [options]
 * @returns {Object}
 */
function createAuditEvent(sessionId, event, actor, details, options) {
  options = options || {};
  var now = new Date().toISOString();

  return {
    eventId:    options.eventId || createAuditEventId(),
    sessionId:   sessionId,
    event:       event || '',
    actor:       actor || ACTOR_TYPE.SYSTEM,
    details:     (details && typeof details === 'object') ? JSON.parse(JSON.stringify(details)) : {},
    createdAt:    now,
    metadata:    options.metadata || {}
  };
}

// ============================================================================
// Snapshot Factory
// ============================================================================

/**
 * Generate an execution snapshot summarizing session state.
 *
 * @param {Object} session
 * @returns {Object}
 */
function createExecutionSnapshot(session) {
  if (!session || !session.executionSessionId) {
    return null;
  }

  return {
    snapshotId:         'exec_snap_' + Date.now(),
    executionSessionId:  session.executionSessionId,
    status:              session.status,
    mode:                session.mode,
    stepCount:           (session.executionSteps || []).length,
    checkpointCount:     (session.checkpoints || []).length,
    auditTrailLength:    (session.auditTrail || []).length,
    dispatchPlanId:      session.dispatchPlanId,
    assignmentPlanId:    session.assignmentPlanId,
    approvalId:          session.approvalId,
    createdAt:           session.createdAt,
    updatedAt:           session.updatedAt,
    generatedAt:         new Date().toISOString(),
    pipelineStage:       session.pipelineStage || 'P9.7.1',
    metadata:            session.metadata || {}
  };
}

// ============================================================================
// Transition Helpers
// ============================================================================

function isValidTransition(fromStatus, toStatus) {
  var allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed) return false;
  return allowed.indexOf(toStatus) !== -1;
}

function isTerminalStatus(status) {
  return status === EXECUTION_STATUS.ARCHIVED ||
         status === EXECUTION_STATUS.ROLLED_BACK;
}

function canStartExecution(session) {
  return !!(session &&
              session.status === EXECUTION_STATUS.READY &&
              session.mode !== FORBIDDEN_MODES[0]);
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // --- Status Enums ---
  EXECUTION_STATUS:           EXECUTION_STATUS,
  EXECUTION_STATUS_VALUES:   EXECUTION_STATUS_VALUES,
  ALLOWED_TRANSITIONS:       ALLOWED_TRANSITIONS,

  // --- Mode Enums ---
  EXECUTION_MODE:            EXECUTION_MODE,
  EXECUTION_MODE_VALUES:     EXECUTION_MODE_VALUES,
  FORBIDDEN_MODES:          FORBIDDEN_MODES,

  // --- Audit Event Types ---
  AUDIT_EVENT_TYPE:          AUDIT_EVENT_TYPE,
  AUDIT_EVENT_TYPE_VALUES:   AUDIT_EVENT_TYPE_VALUES,

  // --- Actor Types ---
  ACTOR_TYPE:                ACTOR_TYPE,
  ACTOR_TYPE_VALUES:         ACTOR_TYPE_VALUES,

  // --- Error Codes ---
  EXECUTION_ERROR_CODES:     EXECUTION_ERROR_CODES,

  // --- ID Generators ---
  createExecutionSessionId:   createExecutionSessionId,
  createCheckpointId:        createCheckpointId,
  createAuditEventId:        createAuditEventId,

  // --- Factory Functions ---
  createExecutionSession:     createExecutionSession,
  createEmptyExecutionSession:createEmptyExecutionSession,
  createCheckpoint:           createCheckpoint,
  createAuditEvent:           createAuditEvent,
  createExecutionSnapshot:    createExecutionSnapshot,

  // --- Transition Helpers ---
  isValidTransition:          isValidTransition,
  isTerminalStatus:          isTerminalStatus,
  canStartExecution:         canStartExecution
};
