/**
 * dispatch-planner.js
 * P9.5.5 Mission Dispatch Planner — Core runtime.
 *
 * Converts reviewed Mission Drafts (via Review Queue items) into dispatch plans.
 * MVP: dispatchMode is always "manual"; no auto-dispatch.
 * No side effects: no mission execution, no commander/gateway/agent-host calls.
 */

const {
  DISPATCH_STATUS,
  DISPATCH_MODE,
  DISPATCH_ERROR_CODES,
  createDispatchPlan,
  validateDispatchPlan,
  canDispatch
} = require('./dispatch-types');

const {
  validateReviewItemForDispatch,
  validateReviewItemsForBatch,
  validateDispatchPlan: validatePlanStructure,
  validateFallbackAgents
} = require('./dispatch-validator');

const {
  selectAgent,
  buildFallbackAgents
} = require('./agent-selector');

// ---------------------------------------------------------------------------
// In-memory plan store (MVP: no persistence)
// ---------------------------------------------------------------------------

var plans = [];
var plansById = {};

// ---------------------------------------------------------------------------
// Helper: generate command preview string from draft
// ---------------------------------------------------------------------------

function generateCommandPreview(draft) {
  if (!draft || typeof draft !== 'object') {
    return '';
  }

  var parts = [];
  parts.push('[DISPATCH PREVIEW]');
  parts.push('Title: ' + (draft.title || '(untitled)'));
  parts.push('Type: ' + (draft.type || 'N/A'));
  parts.push('Objective: ' + (draft.objective || 'N/A'));

  if (draft.inputs && Array.isArray(draft.inputs)) {
    parts.push('Inputs: ' + draft.inputs.length + ' item(s)');
  }

  if (draft.acceptanceCriteria && Array.isArray(draft.acceptanceCriteria)) {
    parts.push('Acceptance Criteria: ' + draft.acceptanceCriteria.length + ' item(s)');
  }

  parts.push('Mode: MANUAL (MVP) — no auto-dispatch');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Core: planDispatchForItem(reviewItem, options)
// ---------------------------------------------------------------------------

function planDispatchForItem(reviewItem, options) {
  var opts = options || {};

  // Validate review item
  var validation = validateReviewItemForDispatch(reviewItem);
  if (!validation.valid) {
    return {
      success: false,
      error: 'Review item validation failed',
      details: validation.errors,
      code: validation.errors[0] && validation.errors[0].code
    };
  }

  // Select agent
  var agentResult;
  if (opts.overrideAgent) {
    var fallback = buildFallbackAgents(opts.overrideAgent);
    agentResult = {
      selectedAgent: opts.overrideAgent,
      fallbackAgents: fallback,
      reason: 'Explicit override: ' + opts.overrideAgent
    };
  } else {
    agentResult = selectAgent(reviewItem);
  }

  // Build dispatch plan
  var plan = createDispatchPlan(reviewItem, agentResult.selectedAgent, {
    fallbackAgents: agentResult.fallbackAgents,
    dispatchReason: agentResult.reason,
    commandPreview: opts.commandPreview || generateCommandPreview(reviewItem.draft),
    metadata: opts.metadata || {}
  });

  // Override status if provided
  if (opts.status && Object.values(DISPATCH_STATUS).includes(opts.status)) {
    plan.status = opts.status;
  }

  // Validate the plan
  var planValidation = validateDispatchPlan(plan);
  if (!planValidation.valid) {
    return {
      success: false,
      error: 'Dispatch plan validation failed',
      details: planValidation.errors,
      code: DISPATCH_ERROR_CODES.INVALID_DISPATCH_PLAN
    };
  }

  // Store in memory
  plans.push(plan);
  plansById[plan.dispatchPlanId] = plan;

  return {
    success: true,
    plan: plan,
    selectedAgent: agentResult.selectedAgent,
    fallbackAgents: agentResult.fallbackAgents,
    reason: agentResult.reason
  };
}

// ---------------------------------------------------------------------------
// Core: planDispatch(reviewedItems, options)
// ---------------------------------------------------------------------------

function planDispatch(reviewedItems, options) {
  var opts = options || {};

  if (!Array.isArray(reviewedItems)) {
    return {
      success: false,
      error: 'reviewedItems must be an array',
      code: DISPATCH_ERROR_CODES.INVALID_BATCH_INPUT,
      results: [],
      succeeded: 0,
      failed: 0
    };
  }

  if (reviewedItems.length === 0) {
    return {
      success: true,
      results: [],
      succeeded: 0,
      failed: 0,
      message: 'No items to process'
    };
  }

  var results = [];
  var succeeded = 0;
  var failed = 0;

  reviewedItems.forEach(function (item) {
    var result = planDispatchForItem(item, opts);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
    results.push(result);
  });

  return {
    success: failed === 0,
    results: results,
    succeeded: succeeded,
    failed: failed
  };
}

// ---------------------------------------------------------------------------
// Core: batchPlanDispatch(reviewedItems, options)
// ---------------------------------------------------------------------------

function batchPlanDispatch(reviewedItems, options) {
  // Validate batch input: must be non-empty array
  if (!Array.isArray(reviewedItems)) {
    return {
      success: false,
      error: 'reviewedItems must be an array',
      code: DISPATCH_ERROR_CODES.INVALID_BATCH_INPUT,
      results: [],
      succeeded: 0,
      failed: 0
    };
  }

  if (reviewedItems.length === 0) {
    return {
      success: false,
      error: 'No review items provided',
      code: DISPATCH_ERROR_CODES.EMPTY_REVIEW_ITEMS,
      results: [],
      succeeded: 0,
      failed: 0
    };
  }

  // Delegate to planDispatch for per-item processing (partial success allowed)
  return planDispatch(reviewedItems, options);
}

// ---------------------------------------------------------------------------
// Get a dispatch plan by ID
// ---------------------------------------------------------------------------

function getDispatchPlan(planId) {
  if (!planId || typeof planId !== 'string') {
    return { success: false, error: 'Invalid planId', code: DISPATCH_ERROR_CODES.INVALID_DISPATCH_PLAN_ID };
  }

  var plan = plansById[planId];
  if (!plan) {
    return { success: false, error: 'Dispatch plan not found: ' + planId, code: DISPATCH_ERROR_CODES.INVALID_DISPATCH_PLAN_ID };
  }

  return { success: true, plan: plan };
}

// ---------------------------------------------------------------------------
// List all dispatch plans (with optional filter)
// ---------------------------------------------------------------------------

function listDispatchPlans(filter) {
  var filtered = [].concat(plans);

  if (filter && typeof filter === 'object') {
    if (filter.status) {
      filtered = filtered.filter(function (p) { return p.status === filter.status; });
    }
    if (filter.selectedAgent) {
      filtered = filtered.filter(function (p) { return p.selectedAgent === filter.selectedAgent; });
    }
    if (filter.priority) {
      filtered = filtered.filter(function (p) { return p.priority === filter.priority; });
    }
    if (filter.reviewId) {
      filtered = filtered.filter(function (p) { return p.reviewId === filter.reviewId; });
    }
    if (filter.draftId) {
      filtered = filtered.filter(function (p) { return p.draftId === filter.draftId; });
    }
  }

  return {
    success: true,
    plans: filtered,
    count: filtered.length
  };
}

// ---------------------------------------------------------------------------
// Preview a dispatch plan (human-readable string)
// ---------------------------------------------------------------------------

function previewDispatchPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return { success: false, error: 'Invalid plan', code: DISPATCH_ERROR_CODES.INVALID_DISPATCH_PLAN };
  }

  var lines = [];
  lines.push('=== Dispatch Plan Preview ===');
  lines.push('Plan ID:     ' + plan.dispatchPlanId);
  lines.push('Review ID:    ' + plan.reviewId);
  lines.push('Draft ID:     ' + plan.draftId);
  lines.push('Strategy ID:  ' + (plan.strategyId || '(none)'));
  lines.push('Goal ID:      ' + (plan.goalId || '(none)'));
  lines.push('Status:       ' + plan.status);
  lines.push('Priority:     ' + plan.priority);
  lines.push('Agent:        ' + plan.selectedAgent);
  lines.push('Fallbacks:    ' + (plan.fallbackAgents || []).join(', '));
  lines.push('Dispatch Mode: ' + plan.dispatchMode);
  lines.push('Reason:       ' + plan.dispatchReason);
  lines.push('--- Command Preview ---');
  lines.push(plan.commandPreview || '(none)');
  lines.push('--- Guardrails ---');
  lines.push(JSON.stringify(plan.guardrails || [], null, 2));
  lines.push('--- Acceptance Criteria ---');
  lines.push(JSON.stringify(plan.acceptanceCriteria || [], null, 2));
  lines.push('--- Risks ---');
  lines.push(JSON.stringify(plan.risks || [], null, 2));
  lines.push('Created:      ' + plan.createdAt);
  lines.push('=== End Preview ===');

  return {
    success: true,
    preview: lines.join('\n')
  };
}

// ---------------------------------------------------------------------------
// Generate a snapshot of current dispatch plans
// ---------------------------------------------------------------------------

function generateDispatchSnapshot() {
  var snapshot = {
    generatedAt: new Date().toISOString(),
    totalPlans: plans.length,
    byStatus: {},
    byAgent: {},
    byPriority: {},
    plans: plans.map(function (p) {
      return {
        dispatchPlanId: p.dispatchPlanId,
        reviewId: p.reviewId,
        draftId: p.draftId,
        status: p.status,
        priority: p.priority,
        selectedAgent: p.selectedAgent,
        dispatchMode: p.dispatchMode,
        createdAt: p.createdAt
      };
    })
  };

  // Count by status
  plans.forEach(function (p) {
    if (!snapshot.byStatus[p.status]) {
      snapshot.byStatus[p.status] = 0;
    }
    snapshot.byStatus[p.status]++;
  });

  // Count by agent
  plans.forEach(function (p) {
    if (!snapshot.byAgent[p.selectedAgent]) {
      snapshot.byAgent[p.selectedAgent] = 0;
    }
    snapshot.byAgent[p.selectedAgent]++;
  });

  // Count by priority
  plans.forEach(function (p) {
    if (!snapshot.byPriority[p.priority]) {
      snapshot.byPriority[p.priority] = 0;
    }
    snapshot.byPriority[p.priority]++;
  });

  return {
    success: true,
    snapshot: snapshot
  };
}

// ---------------------------------------------------------------------------
// Update plan status (e.g., reviewed → cancelled)
// ---------------------------------------------------------------------------

function updatePlanStatus(planId, newStatus) {
  var lookup = getDispatchPlan(planId);
  if (!lookup.success) {
    return lookup;
  }

  if (!Object.values(DISPATCH_STATUS).includes(newStatus)) {
    return {
      success: false,
      error: 'Invalid status: ' + newStatus,
      code: DISPATCH_ERROR_CODES.INVALID_STATUS
    };
  }

  lookup.plan.status = newStatus;
  return {
    success: true,
    plan: lookup.plan
  };
}

// ---------------------------------------------------------------------------
// Clear all plans (for testing)
// ---------------------------------------------------------------------------

function _clearAllPlans() {
  plans = [];
  plansById = {};
  return { success: true };
}

module.exports = {
  planDispatch,
  planDispatchForItem,
  batchPlanDispatch,
  selectAgent,
  getDispatchPlan,
  listDispatchPlans,
  previewDispatchPlan,
  generateDispatchSnapshot,
  updatePlanStatus,
  generateCommandPreview,
  _clearAllPlans
};
