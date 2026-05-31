/**
 * P9.5.2 Strategy Planner MVP — strategy-validator.js
 * Input validation for strategy planner
 */

const { STRATEGY_STATUS, isValidStatus, isValidCategory, STRATEGY_CATEGORIES } = require('./strategy-types');

const ERRORS = {
  INVALID_GOAL: 'Invalid goal object',
  MISSING_GOAL_ID: 'Goal must have goalId or id',
  INVALID_CATEGORY: 'Invalid goal category',
  INVALID_PRIORITY: 'Invalid priority value',
  INVALID_STATUS: 'Invalid strategy status',
  GOAL_NOT_OBJECT: 'Goal must be an object',
  TEMPLATE_NOT_OBJECT: 'Template must be an object',
  STRATEGY_NOT_OBJECT: 'Strategy plan must be an object',
  INVALID_OBJECTIVES: 'Objectives must be an array of strings',
  INVALID_GUARDRAILS: 'Guardrails must be an array of strings',
  INVALID_RECOMMENDATIONS: 'Recommendations must be an array',
  EMPTY_GOAL: 'Goal object is empty',
  UNKNOWN_CATEGORY: 'Unknown category, will use default template'
};

const PRIORITY_LEVELS = ['low', 'medium', 'high', 'critical'];

function validateGoal(goal) {
  const errors = [];
  const warnings = [];

  // Check if goal is an object
  if (!goal || typeof goal !== 'object') {
    errors.push(ERRORS.GOAL_NOT_OBJECT);
    return { valid: false, errors, warnings, goal: null };
  }

  // Check if goal is empty
  if (Object.keys(goal).length === 0) {
    warnings.push(ERRORS.EMPTY_GOAL);
  }

  // Check goalId or id
  if (!goal.goalId && !goal.id) {
    errors.push(ERRORS.MISSING_GOAL_ID);
  }

  // Validate category (warning only, will fallback to default)
  if (goal.category && typeof goal.category === 'string') {
    if (!isValidCategory(goal.category)) {
      warnings.push(ERRORS.UNKNOWN_CATEGORY);
    }
  }

  // Validate priority (warning only)
  if (goal.priority && !PRIORITY_LEVELS.includes(goal.priority)) {
    warnings.push(ERRORS.INVALID_PRIORITY);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    goal: {
      goalId: goal.goalId || goal.id || null,
      category: goal.category || null,
      priority: goal.priority || 'medium',
      name: goal.name || goal.title || null,
      description: goal.description || null,
      targets: goal.targets || [],
      constraints: goal.constraints || [],
      metadata: goal.metadata || {}
    }
  };
}

function validateTemplate(template) {
  const errors = [];
  const warnings = [];

  if (!template || typeof template !== 'object') {
    errors.push(ERRORS.TEMPLATE_NOT_OBJECT);
    return { valid: false, errors, warnings };
  }

  // Check required fields
  if (!template.defaultObjectives || !Array.isArray(template.defaultObjectives)) {
    warnings.push('Template missing defaultObjectives array');
  }

  if (!template.defaultGuardrails || !Array.isArray(template.defaultGuardrails)) {
    warnings.push('Template missing defaultGuardrails array');
  }

  if (!template.recommendedMissionTypes || !Array.isArray(template.recommendedMissionTypes)) {
    warnings.push('Template missing recommendedMissionTypes array');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function validateStrategyPlan(plan) {
  const errors = [];
  const warnings = [];

  if (!plan || typeof plan !== 'object') {
    errors.push(ERRORS.STRATEGY_NOT_OBJECT);
    return { valid: false, errors, warnings };
  }

  // Required fields
  if (!plan.strategyId) {
    errors.push('Strategy plan must have strategyId');
  }

  if (!plan.goalId) {
    errors.push('Strategy plan must have goalId');
  }

  // Validate status
  if (plan.status && !isValidStatus(plan.status)) {
    errors.push(ERRORS.INVALID_STATUS);
  }

  // Validate objectives
  if (plan.objectives && !Array.isArray(plan.objectives)) {
    errors.push(ERRORS.INVALID_OBJECTIVES);
  } else if (plan.objectives) {
    const invalidObj = plan.objectives.filter(o => typeof o !== 'string');
    if (invalidObj.length > 0) {
      errors.push(ERRORS.INVALID_OBJECTIVES);
    }
  }

  // Validate guardrails
  if (plan.guardrails && !Array.isArray(plan.guardrails)) {
    errors.push(ERRORS.INVALID_GUARDRAILS);
  } else if (plan.guardrails) {
    const invalidGuard = plan.guardrails.filter(g => typeof g !== 'string');
    if (invalidGuard.length > 0) {
      errors.push(ERRORS.INVALID_GUARDRAILS);
    }
  }

  // Validate recommendedMissions
  if (plan.recommendedMissions && !Array.isArray(plan.recommendedMissions)) {
    errors.push(ERRORS.INVALID_RECOMMENDATIONS);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function validateCategory(category) {
  if (!category || typeof category !== 'string') {
    return { valid: false, error: ERRORS.INVALID_CATEGORY };
  }

  if (!isValidCategory(category)) {
    return { valid: false, error: ERRORS.UNKNOWN_CATEGORY, fallback: true };
  }

  return { valid: true };
}

function validatePriority(priority) {
  if (!priority) {
    return { valid: true, normalized: 'medium' };
  }

  if (!PRIORITY_LEVELS.includes(priority)) {
    return { valid: false, error: ERRORS.INVALID_PRIORITY, fallback: 'medium' };
  }

  return { valid: true, normalized: priority };
}

function validateStatus(status) {
  if (!status) {
    return { valid: true, normalized: STRATEGY_STATUS.DRAFT };
  }

  if (!isValidStatus(status)) {
    return { valid: false, error: ERRORS.INVALID_STATUS, fallback: STRATEGY_STATUS.DRAFT };
  }

  return { valid: true, normalized: status };
}

function sanitizeGoal(goal) {
  if (!goal || typeof goal !== 'object') {
    return null;
  }

  return {
    goalId: goal.goalId || goal.id || `goal_${Date.now()}`,
    category: goal.category || 'generic',
    priority: PRIORITY_LEVELS.includes(goal.priority) ? goal.priority : 'medium',
    name: goal.name || goal.title || 'Untitled Goal',
    description: goal.description || '',
    targets: Array.isArray(goal.targets) ? goal.targets : [],
    constraints: Array.isArray(goal.constraints) ? goal.constraints : [],
    metadata: goal.metadata && typeof goal.metadata === 'object' ? goal.metadata : {}
  };
}

module.exports = {
  ERRORS,
  PRIORITY_LEVELS,
  validateGoal,
  validateTemplate,
  validateStrategyPlan,
  validateCategory,
  validatePriority,
  validateStatus,
  sanitizeGoal
};
