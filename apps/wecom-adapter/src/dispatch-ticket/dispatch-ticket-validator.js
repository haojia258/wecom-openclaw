/**
 * dispatch-ticket-validator.js
 * P9.6.1 Dispatch Ticket System — Input validation utilities.
 *
 * Validates tickets, dispatch plans, execution modes, approval actions,
 * and batch ticket inputs. No I/O, no side effects.
 */

'use strict';

var types = require('./dispatch-ticket-types');

var TICKET_STATUS_VALUES = types.TICKET_STATUS_VALUES;
var APPROVAL_STATUS_VALUES = types.APPROVAL_STATUS_VALUES;
var EXECUTION_MODE_VALUES = types.EXECUTION_MODE_VALUES;
var FORBIDDEN_MODES = types.FORBIDDEN_MODES;
var RISK_LEVEL_VALUES = types.RISK_LEVEL_VALUES;
var TICKET_ERROR_CODES = types.TICKET_ERROR_CODES;
var VALID_APPROVAL_ACTIONS = types.VALID_APPROVAL_ACTIONS;
var ALLOWED_TRANSITIONS = types.ALLOWED_TRANSITIONS;
var TICKET_STATUS = types.TICKET_STATUS;

// ============================================================================
// validateDispatchTicket — full ticket validation
// ============================================================================

function validateDispatchTicket(ticket) {
  var errors = [];

  if (!ticket || typeof ticket !== 'object') {
    errors.push({ field: 'ticket', code: TICKET_ERROR_CODES.INVALID_TICKET, message: 'Ticket must be an object' });
    return { valid: false, errors: errors };
  }

  // ticketId
  if (!ticket.ticketId || typeof ticket.ticketId !== 'string') {
    errors.push({ field: 'ticketId', code: TICKET_ERROR_CODES.INVALID_TICKET_ID, message: 'ticketId is required and must be a string' });
  } else if (!ticket.ticketId.startsWith('ticket_')) {
    errors.push({ field: 'ticketId', code: TICKET_ERROR_CODES.INVALID_TICKET_ID, message: 'ticketId must start with "ticket_"' });
  }

  // dispatchPlanId
  if (!ticket.dispatchPlanId || typeof ticket.dispatchPlanId !== 'string') {
    errors.push({ field: 'dispatchPlanId', code: TICKET_ERROR_CODES.MISSING_DISPATCH_PLAN_ID, message: 'dispatchPlanId is required' });
  }

  // goalId
  if (!ticket.goalId || typeof ticket.goalId !== 'string') {
    errors.push({ field: 'goalId', code: TICKET_ERROR_CODES.MISSING_GOAL_ID, message: 'goalId is required' });
  }

  // status
  if (!TICKET_STATUS_VALUES.includes(ticket.status)) {
    errors.push({ field: 'status', code: TICKET_ERROR_CODES.INVALID_STATUS, message: 'Invalid ticket status: ' + ticket.status });
  }

  // approvalStatus
  if (!APPROVAL_STATUS_VALUES.includes(ticket.approvalStatus)) {
    errors.push({ field: 'approvalStatus', code: TICKET_ERROR_CODES.INVALID_APPROVAL_STATUS, message: 'Invalid approval status: ' + ticket.approvalStatus });
  }

  // executionMode
  if (!EXECUTION_MODE_VALUES.includes(ticket.executionMode)) {
    errors.push({ field: 'executionMode', code: TICKET_ERROR_CODES.INVALID_EXECUTION_MODE, message: 'Invalid execution mode: ' + ticket.executionMode });
  }

  // Forbidden modes
  if (FORBIDDEN_MODES.includes(ticket.executionMode)) {
    errors.push({ field: 'executionMode', code: TICKET_ERROR_CODES.FORBIDDEN_EXECUTION_MODE, message: 'Forbidden execution mode: ' + ticket.executionMode });
  }

  // priority
  if (ticket.priority && typeof ticket.priority !== 'string') {
    errors.push({ field: 'priority', code: TICKET_ERROR_CODES.INVALID_PRIORITY, message: 'priority must be a string' });
  }

  // riskLevel
  if (!RISK_LEVEL_VALUES.includes(ticket.riskLevel)) {
    errors.push({ field: 'riskLevel', code: TICKET_ERROR_CODES.INVALID_RISK_LEVEL, message: 'Invalid risk level: ' + ticket.riskLevel });
  }

  // title
  if (typeof ticket.title !== 'string') {
    errors.push({ field: 'title', code: TICKET_ERROR_CODES.INVALID_TICKET, message: 'title must be a string' });
  }

  // dispatchPlan
  if (ticket.dispatchPlan !== undefined && ticket.dispatchPlan !== null && typeof ticket.dispatchPlan !== 'object') {
    errors.push({ field: 'dispatchPlan', code: TICKET_ERROR_CODES.INVALID_DISPATCH_PLAN, message: 'dispatchPlan must be an object if provided' });
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// validateDispatchPlan — validates the dispatch plan that a ticket wraps
// ============================================================================

function validateDispatchPlan(plan) {
  var errors = [];

  if (!plan || typeof plan !== 'object') {
    errors.push({ field: 'plan', code: TICKET_ERROR_CODES.INVALID_DISPATCH_PLAN, message: 'Dispatch plan must be an object' });
    return { valid: false, errors: errors };
  }

  // At minimum, the plan should have a dispatchPlanId or planId
  var planId = plan.dispatchPlanId || plan.planId;
  if (!planId || typeof planId !== 'string') {
    errors.push({ field: 'dispatchPlanId', code: TICKET_ERROR_CODES.MISSING_DISPATCH_PLAN_ID, message: 'Dispatch plan must have a dispatchPlanId or planId' });
  }

  // dispatchMode must be manual (for ticket system)
  if (plan.dispatchMode && plan.dispatchMode !== 'manual') {
    errors.push({ field: 'dispatchMode', code: TICKET_ERROR_CODES.INVALID_DISPATCH_PLAN, message: 'dispatchMode must be "manual" for ticket creation' });
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// validateExecutionMode — strict mode validation
// ============================================================================

function validateExecutionMode(mode) {
  var errors = [];

  if (typeof mode !== 'string') {
    errors.push({ field: 'executionMode', code: TICKET_ERROR_CODES.INVALID_EXECUTION_MODE, message: 'executionMode must be a string' });
    return { valid: false, errors: errors };
  }

  if (FORBIDDEN_MODES.includes(mode)) {
    errors.push({
      field: 'executionMode',
      code: TICKET_ERROR_CODES.FORBIDDEN_EXECUTION_MODE,
      message: 'Execution mode "' + mode + '" is FORBIDDEN. Only dry-run and manual-only are allowed.'
    });
    return { valid: false, errors: errors };
  }

  if (!EXECUTION_MODE_VALUES.includes(mode)) {
    errors.push({
      field: 'executionMode',
      code: TICKET_ERROR_CODES.INVALID_EXECUTION_MODE,
      message: 'Invalid execution mode: ' + mode + '. Must be one of: ' + EXECUTION_MODE_VALUES.join(', ')
    });
    return { valid: false, errors: errors };
  }

  return { valid: true, errors: [] };
}

// ============================================================================
// validateApprovalAction — validate approve/reject action
// ============================================================================

function validateApprovalAction(ticket, action, approver, reason) {
  var errors = [];

  // Validate ticket
  if (!ticket || typeof ticket !== 'object') {
    errors.push({ field: 'ticket', code: TICKET_ERROR_CODES.INVALID_TICKET, message: 'Ticket must be an object' });
    return { valid: false, errors: errors };
  }

  // Validate action
  if (!VALID_APPROVAL_ACTIONS.includes(action)) {
    errors.push({ field: 'action', code: TICKET_ERROR_CODES.INVALID_TRANSITION, message: 'Action must be one of: ' + VALID_APPROVAL_ACTIONS.join(', ') });
  }

  // Validate approver
  if (!approver || typeof approver !== 'string') {
    errors.push({ field: 'approver', code: TICKET_ERROR_CODES.INVALID_APPROVER, message: 'approver is required and must be a string' });
  }

  // Validate ticket state
  if (ticket.status !== TICKET_STATUS.PENDING) {
    errors.push({
      field: 'status',
      code: TICKET_ERROR_CODES.INVALID_TRANSITION,
      message: 'Ticket must be in "pending" status to be approved/rejected. Current: ' + ticket.status
    });
  }

  // Rejection must have a reason
  if (action === 'reject' && (!reason || typeof reason !== 'string' || reason.trim().length === 0)) {
    errors.push({
      field: 'rejectionReason',
      code: TICKET_ERROR_CODES.MISSING_REJECTION_REASON,
      message: 'Rejection reason is required when rejecting a ticket'
    });
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// validateBatchTickets — batch validation
// ============================================================================

function validateBatchTickets(tickets) {
  var errors = [];

  if (!Array.isArray(tickets)) {
    errors.push({ field: 'tickets', code: TICKET_ERROR_CODES.EMPTY_BATCH, message: 'Batch tickets must be an array' });
    return { valid: false, errors: errors };
  }

  if (tickets.length === 0) {
    errors.push({ field: 'tickets', code: TICKET_ERROR_CODES.EMPTY_BATCH, message: 'Batch tickets array must not be empty' });
    return { valid: false, errors: errors };
  }

  var seenIds = {};
  for (var i = 0; i < tickets.length; i++) {
    var ticket = tickets[i];
    var ticketErrors = validateDispatchTicket(ticket);
    if (!ticketErrors.valid) {
      for (var j = 0; j < ticketErrors.errors.length; j++) {
        errors.push({
          index: i,
          field: 'tickets[' + i + '].' + ticketErrors.errors[j].field,
          code: ticketErrors.errors[j].code,
          message: ticketErrors.errors[j].message
        });
      }
    }

    // Check duplicates within batch
    if (ticket && ticket.ticketId) {
      if (seenIds[ticket.ticketId]) {
        errors.push({
          index: i,
          field: 'tickets[' + i + '].ticketId',
          code: TICKET_ERROR_CODES.DUPLICATE_TICKET,
          message: 'Duplicate ticketId in batch: ' + ticket.ticketId
        });
      }
      seenIds[ticket.ticketId] = true;
    }
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// validateFilter — filter validation
// ============================================================================

function validateFilter(filter) {
  var errors = [];

  if (!filter || typeof filter !== 'object') {
    return { valid: true, errors: [] };  // empty filter is valid
  }

  if (filter.status !== undefined) {
    var statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    for (var i = 0; i < statuses.length; i++) {
      if (!TICKET_STATUS_VALUES.includes(statuses[i])) {
        errors.push({ field: 'filter.status', code: TICKET_ERROR_CODES.INVALID_STATUS, message: 'Invalid filter status: ' + statuses[i] });
      }
    }
  }

  if (filter.approvalStatus !== undefined) {
    var approvalStatuses = Array.isArray(filter.approvalStatus) ? filter.approvalStatus : [filter.approvalStatus];
    for (var a = 0; a < approvalStatuses.length; a++) {
      if (!APPROVAL_STATUS_VALUES.includes(approvalStatuses[a])) {
        errors.push({ field: 'filter.approvalStatus', code: TICKET_ERROR_CODES.INVALID_APPROVAL_STATUS, message: 'Invalid filter approvalStatus: ' + approvalStatuses[a] });
      }
    }
  }

  if (filter.priority !== undefined) {
    var priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
    for (var p = 0; p < priorities.length; p++) {
      if (typeof priorities[p] !== 'string') {
        errors.push({ field: 'filter.priority', code: TICKET_ERROR_CODES.INVALID_PRIORITY, message: 'Invalid filter priority: ' + priorities[p] });
      }
    }
  }

  if (filter.riskLevel !== undefined) {
    var risks = Array.isArray(filter.riskLevel) ? filter.riskLevel : [filter.riskLevel];
    for (var r = 0; r < risks.length; r++) {
      if (!RISK_LEVEL_VALUES.includes(risks[r])) {
        errors.push({ field: 'filter.riskLevel', code: TICKET_ERROR_CODES.INVALID_RISK_LEVEL, message: 'Invalid filter riskLevel: ' + risks[r] });
      }
    }
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  validateDispatchTicket: validateDispatchTicket,
  validateDispatchPlan: validateDispatchPlan,
  validateExecutionMode: validateExecutionMode,
  validateApprovalAction: validateApprovalAction,
  validateBatchTickets: validateBatchTickets,
  validateFilter: validateFilter
};
