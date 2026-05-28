/**
 * review-queue-types.js
 * P9.5.4 Mission Draft Review Queue — Type definitions, constants, and factory functions.
 *
 * This module defines the ReviewItem structure, status/decision enums,
 * state transition rules, and factory functions.
 */

// ---------------------------------------------------------------------------
// Status constants
// ---------------------------------------------------------------------------

const REVIEW_STATUS = {
  PENDING: 'pending',
  REVIEWED: 'reviewed',
  REJECTED: 'rejected',
  ARCHIVED: 'archived'
};

const REVIEW_STATUS_VALUES = Object.values(REVIEW_STATUS);

// ---------------------------------------------------------------------------
// Decision constants
// ---------------------------------------------------------------------------

const REVIEW_DECISION = {
  APPROVE: 'approve',
  REJECT: 'reject',
  ARCHIVE: 'archive'
};

const REVIEW_DECISION_VALUES = Object.values(REVIEW_DECISION);

// ---------------------------------------------------------------------------
// Allowed state transitions
//
//   pending  ──approve──> reviewed
//   pending  ──reject───> rejected
//   reviewed ──archive──> archived
//   rejected ──archive──> archived
//   archived → (terminal, no transitions)
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS = {
  [REVIEW_STATUS.PENDING]: [REVIEW_STATUS.REVIEWED, REVIEW_STATUS.REJECTED],
  [REVIEW_STATUS.REVIEWED]: [REVIEW_STATUS.ARCHIVED],
  [REVIEW_STATUS.REJECTED]: [REVIEW_STATUS.ARCHIVED],
  [REVIEW_STATUS.ARCHIVED]: []
};

// ---------------------------------------------------------------------------
// Decision → target status mapping
// ---------------------------------------------------------------------------

const DECISION_TO_STATUS = {
  [REVIEW_DECISION.APPROVE]: REVIEW_STATUS.REVIEWED,
  [REVIEW_DECISION.REJECT]: REVIEW_STATUS.REJECTED,
  [REVIEW_DECISION.ARCHIVE]: REVIEW_STATUS.ARCHIVED
};

// ---------------------------------------------------------------------------
// Priority levels
// ---------------------------------------------------------------------------

const PRIORITY_LEVELS = ['high', 'medium', 'low'];

// ---------------------------------------------------------------------------
// ID generators
// ---------------------------------------------------------------------------

function createReviewId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return 'review_' + ts + '_' + rand;
}

function createDraftId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return 'draft_' + ts + '_' + rand;
}

// ---------------------------------------------------------------------------
// Factory: create a ReviewItem from a Mission Draft
// ---------------------------------------------------------------------------

/**
 * Create a ReviewItem from a Mission Draft.
 *
 * @param {Object} draft - The MissionDraft from P9.5.3
 * @param {Object} [options={}]
 * @param {Object} [options.metadata] - Additional metadata
 * @param {string} [options.reviewId] - Pre-set reviewId (for testing)
 * @param {string} [options.createdAt] - Pre-set createdAt (for testing)
 * @returns {Object} ReviewItem
 */
function createReviewItem(draft, options = {}) {
  const safe = (draft && typeof draft === 'object') ? draft : {};
  const now = options.createdAt || new Date().toISOString();
  return {
    reviewId: options.reviewId || createReviewId(),
    draftId: safe.draftId || '',
    strategyId: safe.strategyId || '',
    goalId: safe.goalId || '',
    title: safe.title || '',
    priority: safe.priority || 'medium',
    status: REVIEW_STATUS.PENDING,
    reviewer: null,
    decision: null,
    decisionReason: null,
    draft: typeof draft === 'object' && draft !== null ? { ...draft } : {},
    createdAt: now,
    updatedAt: now,
    metadata: options.metadata || {}
  };
}

// ---------------------------------------------------------------------------
// State transition helpers
// ---------------------------------------------------------------------------

/**
 * Check if a status transition is valid.
 */
function isValidTransition(fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
}

/**
 * Check if a status is a terminal state.
 */
function isTerminalStatus(status) {
  return ALLOWED_TRANSITIONS[status] && ALLOWED_TRANSITIONS[status].length === 0;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  REVIEW_STATUS,
  REVIEW_STATUS_VALUES,
  REVIEW_DECISION,
  REVIEW_DECISION_VALUES,
  ALLOWED_TRANSITIONS,
  DECISION_TO_STATUS,
  PRIORITY_LEVELS,
  createReviewId,
  createDraftId,
  createReviewItem,
  isValidTransition,
  isTerminalStatus
};
