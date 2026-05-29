/** index.js — P9.7.3 Execution Orchestration barrel export */
'use strict';
var types   = require('./execution-orchestration-types');
var valid   = require('./execution-orchestration-validator');
var planner = require('./execution-step-planner');
var runtime = require('./execution-orchestration-runtime');
var audit   = require('./execution-orchestration-audit');

module.exports = {
  ORCH_STATUS:         types.ORCH_STATUS,
  STEP_STATUS:         types.STEP_STATUS,
  ERROR_CODES:         types.ERROR_CODES,
  AUDIT_EVENT:         types.AUDIT_EVENT,
  DEFAULT_STEPS:       types.DEFAULT_STEPS,
  createOrchId:        types.createOrchId,
  createStepId:        types.createStepId,
  createOrchestrationPlan:   types.createOrchestrationPlan,
  createStepPlan:            types.createStepPlan,

  validateOrchestration:  valid.validateOrchestration,
  validateStep:           valid.validateStep,
  validateDependencies:   valid.validateDependencies,
  validateMode:           valid.validateMode,

  planExecutionSteps:     planner.planExecutionSteps,
  getDependencyGraph:     planner.getDependencyGraph,
  getExecutableSteps:     planner.getExecutableSteps,

  createOrchestrationPlan:     runtime.createOrchestrationPlan,
  validateOrchestrationPlan:   runtime.validateOrchestrationPlan,
  markStepValidated:           runtime.markStepValidated,
  markStepDryRunCompleted:     runtime.markStepDryRunCompleted,
  failStep:                    runtime.failStep,
  generateOrchestrationSnapshot: runtime.generateOrchestrationSnapshot,
  archiveOrchestration:        runtime.archiveOrchestration,
  getOrchestration:            runtime.getOrchestration,
  listOrchestrations:          runtime.listOrchestrations,

  recordOrchestrationEvent:      audit.recordOrchestrationEvent,
  listOrchestrationEvents:       audit.listOrchestrationEvents,
  generateOrchestrationAuditSnapshot: audit.generateOrchestrationAuditSnapshot,
};
