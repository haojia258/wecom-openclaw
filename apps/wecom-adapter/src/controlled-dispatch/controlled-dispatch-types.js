/**
 * controlled-dispatch-types.js
 * P9.6.2 Controlled Dispatch Runtime — Type definitions, constants, and factory functions.
 *
 * A Controlled Dispatch Session converts an approved Dispatch Ticket into
 * a safe, controlled execution environment.
 *
 * This is NOT a mission executor. It is NOT a commander task. It is NOT a DAG.
 * It is a safety gate: the session wraps a ticket but ONLY supports dry-run/supervised modes.
 *
 * Forbidden: live, auto, execute modes.
 * No shell, no exec, no spawn, no pm2, no deploy, no gateway, no agent-host.
 */

'use strict';

// ============================================================================
// Session Status
// ============================================================================
const SESSION_STATUS = {
  PLANNED: 'planned',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

const SESSION_STATUS_VALUES = Object.values(SESSION_STATUS);

// ============================================================================
// Allowed state transitions
// ============================================================================
const ALLOWED_SESSION_TRANSITIONS = {};
ALLOWED_SESSION_TRANSITIONS[SESSION_STATUS.PLANNED] = [SESSION_STATUS.RUNNING, SESSION_STATUS.CANCELLED];
ALLOWED_SESSION_TRANSITIONS[SESSION_STATUS.RUNNING] = [SESSION_STATUS.COMPLETED, SESSION_STATUS.FAILED];
ALLOWED_SESSION_TRANSITIONS[SESSION_STATUS.COMPLETED] = [];
ALLOWED_SESSION_TRANSITIONS[SESSION_STATUS.FAILED] = [SESSION_STATUS.PLANNED];
ALLOWED_SESSION_TRANSITIONS[SESSION_STATUS.CANCELLED] = [];

// ============================================================================
// Execution Mode — MVP: only dry-run and supervised
// ============================================================================
const EXECUTION_MODE = {
  DRY_RUN: 'dry-run',
  SUPERVISED: 'supervised'
};

const EXECUTION_MODE_VALUES = Object.values(EXECUTION_MODE);

// Forbidden execution modes (MUST NOT appear in any session)
const FORBIDDEN_MODES = ['live', 'auto', 'execute', 'direct'];

// ============================================================================
// Safety Levels
// ============================================================================
const SAFETY_LEVEL = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

const SAFETY_LEVEL_VALUES = Object.values(SAFETY_LEVEL);

// ============================================================================
// Capability Flags — what this session is allowed to do
// ============================================================================
const CAPABILITY = {
  READ: 'read',
  ANALYZE: 'analyze',
  PLAN: 'plan',
  REPORT: 'report'
};

const CAPABILITY_VALUES = Object.values(CAPABILITY);

// Default capabilities for all sessions (read-only)
const DEFAULT_CAPABILITIES = [CAPABILITY.READ, CAPABILITY.ANALYZE, CAPABILITY.PLAN, CAPABILITY.REPORT];

// ============================================================================
// Error Codes
// ============================================================================
const SESSION_ERROR_CODES = {
  INVALID_SESSION_ID: 'INVALID_SESSION_ID',
  INVALID_SESSION_STATUS: 'INVALID_SESSION_STATUS',
  INVALID_EXECUTION_MODE: 'INVALID_EXECUTION_MODE',
  FORBIDDEN_EXECUTION_MODE: 'FORBIDDEN_EXECUTION_MODE',
  INVALID_SAFETY_LEVEL: 'INVALID_SAFETY_LEVEL',
  INVALID_CAPABILITY: 'INVALID_CAPABILITY',
  INVALID_TICKET_ID: 'INVALID_TICKET_ID',
  INVALID_TICKET_REFERENCE: 'INVALID_TICKET_REFERENCE',
  MISSING_TICKET_ID: 'MISSING_TICKET_ID',
  MISSING_DISPATCH_PLAN_ID: 'MISSING_DISPATCH_PLAN_ID',
  MISSING_GOAL_ID: 'MISSING_GOAL_ID',
  DUPLICATE_SESSION: 'DUPLICATE_SESSION',
  EMPTY_BATCH: 'EMPTY_BATCH',
  TICKET_NOT_APPROVED: 'TICKET_NOT_APPROVED',
  TICKET_ALREADY_DISPATCHED: 'TICKET_ALREADY_DISPATCHED',
  INVALID_SESSION_TRANSITION: 'INVALID_SESSION_TRANSITION',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_ALREADY_COMPLETED: 'SESSION_ALREADY_COMPLETED',
  SESSION_ALREADY_CANCELLED: 'SESSION_ALREADY_CANCELLED'
};

// ============================================================================
// Priority-to-Safety-Level Mapping
// ============================================================================
const PRIORITY_SAFETY_MAP = {
  'low': SAFETY_LEVEL.LOW,
  'medium': SAFETY_LEVEL.MEDIUM,
  'high': SAFETY_LEVEL.HIGH,
  'critical': SAFETY_LEVEL.CRITICAL
};

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a unique session ID.
 * @returns {string} session_<timestamp>_<random>
 */
function createSessionId() {
  var ts = Date.now();
  var rand = Math.random().toString(36).substring(2, 8);
  return 'session_' + ts + '_' + rand;
}

// ============================================================================
// Factory: Create Controlled Dispatch Session
// ============================================================================

/**
 * Creates a Controlled Dispatch Session from an approved dispatch ticket.
 *
 * The session is created in PLANNED status with DRY_RUN mode by default.
 *
 * @param {Object} ticket — Approved dispatch ticket
 * @param {Object} [options]
 * @param {string} [options.executionMode] — 'dry-run' or 'supervised' (default: 'dry-run')
 * @param {string} [options.sessionId] — Pre-assigned session ID
 * @param {string[]} [options.capabilities] — Capability override (default: DEFAULT_CAPABILITIES)
 * @returns {Object} Controlled dispatch session object
 */
function createDispatchSession(ticket, options) {
  var opts = options || {};
  var safe = ticket || {};

  if (opts.executionMode && FORBIDDEN_MODES.indexOf(opts.executionMode) !== -1) {
    throw new Error('Forbidden execution mode: ' + opts.executionMode);
  }

  var priority = safe.priority || 'medium';

  var session = {
    // Identity
    sessionId: opts.sessionId || createSessionId(),
    ticketId: safe.ticketId || null,

    // Pipeline trace (full chain)
    dispatchPlanId: safe.dispatchPlanId || null,
    reviewId: safe.reviewId || null,
    draftId: safe.draftId || null,
    strategyId: safe.strategyId || null,
    goalId: safe.goalId || null,

    // Core attributes (from ticket)
    title: opts.title || safe.title || 'Untitled Session',
    type: safe.type || 'operations',
    priority: priority,

    // Session state
    status: SESSION_STATUS.PLANNED,
    executionMode: opts.executionMode || EXECUTION_MODE.DRY_RUN,
    safetyLevel: opts.safetyLevel || PRIORITY_SAFETY_MAP[priority] || SAFETY_LEVEL.MEDIUM,

    // Capabilities (what this session CAN do)
    capabilities: opts.capabilities || DEFAULT_CAPABILITIES.slice(),

    // Ticket snapshot (frozen at session creation time)
    ticketSnapshot: {
      ticketId: safe.ticketId,
      title: safe.title,
      type: safe.type,
      priority: safe.priority,
      status: safe.status,
      approvalStatus: safe.approvalStatus,
      riskLevel: safe.riskLevel,
      recommendedAgent: safe.recommendedAgent,
      selectedAgent: safe.selectedAgent,
      fallbackAgents: safe.fallbackAgents,
      objective: safe.objective,
      inputs: safe.inputs,
      guardrails: safe.guardrails,
      acceptanceCriteria: safe.acceptanceCriteria,
      risks: safe.risks
    },

    // Execution result (null until dry-run/supervised execution completes)
    dryRunResult: null,

    // Execution log
    executionLog: [],

    // Metadata
    metadata: {
      pipelineStage: 'P9.6.2',
      module: 'controlled-dispatch',
      sourceTicket: safe.ticketId
    },

    // Timestamps
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return session;
}

/**
 * Creates an empty session object (for testing).
 * @param {Object} [overrides]
 * @returns {Object}
 */
function createEmptyDispatchSession(overrides) {
  var base = createDispatchSession({ ticketId: 'ticket_0_000000' });
  if (overrides) {
    Object.keys(overrides).forEach(function (key) {
      base[key] = overrides[key];
    });
  }
  return base;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates basic session structure without full validation.
 * @param {Object} session
 * @returns {boolean}
 */
function _validateSessionBasic(session) {
  if (!session || typeof session !== 'object') return false;
  if (!session.sessionId || typeof session.sessionId !== 'string') return false;
  if (!session.ticketId || typeof session.ticketId !== 'string') return false;
  return true;
}

/**
 * Checks if a status transition is valid.
 * @param {string} from — Current status
 * @param {string} to — Target status
 * @returns {boolean}
 */
function isValidSessionTransition(from, to) {
  var allowed = ALLOWED_SESSION_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.indexOf(to) !== -1;
}

/**
 * Checks if a status is terminal.
 * @param {string} status
 * @returns {boolean}
 */
function isTerminalSessionStatus(status) {
  return status === SESSION_STATUS.COMPLETED ||
         status === SESSION_STATUS.CANCELLED;
}

/**
 * Checks if a session can be started.
 * @param {Object} session
 * @returns {boolean}
 */
function canStartSession(session) {
  return session && session.status === SESSION_STATUS.PLANNED;
}

/**
 * Creates a session snapshot summary.
 * @param {Object[]} sessions — Array of session objects
 * @returns {Object} Snapshot
 */
function createSessionSnapshot(sessions) {
  var snapshot = {
    snapshotId: 'session_snapshot_' + Date.now(),
    generatedAt: new Date().toISOString(),
    totalSessions: sessions.length,
    statusBreakdown: {},
    executionModeBreakdown: {},
    safetyLevelBreakdown: {},
    capabilitySummary: {},
    pipelineSummary: {
      uniqueTickets: 0,
      uniqueDispatchPlans: 0,
      uniqueReviews: 0,
      uniqueDrafts: 0,
      uniqueStrategies: 0,
      uniqueGoals: 0
    }
  };

  var ticketIds = {};
  var planIds = {};
  var reviewIds = {};
  var draftIds = {};
  var strategyIds = {};
  var goalIds = {};

  sessions.forEach(function (s) {
    // Status breakdown
    var st = s.status || 'unknown';
    snapshot.statusBreakdown[st] = (snapshot.statusBreakdown[st] || 0) + 1;

    // Execution mode breakdown
    var em = s.executionMode || 'unknown';
    snapshot.executionModeBreakdown[em] = (snapshot.executionModeBreakdown[em] || 0) + 1;

    // Safety level breakdown
    var sl = s.safetyLevel || 'unknown';
    snapshot.safetyLevelBreakdown[sl] = (snapshot.safetyLevelBreakdown[sl] || 0) + 1;

    // Capability summary
    (s.capabilities || []).forEach(function (c) {
      snapshot.capabilitySummary[c] = (snapshot.capabilitySummary[c] || 0) + 1;
    });

    // Pipeline unique counts
    if (s.ticketId) ticketIds[s.ticketId] = true;
    if (s.dispatchPlanId) planIds[s.dispatchPlanId] = true;
    if (s.reviewId) reviewIds[s.reviewId] = true;
    if (s.draftId) draftIds[s.draftId] = true;
    if (s.strategyId) strategyIds[s.strategyId] = true;
    if (s.goalId) goalIds[s.goalId] = true;
  });

  snapshot.pipelineSummary.uniqueTickets = Object.keys(ticketIds).length;
  snapshot.pipelineSummary.uniqueDispatchPlans = Object.keys(planIds).length;
  snapshot.pipelineSummary.uniqueReviews = Object.keys(reviewIds).length;
  snapshot.pipelineSummary.uniqueDrafts = Object.keys(draftIds).length;
  snapshot.pipelineSummary.uniqueStrategies = Object.keys(strategyIds).length;
  snapshot.pipelineSummary.uniqueGoals = Object.keys(goalIds).length;

  return snapshot;
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  // Status
  SESSION_STATUS: SESSION_STATUS,
  SESSION_STATUS_VALUES: SESSION_STATUS_VALUES,
  ALLOWED_SESSION_TRANSITIONS: ALLOWED_SESSION_TRANSITIONS,

  // Execution mode
  EXECUTION_MODE: EXECUTION_MODE,
  EXECUTION_MODE_VALUES: EXECUTION_MODE_VALUES,
  FORBIDDEN_MODES: FORBIDDEN_MODES,

  // Safety
  SAFETY_LEVEL: SAFETY_LEVEL,
  SAFETY_LEVEL_VALUES: SAFETY_LEVEL_VALUES,

  // Capabilities
  CAPABILITY: CAPABILITY,
  CAPABILITY_VALUES: CAPABILITY_VALUES,
  DEFAULT_CAPABILITIES: DEFAULT_CAPABILITIES,

  // Error codes
  SESSION_ERROR_CODES: SESSION_ERROR_CODES,

  // Mappings
  PRIORITY_SAFETY_MAP: PRIORITY_SAFETY_MAP,

  // ID generation
  createSessionId: createSessionId,

  // Factory functions
  createDispatchSession: createDispatchSession,
  createEmptyDispatchSession: createEmptyDispatchSession,
  createSessionSnapshot: createSessionSnapshot,

  // Helpers
  _validateSessionBasic: _validateSessionBasic,
  isValidSessionTransition: isValidSessionTransition,
  isTerminalSessionStatus: isTerminalSessionStatus,
  canStartSession: canStartSession
};
