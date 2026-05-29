/**
 * dispatch-ticket/index.js
 * P9.6.1 Dispatch Ticket System — Unified barrel export.
 */

'use strict';

var types = require('./dispatch-ticket-types');
var validator = require('./dispatch-ticket-validator');
var store = require('./dispatch-ticket-store');
var runtime = require('./dispatch-ticket-runtime');

var index = {
  // --- Types & Constants ---
  TICKET_STATUS: types.TICKET_STATUS,
  TICKET_STATUS_VALUES: types.TICKET_STATUS_VALUES,
  APPROVAL_STATUS: types.APPROVAL_STATUS,
  APPROVAL_STATUS_VALUES: types.APPROVAL_STATUS_VALUES,
  EXECUTION_MODE: types.EXECUTION_MODE,
  EXECUTION_MODE_VALUES: types.EXECUTION_MODE_VALUES,
  FORBIDDEN_MODES: types.FORBIDDEN_MODES,
  RISK_LEVELS: types.RISK_LEVELS,
  RISK_LEVEL_VALUES: types.RISK_LEVEL_VALUES,
  RISK_EXECUTION_MODE: types.RISK_EXECUTION_MODE,
  PRIORITY_RISK_MAP: types.PRIORITY_RISK_MAP,
  ALLOWED_TRANSITIONS: types.ALLOWED_TRANSITIONS,
  APPROVAL_TO_TICKET_STATUS: types.APPROVAL_TO_TICKET_STATUS,
  APPROVAL_TO_APPROVAL_STATUS: types.APPROVAL_TO_APPROVAL_STATUS,
  VALID_APPROVAL_ACTIONS: types.VALID_APPROVAL_ACTIONS,
  TICKET_ERROR_CODES: types.TICKET_ERROR_CODES,

  // --- Factory Functions ---
  createTicketId: types.createTicketId,
  createDispatchTicket: types.createDispatchTicket,
  createEmptyDispatchTicket: types.createEmptyDispatchTicket,
  createTicketSnapshot: types.createTicketSnapshot,

  // --- Helpers ---
  isValidTransition: types.isValidTransition,
  isTerminalStatus: types.isTerminalStatus,
  canBeApproved: types.canBeApproved,

  // --- Validators ---
  validateDispatchTicket: validator.validateDispatchTicket,
  validateDispatchPlan: validator.validateDispatchPlan,
  validateExecutionMode: validator.validateExecutionMode,
  validateApprovalAction: validator.validateApprovalAction,
  validateBatchTickets: validator.validateBatchTickets,
  validateFilter: validator.validateFilter,

  // --- Store (testing / reset) ---
  setStorePath: store.setStorePath,
  getStorePath: store.getStorePath,
  readStore: store.readStore,
  writeStore: store.writeStore,
  createTicket: store.createTicket,
  createTickets: store.createTickets,
  getTicket: store.getTicket,
  updateTicket: store.updateTicket,
  deleteTicket: store.deleteTicket,
  listTickets: store.listTickets,
  findDuplicateTicket: store.findDuplicateTicket,
  clearTickets: store.clearTickets,

  // --- Store mutex ---
  withLock: store.withLock,
  acquireLock: store.acquireLock,
  releaseLock: store.releaseLock,

  // --- Runtime (primary API) ---
  createTicketFromPlan: runtime.createDispatchTicket,
  createBatchTickets: runtime.createDispatchTickets,
  approveTicket: runtime.approveDispatchTicket,
  rejectTicket: runtime.rejectDispatchTicket,
  archiveTicket: runtime.archiveDispatchTicket,
  getDispatchTicket: runtime.getDispatchTicket,
  listDispatchTickets: runtime.listDispatchTickets,
  generateTicketSnapshot: runtime.generateTicketSnapshot,

  // --- Test helpers ---
  _clearAllTickets: runtime._clearAllTickets
};

module.exports = index;
