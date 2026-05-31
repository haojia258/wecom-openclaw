/**
 * index.js
 * P9.7.1 Execution Session Runtime — Barrel export.
 *
 * Re-exports all public APIs from the execution-runtime sub-modules.
 */

'use strict';

// --- Types & Constants ---
var types   = require('./execution-types');
var v       = require('./execution-validator');
var sm      = require('./execution-state-machine');
var cp      = require('./execution-checkpoint');
var au      = require('./execution-audit');
var st      = require('./execution-store');
var runtime  = require('./execution-runtime');

// ============================================================================
// Consolidated Exports
// ============================================================================

module.exports = {

  // ============ Types & Enums ============

  // Status
  EXECUTION_STATUS:        types.EXECUTION_STATUS,
  EXECUTION_STATUS_VALUES:  types.EXECUTION_STATUS_VALUES,
  ALLOWED_TRANSITIONS:    types.ALLOWED_TRANSITIONS,

  // Mode
  EXECUTION_MODE:          types.EXECUTION_MODE,
  EXECUTION_MODE_VALUES:   types.EXECUTION_MODE_VALUES,
  FORBIDDEN_MODES:         types.FORBIDDEN_MODES,

  // Audit event types
  AUDIT_EVENT_TYPE:        types.AUDIT_EVENT_TYPE,
  AUDIT_EVENT_TYPE_VALUES:  types.AUDIT_EVENT_TYPE_VALUES,

  // Actor types
  ACTOR_TYPE:               types.ACTOR_TYPE,
  ACTOR_TYPE_VALUES:        types.ACTOR_TYPE_VALUES,

  // Error codes
  EXECUTION_ERROR_CODES:    types.EXECUTION_ERROR_CODES,

  // ============ Factories ============

  createExecutionSession:    types.createExecutionSession,
  createEmptyExecutionSession: types.createEmptyExecutionSession,
  createCheckpoint:          types.createCheckpoint,
  createAuditEvent:          types.createAuditEvent,
  createExecutionSnapshot:   types.createExecutionSnapshot,

  // ============ ID Generators ============
  createExecutionSessionId:  types.createExecutionSessionId,
  createCheckpointId:        types.createCheckpointId,
  createAuditEventId:        types.createAuditEventId,

  // ============ Validation ============
  validateExecutionSession:  v.validateExecutionSession,
  validateTransition:         v.validateTransition,
  validateExecutionMode:     v.validateExecutionMode,
  validateCheckpoint:        v.validateCheckpoint,
  validateAuditEvent:        v.validateAuditEvent,
  validateBatchSessions:     v.validateBatchSessions,

  // ============ State Machine ============
  transition:                sm.transition,
  getAllowedTransitions:     sm.getAllowedTransitions,
  isTerminalStatus:          sm.isTerminalStatus,
  canTransition:             sm.canTransition,

  // ============ Checkpoint Runtime ============
  createCheckpointRecord:    cp.createCheckpoint,
  listCheckpoints:           cp.listCheckpoints,
  getCheckpoint:             cp.getCheckpoint,
  restoreCheckpointPlan:     cp.restoreCheckpointPlan,
  deleteCheckpoint:          cp.deleteCheckpoint,
  listAllCheckpoints:        cp.listAllCheckpoints,

  // ============ Audit Runtime ============
  recordAuditEvent:          au.recordAuditEvent,
  listAuditEvents:           au.listAuditEvents,
  getAuditEvent:             au.getAuditEvent,
  listAuditEventsForSession:  au.listAuditEventsForSession,
  generateAuditSnapshot:      au.generateAuditSnapshot,
  deleteAuditEvent:          au.deleteAuditEvent,
  clearAuditEvents:          au.clearAuditEvents,

  // ============ Store ============
  // Sessions
  createSessionRecord:       st.createSessionRecord,
  updateSessionRecord:       st.updateSessionRecord,
  getSessionRecord:          st.getSessionRecord,
  listSessionRecords:        st.listSessionRecords,
  deleteSessionRecord:       st.deleteSessionRecord,
  clearSessionRecords:       st.clearSessionRecords,

  // Checkpoints
  createCheckpointRecord:    st.createCheckpointRecord,
  getCheckpointRecord:       st.getCheckpointRecord,
  listCheckpointRecords:     st.listCheckpointRecords,
  deleteCheckpointRecord:    st.deleteCheckpointRecord,
  clearCheckpointRecords:    st.clearCheckpointRecords,

  // Audit events
  createAuditEventRecord:    st.createAuditEventRecord,
  getAuditEventRecord:        st.getAuditEventRecord,
  listAuditEventRecords:      st.listAuditEventRecords,
  deleteAuditEventRecord:    st.deleteAuditEventRecord,
  clearAuditEventRecords:    st.clearAuditEventRecords,

  // ============ Runtime API ============
  createExecutionSession:     runtime.createExecutionSession,
  startExecutionSession:     runtime.startExecutionSession,
  pauseExecutionSession:     runtime.pauseExecutionSession,
  resumeExecutionSession:    runtime.resumeExecutionSession,
  completeExecutionSession:   runtime.completeExecutionSession,
  failExecutionSession:      runtime.failExecutionSession,
  rollbackExecutionSession:   runtime.rollbackExecutionSession,
  archiveExecutionSession:    runtime.archiveExecutionSession,

  getExecutionSession:       runtime.getExecutionSession,
  listExecutionSessions:     runtime.listExecutionSessions,
  generateExecutionSnapshot:  runtime.generateExecutionSnapshot,
  batchCreateExecutionSessions: runtime.batchCreateExecutionSessions
};
