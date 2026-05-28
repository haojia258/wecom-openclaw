/**
 * dispatch-ticket-runtime.js
 * P9.6.1 Dispatch Ticket System — Core business logic runtime.
 *
 * Converts dispatch plans into approval-level tickets. Tickets are ONLY for
 * approval; they do NOT execute missions, call commanders, or connect to
 * agent-host. This is the first safety gate before Controlled Dispatch.
 */

'use strict';

var types = require('./dispatch-ticket-types');
var validator = require('./dispatch-ticket-validator');
var store = require('./dispatch-ticket-store');

var TICKET_STATUS = types.TICKET_STATUS;
var APPROVAL_STATUS = types.APPROVAL_STATUS;
var EXECUTION_MODE = types.EXECUTION_MODE;
var TICKET_ERROR_CODES = types.TICKET_ERROR_CODES;

// ============================================================================
// createDispatchTicket
// ============================================================================

/**
 * Convert a dispatch plan into a dispatch ticket.
 *
 * @param {Object} dispatchPlan — reviewed dispatch plan from P9.5.5
 * @param {Object} [options]
 * @returns {Object} { success: boolean, ticket?: Object, error?: string, details?: Array }
 */
function createDispatchTicket(dispatchPlan, options) {
  options = options || {};

  // Validate dispatch plan
  var planValidation = validator.validateDispatchPlan(dispatchPlan);
  if (!planValidation.valid) {
    return { success: false, error: TICKET_ERROR_CODES.INVALID_DISPATCH_PLAN, details: planValidation.errors };
  }

  // Check for duplicate tickets (same dispatchPlanId)
  if (!options.allowDuplicates) {
    var planId = dispatchPlan.dispatchPlanId || dispatchPlan.planId;
    var existing = store.findDuplicateTicket(planId);
    if (existing) {
      return {
        success: false,
        error: TICKET_ERROR_CODES.DUPLICATE_TICKET,
        details: [{ message: 'Ticket already exists for dispatchPlanId: ' + planId, existingTicketId: existing.ticketId }]
      };
    }
  }

  // Create ticket
  var ticket = types.createDispatchTicket(dispatchPlan, options);

  // Validate created ticket
  var ticketValidation = validator.validateDispatchTicket(ticket);
  if (!ticketValidation.valid) {
    return { success: false, error: TICKET_ERROR_CODES.INVALID_TICKET, details: ticketValidation.errors };
  }

  // Validate execution mode (must not be live/auto/execute)
  var modeValidation = validator.validateExecutionMode(ticket.executionMode);
  if (!modeValidation.valid) {
    return { success: false, error: TICKET_ERROR_CODES.FORBIDDEN_EXECUTION_MODE, details: modeValidation.errors };
  }

  // Persist
  store.createTicket(ticket);

  return { success: true, ticket: ticket };
}

// ============================================================================
// createDispatchTickets — batch creation
// ============================================================================

/**
 * Convert multiple dispatch plans into dispatch tickets.
 *
 * @param {Array<Object>} dispatchPlans
 * @param {Object} [options]
 * @returns {Array<Object>} array of { success, ticket? } per plan
 */
function createDispatchTickets(dispatchPlans, options) {
  options = options || {};

  if (!Array.isArray(dispatchPlans)) {
    return [{ success: false, error: TICKET_ERROR_CODES.EMPTY_BATCH, details: [{ message: 'dispatchPlans must be an array' }] }];
  }

  if (dispatchPlans.length === 0) {
    return [{ success: false, error: TICKET_ERROR_CODES.EMPTY_BATCH, details: [{ message: 'dispatchPlans array must not be empty' }] }];
  }

  var results = [];
  var validTickets = [];

  for (var i = 0; i < dispatchPlans.length; i++) {
    var plan = dispatchPlans[i];
    var result = createDispatchTicket(plan, options);

    if (result.success) {
      validTickets.push(result.ticket);
    }

    results.push(result);
  }

  // If no valid tickets were created, don't try to batch persist
  return results;
}

// ============================================================================
// approveDispatchTicket
// ============================================================================

/**
 * Approve a dispatch ticket. Sets approvalStatus to human-approved,
 * status to approved.
 *
 * @param {string} ticketId
 * @param {string} approver
 * @param {string} [reason]
 * @returns {Object} { success, ticket?, error?, details? }
 */
function approveDispatchTicket(ticketId, approver, reason) {
  if (!ticketId || typeof ticketId !== 'string') {
    return { success: false, error: TICKET_ERROR_CODES.INVALID_TICKET_ID, details: [{ message: 'ticketId is required' }] };
  }

  var ticket = store.getTicket(ticketId);
  if (!ticket) {
    return { success: false, error: TICKET_ERROR_CODES.TICKET_NOT_FOUND, details: [{ message: 'Ticket not found: ' + ticketId }] };
  }

  // Validate the approval action
  var actionValidation = validator.validateApprovalAction(ticket, 'approve', approver, reason);
  if (!actionValidation.valid) {
    return { success: false, error: TICKET_ERROR_CODES.INVALID_TRANSITION, details: actionValidation.errors };
  }

  // Calculate new approval status
  var newApprovalStatus = types.APPROVAL_TO_APPROVAL_STATUS['approve'];

  // Update ticket
  var updates = {
    status: TICKET_STATUS.APPROVED,
    approvalStatus: newApprovalStatus,
    approver: approver
  };

  if (reason) {
    updates.metadata = Object.assign({}, ticket.metadata || {}, { approvalReason: reason });
  }

  var updated = store.updateTicket(ticketId, updates);
  if (!updated) {
    return { success: false, error: TICKET_ERROR_CODES.TICKET_NOT_FOUND, details: [{ message: 'Failed to update ticket: ' + ticketId }] };
  }

  return { success: true, ticket: updated };
}

// ============================================================================
// rejectDispatchTicket
// ============================================================================

/**
 * Reject a dispatch ticket. Sets approvalStatus to human-rejected,
 * status to rejected.
 *
 * @param {string} ticketId
 * @param {string} reviewer
 * @param {string} reason — required for rejection
 * @returns {Object} { success, ticket?, error?, details? }
 */
function rejectDispatchTicket(ticketId, reviewer, reason) {
  if (!ticketId || typeof ticketId !== 'string') {
    return { success: false, error: TICKET_ERROR_CODES.INVALID_TICKET_ID, details: [{ message: 'ticketId is required' }] };
  }

  var ticket = store.getTicket(ticketId);
  if (!ticket) {
    return { success: false, error: TICKET_ERROR_CODES.TICKET_NOT_FOUND, details: [{ message: 'Ticket not found: ' + ticketId }] };
  }

  // Validate the rejection action
  var actionValidation = validator.validateApprovalAction(ticket, 'reject', reviewer, reason);
  if (!actionValidation.valid) {
    return { success: false, error: TICKET_ERROR_CODES.INVALID_TRANSITION, details: actionValidation.errors };
  }

  // Calculate new approval status
  var newApprovalStatus = types.APPROVAL_TO_APPROVAL_STATUS['reject'];

  // Update ticket
  var updates = {
    status: TICKET_STATUS.REJECTED,
    approvalStatus: newApprovalStatus,
    reviewer: reviewer,
    rejectionReason: reason
  };

  var updated = store.updateTicket(ticketId, updates);
  if (!updated) {
    return { success: false, error: TICKET_ERROR_CODES.TICKET_NOT_FOUND, details: [{ message: 'Failed to update ticket: ' + ticketId }] };
  }

  return { success: true, ticket: updated };
}

// ============================================================================
// archiveDispatchTicket
// ============================================================================

/**
 * Archive a dispatch ticket. Only approved or rejected tickets can be archived.
 *
 * @param {string} ticketId
 * @returns {Object} { success, ticket?, error?, details? }
 */
function archiveDispatchTicket(ticketId) {
  if (!ticketId || typeof ticketId !== 'string') {
    return { success: false, error: TICKET_ERROR_CODES.INVALID_TICKET_ID, details: [{ message: 'ticketId is required' }] };
  }

  var ticket = store.getTicket(ticketId);
  if (!ticket) {
    return { success: false, error: TICKET_ERROR_CODES.TICKET_NOT_FOUND, details: [{ message: 'Ticket not found: ' + ticketId }] };
  }

  // Can only archive approved or rejected tickets
  if (ticket.status !== TICKET_STATUS.APPROVED && ticket.status !== TICKET_STATUS.REJECTED) {
    return {
      success: false,
      error: TICKET_ERROR_CODES.INVALID_TRANSITION,
      details: [{ message: 'Can only archive approved or rejected tickets. Current status: ' + ticket.status }]
    };
  }

  var updated = store.updateTicket(ticketId, { status: TICKET_STATUS.ARCHIVED });
  if (!updated) {
    return { success: false, error: TICKET_ERROR_CODES.TICKET_NOT_FOUND, details: [{ message: 'Failed to update ticket: ' + ticketId }] };
  }

  return { success: true, ticket: updated };
}

// ============================================================================
// getDispatchTicket
// ============================================================================

function getDispatchTicket(ticketId) {
  if (!ticketId || typeof ticketId !== 'string') {
    return null;
  }
  return store.getTicket(ticketId);
}

// ============================================================================
// listDispatchTickets
// ============================================================================

/**
 * List tickets with optional filtering.
 *
 * @param {Object} [filter] { status, priority, riskLevel, approvalStatus }
 * @returns {Array<Object>}
 */
function listDispatchTickets(filter) {
  var filterValidation = validator.validateFilter(filter);
  if (!filterValidation.valid) {
    return [];
  }
  return store.listTickets(filter);
}

// ============================================================================
// generateTicketSnapshot
// ============================================================================

/**
 * Generate a summary snapshot of all tickets.
 *
 * @returns {Object} { total, byStatus, byPriority, byRisk, approvalSummary, generatedAt, meta }
 */
function generateTicketSnapshot() {
  var data = store.readStore();
  var tickets = data.tickets || [];

  var snapshot = types.createTicketSnapshot(tickets, data.meta);

  // Add pipeline summary (counts of linked upstream entities)
  var uniqueDispatchPlans = {};
  var uniqueReviews = {};
  var uniqueDrafts = {};
  var uniqueStrategies = {};
  var uniqueGoals = {};

  for (var i = 0; i < tickets.length; i++) {
    var t = tickets[i];
    if (t.dispatchPlanId) uniqueDispatchPlans[t.dispatchPlanId] = true;
    if (t.reviewId) uniqueReviews[t.reviewId] = true;
    if (t.draftId) uniqueDrafts[t.draftId] = true;
    if (t.strategyId) uniqueStrategies[t.strategyId] = true;
    if (t.goalId) uniqueGoals[t.goalId] = true;
  }

  snapshot.pipelineSummary = {
    uniqueDispatchPlans: Object.keys(uniqueDispatchPlans).length,
    uniqueReviews: Object.keys(uniqueReviews).length,
    uniqueDrafts: Object.keys(uniqueDrafts).length,
    uniqueStrategies: Object.keys(uniqueStrategies).length,
    uniqueGoals: Object.keys(uniqueGoals).length
  };

  return snapshot;
}

// ============================================================================
// Test helpers
// ============================================================================

function _clearAllTickets() {
  return store.clearTickets();
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Core runtime
  createDispatchTicket: createDispatchTicket,
  createDispatchTickets: createDispatchTickets,
  approveDispatchTicket: approveDispatchTicket,
  rejectDispatchTicket: rejectDispatchTicket,
  archiveDispatchTicket: archiveDispatchTicket,
  getDispatchTicket: getDispatchTicket,
  listDispatchTickets: listDispatchTickets,
  generateTicketSnapshot: generateTicketSnapshot,

  // Test helpers
  _clearAllTickets: _clearAllTickets
};
