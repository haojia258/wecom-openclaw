/**
 * dispatch-types.js
 * P9.5.5 Mission Dispatch Planner — Type definitions, constants, and factory functions.
 *
 * This module defines the DispatchPlan structure, status/dispatchMode enums,
 * and factory functions for creating dispatch plans.
 */

// ---------------------------------------------------------------------------
// Status constants
// ---------------------------------------------------------------------------

const DISPATCH_STATUS = {
  PLANNED: 'planned',
  REVIEWED: 'reviewed',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived'
};

const DISPATCH_STATUS_VALUES = Object.values(DISPATCH_STATUS);

// ---------------------------------------------------------------------------
// Dispatch mode constants
// ---------------------------------------------------------------------------

const DISPATCH_MODE = {
  MANUAL: 'manual',
  SUPERVISED: 'supervised',
  BLOCKED: 'blocked'
};

const DISPATCH_MODE_VALUES = Object.values(DISPATCH_MODE);

// MVP: only manual is allowed by default
const ALLOWED_DISPATCH_MODES_MVP = [DISPATCH_MODE.MANUAL];

// ---------------------------------------------------------------------------
// Agent constants
// ---------------------------------------------------------------------------

const AGENT = {
  CODEX: 'codex',
  WORKBUDDY: 'workbuddy',
  DEEPSEEK: 'deepseek',
  DOUBAO: 'doubao'
};

const AGENT_VALUES = Object.values(AGENT);

// Category → default agent mapping
const CATEGORY_AGENT_MAP = {
  commerce: AGENT.CODEX,
  operations: AGENT.WORKBUDDY,
  marketing: AGENT.DOUBAO,
  customer: AGENT.DEEPSEEK,
  devops: AGENT.CODEX,
  finance: AGENT.DEEPSEEK
};

// ---------------------------------------------------------------------------
// Priority levels (inherited from Mission Draft)
// ---------------------------------------------------------------------------

const PRIORITY_LEVELS = ['high', 'medium', 'low'];

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

const DISPATCH_ERROR_CODES = {
  INVALID_DISPATCH_PLAN: 'INVALID_DISPATCH_PLAN',
  INVALID_DISPATCH_PLAN_ID: 'INVALID_DISPATCH_PLAN_ID',
  INVALID_REVIEW_ID: 'INVALID_REVIEW_ID',
  INVALID_DRAFT_ID: 'INVALID_DRAFT_ID',
  INVALID_STRATEGY_ID: 'INVALID_STRATEGY_ID',
  INVALID_GOAL_ID: 'INVALID_GOAL_ID',
  INVALID_STATUS: 'INVALID_STATUS',
  INVALID_PRIORITY: 'INVALID_PRIORITY',
  INVALID_AGENT: 'INVALID_AGENT',
  INVALID_DISPATCH_MODE: 'INVALID_DISPATCH_MODE',
  INVALID_REVIEW_ITEM: 'INVALID_REVIEW_ITEM',
  REVIEW_ITEM_NOT_REVIEWED: 'REVIEW_ITEM_NOT_REVIEWED',
  REVIEW_ITEM_REJECTED: 'REVIEW_ITEM_REJECTED',
  REVIEW_ITEM_PENDING: 'REVIEW_ITEM_PENDING',
  REVIEW_ITEM_ARCHIVED: 'REVIEW_ITEM_ARCHIVED',
  EMPTY_REVIEW_ITEMS: 'EMPTY_REVIEW_ITEMS',
  INVALID_BATCH_INPUT: 'INVALID_BATCH_INPUT',
  FALLBACK_CONTAINS_SELECTED: 'FALLBACK_CONTAINS_SELECTED',
  DISPATCH_MODE_NOT_MANUAL: 'DISPATCH_MODE_NOT_MANUAL',
  INVALID_COMMAND_PREVIEW: 'INVALID_COMMAND_PREVIEW'
};

// ---------------------------------------------------------------------------
// ID generator
// ---------------------------------------------------------------------------

function createDispatchPlanId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return 'dispatch_' + ts + '_' + rand;
}

// ---------------------------------------------------------------------------
// Factory: createDispatchPlan(reviewItem, selectedAgent, options)
// ---------------------------------------------------------------------------

function createDispatchPlan(reviewItem, selectedAgent, options) {
  const opts = options || {};

  const now = new Date().toISOString();
  const draft = reviewItem.draft || reviewItem;

  const plan = {
    dispatchPlanId: opts.dispatchPlanId || createDispatchPlanId(),
    reviewId: reviewItem.reviewId || reviewItem.reviewId || '',
    draftId: draft.draftId || '',
    strategyId: draft.strategyId || '',
    goalId: draft.goalId || '',
    status: DISPATCH_STATUS.PLANNED,
    priority: draft.priority || 'medium',
    selectedAgent: selectedAgent,
    fallbackAgents: opts.fallbackAgents || [],
    dispatchMode: DISPATCH_MODE.MANUAL, // MVP: always manual
    dispatchReason: opts.dispatchReason || 'Agent selected based on draft recommendation and category',
    commandPreview: opts.commandPreview || '',
    guardrails: draft.guardrails || [],
    acceptanceCriteria: draft.acceptanceCriteria || [],
    risks: draft.risks || [],
    createdAt: now,
    metadata: opts.metadata || {}
  };

  return plan;
}

// ---------------------------------------------------------------------------
// Validate a dispatch plan structure
// ---------------------------------------------------------------------------

function validateDispatchPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return { valid: false, error: 'Dispatch plan must be an object', code: DISPATCH_ERROR_CODES.INVALID_DISPATCH_PLAN };
  }

  if (!plan.dispatchPlanId || typeof plan.dispatchPlanId !== 'string' || !plan.dispatchPlanId.startsWith('dispatch_')) {
    return { valid: false, error: 'Invalid dispatchPlanId', code: DISPATCH_ERROR_CODES.INVALID_DISPATCH_PLAN_ID };
  }

  if (!plan.reviewId || typeof plan.reviewId !== 'string' || !plan.reviewId.startsWith('review_')) {
    return { valid: false, error: 'Invalid reviewId', code: DISPATCH_ERROR_CODES.INVALID_REVIEW_ID };
  }

  if (!plan.draftId || typeof plan.draftId !== 'string' || !plan.draftId.startsWith('draft_')) {
    return { valid: false, error: 'Invalid draftId', code: DISPATCH_ERROR_CODES.INVALID_DRAFT_ID };
  }

  if (plan.strategyId && (typeof plan.strategyId !== 'string' || !plan.strategyId.startsWith('strategy_'))) {
    return { valid: false, error: 'Invalid strategyId', code: DISPATCH_ERROR_CODES.INVALID_STRATEGY_ID };
  }

  if (plan.goalId && (typeof plan.goalId !== 'string' || !plan.goalId.startsWith('goal_'))) {
    return { valid: false, error: 'Invalid goalId', code: DISPATCH_ERROR_CODES.INVALID_GOAL_ID };
  }

  if (!DISPATCH_STATUS_VALUES.includes(plan.status)) {
    return { valid: false, error: 'Invalid status: ' + plan.status, code: DISPATCH_ERROR_CODES.INVALID_STATUS };
  }

  if (!PRIORITY_LEVELS.includes(plan.priority)) {
    return { valid: false, error: 'Invalid priority: ' + plan.priority, code: DISPATCH_ERROR_CODES.INVALID_PRIORITY };
  }

  if (!AGENT_VALUES.includes(plan.selectedAgent)) {
    return { valid: false, error: 'Invalid selectedAgent: ' + plan.selectedAgent, code: DISPATCH_ERROR_CODES.INVALID_AGENT };
  }

  if (!DISPATCH_MODE_VALUES.includes(plan.dispatchMode)) {
    return { valid: false, error: 'Invalid dispatchMode: ' + plan.dispatchMode, code: DISPATCH_ERROR_CODES.INVALID_DISPATCH_MODE };
  }

  // MVP: dispatchMode must be manual
  if (plan.dispatchMode !== DISPATCH_MODE.MANUAL) {
    return { valid: false, error: 'MVP only allows dispatchMode=manual', code: DISPATCH_ERROR_CODES.DISPATCH_MODE_NOT_MANUAL };
  }

  // fallbackAgents must not contain selectedAgent
  if (plan.fallbackAgents && plan.fallbackAgents.includes(plan.selectedAgent)) {
    return { valid: false, error: 'fallbackAgents must not contain selectedAgent', code: DISPATCH_ERROR_CODES.FALLBACK_CONTAINS_SELECTED };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Check if review item status is valid for dispatch
// ---------------------------------------------------------------------------

function canDispatch(reviewItem) {
  if (!reviewItem || typeof reviewItem !== 'object') {
    return { canDispatch: false, reason: 'Invalid review item', code: DISPATCH_ERROR_CODES.INVALID_REVIEW_ITEM };
  }

  const status = reviewItem.status;

  if (status === 'pending') {
    return { canDispatch: false, reason: 'Review item is still pending', code: DISPATCH_ERROR_CODES.REVIEW_ITEM_PENDING };
  }

  if (status === 'rejected') {
    return { canDispatch: false, reason: 'Review item was rejected', code: DISPATCH_ERROR_CODES.REVIEW_ITEM_REJECTED };
  }

  if (status === 'archived') {
    return { canDispatch: false, reason: 'Review item is archived', code: DISPATCH_ERROR_CODES.REVIEW_ITEM_ARCHIVED };
  }

  if (status !== 'reviewed') {
    return { canDispatch: false, reason: 'Review item status is not reviewed', code: DISPATCH_ERROR_CODES.REVIEW_ITEM_NOT_REVIEWED };
  }

  return { canDispatch: true };
}

module.exports = {
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
};
