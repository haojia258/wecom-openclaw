/**
 * execution-orchestration-validator.js
 * P9.7.3 — Orchestration input validation. 15+ error codes.
 * Dry-run only, no real execution.
 */
'use strict';

var t = require('./execution-orchestration-types');

function validateOrchestration(orch) {
  var errors = [];
  if (!orch || typeof orch !== 'object') {
    errors.push({ code: t.ERROR_CODES.INVALID_ORCHESTRATION, message: 'must be an object' });
    return { valid: false, errors: errors };
  }
  if (!orch.orchestrationId || typeof orch.orchestrationId !== 'string' || orch.orchestrationId.indexOf('orch_') !== 0) {
    errors.push({ code: t.ERROR_CODES.INVALID_ORCHESTRATION_ID, message: 'orchestrationId must start with orch_' });
  }
  if (!orch.executionSessionId || typeof orch.executionSessionId !== 'string') {
    errors.push({ code: t.ERROR_CODES.INVALID_SESSION_ID, message: 'executionSessionId required' });
  }
  if (!orch.sandboxSessionId || typeof orch.sandboxSessionId !== 'string') {
    errors.push({ code: t.ERROR_CODES.INVALID_SANDBOX_ID, message: 'sandboxSessionId required' });
  }
  if (t.FORBIDDEN_MODES.indexOf(orch.mode) !== -1) {
    errors.push({ code: t.ERROR_CODES.LIVE_MODE_FORBIDDEN, message: orch.mode + ' mode is forbidden' });
  } else if (!orch.mode || t.ALLOWED_MODES.indexOf(orch.mode) === -1) {
    errors.push({ code: t.ERROR_CODES.INVALID_MODE, message: 'mode must be dry-run or supervised' });
  }
  if (!orch.status || t.ORCH_STATUS_VALUES.indexOf(orch.status) === -1) {
    errors.push({ code: t.ERROR_CODES.INVALID_STATUS, message: 'invalid status' });
  }
  return { valid: errors.length === 0, errors: errors };
}

function validateStep(step) {
  var errors = [];
  if (!step || typeof step !== 'object') {
    errors.push({ code: t.ERROR_CODES.INVALID_STEP, message: 'step must be an object' });
    return { valid: false, errors: errors };
  }
  if (!step.stepId || typeof step.stepId !== 'string') {
    errors.push({ code: t.ERROR_CODES.INVALID_STEP_ID, message: 'stepId required' });
  }
  if (!step.status || t.STEP_STATUS_VALUES.indexOf(step.status) === -1) {
    errors.push({ code: t.ERROR_CODES.INVALID_STEP_STATUS, message: 'invalid step status' });
  }
  if (!Array.isArray(step.dependsOn)) {
    errors.push({ code: t.ERROR_CODES.INVALID_DEPENDENCY, message: 'dependsOn must be an array' });
  }
  return { valid: errors.length === 0, errors: errors };
}

function validateDependencies(steps) {
  var errors = [];
  if (!Array.isArray(steps)) {
    errors.push({ code: t.ERROR_CODES.INVALID_DEPENDENCY, message: 'steps must be an array' });
    return { valid: false, errors: errors };
  }
  var stepNames = {};
  for (var i = 0; i < steps.length; i++) {
    if (steps[i] && steps[i].name) stepNames[steps[i].name] = true;
  }
  for (var j = 0; j < steps.length; j++) {
    var s = steps[j];
    if (!s || !s.dependsOn) continue;
    for (var k = 0; k < s.dependsOn.length; k++) {
      if (!stepNames[s.dependsOn[k]]) {
        errors.push({ code: t.ERROR_CODES.INVALID_DEPENDENCY, message: 'Step ' + s.name + ' depends on unknown step: ' + s.dependsOn[k] });
      }
    }
  }
  // Circular dependency check
  for (var m = 0; m < steps.length; m++) {
    if (hasCycle(steps, steps[m], {}, stepNames)) {
      errors.push({ code: t.ERROR_CODES.CIRCULAR_DEPENDENCY, message: 'Circular dependency detected involving step ' + (steps[m] ? steps[m].name : 'unknown') });
      break;
    }
  }
  return { valid: errors.length === 0, errors: errors };
}

function hasCycle(steps, step, visited, stepNames) {
  if (!step || !step.name) return false;
  if (visited[step.name]) return true;
  visited[step.name] = true;
  if (!step.dependsOn) { visited[step.name] = false; return false; }
  for (var i = 0; i < step.dependsOn.length; i++) {
    var dep = findStep(steps, step.dependsOn[i]);
    if (dep && hasCycle(steps, dep, visited, stepNames)) return true;
  }
  visited[step.name] = false;
  return false;
}

function findStep(steps, name) {
  for (var i = 0; i < steps.length; i++) {
    if (steps[i] && steps[i].name === name) return steps[i];
  }
  return null;
}

function validateMode(mode) {
  if (t.FORBIDDEN_MODES.indexOf(mode) !== -1) {
    return { valid: false, errors: [{ code: t.ERROR_CODES.LIVE_MODE_FORBIDDEN, message: mode + ' is forbidden' }] };
  }
  if (t.ALLOWED_MODES.indexOf(mode) === -1) {
    return { valid: false, errors: [{ code: t.ERROR_CODES.INVALID_MODE, message: 'Unknown mode: ' + mode }] };
  }
  return { valid: true, errors: [] };
}

function validateStepTransition(step, toStatus) {
  var errors = [];
  if (!step) { errors.push({ code: t.ERROR_CODES.INVALID_STEP, message: 'step required' }); return { valid: false, errors: errors }; }
  if (t.STEP_STATUS_VALUES.indexOf(toStatus) === -1) {
    errors.push({ code: t.ERROR_CODES.INVALID_STEP_STATUS, message: 'invalid target status: ' + toStatus });
  }
  return { valid: errors.length === 0, errors: errors };
}

module.exports = {
  validateOrchestration, validateStep, validateDependencies,
  validateMode, validateStepTransition,
  findStep, hasCycle
};
