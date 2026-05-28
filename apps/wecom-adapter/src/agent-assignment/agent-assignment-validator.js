/**
 * agent-assignment-validator.js
 * P9.6.4 Agent Assignment Matrix — Validation logic for assignment plans.
 *
 * Validates assignment plans, session eligibility, agent selection, and batch
 * operations before they are persisted.
 *
 * Safety constraints:
 *   - No shell, no exec, no spawn
 *   - No agent invocation
 */

'use strict';

var types = require('./agent-assignment-types');

// ============================================================================
// Validation Error Helpers
// ============================================================================

var V = {
  INVALID_PLAN_OBJECT: { field: 'plan', code: 'INVALID_PLAN_OBJECT', message: 'Plan must be a non-null object' },
  MISSING_ASSIGNMENT_ID: { field: 'assignmentId', code: 'MISSING_ASSIGNMENT_ID', message: 'Assignment ID is required' },
  INVALID_ASSIGNMENT_ID_FORMAT: { field: 'assignmentId', code: 'INVALID_ASSIGNMENT_ID_FORMAT', message: 'Assignment ID must start with assign_' },
  MISSING_SESSION_ID: { field: 'sessionId', code: 'MISSING_SESSION_ID', message: 'Session ID is required' },
  INVALID_SESSION_ID_FORMAT: { field: 'sessionId', code: 'INVALID_SESSION_ID_FORMAT', message: 'Session ID must start with session_ or cds_' },
  INVALID_AGENT: { field: 'selectedAgent', code: 'INVALID_AGENT', message: 'Selected agent is not a valid agent' },
  MISSING_AGENT: { field: 'selectedAgent', code: 'MISSING_AGENT', message: 'Selected agent is required' },
  INVALID_STATUS: { field: 'status', code: 'INVALID_STATUS', message: 'Invalid assignment status' },
  INVALID_MODE: { field: 'mode', code: 'INVALID_MODE', message: 'Invalid assignment mode' },
  FORBIDDEN_MODE: { field: 'mode', code: 'FORBIDDEN_MODE', message: 'Forbidden assignment mode (only dry-run and supervised allowed)' },
  INVALID_TRANSITION: { field: 'status', code: 'INVALID_TRANSITION', message: 'Invalid status transition' },
  FALLBACK_CONTAINS_SELECTED: { field: 'fallbackAgents', code: 'FALLBACK_CONTAINS_SELECTED', message: 'Fallback agents must not include the selected agent' },
  INVALID_FALLBACK_AGENT: { field: 'fallbackAgents', code: 'INVALID_FALLBACK_AGENT', message: 'Fallback agent list contains an invalid agent' },
  MISSING_CONFIDENCE: { field: 'confidence', code: 'MISSING_CONFIDENCE', message: 'Confidence score is required' },
  INVALID_CONFIDENCE_RANGE: { field: 'confidence', code: 'INVALID_CONFIDENCE_RANGE', message: 'Confidence must be between 0 and 1' },
  MISSING_REASON: { field: 'reason', code: 'MISSING_REASON', message: 'Assignment reason is required' },
  DUPLICATE_SESSION: { field: 'sessionId', code: 'DUPLICATE_SESSION', message: 'Session already has an assignment plan' },
  INVALID_SESSION_STATUS: { field: 'sessionStatus', code: 'INVALID_SESSION_STATUS', message: 'Session must be in planned status for assignment' },
  SESSION_NOT_APPROVED: { field: 'sessionApproval', code: 'SESSION_NOT_APPROVED', message: 'Session must be approved before assignment (via Approval Gate)' },
  NO_AGENT_MATCH: { field: 'selectedAgent', code: 'NO_AGENT_MATCH', message: 'No matching agent found' }
};

// ============================================================================
// Core Validators
// ============================================================================

/**
 * Validate a complete assignment plan.
 *
 * @param {Object} plan — AssignmentPlan to validate
 * @returns {Object} { valid: boolean, errors: Array }
 */
function validateAssignmentPlan(plan) {
  var errors = [];

  if (!plan || typeof plan !== 'object') {
    errors.push(V.INVALID_PLAN_OBJECT);
    return { valid: false, errors: errors };
  }

  // assignmentId
  if (!plan.assignmentId) {
    errors.push(V.MISSING_ASSIGNMENT_ID);
  } else if (typeof plan.assignmentId !== 'string' || plan.assignmentId.indexOf('assign_') !== 0) {
    errors.push(V.INVALID_ASSIGNMENT_ID_FORMAT);
  }

  // sessionId
  if (!plan.sessionId) {
    errors.push(V.MISSING_SESSION_ID);
  } else if (typeof plan.sessionId !== 'string') {
    errors.push(V.INVALID_SESSION_ID_FORMAT);
  }

  // selectedAgent
  if (!plan.selectedAgent) {
    errors.push(V.MISSING_AGENT);
  } else if (!types.isValidAgent(plan.selectedAgent)) {
    errors.push(V.INVALID_AGENT);
  }

  // status
  if (plan.status && types.ASSIGNMENT_STATUS_VALUES.indexOf(plan.status) === -1) {
    errors.push(V.INVALID_STATUS);
  }

  // mode
  if (!plan.mode) {
    // default to dry-run — valid
  } else if (types.FORBIDDEN_MODES.indexOf(plan.mode) !== -1) {
    errors.push(V.FORBIDDEN_MODE);
  } else if (types.ALLOWED_MODES.indexOf(plan.mode) === -1) {
    errors.push(V.INVALID_MODE);
  }

  // fallback agents must not include selectedAgent
  if (Array.isArray(plan.fallbackAgents) && plan.selectedAgent) {
    if (plan.fallbackAgents.indexOf(plan.selectedAgent) !== -1) {
      errors.push(V.FALLBACK_CONTAINS_SELECTED);
    }
    plan.fallbackAgents.forEach(function (agent) {
      if (!types.isValidAgent(agent)) {
        errors.push(V.INVALID_FALLBACK_AGENT);
      }
    });
  }

  // confidence
  if (plan.confidence === undefined || plan.confidence === null) {
    errors.push(V.MISSING_CONFIDENCE);
  } else if (typeof plan.confidence !== 'number' || plan.confidence < 0 || plan.confidence > 1) {
    errors.push(V.INVALID_CONFIDENCE_RANGE);
  }

  // reason
  if (!plan.reason || typeof plan.reason !== 'string' || plan.reason.trim() === '') {
    errors.push(V.MISSING_REASON);
  }

  return { valid: errors.length === 0, errors: errors };
}

/**
 * Validate a session for assignment eligibility.
 *
 * @param {Object} session — Controlled dispatch session
 * @returns {Object} { valid: boolean, errors: Array }
 */
function validateSessionForAssignment(session) {
  var errors = [];

  if (!session || typeof session !== 'object') {
    errors.push({ field: 'session', code: 'INVALID_SESSION_OBJECT', message: 'Session must be a non-null object' });
    return { valid: false, errors: errors };
  }

  // Session must have an ID
  if (!session.sessionId) {
    errors.push({ field: 'sessionId', code: 'MISSING_SESSION_ID', message: 'Session has no sessionId' });
  }

  return { valid: errors.length === 0, errors: errors };
}

/**
 * Validate an agent name.
 */
function validateAgent(agent) {
  if (!agent || typeof agent !== 'string') {
    return { valid: false, errors: [{ field: 'agent', code: 'INVALID_AGENT', message: 'Agent must be a non-empty string' }] };
  }
  if (!types.isValidAgent(agent)) {
    return { valid: false, errors: [V.INVALID_AGENT] };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate a capabilities list.
 */
function validateCapabilities(capabilities) {
  if (!Array.isArray(capabilities)) {
    return { valid: false, errors: [{ field: 'capabilities', code: 'NOT_ARRAY', message: 'Capabilities must be an array' }] };
  }
  if (capabilities.length === 0) {
    return { valid: false, errors: [{ field: 'capabilities', code: 'EMPTY_CAPABILITIES', message: 'Capabilities list cannot be empty' }] };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate an assignment status transition.
 */
function validateAssignmentTransition(currentStatus, newStatus) {
  if (!types.isValidAssignmentTransition(currentStatus, newStatus)) {
    return { valid: false, errors: [V.INVALID_TRANSITION] };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate a batch of assignment plans.
 * Checks for duplicate sessionIds within the batch.
 */
function validateBatchPlans(plans) {
  var errors = [];
  var seenSessionIds = {};

  if (!Array.isArray(plans)) {
    return { valid: false, errors: [{ field: 'plans', code: 'NOT_ARRAY', message: 'Plans must be an array' }] };
  }

  // Check each plan
  plans.forEach(function (plan, index) {
    var result = validateAssignmentPlan(plan);
    if (!result.valid) {
      result.errors.forEach(function (err) {
        errors.push({
          index: index,
          field: err.field,
          code: err.code,
          message: 'Plan[' + index + ']: ' + err.message
        });
      });
    }

    // Check for duplicate sessionIds within batch
    if (plan.sessionId) {
      if (seenSessionIds[plan.sessionId]) {
        errors.push({
          index: index,
          field: 'sessionId',
          code: 'DUPLICATE_SESSION_IN_BATCH',
          message: 'Plan[' + index + ']: Duplicate sessionId in batch: ' + plan.sessionId
        });
      }
      seenSessionIds[plan.sessionId] = true;
    }
  });

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  V: V,
  validateAssignmentPlan: validateAssignmentPlan,
  validateSessionForAssignment: validateSessionForAssignment,
  validateAgent: validateAgent,
  validateCapabilities: validateCapabilities,
  validateAssignmentTransition: validateAssignmentTransition,
  validateBatchPlans: validateBatchPlans
};
