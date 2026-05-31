/**
 * execution-orchestration-types.js
 * P9.7.3 Controlled Execution Orchestration — Types & constants.
 *
 * Defines OrchestrationPlan, StepPlan, orchestrator statuses,
 * step statuses, error codes, and factory functions.
 *
 * Safety: dry-run only, no real execution.
 */

'use strict';

// ============================================================================
// Orchestration Status
// ============================================================================
const ORCH_STATUS = {
  PLANNED:          'planned',
  VALIDATED:        'validated',
  DRY_RUN_READY:    'dry_run_ready',
  DRY_RUN_COMPLETED:'dry_run_completed',
  FAILED:           'failed',
  ARCHIVED:         'archived'
};

const ORCH_STATUS_VALUES = Object.values(ORCH_STATUS);

// ============================================================================
// Step Status
// ============================================================================
const STEP_STATUS = {
  PENDING:           'pending',
  VALIDATED:         'validated',
  SKIPPED:           'skipped',
  DRY_RUN_COMPLETED: 'dry_run_completed',
  FAILED:            'failed'
};

const STEP_STATUS_VALUES = Object.values(STEP_STATUS);

// ============================================================================
// Step Types
// ============================================================================
const STEP_TYPE = {
  VALIDATION:    'validation',
  PREPARATION:   'preparation',
  CHECKPOINT:    'checkpoint',
  FINALIZATION:  'finalization'
};

// ============================================================================
// Allowed Orchestration Transitions
// ============================================================================
const ALLOWED_TRANSITIONS = {};
ALLOWED_TRANSITIONS[ORCH_STATUS.PLANNED]           = [ORCH_STATUS.VALIDATED, ORCH_STATUS.FAILED];
ALLOWED_TRANSITIONS[ORCH_STATUS.VALIDATED]         = [ORCH_STATUS.DRY_RUN_READY, ORCH_STATUS.FAILED];
ALLOWED_TRANSITIONS[ORCH_STATUS.DRY_RUN_READY]     = [ORCH_STATUS.DRY_RUN_COMPLETED, ORCH_STATUS.FAILED];
ALLOWED_TRANSITIONS[ORCH_STATUS.DRY_RUN_COMPLETED] = [ORCH_STATUS.ARCHIVED];
ALLOWED_TRANSITIONS[ORCH_STATUS.FAILED]            = [];
ALLOWED_TRANSITIONS[ORCH_STATUS.ARCHIVED]          = [];

// ============================================================================
// Allowed Modes
// ============================================================================
const ALLOWED_MODES = ['dry-run', 'supervised'];
const FORBIDDEN_MODES = ['live', 'auto', 'execute'];

// ============================================================================
// Error Codes
// ============================================================================
const ERROR_CODES = {
  INVALID_ORCHESTRATION:     'INVALID_ORCHESTRATION',
  INVALID_ORCHESTRATION_ID:  'INVALID_ORCHESTRATION_ID',
  INVALID_SESSION_ID:        'INVALID_SESSION_ID',
  INVALID_SANDBOX_ID:        'INVALID_SANDBOX_ID',
  INVALID_MODE:              'INVALID_MODE',
  INVALID_STATUS:            'INVALID_STATUS',
  INVALID_STEP:              'INVALID_STEP',
  INVALID_STEP_ID:           'INVALID_STEP_ID',
  INVALID_STEP_STATUS:       'INVALID_STEP_STATUS',
  INVALID_DEPENDENCY:        'INVALID_DEPENDENCY',
  CIRCULAR_DEPENDENCY:       'CIRCULAR_DEPENDENCY',
  MISSING_GUARDRAILS:        'MISSING_GUARDRAILS',
  LIVE_MODE_FORBIDDEN:       'LIVE_MODE_FORBIDDEN',
  AUTO_MODE_FORBIDDEN:       'AUTO_MODE_FORBIDDEN',
  REAL_EXECUTION_FORBIDDEN:  'REAL_EXECUTION_FORBIDDEN',
  ORCHESTRATION_NOT_FOUND:   'ORCHESTRATION_NOT_FOUND',
  STEP_NOT_FOUND:            'STEP_NOT_FOUND'
};

// ============================================================================
// Audit Event Types
// ============================================================================
const AUDIT_EVENT = {
  ORCHESTRATION_CREATED:   'orchestration_created',
  ORCHESTRATION_VALIDATED: 'orchestration_validated',
  STEP_VALIDATED:          'step_validated',
  STEP_DRY_RUN_COMPLETED:  'step_dry_run_completed',
  STEP_FAILED:             'step_failed',
  ORCHESTRATION_ARCHIVED:  'orchestration_archived'
};

// ============================================================================
// Default Step Template Names
// ============================================================================
const DEFAULT_STEPS = [
  { name: 'validate-input',             type: 'validation',    dependsOn: [] },
  { name: 'validate-approval',          type: 'validation',    dependsOn: ['validate-input'] },
  { name: 'validate-agent-assignment',  type: 'validation',    dependsOn: ['validate-approval'] },
  { name: 'prepare-sandbox',            type: 'preparation',   dependsOn: ['validate-agent-assignment'] },
  { name: 'dry-run-command-preview',    type: 'preparation',   dependsOn: ['prepare-sandbox'] },
  { name: 'create-checkpoint',          type: 'checkpoint',    dependsOn: ['dry-run-command-preview'] },
  { name: 'finalize-dry-run',           type: 'finalization',  dependsOn: ['create-checkpoint'] }
];

// ============================================================================
// Factory Functions
// ============================================================================

function createOrchId() {
  return 'orch_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function createStepId() {
  return 'step_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * Create an orchestration plan linking execution session + sandbox session.
 */
function createOrchestrationPlan(executionSession, sandboxSession, options) {
  options = options || {};
  var now = new Date().toISOString();

  return {
    orchestrationId:     options.orchestrationId || createOrchId(),
    executionSessionId:  (executionSession && executionSession.executionSessionId) || null,
    sandboxSessionId:    (sandboxSession && sandboxSession.sessionId) || null,
    mode:                options.mode || 'dry-run',
    status:              ORCH_STATUS.PLANNED,
    steps:               [],
    dependencies:         [],
    guardrails:          options.guardrails || [],
    risks:               options.risks || [],
    auditTrail:          [],
    createdAt:            now,
    updatedAt:           now,
    metadata:            options.metadata || {}
  };
}

/**
 * Create a step plan object.
 */
function createStepPlan(name, type, dependsOn) {
  return {
    stepId:          createStepId(),
    name:            name || 'unnamed-step',
    type:            type || 'validation',
    status:          STEP_STATUS.PENDING,
    dependsOn:       dependsOn || [],
    dryRun:          true,
    commandPreview:  null,
    expectedOutput:  {},
    risks:           [],
    guardrails:      [],
    createdAt:        new Date().toISOString()
  };
}

/**
 * Check if orchestration transition is valid.
 */
function isValidOrchTransition(fromStatus, toStatus) {
  var allowed = ALLOWED_TRANSITIONS[fromStatus];
  return allowed ? allowed.indexOf(toStatus) !== -1 : false;
}

/**
 * Check if orchestration status is terminal.
 */
function isTerminalOrchStatus(status) {
  return status === ORCH_STATUS.ARCHIVED || status === ORCH_STATUS.FAILED;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  ORCH_STATUS, ORCH_STATUS_VALUES,
  STEP_STATUS, STEP_STATUS_VALUES,
  STEP_TYPE,
  ALLOWED_TRANSITIONS,
  ALLOWED_MODES, FORBIDDEN_MODES,
  ERROR_CODES,
  AUDIT_EVENT,
  DEFAULT_STEPS,

  createOrchId, createStepId,
  createOrchestrationPlan, createStepPlan,
  isValidOrchTransition, isTerminalOrchStatus
};
