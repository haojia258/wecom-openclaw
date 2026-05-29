/**
 * execution-orchestration-runtime.js
 * P9.7.3 — Controlled execution orchestration runtime.
 *
 * Orchestrates step plans over execution + sandbox sessions.
 * All operations are dry-run only — no real execution.
 *
 * Safety: no shell/exec/spawn/pm2/deploy/nginx/gateway/agent-host.
 */

'use strict';

var t   = require('./execution-orchestration-types');
var v   = require('./execution-orchestration-validator');
var sp  = require('./execution-step-planner');
var au  = require('./execution-orchestration-audit');

// In-memory store
var _orchPlans = {};

// ============================================================================
// Core API
// ============================================================================

function createOrchestrationPlan(executionSession, sandboxSession, options) {
  if (!executionSession || !executionSession.executionSessionId) {
    return { success: false, error: 'Invalid execution session', code: t.ERROR_CODES.INVALID_SESSION_ID };
  }
  if (!sandboxSession || !sandboxSession.sessionId) {
    return { success: false, error: 'Invalid sandbox session', code: t.ERROR_CODES.INVALID_SANDBOX_ID };
  }

  var mode = (options && options.mode) || 'dry-run';
  var modeResult = v.validateMode(mode);
  if (!modeResult.valid) {
    return { success: false, error: modeResult.errors[0].message, code: modeResult.errors[0].code };
  }

  var plan = t.createOrchestrationPlan(executionSession, sandboxSession, options);

  // Generate steps
  var stepResult = sp.planExecutionSteps(executionSession, sandboxSession, options);
  if (stepResult.success) {
    plan.steps = stepResult.steps;
  }

  // Validate
  var valResult = v.validateOrchestration(plan);
  if (!valResult.valid) {
    return { success: false, error: valResult.errors[0].message, code: valResult.errors[0].code };
  }

  _orchPlans[plan.orchestrationId] = plan;

  au.recordOrchestrationEvent(plan.orchestrationId, t.AUDIT_EVENT.ORCHESTRATION_CREATED, options && options.actor, {
    executionSessionId: plan.executionSessionId,
    sandboxSessionId: plan.sandboxSessionId,
    mode: plan.mode
  });

  return { success: true, plan: plan };
}

function validateOrchestrationPlan(plan) {
  var result = v.validateOrchestration(plan);
  if (!result.valid) {
    return { success: false, errors: result.errors };
  }

  var depResult = v.validateDependencies(plan.steps);
  if (!depResult.valid) {
    return { success: false, errors: depResult.errors };
  }

  if (!plan.guardrails || plan.guardrails.length === 0) {
    return { success: true, warnings: [{ code: t.ERROR_CODES.MISSING_GUARDRAILS, message: 'No guardrails defined' }] };
  }

  return { success: true };
}

function markStepValidated(orchestrationId, stepId) {
  var plan = _orchPlans[orchestrationId];
  if (!plan) return { success: false, error: 'Orchestration not found', code: t.ERROR_CODES.ORCHESTRATION_NOT_FOUND };

  var step = findStepById(plan, stepId);
  if (!step) return { success: false, error: 'Step not found', code: t.ERROR_CODES.STEP_NOT_FOUND };

  var val = v.validateStepTransition(step, t.STEP_STATUS.VALIDATED);
  if (!val.valid) return { success: false, error: val.errors[0].message, code: val.errors[0].code };

  step.status = t.STEP_STATUS.VALIDATED;
  plan.updatedAt = new Date().toISOString();

  au.recordOrchestrationEvent(orchestrationId, t.AUDIT_EVENT.STEP_VALIDATED, 'system', { stepId: stepId, stepName: step.name });

  return { success: true, plan: plan };
}

function markStepDryRunCompleted(orchestrationId, stepId, result) {
  var plan = _orchPlans[orchestrationId];
  if (!plan) return { success: false, error: 'Not found', code: t.ERROR_CODES.ORCHESTRATION_NOT_FOUND };

  var step = findStepById(plan, stepId);
  if (!step) return { success: false, error: 'Step not found', code: t.ERROR_CODES.STEP_NOT_FOUND };

  step.status = t.STEP_STATUS.DRY_RUN_COMPLETED;
  if (result) step.expectedOutput = result;
  plan.updatedAt = new Date().toISOString();

  au.recordOrchestrationEvent(orchestrationId, t.AUDIT_EVENT.STEP_DRY_RUN_COMPLETED, 'system', { stepId: stepId, stepName: step.name });

  // Check if all steps are done
  if (plan.steps.every(function (s) { return s.status === t.STEP_STATUS.DRY_RUN_COMPLETED || s.status === t.STEP_STATUS.SKIPPED; })) {
    plan.status = t.ORCH_STATUS.DRY_RUN_COMPLETED;
  }

  return { success: true, plan: plan, step: step };
}

function failStep(orchestrationId, stepId, reason) {
  var plan = _orchPlans[orchestrationId];
  if (!plan) return { success: false, error: 'Not found', code: t.ERROR_CODES.ORCHESTRATION_NOT_FOUND };

  var step = findStepById(plan, stepId);
  if (!step) return { success: false, error: 'Step not found', code: t.ERROR_CODES.STEP_NOT_FOUND };

  step.status = t.STEP_STATUS.FAILED;
  plan.updatedAt = new Date().toISOString();
  plan.status = t.ORCH_STATUS.FAILED;

  au.recordOrchestrationEvent(orchestrationId, t.AUDIT_EVENT.STEP_FAILED, 'system', { stepId: stepId, stepName: step.name, reason: reason });

  return { success: true, plan: plan, step: step };
}

function generateOrchestrationSnapshot(plans) {
  plans = plans || Object.values(_orchPlans);
  var snapshot = {
    totalPlans: plans.length,
    statusCounts: {},
    stepsSummary: { total: 0, pending: 0, validated: 0, completed: 0, failed: 0 },
    plans: plans,
    generatedAt: new Date().toISOString()
  };
  plans.forEach(function (p) {
    snapshot.statusCounts[p.status] = (snapshot.statusCounts[p.status] || 0) + 1;
    p.steps.forEach(function (s) {
      snapshot.stepsSummary.total++;
      if (s.status === 'pending') snapshot.stepsSummary.pending++;
      else if (s.status === 'validated') snapshot.stepsSummary.validated++;
      else if (s.status === 'dry_run_completed') snapshot.stepsSummary.completed++;
      else if (s.status === 'failed') snapshot.stepsSummary.failed++;
    });
  });
  return { success: true, snapshot: snapshot };
}

function archiveOrchestration(orchestrationId, actor, reason) {
  var plan = _orchPlans[orchestrationId];
  if (!plan) return { success: false, error: 'Not found', code: t.ERROR_CODES.ORCHESTRATION_NOT_FOUND };

  if (!t.isValidOrchTransition(plan.status, t.ORCH_STATUS.ARCHIVED)) {
    return { success: false, error: 'Cannot archive from status: ' + plan.status, code: t.ERROR_CODES.INVALID_STATUS };
  }

  plan.status = t.ORCH_STATUS.ARCHIVED;
  plan.updatedAt = new Date().toISOString();

  au.recordOrchestrationEvent(orchestrationId, t.AUDIT_EVENT.ORCHESTRATION_ARCHIVED, actor || 'system', { reason: reason });

  return { success: true, plan: plan };
}

function getOrchestration(orchestrationId) {
  return _orchPlans[orchestrationId] || null;
}

function listOrchestrations(filter) {
  filter = filter || {};
  var ids = Object.keys(_orchPlans);
  var results = [];
  for (var i = 0; i < ids.length; i++) {
    var p = _orchPlans[ids[i]];
    var include = true;
    if (filter.status && p.status !== filter.status) include = false;
    if (filter.mode && p.mode !== filter.mode) include = false;
    if (include) results.push(p);
  }
  return results;
}

function _clearAll() { _orchPlans = {}; }

// ============================================================================
// Helpers
// ============================================================================

function findStepById(plan, stepId) {
  for (var i = 0; i < plan.steps.length; i++) {
    if (plan.steps[i].stepId === stepId) return plan.steps[i];
  }
  return null;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  createOrchestrationPlan, validateOrchestrationPlan,
  markStepValidated, markStepDryRunCompleted, failStep,
  generateOrchestrationSnapshot, archiveOrchestration,
  getOrchestration, listOrchestrations, _clearAll
};
