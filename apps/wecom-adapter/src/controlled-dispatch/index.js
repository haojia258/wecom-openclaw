/**
 * index.js
 * P9.6.2 Controlled Dispatch Runtime — Barrel export.
 *
 * Controlled Dispatch converts approved dispatch tickets into safe,
 * controlled dispatch sessions. ONLY dry-run and supervised modes.
 *
 * This is a SAFETY GATE. No live/auto/execute execution.
 */

'use strict';

var types = require('./controlled-dispatch-types');
var validator = require('./controlled-dispatch-validator');
var store = require('./controlled-dispatch-store');
var runtime = require('./controlled-dispatch-runtime');

// ============================================================================
// Types & Constants
// ============================================================================
var SESSION_STATUS = types.SESSION_STATUS;
var SESSION_STATUS_VALUES = types.SESSION_STATUS_VALUES;
var ALLOWED_SESSION_TRANSITIONS = types.ALLOWED_SESSION_TRANSITIONS;
var EXECUTION_MODE = types.EXECUTION_MODE;
var EXECUTION_MODE_VALUES = types.EXECUTION_MODE_VALUES;
var FORBIDDEN_MODES = types.FORBIDDEN_MODES;
var SAFETY_LEVEL = types.SAFETY_LEVEL;
var SAFETY_LEVEL_VALUES = types.SAFETY_LEVEL_VALUES;
var CAPABILITY = types.CAPABILITY;
var CAPABILITY_VALUES = types.CAPABILITY_VALUES;
var DEFAULT_CAPABILITIES = types.DEFAULT_CAPABILITIES;
var SESSION_ERROR_CODES = types.SESSION_ERROR_CODES;
var PRIORITY_SAFETY_MAP = types.PRIORITY_SAFETY_MAP;

// Factory
var createSessionId = types.createSessionId;
var createDispatchSession = types.createDispatchSession;
var createEmptyDispatchSession = types.createEmptyDispatchSession;
var createSessionSnapshot = types.createSessionSnapshot;

// Helpers
var _validateSessionBasic = types._validateSessionBasic;
var isValidSessionTransition = types.isValidSessionTransition;
var isTerminalSessionStatus = types.isTerminalSessionStatus;
var canStartSession = types.canStartSession;

// ============================================================================
// Validators
// ============================================================================
var V = validator.V;
var validateDispatchSession = validator.validateDispatchSession;
var validateExecutionMode = validator.validateExecutionMode;
var validateTicketForDispatch = validator.validateTicketForDispatch;
var validateSessionTransition = validator.validateSessionTransition;
var validateCapabilities = validator.validateCapabilities;
var validateBatchSessions = validator.validateBatchSessions;
var validateSessionFilter = validator.validateSessionFilter;

// ============================================================================
// Store
// ============================================================================
var _storeCreateSession = store.createSession;
var _storeCreateSessions = store.createSessions;
var _storeGetSession = store.getSession;
var _storeUpdateSession = store.updateSession;
var _storeDeleteSession = store.deleteSession;
var _storeListSessions = store.listSessions;
var _storeFindSessionByTicket = store.findSessionByTicket;
var _storeClearAllSessions = store.clearAllSessions;
var _storeGetSessionCount = store.getSessionCount;
var setStorePath = store.setStorePath;
var getStorePath = store.getStorePath;
var resetStorePath = store.resetStorePath;

// ============================================================================
// Runtime
// ============================================================================
var _runtimeCreateDispatchSession = runtime.createDispatchSession;
var _runtimeCreateDispatchSessions = runtime.createDispatchSessions;
var _runtimeStartSession = runtime.startSession;
var _runtimeCompleteSession = runtime.completeSession;
var _runtimeFailSession = runtime.failSession;
var _runtimeCancelSession = runtime.cancelSession;
var _runtimeGetDispatchSession = runtime.getDispatchSession;
var _runtimeListDispatchSessions = runtime.listDispatchSessions;
var _runtimeGenerateSessionSnapshot = runtime.generateSessionSnapshot;

// ============================================================================
// Convenience aliases
// ============================================================================
var createSessionFromTicket = _runtimeCreateDispatchSession;
var createBatchSessions = _runtimeCreateDispatchSessions;
var getSession = _runtimeGetDispatchSession;
var listSessions = _runtimeListDispatchSessions;
var startDispatchSession = _runtimeStartSession;
var completeDispatchSession = _runtimeCompleteSession;
var failDispatchSession = _runtimeFailSession;
var cancelDispatchSession = _runtimeCancelSession;

// ============================================================================
// Combined export
// ============================================================================
var index = {
  // --- Types & Constants ---
  SESSION_STATUS: SESSION_STATUS,
  SESSION_STATUS_VALUES: SESSION_STATUS_VALUES,
  ALLOWED_SESSION_TRANSITIONS: ALLOWED_SESSION_TRANSITIONS,
  EXECUTION_MODE: EXECUTION_MODE,
  EXECUTION_MODE_VALUES: EXECUTION_MODE_VALUES,
  FORBIDDEN_MODES: FORBIDDEN_MODES,
  SAFETY_LEVEL: SAFETY_LEVEL,
  SAFETY_LEVEL_VALUES: SAFETY_LEVEL_VALUES,
  CAPABILITY: CAPABILITY,
  CAPABILITY_VALUES: CAPABILITY_VALUES,
  DEFAULT_CAPABILITIES: DEFAULT_CAPABILITIES,
  SESSION_ERROR_CODES: SESSION_ERROR_CODES,
  PRIORITY_SAFETY_MAP: PRIORITY_SAFETY_MAP,

  // --- Factory (raw object creation, NOT the runtime API) ---
  createSessionId: createSessionId,
  createDispatchSessionObj: createDispatchSession,
  createEmptyDispatchSession: createEmptyDispatchSession,
  createSessionSnapshot: createSessionSnapshot,

  // --- Helpers ---
  _validateSessionBasic: _validateSessionBasic,
  isValidSessionTransition: isValidSessionTransition,
  isTerminalSessionStatus: isTerminalSessionStatus,
  canStartSession: canStartSession,

  // --- Validators ---
  V: V,
  validateDispatchSession: validateDispatchSession,
  validateExecutionMode: validateExecutionMode,
  validateTicketForDispatch: validateTicketForDispatch,
  validateSessionTransition: validateSessionTransition,
  validateCapabilities: validateCapabilities,
  validateBatchSessions: validateBatchSessions,
  validateSessionFilter: validateSessionFilter,

  // --- Store ---
  createSession: _storeCreateSession,
  createSessions: _storeCreateSessions,
  getSession: getSession,
  updateSession: _storeUpdateSession,
  deleteSession: _storeDeleteSession,
  listSessions: listSessions,
  findSessionByTicket: _storeFindSessionByTicket,
  clearAllSessions: _storeClearAllSessions,
  getSessionCount: _storeGetSessionCount,
  setStorePath: setStorePath,
  getStorePath: getStorePath,
  resetStorePath: resetStorePath,
  acquireLock: store.acquireLock,
  releaseLock: store.releaseLock,
  withLock: store.withLock,

  // --- Runtime ---
  createDispatchSession: _runtimeCreateDispatchSession,
  createDispatchSessions: _runtimeCreateDispatchSessions,
  startSession: _runtimeStartSession,
  completeSession: _runtimeCompleteSession,
  failSession: _runtimeFailSession,
  cancelSession: _runtimeCancelSession,
  getDispatchSession: _runtimeGetDispatchSession,
  listDispatchSessions: _runtimeListDispatchSessions,
  generateSessionSnapshot: _runtimeGenerateSessionSnapshot,

  // --- Aliases ---
  createSessionFromTicket: createSessionFromTicket,
  createBatchSessions: createBatchSessions,
  startDispatchSession: startDispatchSession,
  completeDispatchSession: completeDispatchSession,
  failDispatchSession: failDispatchSession,
  cancelDispatchSession: cancelDispatchSession,

  // --- Sub-module references (for testing) ---
  types: types,
  validator: validator,
  store: store,
  runtime: runtime
};

module.exports = index;
