/**
 * P9.5.3 Mission Compiler MVP — mission-draft-validator.js
 * Validation for mission drafts
 */

const {
  MISSION_DRAFT_STATUS,
  isValidMissionDraftStatus,
  isValidAgent
} = require('./mission-compiler-types');

const ERRORS = {
  DRAFT_NOT_OBJECT: 'Mission draft must be an object',
  STRATEGY_NOT_OBJECT: 'Strategy plan must be an object',
  MISSING_DRAFT_ID: 'Draft must have draftId',
  MISSING_STRATEGY_ID: 'Draft must have strategyId',
  MISSING_GOAL_ID: 'Draft must have goalId',
  INVALID_TYPE: 'Draft type must be a non-empty string',
  INVALID_TITLE: 'Draft title must be a non-empty string',
  INVALID_PRIORITY: 'Invalid priority value',
  INVALID_STATUS: 'Invalid draft status',
  INVALID_RECOMMENDED_AGENT: 'Invalid recommended agent',
  INVALID_SOURCE: 'Draft source must be mission-compiler',
  OBJECTIVE_NOT_STRING: 'Objective must be a string',
  INPUTS_NOT_OBJECT: 'Inputs must be an object',
  GUARDRAILS_NOT_ARRAY: 'Guardrails must be an array of strings',
  ACCEPTANCE_CRITERIA_NOT_ARRAY: 'Acceptance criteria must be an array of strings',
  RISKS_NOT_ARRAY: 'Risks must be an array of strings',
  STRATEGY_MISSING_OBJECTIVES: 'Strategy plan must have objectives array',
  STRATEGY_MISSING_GUARDRAILS: 'Strategy plan must have guardrails array',
  EMPTY_STRATEGY_OBJECTIVES: 'Strategy plan has empty objectives',
  INVALID_STRATEGY_OBJECTIVES: 'Strategy objectives must contain strings',
  STRATEGY_EMPTY: 'Strategy plan is null or undefined'
};

const PRIORITY_LEVELS = ['low', 'medium', 'high', 'critical'];

/**
 * Validate a mission draft
 * @param {Object} draft - Mission draft to validate
 * @returns {Object} Validation result
 */
function validateMissionDraft(draft) {
  const errors = [];
  const warnings = [];

  if (!draft || typeof draft !== 'object') {
    errors.push(ERRORS.DRAFT_NOT_OBJECT);
    return { valid: false, errors, warnings };
  }

  // Required fields
  if (!draft.draftId) {
    errors.push(ERRORS.MISSING_DRAFT_ID);
  }

  if (!draft.strategyId) {
    errors.push(ERRORS.MISSING_STRATEGY_ID);
  }

  if (!draft.goalId) {
    errors.push(ERRORS.MISSING_GOAL_ID);
  }

  // Type validation
  if (draft.type && typeof draft.type !== 'string') {
    errors.push(ERRORS.INVALID_TYPE);
  } else if (draft.type !== undefined && draft.type.trim() === '') {
    errors.push(ERRORS.INVALID_TYPE);
  }

  if (draft.title && typeof draft.title !== 'string') {
    errors.push(ERRORS.INVALID_TITLE);
  } else if (draft.title !== undefined && draft.title.trim() === '') {
    errors.push(ERRORS.INVALID_TITLE);
  }

  // Priority validation
  if (draft.priority && !PRIORITY_LEVELS.includes(draft.priority)) {
    errors.push(ERRORS.INVALID_PRIORITY);
  }

  // Status validation
  if (draft.status && !isValidMissionDraftStatus(draft.status)) {
    errors.push(ERRORS.INVALID_STATUS);
  }

  // Source validation
  if (draft.source && draft.source !== 'mission-compiler') {
    warnings.push(ERRORS.INVALID_SOURCE);
  }

  // Recommended agent validation
  if (draft.recommendedAgent && !isValidAgent(draft.recommendedAgent)) {
    errors.push(ERRORS.INVALID_RECOMMENDED_AGENT);
  }

  // Objective validation
  if (draft.objective !== undefined && typeof draft.objective !== 'string') {
    errors.push(ERRORS.OBJECTIVE_NOT_STRING);
  }

  // Inputs must be object
  if (draft.inputs !== undefined && (typeof draft.inputs !== 'object' || Array.isArray(draft.inputs))) {
    errors.push(ERRORS.INPUTS_NOT_OBJECT);
  }

  // Guardrails validation
  if (draft.guardrails !== undefined) {
    if (!Array.isArray(draft.guardrails)) {
      errors.push(ERRORS.GUARDRAILS_NOT_ARRAY);
    } else {
      const nonStrings = draft.guardrails.filter(g => typeof g !== 'string');
      if (nonStrings.length > 0) {
        errors.push(ERRORS.GUARDRAILS_NOT_ARRAY);
      }
    }
  }

  // Acceptance criteria validation
  if (draft.acceptanceCriteria !== undefined) {
    if (!Array.isArray(draft.acceptanceCriteria)) {
      errors.push(ERRORS.ACCEPTANCE_CRITERIA_NOT_ARRAY);
    } else {
      const nonStrings = draft.acceptanceCriteria.filter(a => typeof a !== 'string');
      if (nonStrings.length > 0) {
        errors.push(ERRORS.ACCEPTANCE_CRITERIA_NOT_ARRAY);
      }
    }
  }

  // Risks validation
  if (draft.risks !== undefined) {
    if (!Array.isArray(draft.risks)) {
      errors.push(ERRORS.RISKS_NOT_ARRAY);
    } else {
      const nonStrings = draft.risks.filter(r => typeof r !== 'string');
      if (nonStrings.length > 0) {
        errors.push(ERRORS.RISKS_NOT_ARRAY);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate strategy plan for compilation
 * @param {Object} strategyPlan - Strategy plan to validate
 * @returns {Object} Validation result
 */
function validateStrategyForCompilation(strategyPlan) {
  const errors = [];
  const warnings = [];

  if (!strategyPlan || typeof strategyPlan !== 'object') {
    errors.push(ERRORS.STRATEGY_EMPTY);
    return { valid: false, errors, warnings };
  }

  // Must have objectives
  if (!strategyPlan.objectives) {
    errors.push(ERRORS.STRATEGY_MISSING_OBJECTIVES);
  } else if (!Array.isArray(strategyPlan.objectives)) {
    errors.push(ERRORS.INVALID_STRATEGY_OBJECTIVES);
  } else if (strategyPlan.objectives.length === 0) {
    warnings.push(ERRORS.EMPTY_STRATEGY_OBJECTIVES);
  } else {
    const nonStrings = strategyPlan.objectives.filter(o => typeof o !== 'string');
    if (nonStrings.length > 0) {
      errors.push(ERRORS.INVALID_STRATEGY_OBJECTIVES);
    }
  }

  // Must have guardrails (warning only)
  if (!strategyPlan.guardrails || !Array.isArray(strategyPlan.guardrails)) {
    warnings.push(ERRORS.STRATEGY_MISSING_GUARDRAILS);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate priority value
 * @param {string} priority - Priority to validate
 * @returns {Object} Validation result
 */
function validatePriority(priority) {
  if (!priority) {
    return { valid: true, normalized: 'medium' };
  }

  if (!PRIORITY_LEVELS.includes(priority)) {
    return { valid: false, error: ERRORS.INVALID_PRIORITY, fallback: 'medium' };
  }

  return { valid: true, normalized: priority };
}

/**
 * Validate draft status
 * @param {string} status - Status to validate
 * @returns {Object} Validation result
 */
function validateStatus(status) {
  if (!status) {
    return { valid: true, normalized: MISSION_DRAFT_STATUS.DRAFT };
  }

  if (!isValidMissionDraftStatus(status)) {
    return { valid: false, error: ERRORS.INVALID_STATUS, fallback: MISSION_DRAFT_STATUS.DRAFT };
  }

  return { valid: true, normalized: status };
}

/**
 * Validate agent
 * @param {string} agent - Agent to validate
 * @returns {Object} Validation result
 */
function validateAgent(agent) {
  if (!agent) {
    return { valid: true, normalized: null };
  }

  if (!isValidAgent(agent)) {
    return { valid: false, error: ERRORS.INVALID_RECOMMENDED_AGENT, fallback: 'workbuddy' };
  }

  return { valid: true, normalized: agent };
}

module.exports = {
  ERRORS,
  PRIORITY_LEVELS,
  validateMissionDraft,
  validateStrategyForCompilation,
  validatePriority,
  validateStatus,
  validateAgent
};
