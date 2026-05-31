/**
 * agent-assignment-types.js
 * P9.6.4 Agent Assignment Matrix — Type definitions, constants, and factory functions.
 *
 * The Agent Assignment Matrix maps approved Controlled Dispatch Sessions to
 * the most suitable AI Agent (Codex, WorkBuddy, DeepSeek, Doubao) based on
 * capability matching and session requirements.
 *
 * This module defines the AssignmentPlan structure, agent identifiers,
 * status/mode enums, and factory functions.
 *
 * Safety constraints:
 *   - No shell, no exec, no spawn, no pm2, no deploy, no nginx, no .env
 *   - No agent invocation — this is a planning module only
 *   - No connection to agent-host, commander, or gateway
 *   - No HTTP API exposure
 *   - No live execution mode
 */

'use strict';

// ============================================================================
// Agent Identifiers
// ============================================================================
const AGENT = {
  CODEX: 'codex',
  WORKBUDDY: 'workbuddy',
  DEEPSEEK: 'deepseek',
  DOUBAO: 'doubao'
};

const AGENT_VALUES = Object.values(AGENT);

// ============================================================================
// Assignment Status — lifecycle of an assignment plan
// ============================================================================
const ASSIGNMENT_STATUS = {
  PLANNED: 'planned',
  REVIEWED: 'reviewed',
  REJECTED: 'rejected',
  ARCHIVED: 'archived'
};

const ASSIGNMENT_STATUS_VALUES = Object.values(ASSIGNMENT_STATUS);

// ============================================================================
// Assignment Mode — only read-only modes allowed
// ============================================================================
const ASSIGNMENT_MODE = {
  DRY_RUN: 'dry-run',
  SUPERVISED: 'supervised'
};

const ALLOWED_MODES = Object.values(ASSIGNMENT_MODE);

const FORBIDDEN_MODES = ['live', 'auto', 'execute', 'direct', 'production'];

// ============================================================================
// Allowed Transitions
// ============================================================================
const ALLOWED_ASSIGNMENT_TRANSITIONS = {
  planned: ['reviewed', 'rejected', 'archived'],
  reviewed: ['rejected', 'archived'],
  rejected: ['planned', 'archived'],
  archived: []
};

// ============================================================================
// Category → Required Capabilities Mapping
// ============================================================================
const CATEGORY_CAPABILITY_MAP = {
  devops: ['ops', 'server', 'audit'],
  commerce: ['coding', 'testing', 'analysis'],
  marketing: ['marketing', 'content', 'campaign'],
  customer: ['customer', 'content', 'report'],
  finance: ['finance', 'risk', 'report'],
  operations: ['ops', 'audit', 'staging'],
  reliability: ['ops', 'audit', 'report'],
  security: ['audit', 'risk', 'analysis'],
  cost: ['finance', 'report', 'analysis'],
  performance: ['coding', 'testing', 'analysis'],
  compliance: ['audit', 'report', 'risk']
};

const CATEGORY_VALUES = Object.keys(CATEGORY_CAPABILITY_MAP);

// ============================================================================
// Agent Priority — tie-breaking when multiple agents match equally
// ============================================================================
const AGENT_PRIORITY = {
  codex: 1,
  workbuddy: 2,
  deepseek: 3,
  doubao: 4
};

// ============================================================================
// Error Codes
// ============================================================================
const ASSIGNMENT_ERROR_CODES = {
  INVALID_PLAN: 'INVALID_PLAN',
  MISSING_ASSIGNMENT_ID: 'MISSING_ASSIGNMENT_ID',
  INVALID_ASSIGNMENT_ID: 'INVALID_ASSIGNMENT_ID',
  MISSING_SESSION_ID: 'MISSING_SESSION_ID',
  INVALID_SESSION: 'INVALID_SESSION',
  INVALID_AGENT: 'INVALID_AGENT',
  FORBIDDEN_MODE: 'FORBIDDEN_MODE',
  INVALID_STATUS: 'INVALID_STATUS',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  NO_CAPABILITIES: 'NO_CAPABILITIES',
  NO_AGENT_AVAILABLE: 'NO_AGENT_AVAILABLE',
  MISSING_REQUIRED_CAPABILITIES: 'MISSING_REQUIRED_CAPABILITIES',
  SESSION_ALREADY_ASSIGNED: 'SESSION_ALREADY_ASSIGNED',
  INVALID_FALLBACK: 'INVALID_FALLBACK',
  FALLBACK_CONTAINS_SELECTED: 'FALLBACK_CONTAINS_SELECTED',
  MISSING_CONFIDENCE: 'MISSING_CONFIDENCE',
  INVALID_CONFIDENCE: 'INVALID_CONFIDENCE'
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Generate a unique assignment plan ID.
 * Format: assign_<timestamp>_<random6>
 */
function createAssignmentId() {
  var ts = Date.now();
  var rand = Math.floor(Math.random() * 900000) + 100000;
  return 'assign_' + ts + '_' + rand;
}

/**
 * Create an AssignmentPlan object from a session and match result.
 *
 * @param {Object} session — controlled dispatch session
 * @param {Object} matchResult — from capability-matrix.matchAgentForSession()
 * @param {Object} options — { assignmentId, mode, status }
 * @returns {Object} AssignmentPlan
 */
function createAssignmentPlan(session, matchResult, options) {
  var opts = options || {};
  var safe = session || {};
  var result = matchResult || {};

  if (opts.mode && FORBIDDEN_MODES.indexOf(opts.mode) !== -1) {
    throw new Error(ASSIGNMENT_ERROR_CODES.FORBIDDEN_MODE + ': ' + opts.mode);
  }

  var plan = {
    assignmentId: opts.assignmentId || createAssignmentId(),
    sessionId: safe.sessionId || null,
    ticketId: safe.ticketId || null,
    dispatchPlanId: safe.dispatchPlanId || null,
    reviewId: safe.reviewId || null,
    draftId: safe.draftId || null,
    strategyId: safe.strategyId || null,
    goalId: safe.goalId || null,
    selectedAgent: result.selectedAgent || null,
    fallbackAgents: (result.fallbackAgents || []).slice(),
    requiredCapabilities: (result.requiredCapabilities || []).slice(),
    matchedCapabilities: (result.matchedCapabilities || []).slice(),
    missingCapabilities: (result.missingCapabilities || []).slice(),
    confidence: typeof result.confidence === 'number' ? result.confidence : 0,
    reason: result.reason || '',
    status: opts.status || ASSIGNMENT_STATUS.PLANNED,
    mode: opts.mode || ASSIGNMENT_MODE.DRY_RUN,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: opts.metadata || {}
  };

  return plan;
}

/**
 * Create an empty assignment plan skeleton (for safe defaults before validation).
 */
function createEmptyAssignmentPlan() {
  return {
    assignmentId: null,
    sessionId: null,
    ticketId: null,
    dispatchPlanId: null,
    reviewId: null,
    draftId: null,
    strategyId: null,
    goalId: null,
    selectedAgent: null,
    fallbackAgents: [],
    requiredCapabilities: [],
    matchedCapabilities: [],
    missingCapabilities: [],
    confidence: 0,
    reason: '',
    status: ASSIGNMENT_STATUS.PLANNED,
    mode: ASSIGNMENT_MODE.DRY_RUN,
    createdAt: null,
    updatedAt: null,
    metadata: {}
  };
}

/**
 * Generate a snapshot summary of assignment plans.
 */
function createAssignmentSnapshot(plans) {
  var total = (plans && plans.length) || 0;
  var byStatus = {};
  var byAgent = {};
  var byMode = {};

  ASSIGNMENT_STATUS_VALUES.forEach(function (s) { byStatus[s] = 0; });
  AGENT_VALUES.forEach(function (a) { byAgent[a] = 0; });
  ALLOWED_MODES.forEach(function (m) { byMode[m] = 0; });

  if (plans && plans.length) {
    plans.forEach(function (p) {
      if (p.status && byStatus.hasOwnProperty(p.status)) {
        byStatus[p.status]++;
      }
      if (p.selectedAgent && byAgent.hasOwnProperty(p.selectedAgent)) {
        byAgent[p.selectedAgent]++;
      }
      if (p.mode && byMode.hasOwnProperty(p.mode)) {
        byMode[p.mode]++;
      }
    });
  }

  return {
    total: total,
    byStatus: byStatus,
    byAgent: byAgent,
    byMode: byMode,
    plans: (plans || []).map(function (p) {
      return {
        assignmentId: p.assignmentId,
        sessionId: p.sessionId,
        selectedAgent: p.selectedAgent,
        confidence: p.confidence,
        status: p.status,
        mode: p.mode
      };
    })
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an agent name is valid.
 */
function isValidAgent(agent) {
  return AGENT_VALUES.indexOf(agent) !== -1;
}

/**
 * Check if an assignment status is terminal (no further transitions).
 */
function isTerminalAssignmentStatus(status) {
  return status === ASSIGNMENT_STATUS.ARCHIVED;
}

/**
 * Check if a transition between two assignment statuses is valid.
 */
function isValidAssignmentTransition(fromStatus, toStatus) {
  var allowed = ALLOWED_ASSIGNMENT_TRANSITIONS[fromStatus];
  return allowed ? allowed.indexOf(toStatus) !== -1 : false;
}

/**
 * Check if an assignment plan can be updated (not archived).
 */
function canUpdateAssignmentPlan(plan) {
  return !!(plan && !isTerminalAssignmentStatus(plan.status));
}

/**
 * Derive required capabilities from a session category or explicit list.
 */
function deriveRequiredCapabilities(category) {
  if (category && CATEGORY_CAPABILITY_MAP[category]) {
    return CATEGORY_CAPABILITY_MAP[category].slice();
  }
  return [];
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  AGENT: AGENT,
  AGENT_VALUES: AGENT_VALUES,
  ASSIGNMENT_STATUS: ASSIGNMENT_STATUS,
  ASSIGNMENT_STATUS_VALUES: ASSIGNMENT_STATUS_VALUES,
  ASSIGNMENT_MODE: ASSIGNMENT_MODE,
  ALLOWED_MODES: ALLOWED_MODES,
  FORBIDDEN_MODES: FORBIDDEN_MODES,
  ALLOWED_ASSIGNMENT_TRANSITIONS: ALLOWED_ASSIGNMENT_TRANSITIONS,
  CATEGORY_CAPABILITY_MAP: CATEGORY_CAPABILITY_MAP,
  CATEGORY_VALUES: CATEGORY_VALUES,
  AGENT_PRIORITY: AGENT_PRIORITY,
  ASSIGNMENT_ERROR_CODES: ASSIGNMENT_ERROR_CODES,

  createAssignmentId: createAssignmentId,
  createAssignmentPlan: createAssignmentPlan,
  createEmptyAssignmentPlan: createEmptyAssignmentPlan,
  createAssignmentSnapshot: createAssignmentSnapshot,

  isValidAgent: isValidAgent,
  isTerminalAssignmentStatus: isTerminalAssignmentStatus,
  isValidAssignmentTransition: isValidAssignmentTransition,
  canUpdateAssignmentPlan: canUpdateAssignmentPlan,
  deriveRequiredCapabilities: deriveRequiredCapabilities
};
