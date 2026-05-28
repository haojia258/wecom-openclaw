/**
 * approval-gate-types.js
 * P9.6.3 Approval Gate — Type definitions, constants, and factory functions.
 *
 * The Approval Gate is the human approval layer for Controlled Dispatch Sessions.
 * Before a session can move from PLANNED to RUNNING, it must pass through the
 * Approval Gate: a human reviewer must explicitly approve or reject it.
 *
 * This module defines the ApprovalRecord structure, status/decisoin enums,
 * and factory functions for creating and managing approval records.
 *
 * Safety constraints:
 *   - No shell, no exec, no spawn, no pm2, no deploy, no nginx, no .env
 *   - No automatic approval — always requires human review
 *   - No modification of session state — approval gate manages approval records only
 */

'use strict';

// ============================================================================
// Approval Status — lifecycle of an approval record
// ============================================================================
const APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ARCHIVED: 'archived'
};

const APPROVAL_STATUS_VALUES = Object.values(APPROVAL_STATUS);

// ============================================================================
// Approval Decision — the action taken by a reviewer
// ============================================================================
const APPROVAL_DECISION = {
  APPROVE: 'approve',
  REJECT: 'reject',
  ARCHIVE: 'archive'
};

const APPROVAL_DECISION_VALUES = Object.values(APPROVAL_DECISION);

// ============================================================================
// Allowed approval transitions
// ============================================================================
const ALLOWED_APPROVAL_TRANSITIONS = {};
ALLOWED_APPROVAL_TRANSITIONS[APPROVAL_STATUS.PENDING] = [APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.ARCHIVED];
ALLOWED_APPROVAL_TRANSITIONS[APPROVAL_STATUS.APPROVED] = [APPROVAL_STATUS.ARCHIVED];
ALLOWED_APPROVAL_TRANSITIONS[APPROVAL_STATUS.REJECTED] = [APPROVAL_STATUS.ARCHIVED, APPROVAL_STATUS.PENDING];
ALLOWED_APPROVAL_TRANSITIONS[APPROVAL_STATUS.ARCHIVED] = [];

// ============================================================================
// Approval Error Codes
// ============================================================================
const APPROVAL_ERROR_CODES = {
  INVALID_APPROVAL_ID: 'INVALID_APPROVAL_ID',
  INVALID_APPROVAL_ID_FORMAT: 'INVALID_APPROVAL_ID_FORMAT',
  MISSING_SESSION_ID: 'MISSING_SESSION_ID',
  INVALID_SESSION_ID: 'INVALID_SESSION_ID',
  MISSING_TICKET_ID: 'MISSING_TICKET_ID',
  INVALID_TICKET_ID: 'INVALID_TICKET_ID',
  INVALID_STATUS: 'INVALID_STATUS',
  MISSING_REVIEWER: 'MISSING_REVIEWER',
  INVALID_REVIEWER: 'INVALID_REVIEWER',
  INVALID_DECISION: 'INVALID_DECISION',
  MISSING_DECISION_REASON: 'MISSING_DECISION_REASON',
  INVALID_DECISION_REASON: 'INVALID_DECISION_REASON',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  INVALID_SESSION_STATUS: 'INVALID_SESSION_STATUS',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  DUPLICATE_APPROVAL: 'DUPLICATE_APPROVAL',
  APPROVAL_NOT_FOUND: 'APPROVAL_NOT_FOUND',
  APPROVAL_ALREADY_CLOSED: 'APPROVAL_ALREADY_CLOSED',
  SESSION_ALREADY_APPROVED: 'SESSION_ALREADY_APPROVED',
  MISSING_PIPELINE_IDS: 'MISSING_PIPELINE_IDS'
};

// ============================================================================
// Reviewer Roles
// ============================================================================
const REVIEWER_ROLE = {
  HUMAN: 'human',
  MANAGER: 'manager',
  ADMIN: 'admin'
};

const REVIEWER_ROLE_VALUES = Object.values(REVIEWER_ROLE);

// ============================================================================
// Priority-to-Minimum-Reviewer Mapping
// ============================================================================
const PRIORITY_REVIEWER_MAP = {
  'low': REVIEWER_ROLE.HUMAN,
  'medium': REVIEWER_ROLE.HUMAN,
  'high': REVIEWER_ROLE.MANAGER,
  'critical': REVIEWER_ROLE.ADMIN
};

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a unique approval ID.
 * @returns {string} approval_<timestamp>_<random>
 */
function createApprovalId() {
  var ts = Date.now();
  var rand = Math.random().toString(36).substring(2, 8);
  return 'approval_' + ts + '_' + rand;
}

// ============================================================================
// Factory: Create Approval Record
// ============================================================================

/**
 * Creates an Approval Record for a Controlled Dispatch Session.
 *
 * An approval record tracks the human review decision for a dispatch session.
 * Initially created in PENDING status.
 *
 * @param {Object} session — Controlled dispatch session object
 * @param {Object} [options]
 * @param {string} [options.approvalId] — Pre-assigned approval ID
 * @param {string} [options.reviewer] — Human reviewer identifier
 * @param {string} [options.notes] — Additional review notes
 * @param {string} [options.priority] — Override priority for reviewer assignment
 * @returns {Object} Approval record
 */
function createApprovalRecord(session, options) {
  var opts = options || {};
  var safe = session || {};
  var priority = safe.priority || 'medium';

  var record = {
    // Identity
    approvalId: opts.approvalId || createApprovalId(),

    // Linked session
    sessionId: safe.sessionId || null,
    ticketId: safe.ticketId || null,

    // Pipeline trace (inherited from session)
    dispatchPlanId: safe.dispatchPlanId || null,
    reviewId: safe.reviewId || null,
    draftId: safe.draftId || null,
    strategyId: safe.strategyId || null,
    goalId: safe.goalId || null,

    // Session info snapshot
    title: safe.title || 'Untitled Approval',

    // Approval state
    status: APPROVAL_STATUS.PENDING,
    priority: priority,

    // Reviewer info
    reviewer: opts.reviewer || null,
    requiredReviewerRole: PRIORITY_REVIEWER_MAP[priority] || REVIEWER_ROLE.HUMAN,

    // Decision
    decision: null,
    decisionReason: null,
    decisionAt: null,

    // Review notes
    notes: opts.notes || null,

    // Session snapshot (frozen at approval creation time)
    sessionSnapshot: {
      sessionId: safe.sessionId,
      ticketId: safe.ticketId,
      title: safe.title,
      status: safe.status,
      executionMode: safe.executionMode,
      safetyLevel: safe.safetyLevel,
      priority: safe.priority,
      type: safe.type
    },

    // Audit log
    auditLog: [],

    // Metadata
    metadata: {
      pipelineStage: 'P9.6.3',
      module: 'approval-gate',
      sourceSession: safe.sessionId,
      sourceTicket: safe.ticketId
    },

    // Timestamps
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Add initial audit entry
  record.auditLog.push({
    action: 'created',
    status: APPROVAL_STATUS.PENDING,
    timestamp: record.createdAt,
    details: 'Approval record created for session ' + (safe.sessionId || 'unknown')
  });

  return record;
}

/**
 * Creates an empty approval record (for testing).
 * @param {Object} [overrides]
 * @returns {Object}
 */
function createEmptyApprovalRecord(overrides) {
  var base = createApprovalRecord({
    sessionId: 'session_0_000000',
    ticketId: 'ticket_0_000000',
    title: 'Test Approval',
    priority: 'medium'
  });
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
 * Validates basic approval record structure without full validation.
 * @param {Object} record
 * @returns {boolean}
 */
function _validateApprovalBasic(record) {
  if (!record || typeof record !== 'object') return false;
  if (!record.approvalId || typeof record.approvalId !== 'string') return false;
  if (!record.sessionId || typeof record.sessionId !== 'string') return false;
  return true;
}

/**
 * Checks if an approval status transition is valid.
 * @param {string} from — Current status
 * @param {string} to — Target status
 * @returns {boolean}
 */
function isValidApprovalTransition(from, to) {
  var allowed = ALLOWED_APPROVAL_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.indexOf(to) !== -1;
}

/**
 * Checks if an approval status is terminal.
 * @param {string} status
 * @returns {boolean}
 */
function isTerminalApprovalStatus(status) {
  return status === APPROVAL_STATUS.APPROVED ||
         status === APPROVAL_STATUS.REJECTED;
}

/**
 * Checks if an approval is actionable (can be approved/rejected).
 * @param {Object} record
 * @returns {boolean}
 */
function canActOnApproval(record) {
  return !!(record && record.status === APPROVAL_STATUS.PENDING);
}

/**
 * Creates an approval snapshot summary.
 * @param {Object[]} records — Array of approval records
 * @returns {Object} Snapshot
 */
function createApprovalSnapshot(records) {
  var snapshot = {
    snapshotId: 'approval_snapshot_' + Date.now(),
    generatedAt: new Date().toISOString(),
    totalApprovals: records.length,
    statusBreakdown: {},
    decisionBreakdown: {},
    reviewerBreakdown: {},
    priorityBreakdown: {},
    pipelineSummary: {
      uniqueSessions: 0,
      uniqueTickets: 0,
      uniqueDispatchPlans: 0
    },
    pendingApprovals: [],
    recentDecisions: []
  };

  var sessionIds = {};
  var ticketIds = {};
  var planIds = {};
  var now = Date.now();
  var RECENT_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

  records.forEach(function (r) {
    // Status breakdown
    var st = r.status || 'unknown';
    snapshot.statusBreakdown[st] = (snapshot.statusBreakdown[st] || 0) + 1;

    // Decision breakdown
    if (r.decision) {
      snapshot.decisionBreakdown[r.decision] = (snapshot.decisionBreakdown[r.decision] || 0) + 1;
    }

    // Reviewer breakdown
    var rev = r.reviewer || 'unassigned';
    snapshot.reviewerBreakdown[rev] = (snapshot.reviewerBreakdown[rev] || 0) + 1;

    // Priority breakdown
    var pri = r.priority || 'medium';
    snapshot.priorityBreakdown[pri] = (snapshot.priorityBreakdown[pri] || 0) + 1;

    // Pipeline unique counts
    if (r.sessionId) sessionIds[r.sessionId] = true;
    if (r.ticketId) ticketIds[r.ticketId] = true;
    if (r.dispatchPlanId) planIds[r.dispatchPlanId] = true;

    // Collect pending
    if (r.status === APPROVAL_STATUS.PENDING) {
      snapshot.pendingApprovals.push({
        approvalId: r.approvalId,
        sessionId: r.sessionId,
        title: r.title,
        priority: r.priority,
        createdAt: r.createdAt
      });
    }

    // Collect recent decisions
    if (r.decisionAt && r.decision && (now - new Date(r.decisionAt).getTime()) < RECENT_WINDOW) {
      snapshot.recentDecisions.push({
        approvalId: r.approvalId,
        sessionId: r.sessionId,
        decision: r.decision,
        reviewer: r.reviewer,
        decisionAt: r.decisionAt
      });
    }
  });

  snapshot.pipelineSummary.uniqueSessions = Object.keys(sessionIds).length;
  snapshot.pipelineSummary.uniqueTickets = Object.keys(ticketIds).length;
  snapshot.pipelineSummary.uniqueDispatchPlans = Object.keys(planIds).length;

  // Sort pending by priority
  var PRI_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
  snapshot.pendingApprovals.sort(function (a, b) {
    return (PRI_ORDER[a.priority] || 99) - (PRI_ORDER[b.priority] || 99);
  });

  // Sort recent by time descending
  snapshot.recentDecisions.sort(function (a, b) {
    return new Date(b.decisionAt).getTime() - new Date(a.decisionAt).getTime();
  });

  return snapshot;
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  // Status
  APPROVAL_STATUS: APPROVAL_STATUS,
  APPROVAL_STATUS_VALUES: APPROVAL_STATUS_VALUES,

  // Decision
  APPROVAL_DECISION: APPROVAL_DECISION,
  APPROVAL_DECISION_VALUES: APPROVAL_DECISION_VALUES,

  // Transitions
  ALLOWED_APPROVAL_TRANSITIONS: ALLOWED_APPROVAL_TRANSITIONS,

  // Error codes
  APPROVAL_ERROR_CODES: APPROVAL_ERROR_CODES,

  // Roles
  REVIEWER_ROLE: REVIEWER_ROLE,
  REVIEWER_ROLE_VALUES: REVIEWER_ROLE_VALUES,
  PRIORITY_REVIEWER_MAP: PRIORITY_REVIEWER_MAP,

  // ID generation
  createApprovalId: createApprovalId,

  // Factory functions
  createApprovalRecord: createApprovalRecord,
  createEmptyApprovalRecord: createEmptyApprovalRecord,
  createApprovalSnapshot: createApprovalSnapshot,

  // Helpers
  _validateApprovalBasic: _validateApprovalBasic,
  isValidApprovalTransition: isValidApprovalTransition,
  isTerminalApprovalStatus: isTerminalApprovalStatus,
  canActOnApproval: canActOnApproval
};
