/**
 * review-queue-validator.js
 * P9.5.4 Mission Draft Review Queue — Validation logic.
 *
 * Pure validation functions. No I/O, no side effects.
 */

const {
  REVIEW_STATUS,
  REVIEW_STATUS_VALUES,
  REVIEW_DECISION,
  REVIEW_DECISION_VALUES,
  PRIORITY_LEVELS,
  isValidTransition
} = require('./review-queue-types');

// ---------------------------------------------------------------------------
// Validation error codes
// ---------------------------------------------------------------------------

const VALIDATION_ERRORS = {
  // Structural errors
  MISSING_REVIEW_ID: 'MISSING_REVIEW_ID',
  MISSING_DRAFT_ID: 'MISSING_DRAFT_ID',
  MISSING_STRATEGY_ID: 'MISSING_STRATEGY_ID',
  MISSING_GOAL_ID: 'MISSING_GOAL_ID',
  MISSING_TITLE: 'MISSING_TITLE',
  INVALID_PRIORITY: 'INVALID_PRIORITY',
  INVALID_STATUS: 'INVALID_STATUS',
  INVALID_DECISION: 'INVALID_DECISION',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  MISSING_DRAFT: 'MISSING_DRAFT',
  MISSING_CREATED_AT: 'MISSING_CREATED_AT',
  MISSING_UPDATED_AT: 'MISSING_UPDATED_AT',

  // Action errors
  MISSING_REVIEWER: 'MISSING_REVIEWER',
  MISSING_REASON: 'MISSING_REASON',
  DUPLICATE_DRAFT: 'DUPLICATE_DRAFT',
  INVALID_DRAFT_OBJECT: 'INVALID_DRAFT_OBJECT',
  ALREADY_REVIEWED: 'ALREADY_REVIEWED',
  ALREADY_REJECTED: 'ALREADY_REJECTED',
  ALREADY_ARCHIVED: 'ALREADY_ARCHIVED',
  NOT_FOUND: 'NOT_FOUND',

  // Runtime errors
  INVALID_FILTER: 'INVALID_FILTER'
};

// ---------------------------------------------------------------------------
// validateReviewItem — Full structural validation
// ---------------------------------------------------------------------------

/**
 * Validate a complete ReviewItem.
 *
 * @param {Object} item
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateReviewItem(item) {
  const errors = [];

  if (!item || typeof item !== 'object') {
    return { valid: false, errors: ['INVALID_ITEM'] };
  }

  if (!item.reviewId || typeof item.reviewId !== 'string') {
    errors.push(VALIDATION_ERRORS.MISSING_REVIEW_ID);
  }
  if (!item.draftId || typeof item.draftId !== 'string') {
    errors.push(VALIDATION_ERRORS.MISSING_DRAFT_ID);
  }
  if (!item.strategyId || typeof item.strategyId !== 'string') {
    errors.push(VALIDATION_ERRORS.MISSING_STRATEGY_ID);
  }
  if (!item.goalId || typeof item.goalId !== 'string') {
    errors.push(VALIDATION_ERRORS.MISSING_GOAL_ID);
  }
  if (!item.title || typeof item.title !== 'string') {
    errors.push(VALIDATION_ERRORS.MISSING_TITLE);
  }
  if (!item.priority || !PRIORITY_LEVELS.includes(item.priority)) {
    errors.push(VALIDATION_ERRORS.INVALID_PRIORITY);
  }
  if (!item.status || !REVIEW_STATUS_VALUES.includes(item.status)) {
    errors.push(VALIDATION_ERRORS.INVALID_STATUS);
  }
  if (!item.draft || typeof item.draft !== 'object' || item.draft === null) {
    errors.push(VALIDATION_ERRORS.MISSING_DRAFT);
  }
  if (!item.createdAt) {
    errors.push(VALIDATION_ERRORS.MISSING_CREATED_AT);
  }
  if (!item.updatedAt) {
    errors.push(VALIDATION_ERRORS.MISSING_UPDATED_AT);
  }

  // Validate decision/status consistency for reviewed items
  if (item.status === REVIEW_STATUS.REVIEWED || item.status === REVIEW_STATUS.REJECTED) {
    if (!item.decision) {
      errors.push('MISSING_DECISION_FOR_' + item.status.toUpperCase());
    }
    if (!item.reviewer) {
      errors.push('MISSING_REVIEWER_FOR_' + item.status.toUpperCase());
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// validateDraftForEnqueue — Validate a draft before enqueueing
// ---------------------------------------------------------------------------

/**
 * Validate a Mission Draft for enqueue into the review queue.
 * Checks that the draft is a non-null object with required fields.
 *
 * @param {Object} draft
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateDraftForEnqueue(draft) {
  const errors = [];

  if (!draft || typeof draft !== 'object' || draft === null) {
    errors.push(VALIDATION_ERRORS.INVALID_DRAFT_OBJECT);
    return { valid: false, errors };
  }

  if (!draft.draftId) {
    errors.push(VALIDATION_ERRORS.MISSING_DRAFT_ID);
  }
  if (!draft.title) {
    errors.push(VALIDATION_ERRORS.MISSING_TITLE);
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// validateDecision — Validate decision value
// ---------------------------------------------------------------------------

/**
 * Validate a review decision.
 *
 * @param {string} decision
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateDecision(decision) {
  const valid = typeof decision === 'string' && REVIEW_DECISION_VALUES.includes(decision);
  return {
    valid,
    errors: valid ? [] : [VALIDATION_ERRORS.INVALID_DECISION]
  };
}

// ---------------------------------------------------------------------------
// validateStatus — Validate status value
// ---------------------------------------------------------------------------

/**
 * Validate a status value.
 *
 * @param {string} status
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateStatus(status) {
  const valid = typeof status === 'string' && REVIEW_STATUS_VALUES.includes(status);
  return {
    valid,
    errors: valid ? [] : [VALIDATION_ERRORS.INVALID_STATUS]
  };
}

// ---------------------------------------------------------------------------
// validatePriority — Validate priority value
// ---------------------------------------------------------------------------

/**
 * Validate a priority value.
 *
 * @param {string} priority
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePriority(priority) {
  const valid = typeof priority === 'string' && PRIORITY_LEVELS.includes(priority);
  return {
    valid,
    errors: valid ? [] : [VALIDATION_ERRORS.INVALID_PRIORITY]
  };
}

// ---------------------------------------------------------------------------
// validateReviewAction — Validate a review action (approve/reject/archive)
// ---------------------------------------------------------------------------

/**
 * Validate a review action against a ReviewItem.
 *
 * @param {Object|null} item - The ReviewItem (null if not found)
 * @param {string} decision - The decision (approve/reject/archive)
 * @param {string} reviewer - The reviewer identifier
 * @param {string} reason - The decision reason
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateReviewAction(item, decision, reviewer, reason) {
  const errors = [];

  // Check item exists
  if (!item) {
    errors.push(VALIDATION_ERRORS.NOT_FOUND);
    return { valid: false, errors };
  }

  // Check reviewer
  if (!reviewer || typeof reviewer !== 'string' || reviewer.trim().length === 0) {
    errors.push(VALIDATION_ERRORS.MISSING_REVIEWER);
  }

  // Check reason
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    errors.push(VALIDATION_ERRORS.MISSING_REASON);
  }

  // Check decision-appropriate status
  if (decision === REVIEW_DECISION.APPROVE || decision === REVIEW_DECISION.REJECT) {
    if (item.status === REVIEW_STATUS.REVIEWED) {
      errors.push(VALIDATION_ERRORS.ALREADY_REVIEWED);
    } else if (item.status === REVIEW_STATUS.REJECTED) {
      errors.push(VALIDATION_ERRORS.ALREADY_REJECTED);
    } else if (item.status === REVIEW_STATUS.ARCHIVED) {
      errors.push(VALIDATION_ERRORS.ALREADY_ARCHIVED);
    }
  }

  if (decision === REVIEW_DECISION.ARCHIVE) {
    if (item.status === REVIEW_STATUS.ARCHIVED) {
      errors.push(VALIDATION_ERRORS.ALREADY_ARCHIVED);
    } else if (item.status === REVIEW_STATUS.PENDING) {
      errors.push(VALIDATION_ERRORS.INVALID_TRANSITION);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// validateFilter — Validate filter object
// ---------------------------------------------------------------------------

/**
 * Validate filter criteria.
 *
 * @param {Object} filter
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateFilter(filter) {
  const errors = [];

  if (!filter || typeof filter !== 'object') {
    return { valid: true, errors: [] };
  }

  if (filter.status !== undefined) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    for (const s of statuses) {
      if (!REVIEW_STATUS_VALUES.includes(s)) {
        errors.push(VALIDATION_ERRORS.INVALID_FILTER + ': invalid status "' + s + '"');
      }
    }
  }

  if (filter.priority !== undefined) {
    if (!PRIORITY_LEVELS.includes(filter.priority)) {
      errors.push(VALIDATION_ERRORS.INVALID_FILTER + ': invalid priority "' + filter.priority + '"');
    }
  }

  if (filter.since !== undefined) {
    const d = new Date(filter.since);
    if (isNaN(d.getTime())) {
      errors.push(VALIDATION_ERRORS.INVALID_FILTER + ': invalid since date');
    }
  }

  if (filter.until !== undefined) {
    const d = new Date(filter.until);
    if (isNaN(d.getTime())) {
      errors.push(VALIDATION_ERRORS.INVALID_FILTER + ': invalid until date');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  VALIDATION_ERRORS,
  validateReviewItem,
  validateDraftForEnqueue,
  validateDecision,
  validateStatus,
  validatePriority,
  validateReviewAction,
  validateFilter
};
