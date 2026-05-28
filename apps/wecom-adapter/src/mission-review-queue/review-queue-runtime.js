/**
 * review-queue-runtime.js
 * P9.5.4 Mission Draft Review Queue — Runtime orchestration layer.
 *
 * This module provides the 8 core capabilities:
 *   1. enqueueDraft(draft)
 *   2. enqueueDrafts(drafts)
 *   3. getReviewItem(reviewId)
 *   4. listReviewItems(filter)
 *   5. approveDraft(reviewId, reviewer, reason)
 *   6. rejectDraft(reviewId, reviewer, reason)
 *   7. archiveReviewItem(reviewId, reviewer, reason)
 *   8. generateReviewQueueSnapshot()
 *
 * Safety: No mission execution, no commander/gateway calls,
 * no HTTP API, no shell/pm2/deploy/nginx/.env access.
 */

const { createReviewItem, REVIEW_STATUS, REVIEW_DECISION } = require('./review-queue-types');
const {
  VALIDATION_ERRORS,
  validateDraftForEnqueue,
  validateDecision,
  validateReviewAction,
  validateFilter
} = require('./review-queue-validator');
const {
  addItem,
  addItems,
  getItem,
  updateItem,
  listItems,
  findDuplicateDraft,
  readQueue,
  clearQueue
} = require('./review-queue-store');

// =========================================================================
// 1. enqueueDraft(draft)
// =========================================================================

/**
 * Enqueue a single Mission Draft into the review queue.
 *
 * Validates the draft, checks for duplicates, creates a ReviewItem,
 * and persists it.
 *
 * @param {Object} draft - The MissionDraft from P9.5.3
 * @param {Object} [options={}]
 * @param {boolean} [options.allowDuplicates=false] - Allow duplicate drafts
 * @param {string} [options.reviewId] - Pre-set reviewId (for testing)
 * @param {string} [options.createdAt] - Pre-set createdAt (for testing)
 * @returns {{ success: boolean, reviewItem?: Object, error?: string, details?: string[] }}
 */
function enqueueDraft(draft, options) {
  options = options || {};

  // Step 1: Validate the draft
  var validation = validateDraftForEnqueue(draft);
  if (!validation.valid) {
    return {
      success: false,
      error: 'INVALID_DRAFT',
      details: validation.errors
    };
  }

  // Step 2: Check for duplicate drafts
  if (!options.allowDuplicates) {
    var existing = findDuplicateDraft(draft.draftId);
    if (existing) {
      return {
        success: false,
        error: 'DUPLICATE_DRAFT',
        details: [VALIDATION_ERRORS.DUPLICATE_DRAFT],
        existingReviewId: existing.reviewId
      };
    }
  }

  // Step 3: Create and persist the ReviewItem
  var item = createReviewItem(draft, {
    metadata: options.metadata,
    reviewId: options.reviewId,
    createdAt: options.createdAt
  });

  addItem(item);

  return {
    success: true,
    reviewItem: item
  };
}

// =========================================================================
// 2. enqueueDrafts(drafts)
// =========================================================================

/**
 * Enqueue multiple Mission Drafts in batch.
 * Each draft is validated independently. Failed drafts are reported
 * but do not prevent successful ones from being stored.
 *
 * @param {Object[]} drafts - Array of MissionDrafts
 * @param {Object} [options={}]
 * @returns {Array<{ success: boolean, reviewItem?: Object, error?: string, details?: string[] }>}
 */
function enqueueDrafts(drafts, options) {
  var results = [];

  // Validate drafts, prepare valid items
  var validItems = [];
  for (var i = 0; i < drafts.length; i++) {
    var draft = drafts[i];
    var validation = validateDraftForEnqueue(draft);
    if (!validation.valid) {
      results.push({
        success: false,
        error: 'INVALID_DRAFT',
        details: validation.errors
      });
      continue;
    }

    // Check dup
    if (!(options && options.allowDuplicates)) {
      var existing = findDuplicateDraft(draft.draftId);
      if (existing) {
        results.push({
          success: false,
          error: 'DUPLICATE_DRAFT',
          details: [VALIDATION_ERRORS.DUPLICATE_DRAFT],
          existingReviewId: existing.reviewId
        });
        continue;
      }
    }

    var item = createReviewItem(draft, {
      metadata: options && options.metadata,
      reviewId: options && options.reviewId,
      createdAt: options && options.createdAt
    });
    validItems.push(item);
    results.push({
      success: true,
      reviewItem: item
    });
  }

  // Store all valid items atomically
  if (validItems.length > 0) {
    addItems(validItems);
  }

  return results;
}

// =========================================================================
// 3. getReviewItem(reviewId)
// =========================================================================

/**
 * Retrieve a single ReviewItem by reviewId.
 *
 * @param {string} reviewId
 * @returns {{ success: boolean, reviewItem?: Object, error?: string, details?: string[] }}
 */
function getReviewItem(reviewId) {
  var item = getItem(reviewId);
  if (!item) {
    return {
      success: false,
      error: 'NOT_FOUND',
      details: [VALIDATION_ERRORS.NOT_FOUND]
    };
  }
  return {
    success: true,
    reviewItem: item
  };
}

// =========================================================================
// 4. listReviewItems(filter)
// =========================================================================

/**
 * List ReviewItems with optional filters.
 *
 * Supported filters: status, priority, draftId, strategyId, goalId,
 * reviewer, since, until.
 *
 * @param {Object} [filter={}]
 * @returns {{ success: boolean, items: Object[], total: number, error?: string, details?: string[] }}
 */
function listReviewItems(filter) {
  filter = filter || {};

  // Validate filter
  var filterValidation = validateFilter(filter);
  if (!filterValidation.valid) {
    return {
      success: false,
      error: 'INVALID_FILTER',
      details: filterValidation.errors
    };
  }

  var items = listItems(filter);
  return {
    success: true,
    items: items,
    total: items.length
  };
}

// =========================================================================
// 5. approveDraft(reviewId, reviewer, reason)
// =========================================================================

/**
 * Approve a pending draft.
 *
 * Transition: pending → reviewed
 * Sets decision='approve', records reviewer and reason.
 *
 * @param {string} reviewId
 * @param {string} reviewer
 * @param {string} reason
 * @returns {{ success: boolean, reviewItem?: Object, error?: string, details?: string[] }}
 */
function approveDraft(reviewId, reviewer, reason) {
  return _performReviewAction(reviewId, REVIEW_DECISION.APPROVE, reviewer, reason);
}

// =========================================================================
// 6. rejectDraft(reviewId, reviewer, reason)
// =========================================================================

/**
 * Reject a pending draft.
 *
 * Transition: pending → rejected
 * Sets decision='reject', records reviewer and reason.
 *
 * @param {string} reviewId
 * @param {string} reviewer
 * @param {string} reason
 * @returns {{ success: boolean, reviewItem?: Object, error?: string, details?: string[] }}
 */
function rejectDraft(reviewId, reviewer, reason) {
  return _performReviewAction(reviewId, REVIEW_DECISION.REJECT, reviewer, reason);
}

// =========================================================================
// 7. archiveReviewItem(reviewId, reviewer, reason)
// =========================================================================

/**
 * Archive a reviewed or rejected item.
 *
 * Transition: reviewed|rejected → archived
 * Sets decision='archive', records reviewer and reason.
 *
 * @param {string} reviewId
 * @param {string} reviewer
 * @param {string} reason
 * @returns {{ success: boolean, reviewItem?: Object, error?: string, details?: string[] }}
 */
function archiveReviewItem(reviewId, reviewer, reason) {
  return _performReviewAction(reviewId, REVIEW_DECISION.ARCHIVE, reviewer, reason);
}

// ---------------------------------------------------------------------------
// Internal: perform review action (approve/reject/archive)
// ---------------------------------------------------------------------------

function _performReviewAction(reviewId, decision, reviewer, reason) {
  // Validate decision
  var decisionValidation = validateDecision(decision);
  if (!decisionValidation.valid) {
    return {
      success: false,
      error: 'INVALID_DECISION',
      details: decisionValidation.errors
    };
  }

  // Fetch item
  var item = getItem(reviewId);
  if (!item) {
    return {
      success: false,
      error: 'NOT_FOUND',
      details: [VALIDATION_ERRORS.NOT_FOUND]
    };
  }

  // Validate the action (checks status transitions, reviewer, reason)
  var actionValidation = validateReviewAction(item, decision, reviewer, reason);
  if (!actionValidation.valid) {
    return {
      success: false,
      error: 'INVALID_ACTION',
      details: actionValidation.errors
    };
  }

  // Determine target status
  var targetStatus;
  if (decision === REVIEW_DECISION.APPROVE) {
    targetStatus = REVIEW_STATUS.REVIEWED;
  } else if (decision === REVIEW_DECISION.REJECT) {
    targetStatus = REVIEW_STATUS.REJECTED;
  } else {
    targetStatus = REVIEW_STATUS.ARCHIVED;
  }

  // Update the item
  var updated = updateItem(reviewId, {
    status: targetStatus,
    decision: decision,
    reviewer: reviewer,
    decisionReason: reason
  });

  if (!updated) {
    return {
      success: false,
      error: 'UPDATE_FAILED',
      details: ['Failed to update review item']
    };
  }

  return {
    success: true,
    reviewItem: updated
  };
}

// =========================================================================
// 8. generateReviewQueueSnapshot()
// =========================================================================

/**
 * Generate a summary snapshot of the review queue.
 *
 * @returns {Object} Snapshot with counts, breakdowns, and metadata.
 */
function generateReviewQueueSnapshot() {
  var data = readQueue();
  var items = data.items || [];

  // Count by status
  var byStatus = {};
  REVIEW_STATUS_VALUES.forEach(function (s) { byStatus[s] = 0; });
  items.forEach(function (item) {
    if (byStatus[item.status] !== undefined) {
      byStatus[item.status]++;
    }
  });

  // Count by priority
  var byPriority = { high: 0, medium: 0, low: 0 };
  items.forEach(function (item) {
    if (byPriority[item.priority] !== undefined) {
      byPriority[item.priority]++;
    }
  });

  // Find oldest pending
  var pendingItems = items.filter(function (i) { return i.status === REVIEW_STATUS.PENDING; });
  pendingItems.sort(function (a, b) {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  var oldestPending = pendingItems.length > 0 ? pendingItems[0].reviewId : null;

  // Find newest reviewed
  var reviewedItems = items.filter(function (i) { return i.status === REVIEW_STATUS.REVIEWED; });
  reviewedItems.sort(function (a, b) {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  var newestReviewed = reviewedItems.length > 0 ? reviewedItems[0].reviewId : null;

  return {
    totalItems: items.length,
    byStatus: byStatus,
    byPriority: byPriority,
    pendingCount: byStatus[REVIEW_STATUS.PENDING] || 0,
    reviewedCount: byStatus[REVIEW_STATUS.REVIEWED] || 0,
    rejectedCount: byStatus[REVIEW_STATUS.REJECTED] || 0,
    archivedCount: byStatus[REVIEW_STATUS.ARCHIVED] || 0,
    oldestPending: oldestPending,
    newestReviewed: newestReviewed,
    generatedAt: new Date().toISOString(),
    meta: data.meta
  };
}

// Re-export REVIEW_STATUS_VALUES for snapshot
var REVIEW_STATUS_VALUES = Object.values(REVIEW_STATUS);

// =========================================================================
// Utility: getStats (alias for generateReviewQueueSnapshot)
// =========================================================================

function getStats() {
  return generateReviewQueueSnapshot();
}

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  enqueueDraft: enqueueDraft,
  enqueueDrafts: enqueueDrafts,
  getReviewItem: getReviewItem,
  listReviewItems: listReviewItems,
  approveDraft: approveDraft,
  rejectDraft: rejectDraft,
  archiveReviewItem: archiveReviewItem,
  generateReviewQueueSnapshot: generateReviewQueueSnapshot,
  getStats: getStats,
  clearQueue: clearQueue
};
