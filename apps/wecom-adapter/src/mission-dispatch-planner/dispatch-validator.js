/**
 * dispatch-validator.js
 * P9.5.5 Mission Dispatch Planner — Input validation utilities.
 *
 * Validates review items, dispatch plans, and filter/snapshot inputs.
 * No I/O, no side effects.
 */

const {
  DISPATCH_STATUS_VALUES,
  DISPATCH_MODE_VALUES,
  AGENT_VALUES,
  PRIORITY_LEVELS,
  DISPATCH_ERROR_CODES,
  canDispatch
} = require('./dispatch-types');

// ---------------------------------------------------------------------------
// Validate a single review item for dispatch eligibility
// ---------------------------------------------------------------------------

function validateReviewItemForDispatch(reviewItem) {
  const errors = [];

  if (!reviewItem || typeof reviewItem !== 'object') {
    errors.push({
      field: 'reviewItem',
      message: 'Review item must be an object',
      code: DISPATCH_ERROR_CODES.INVALID_REVIEW_ITEM
    });
    return { valid: false, errors };
  }

  // Check required fields
  if (!reviewItem.reviewId || typeof reviewItem.reviewId !== 'string') {
    errors.push({
      field: 'reviewId',
      message: 'reviewId is required and must be a string',
      code: DISPATCH_ERROR_CODES.INVALID_REVIEW_ID
    });
  }

  if (!reviewItem.status || typeof reviewItem.status !== 'string') {
    errors.push({
      field: 'status',
      message: 'status is required and must be a string',
      code: DISPATCH_ERROR_CODES.INVALID_STATUS
    });
  }

  // Check if status allows dispatch
  const dispatchCheck = canDispatch(reviewItem);
  if (!dispatchCheck.canDispatch) {
    errors.push({
      field: 'status',
      message: dispatchCheck.reason,
      code: dispatchCheck.code
    });
  }

  // Check draft exists
  if (!reviewItem.draft || typeof reviewItem.draft !== 'object') {
    errors.push({
      field: 'draft',
      message: 'reviewItem.draft is required and must be an object',
      code: DISPATCH_ERROR_CODES.INVALID_REVIEW_ITEM
    });
  } else {
    if (!reviewItem.draft.draftId || typeof reviewItem.draft.draftId !== 'string') {
      errors.push({
        field: 'draft.draftId',
        message: 'draft.draftId is required',
        code: DISPATCH_ERROR_CODES.INVALID_DRAFT_ID
      });
    }
    if (reviewItem.draft.priority && !PRIORITY_LEVELS.includes(reviewItem.draft.priority)) {
      errors.push({
        field: 'draft.priority',
        message: 'Invalid priority: ' + reviewItem.draft.priority,
        code: DISPATCH_ERROR_CODES.INVALID_PRIORITY
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ---------------------------------------------------------------------------
// Validate an array of review items for batch dispatch
// ---------------------------------------------------------------------------

function validateReviewItemsForBatch(reviewItems) {
  const errors = [];

  if (!Array.isArray(reviewItems)) {
    errors.push({
      field: 'reviewItems',
      message: 'reviewItems must be an array',
      code: DISPATCH_ERROR_CODES.INVALID_BATCH_INPUT
    });
    return { valid: false, errors };
  }

  if (reviewItems.length === 0) {
    errors.push({
      field: 'reviewItems',
      message: 'reviewItems must not be empty',
      code: DISPATCH_ERROR_CODES.EMPTY_REVIEW_ITEMS
    });
    return { valid: false, errors };
  }

  reviewItems.forEach((item, index) => {
    const itemValidation = validateReviewItemForDispatch(item);
    if (!itemValidation.valid) {
      itemValidation.errors.forEach(function (err) {
        errors.push({
          field: 'reviewItems[' + index + '].' + err.field,
          message: err.message,
          code: err.code,
          index: index
        });
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

// ---------------------------------------------------------------------------
// Validate a dispatch plan structure
// ---------------------------------------------------------------------------

function validateDispatchPlan(plan) {
  const errors = [];

  if (!plan || typeof plan !== 'object') {
    errors.push({
      field: 'plan',
      message: 'Dispatch plan must be an object',
      code: DISPATCH_ERROR_CODES.INVALID_DISPATCH_PLAN
    });
    return { valid: false, errors };
  }

  if (!plan.dispatchPlanId || typeof plan.dispatchPlanId !== 'string' || !plan.dispatchPlanId.startsWith('dispatch_')) {
    errors.push({
      field: 'dispatchPlanId',
      message: 'dispatchPlanId must be a string starting with "dispatch_"',
      code: DISPATCH_ERROR_CODES.INVALID_DISPATCH_PLAN_ID
    });
  }

  if (!plan.reviewId || typeof plan.reviewId !== 'string' || !plan.reviewId.startsWith('review_')) {
    errors.push({
      field: 'reviewId',
      message: 'reviewId must be a string starting with "review_"',
      code: DISPATCH_ERROR_CODES.INVALID_REVIEW_ID
    });
  }

  if (!plan.draftId || typeof plan.draftId !== 'string' || !plan.draftId.startsWith('draft_')) {
    errors.push({
      field: 'draftId',
      message: 'draftId must be a string starting with "draft_"',
      code: DISPATCH_ERROR_CODES.INVALID_DRAFT_ID
    });
  }

  if (plan.strategyId && (typeof plan.strategyId !== 'string' || !plan.strategyId.startsWith('strategy_'))) {
    errors.push({
      field: 'strategyId',
      message: 'strategyId must be a string starting with "strategy_"',
      code: DISPATCH_ERROR_CODES.INVALID_STRATEGY_ID
    });
  }

  if (plan.goalId && (typeof plan.goalId !== 'string' || !plan.goalId.startsWith('goal_'))) {
    errors.push({
      field: 'goalId',
      message: 'goalId must be a string starting with "goal_"',
      code: DISPATCH_ERROR_CODES.INVALID_GOAL_ID
    });
  }

  if (!DISPATCH_STATUS_VALUES.includes(plan.status)) {
    errors.push({
      field: 'status',
      message: 'Invalid status: ' + plan.status,
      code: DISPATCH_ERROR_CODES.INVALID_STATUS
    });
  }

  if (!PRIORITY_LEVELS.includes(plan.priority)) {
    errors.push({
      field: 'priority',
      message: 'Invalid priority: ' + plan.priority,
      code: DISPATCH_ERROR_CODES.INVALID_PRIORITY
    });
  }

  if (!AGENT_VALUES.includes(plan.selectedAgent)) {
    errors.push({
      field: 'selectedAgent',
      message: 'Invalid selectedAgent: ' + plan.selectedAgent,
      code: DISPATCH_ERROR_CODES.INVALID_AGENT
    });
  }

  if (!DISPATCH_MODE_VALUES.includes(plan.dispatchMode)) {
    errors.push({
      field: 'dispatchMode',
      message: 'Invalid dispatchMode: ' + plan.dispatchMode,
      code: DISPATCH_ERROR_CODES.INVALID_DISPATCH_MODE
    });
  }

  // MVP: dispatchMode must be manual
  if (plan.dispatchMode !== 'manual') {
    errors.push({
      field: 'dispatchMode',
      message: 'MVP only allows dispatchMode=manual, got: ' + plan.dispatchMode,
      code: DISPATCH_ERROR_CODES.DISPATCH_MODE_NOT_MANUAL
    });
  }

  // fallbackAgents must be an array and must not contain selectedAgent
  if (!Array.isArray(plan.fallbackAgents)) {
    errors.push({
      field: 'fallbackAgents',
      message: 'fallbackAgents must be an array',
      code: DISPATCH_ERROR_CODES.INVALID_AGENT
    });
  } else if (plan.fallbackAgents.includes(plan.selectedAgent)) {
    errors.push({
      field: 'fallbackAgents',
      message: 'fallbackAgents must not contain selectedAgent',
      code: DISPATCH_ERROR_CODES.FALLBACK_CONTAINS_SELECTED
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ---------------------------------------------------------------------------
// Validate a snapshot payload
// ---------------------------------------------------------------------------

function validateSnapshot(snapshot) {
  const errors = [];

  if (!snapshot || typeof snapshot !== 'object') {
    errors.push({
      field: 'snapshot',
      message: 'Snapshot must be an object',
      code: DISPATCH_ERROR_CODES.INVALID_DISPATCH_PLAN
    });
    return { valid: false, errors };
  }

  if (!snapshot.generatedAt || typeof snapshot.generatedAt !== 'string') {
    errors.push({
      field: 'generatedAt',
      message: 'generatedAt is required and must be a string',
      code: DISPATCH_ERROR_CODES.INVALID_DISPATCH_PLAN
    });
  }

  if (!Array.isArray(snapshot.plans)) {
    errors.push({
      field: 'plans',
      message: 'plans must be an array',
      code: DISPATCH_ERROR_CODES.INVALID_DISPATCH_PLAN
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ---------------------------------------------------------------------------
// Validate fallback agents array
// ---------------------------------------------------------------------------

function validateFallbackAgents(fallbackAgents, selectedAgent) {
  const errors = [];

  if (!Array.isArray(fallbackAgents)) {
    errors.push({
      field: 'fallbackAgents',
      message: 'fallbackAgents must be an array',
      code: DISPATCH_ERROR_CODES.INVALID_AGENT
    });
    return { valid: false, errors };
  }

  fallbackAgents.forEach(function (agent, index) {
    if (!AGENT_VALUES.includes(agent)) {
      errors.push({
        field: 'fallbackAgents[' + index + ']',
        message: 'Invalid agent: ' + agent,
        code: DISPATCH_ERROR_CODES.INVALID_AGENT
      });
    }
    if (agent === selectedAgent) {
      errors.push({
        field: 'fallbackAgents[' + index + ']',
        message: 'fallbackAgents must not contain selectedAgent (' + selectedAgent + ')',
        code: DISPATCH_ERROR_CODES.FALLBACK_CONTAINS_SELECTED
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateReviewItemForDispatch,
  validateReviewItemsForBatch,
  validateDispatchPlan,
  validateSnapshot,
  validateFallbackAgents
};
