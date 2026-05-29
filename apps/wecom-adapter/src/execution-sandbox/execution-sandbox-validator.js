/**
 * execution-sandbox-validator.js
 * P9.7.2 Execution Sandbox — Input validation.
 *
 * Validates SandboxSession, SandboxPlan, state transitions,
 * required fields, and ID formats.
 *
 * Safety constraints:
 *   - No real task execution, no shell/exec/spawn
 *   - Dry-run only
 */

'use strict';

var t = require('./execution-sandbox-types');

// ============================================================================
// Public API
// ============================================================================

/**
 * Validate a sandbox session object.
 *
 * @param {Object} session
 * @returns {{ valid: boolean, errors: Array<{code: string, message: string}> }}
 */
function validateSession(session) {
  var errors = [];

  if (!session || typeof session !== 'object') {
    errors.push({ code: t.ERROR_CODES.INVALID_SESSION, message: 'session must be an object' });
    return { valid: false, errors: errors };
  }

  if (!session.sessionId || typeof session.sessionId !== 'string') {
    errors.push({ code: t.ERROR_CODES.INVALID_SESSION_ID, message: 'sessionId is required and must be a string' });
  } else if (session.sessionId.indexOf('exec_') !== 0) {
    errors.push({ code: t.ERROR_CODES.INVALID_SESSION_ID, message: 'sessionId must start with "exec_"' });
  }

  if (!session.status || t.SANDBOX_STATUS_VALUES.indexOf(session.status) === -1) {
    errors.push({ code: t.ERROR_CODES.INVALID_STATUS, message: 'status must be one of: ' + t.SANDBOX_STATUS_VALUES.join(', ') });
  }

  return { valid: errors.length === 0, errors: errors };
}

/**
 * Validate a sandbox plan object (dispatchPlan-like).
 *
 * @param {Object} plan
 * @returns {{ valid: boolean, errors: Array }}
 */
function validatePlan(plan) {
  var errors = [];

  if (!plan || typeof plan !== 'object') {
    errors.push({ code: t.ERROR_CODES.INVALID_PLAN, message: 'plan must be an object' });
    return { valid: false, errors: errors };
  }

  if (!plan.planId && !plan.dispatchPlanId) {
    errors.push({ code: t.ERROR_CODES.INVALID_PLAN, message: 'plan must have planId or dispatchPlanId' });
  }

  return { valid: errors.length === 0, errors: errors };
}

/**
 * Validate an agent object.
 *
 * @param {Object} agent
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateAgent(agent) {
  var errors = [];

  if (!agent || typeof agent !== 'object') {
    errors.push({ code: t.ERROR_CODES.INVALID_AGENT, message: 'agent must be an object' });
  }

  return { valid: errors.length === 0, errors: errors };
}

/**
 * Validate a state transition.
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateTransition(fromStatus, toStatus) {
  var errors = [];

  if (!fromStatus || t.SANDBOX_STATUS_VALUES.indexOf(fromStatus) === -1) {
    errors.push({ code: t.ERROR_CODES.INVALID_STATUS, message: 'Invalid fromStatus: ' + fromStatus });
  }

  if (!toStatus || t.SANDBOX_STATUS_VALUES.indexOf(toStatus) === -1) {
    errors.push({ code: t.ERROR_CODES.INVALID_STATUS, message: 'Invalid toStatus: ' + toStatus });
  }

  if (errors.length === 0 && !t.isValidTransition(fromStatus, toStatus)) {
    errors.push({ code: t.ERROR_CODES.INVALID_TRANSITION, message: 'Transition ' + fromStatus + ' → ' + toStatus + ' is not allowed' });
  }

  return { valid: errors.length === 0, errors: errors };
}

/**
 * Validate a checkpoint object.
 *
 * @param {Object} checkpoint
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateCheckpoint(checkpoint) {
  var errors = [];

  if (!checkpoint || typeof checkpoint !== 'object') {
    errors.push({ code: t.ERROR_CODES.CHECKPOINT_NOT_FOUND, message: 'checkpoint must be an object' });
    return { valid: false, errors: errors };
  }

  if (!checkpoint.checkpointId) {
    errors.push({ code: t.ERROR_CODES.CHECKPOINT_NOT_FOUND, message: 'checkpointId is required' });
  }

  if (!checkpoint.sessionId) {
    errors.push({ code: t.ERROR_CODES.INVALID_SESSION_ID, message: 'sessionId is required in checkpoint' });
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  validateSession:    validateSession,
  validatePlan:       validatePlan,
  validateAgent:      validateAgent,
  validateTransition: validateTransition,
  validateCheckpoint: validateCheckpoint
};
