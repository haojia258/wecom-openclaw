/**
 * index.js
 * P9.5.5 Mission Dispatch Planner — Barrel export.
 *
 * Exports all public symbols from sub-modules.
 */

const {
  DISPATCH_STATUS,
  DISPATCH_STATUS_VALUES,
  DISPATCH_MODE,
  DISPATCH_MODE_VALUES,
  ALLOWED_DISPATCH_MODES_MVP,
  AGENT,
  AGENT_VALUES,
  CATEGORY_AGENT_MAP,
  PRIORITY_LEVELS,
  DISPATCH_ERROR_CODES,
  createDispatchPlanId,
  createDispatchPlan,
  validateDispatchPlan,
  canDispatch
} = require('./dispatch-types');

const {
  validateReviewItemForDispatch,
  validateReviewItemsForBatch,
  validateDispatchPlan: validateDispatchPlanValidator,
  validateSnapshot,
  validateFallbackAgents
} = require('./dispatch-validator');

const {
  selectAgent,
  selectAgentWithOverride,
  getDefaultAgentForCategory,
  isValidAgent,
  getAllAgents,
  buildFallbackAgents
} = require('./agent-selector');

const {
  planDispatch,
  planDispatchForItem,
  batchPlanDispatch,
  getDispatchPlan,
  listDispatchPlans,
  previewDispatchPlan,
  generateDispatchSnapshot,
  updatePlanStatus,
  generateCommandPreview,
  _clearAllPlans
} = require('./dispatch-planner');

// ---------------------------------------------------------------------------
// Singleton runtime (optional convenience)
// ---------------------------------------------------------------------------

const DispatchPlannerRuntime = {
  planDispatch: planDispatch,
  planDispatchForItem: planDispatchForItem,
  batchPlanDispatch: batchPlanDispatch,
  selectAgent: selectAgent,
  getDispatchPlan: getDispatchPlan,
  listDispatchPlans: listDispatchPlans,
  previewDispatchPlan: previewDispatchPlan,
  generateDispatchSnapshot: generateDispatchSnapshot,
  updatePlanStatus: updatePlanStatus,
  _clearAllPlans: _clearAllPlans
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Types & constants
  DISPATCH_STATUS,
  DISPATCH_STATUS_VALUES,
  DISPATCH_MODE,
  DISPATCH_MODE_VALUES,
  ALLOWED_DISPATCH_MODES_MVP,
  AGENT,
  AGENT_VALUES,
  CATEGORY_AGENT_MAP,
  PRIORITY_LEVELS,
  DISPATCH_ERROR_CODES,

  // Factory functions
  createDispatchPlanId,
  createDispatchPlan,
  validateDispatchPlan,
  canDispatch,

  // Validators
  validateReviewItemForDispatch,
  validateReviewItemsForBatch,
  validateDispatchPlanValidator,
  validateSnapshot,
  validateFallbackAgents,

  // Agent selector
  selectAgent,
  selectAgentWithOverride,
  getDefaultAgentForCategory,
  isValidAgent,
  getAllAgents,
  buildFallbackAgents,

  // Core runtime
  planDispatch,
  planDispatchForItem,
  batchPlanDispatch,
  getDispatchPlan,
  listDispatchPlans,
  previewDispatchPlan,
  generateDispatchSnapshot,
  updatePlanStatus,
  generateCommandPreview,
  _clearAllPlans,

  // Singleton
  DispatchPlannerRuntime
};
