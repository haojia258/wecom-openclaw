/**
 * index.js
 * P9.7.2 Execution Sandbox — Barrel export.
 *
 * Safety constraints:
 *   - No real task execution, no shell/exec/spawn
 *   - Dry-run only
 */

'use strict';

var types   = require('./execution-sandbox-types');
var valid   = require('./execution-sandbox-validator');
var store   = require('./execution-sandbox-store');
var runtime = require('./execution-sandbox-runtime');

module.exports = {
  // Types
  SANDBOX_STATUS:        types.SANDBOX_STATUS,
  SANDBOX_STATUS_VALUES: types.SANDBOX_STATUS_VALUES,
  ALLOWED_TRANSITIONS:   types.ALLOWED_TRANSITIONS,
  ERROR_CODES:           types.ERROR_CODES,
  AUDIT_EVENT:           types.AUDIT_EVENT,
  createSandboxSession:  types.createSandboxSession,
  createCheckpoint:       types.createCheckpoint,
  createAuditEvent:      types.createAuditEvent,
  isValidTransition:      types.isValidTransition,
  isTerminalStatus:       types.isTerminalStatus,

  // Validator
  validateSession:       valid.validateSession,
  validatePlan:          valid.validatePlan,
  validateAgent:         valid.validateAgent,
  validateTransition:    valid.validateTransition,
  validateCheckpoint:    valid.validateCheckpoint,

  // Store
  storeCreateSession:         store.createSession,
  storeGetSession:           store.getSession,
  storeUpdateSession:        store.updateSession,
  storeListSessions:         store.listSessions,
  storeCreateCheckpoint:      store.createCheckpointRecord,
  storeGetCheckpoint:        store.getCheckpoint,
  storeListCheckpoints:      store.listCheckpoints,
  storeRecordAudit:          store.recordAudit,
  storeClearAll:             store.clearAll,

  // Runtime
  createSandboxSession:      runtime.createSandboxSession,
  startSandboxSession:       runtime.startSandboxSession,
  pauseSandboxSession:       runtime.pauseSandboxSession,
  resumeSandboxSession:      runtime.resumeSandboxSession,
  completeSandboxSession:    runtime.completeSandboxSession,
  archiveSandboxSession:     runtime.archiveSandboxSession,
  checkpointSession:         runtime.checkpointSession,
  restoreCheckpointPlan:     runtime.restoreCheckpointPlan,
  generateSandboxSnapshot:   runtime.generateSandboxSnapshot,
  getSandboxSession:         runtime.getSandboxSession,
  listSandboxSessions:       runtime.listSandboxSessions
};
