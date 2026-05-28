/**
 * agent-assignment-runtime.js
 * P9.6.4 Agent Assignment Matrix — Core runtime API.
 *
 * Primary operations:
 * 1. createAssignmentPlan(session, options) — match session to agent and create plan
 * 2. createAssignmentPlans(sessions, options) — batch assignment
 * 3. generateAssignmentSnapshot(plans) — summary snapshot
 * 4. Query helpers
 *
 * This module uses in-memory storage. Assignment plans are not persisted to disk
 * by default (like dispatch-planner). The assignment plan is a planning artifact.
 *
 * Safety constraints:
 *   - No shell, no exec, no spawn, no pm2, no deploy, no nginx, no .env
 *   - No agent invocation — planning only
 *   - No connection to agent-host, commander, or gateway
 *   - No HTTP API exposure
 *   - MODE must be dry-run or supervised (FORBIDDEN_MODES rejected)
 *   - No live execution
 */

'use strict';

var types = require('./agent-assignment-types');
var matrix = require('./agent-capability-matrix');
var validator = require('./agent-assignment-validator');

// ============================================================================
// In-Memory Store
// ============================================================================
var _assignmentPlans = [];

// ============================================================================
// Core API
// ============================================================================

/**
 * Create an assignment plan for a single session.
 *
 * Flow:
 * 1. Validate mode (reject forbidden modes)
 * 2. Validate session is eligible
 * 3. Match agent via capability matrix
 * 4. Build assignment plan object
 * 5. Validate the plan
 * 6. Check for duplicate session
 * 7. Store plan
 *
 * @param {Object} session — Controlled dispatch session
 * @param {Object} options — { category, requiredCapabilities, mode, metadata }
 * @returns {Object} { success: boolean, plan: Object|null, error: string|null, code: string|null }
 */
function createAssignmentPlan(session, options) {
  var opts = options || {};

  // 1. Validate mode
  var mode = opts.mode || types.ASSIGNMENT_MODE.DRY_RUN;
  if (types.FORBIDDEN_MODES.indexOf(mode) !== -1) {
    return {
      success: false,
      plan: null,
      error: 'Forbidden assignment mode: ' + mode + '. Only dry-run and supervised are allowed.',
      code: types.ASSIGNMENT_ERROR_CODES.FORBIDDEN_MODE
    };
  }

  if (types.ALLOWED_MODES.indexOf(mode) === -1) {
    return {
      success: false,
      plan: null,
      error: 'Invalid assignment mode: ' + mode,
      code: 'INVALID_MODE'
    };
  }

  // 2. Validate session
  var sessionCheck = validator.validateSessionForAssignment(session);
  if (!sessionCheck.valid) {
    return {
      success: false,
      plan: null,
      error: sessionCheck.errors[0].message,
      code: sessionCheck.errors[0].code
    };
  }

  // 3. Match agent
  var matchResult = matrix.matchAgentForSession(session, opts);

  if (!matchResult.selectedAgent) {
    return {
      success: false,
      plan: null,
      error: 'No agent found matching the required capabilities',
      code: types.ASSIGNMENT_ERROR_CODES.NO_AGENT_AVAILABLE
    };
  }

  // 4. Build plan object
  var plan;
  try {
    plan = types.createAssignmentPlan(session, matchResult, { mode: mode, metadata: opts.metadata });
  } catch (e) {
    return {
      success: false,
      plan: null,
      error: e.message,
      code: types.ASSIGNMENT_ERROR_CODES.FORBIDDEN_MODE
    };
  }

  // 5. Validate the plan
  var planCheck = validator.validateAssignmentPlan(plan);
  if (!planCheck.valid) {
    return {
      success: false,
      plan: null,
      error: planCheck.errors[0].message,
      code: planCheck.errors[0].code
    };
  }

  // 6. Dedup — check for existing assignment for same session
  var existing = _findBySessionId(plan.sessionId);
  if (existing) {
    return {
      success: false,
      plan: null,
      error: 'Session already has an assignment plan: ' + existing.assignmentId,
      code: types.ASSIGNMENT_ERROR_CODES.SESSION_ALREADY_ASSIGNED
    };
  }

  // 7. Store
  _assignmentPlans.push(plan);

  return {
    success: true,
    plan: plan,
    error: null,
    code: null
  };
}

/**
 * Create assignment plans for multiple sessions (batch).
 * Each session is processed individually — failures do not abort the entire batch.
 *
 * @param {Array} sessions — Array of controlled dispatch sessions
 * @param {Object} options — { category, requiredCapabilities, mode, metadata }
 * @returns {Object} { success, plans, errors, summary }
 */
function createAssignmentPlans(sessions, options) {
  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
    return {
      success: false,
      plans: [],
      errors: [{ sessionIndex: -1, error: 'Sessions array is empty or invalid', code: 'EMPTY_INPUT' }],
      summary: { total: 0, success: 0, failed: 0 }
    };
  }

  var plans = [];
  var errors = [];
  var successCount = 0;
  var failedCount = 0;

  // Check for duplicate sessionIds within the batch
  var batchSessionIds = {};
  sessions.forEach(function (_, index) {
    var sess = sessions[index];
    if (sess && sess.sessionId) {
      if (batchSessionIds[sess.sessionId]) {
        errors.push({
          sessionIndex: index,
          error: 'Duplicate sessionId in batch: ' + sess.sessionId,
          code: 'DUPLICATE_SESSION_IN_BATCH'
        });
        failedCount++;
        return;
      }
      batchSessionIds[sess.sessionId] = true;
    }
  });

  // Process each session
  sessions.forEach(function (session, index) {
    // Skip if already flagged as duplicate
    var isDuplicate = errors.some(function (e) { return e.sessionIndex === index; });
    if (isDuplicate) return;

    var result = createAssignmentPlan(session, options);
    if (result.success) {
      plans.push(result.plan);
      successCount++;
    } else {
      errors.push({
        sessionIndex: index,
        sessionId: session ? session.sessionId : undefined,
        error: result.error,
        code: result.code
      });
      failedCount++;
    }
  });

  return {
    success: errors.length === 0,
    plans: plans,
    errors: errors,
    summary: { total: sessions.length, success: successCount, failed: failedCount }
  };
}

/**
 * Get an assignment plan by ID.
 */
function getAssignmentPlan(assignmentId) {
  if (!assignmentId) return null;
  for (var i = 0; i < _assignmentPlans.length; i++) {
    if (_assignmentPlans[i].assignmentId === assignmentId) {
      return _assignmentPlans[i];
    }
  }
  return null;
}

/**
 * List assignment plans with optional filters.
 *
 * @param {Object} filter — { status, agent, sessionId, mode }
 * @returns {Array}
 */
function listAssignmentPlans(filter) {
  var f = filter || {};
  return _assignmentPlans.filter(function (plan) {
    if (f.status && plan.status !== f.status) return false;
    if (f.agent && plan.selectedAgent !== f.agent) return false;
    if (f.sessionId && plan.sessionId !== f.sessionId) return false;
    if (f.mode && plan.mode !== f.mode) return false;
    return true;
  });
}

/**
 * Find assignment plan by session ID.
 * Exported as internal helper and re-exported for tests.
 */
function _findBySessionId(sessionId) {
  for (var i = 0; i < _assignmentPlans.length; i++) {
    if (_assignmentPlans[i].sessionId === sessionId) {
      return _assignmentPlans[i];
    }
  }
  return null;
}

/**
 * Update the status of an assignment plan.
 */
function updateAssignmentStatus(assignmentId, newStatus) {
  var plan = getAssignmentPlan(assignmentId);
  if (!plan) {
    return { success: false, error: 'Assignment plan not found: ' + assignmentId, code: 'NOT_FOUND' };
  }

  // Validate transition
  var transitionCheck = validator.validateAssignmentTransition(plan.status, newStatus);
  if (!transitionCheck.valid) {
    return {
      success: false,
      error: 'Invalid transition: ' + plan.status + ' → ' + newStatus,
      code: 'INVALID_TRANSITION'
    };
  }

  plan.status = newStatus;
  plan.updatedAt = new Date().toISOString();
  return { success: true, plan: plan };
}

/**
 * Generate a snapshot summary of all or filtered assignment plans.
 */
function generateAssignmentSnapshot(filter) {
  var plans = filter ? listAssignmentPlans(filter) : _assignmentPlans.slice();
  return types.createAssignmentSnapshot(plans);
}

/**
 * Clear all assignment plans (for testing).
 */
function clearAllPlans() {
  _assignmentPlans = [];
}

/**
 * Get the total count of assignment plans.
 */
function getPlanCount() {
  return _assignmentPlans.length;
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  createAssignmentPlan: createAssignmentPlan,
  createAssignmentPlans: createAssignmentPlans,
  getAssignmentPlan: getAssignmentPlan,
  listAssignmentPlans: listAssignmentPlans,
  findAssignmentBySession: _findBySessionId,
  updateAssignmentStatus: updateAssignmentStatus,
  generateAssignmentSnapshot: generateAssignmentSnapshot,
  clearAllPlans: clearAllPlans,
  getPlanCount: getPlanCount
};
