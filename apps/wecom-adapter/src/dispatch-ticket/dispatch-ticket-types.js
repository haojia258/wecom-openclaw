/**
 * dispatch-ticket-types.js
 * P9.6.1 Dispatch Ticket System — Type definitions, constants, and factory functions.
 *
 * This module defines the DispatchTicket structure, status/approval/execution enums,
 * and factory functions for creating dispatch tickets.
 *
 * A Dispatch Ticket is NOT a mission, NOT a DAG, NOT a commander task.
 * It is an approval-layer ticket that wraps a reviewed dispatch plan.
 */

'use strict';

// ============================================================================
// Ticket Status
// ============================================================================
const TICKET_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ARCHIVED: 'archived'
};

const TICKET_STATUS_VALUES = Object.values(TICKET_STATUS);

// ============================================================================
// Approval Status
// ============================================================================
const APPROVAL_STATUS = {
  WAITING: 'waiting',
  HUMAN_APPROVED: 'human-approved',
  HUMAN_REJECTED: 'human-rejected'
};

const APPROVAL_STATUS_VALUES = Object.values(APPROVAL_STATUS);

// ============================================================================
// Execution Mode — MVP: only dry-run and manual-only
// ============================================================================
const EXECUTION_MODE = {
  DRY_RUN: 'dry-run',
  MANUAL_ONLY: 'manual-only'
};

const EXECUTION_MODE_VALUES = Object.values(EXECUTION_MODE);

// Forbidden execution modes (MUST NOT appear in any ticket)
const FORBIDDEN_MODES = ['live', 'auto', 'execute'];

// ============================================================================
// Risk Levels
// ============================================================================
const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

const RISK_LEVEL_VALUES = Object.values(RISK_LEVELS);

// ============================================================================
// Error Codes
// ============================================================================
const TICKET_ERROR_CODES = {
  INVALID_TICKET_ID: 'INVALID_TICKET_ID',
  INVALID_STATUS: 'INVALID_STATUS',
  INVALID_APPROVAL_STATUS: 'INVALID_APPROVAL_STATUS',
  INVALID_EXECUTION_MODE: 'INVALID_EXECUTION_MODE',
  INVALID_DISPATCH_PLAN: 'INVALID_DISPATCH_PLAN',
  INVALID_PRIORITY: 'INVALID_PRIORITY',
  INVALID_RISK_LEVEL: 'INVALID_RISK_LEVEL',
  MISSING_DISPATCH_PLAN_ID: 'MISSING_DISPATCH_PLAN_ID',
  MISSING_GOAL_ID: 'MISSING_GOAL_ID',
  DUPLICATE_TICKET: 'DUPLICATE_TICKET',
  EMPTY_BATCH: 'EMPTY_BATCH',
  FORBIDDEN_EXECUTION_MODE: 'FORBIDDEN_EXECUTION_MODE',
  INVALID_APPROVER: 'INVALID_APPROVER',
  INVALID_REVIEWER: 'INVALID_REVIEWER',
  MISSING_REJECTION_REASON: 'MISSING_REJECTION_REASON',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  INVALID_TICKET: 'INVALID_TICKET',
  INVALID_METADATA: 'INVALID_METADATA'
};

// ============================================================================
// State Transitions
// ============================================================================
const ALLOWED_TRANSITIONS = {
  [TICKET_STATUS.PENDING]: [TICKET_STATUS.APPROVED, TICKET_STATUS.REJECTED],
  [TICKET_STATUS.APPROVED]: [TICKET_STATUS.ARCHIVED],
  [TICKET_STATUS.REJECTED]: [TICKET_STATUS.ARCHIVED, TICKET_STATUS.PENDING],  // can resubmit
  [TICKET_STATUS.ARCHIVED]: []
};

const APPROVAL_TO_TICKET_STATUS = {
  [APPROVAL_STATUS.HUMAN_APPROVED]: TICKET_STATUS.APPROVED,
  [APPROVAL_STATUS.HUMAN_REJECTED]: TICKET_STATUS.REJECTED
};

const APPROVAL_TO_APPROVAL_STATUS = {
  'approve': APPROVAL_STATUS.HUMAN_APPROVED,
  'reject': APPROVAL_STATUS.HUMAN_REJECTED
};

const VALID_APPROVAL_ACTIONS = ['approve', 'reject'];

// ============================================================================
// Risk → Execution Mode Mapping
// ============================================================================
const RISK_EXECUTION_MODE = {
  [RISK_LEVELS.LOW]: EXECUTION_MODE.DRY_RUN,
  [RISK_LEVELS.MEDIUM]: EXECUTION_MODE.DRY_RUN,
  [RISK_LEVELS.HIGH]: EXECUTION_MODE.MANUAL_ONLY,
  [RISK_LEVELS.CRITICAL]: EXECUTION_MODE.MANUAL_ONLY
};

// ============================================================================
// Priority → Risk Mapping
// ============================================================================
const PRIORITY_RISK_MAP = {
  'low': RISK_LEVELS.LOW,
  'medium': RISK_LEVELS.MEDIUM,
  'high': RISK_LEVELS.HIGH,
  'critical': RISK_LEVELS.CRITICAL
};

// ============================================================================
// ID Generator
// ============================================================================
function createTicketId() {
  var ts = Date.now();
  var rand = Math.random().toString(36).substring(2, 8);
  return 'ticket_' + ts + '_' + rand;
}

// ============================================================================
// Factory: createDispatchTicket
// ============================================================================

/**
 * Create a dispatch ticket from a reviewed dispatch plan.
 *
 * @param {Object} dispatchPlan — the dispatch plan from P9.5.5
 * @param {Object} [options] — optional overrides
 * @returns {Object} a new DispatchTicket
 */
function createDispatchTicket(dispatchPlan, options) {
  options = options || {};
  var safe = (dispatchPlan && typeof dispatchPlan === 'object') ? dispatchPlan : {};
  var now = options.createdAt || new Date().toISOString();
  var priority = options.priority || safe.priority || 'medium';
  var riskLevel = options.riskLevel || PRIORITY_RISK_MAP[priority] || RISK_LEVELS.MEDIUM;

  var ticket = {
    // --- Identity ---
    ticketId: options.ticketId || createTicketId(),
    dispatchPlanId: safe.dispatchPlanId || safe.planId || '',
    reviewId: safe.reviewId || '',
    draftId: safe.draftId || '',
    strategyId: safe.strategyId || '',
    goalId: safe.goalId || '',

    // --- Content ---
    title: options.title || safe.title || 'Untitled Ticket',
    description: safe.description || options.description || '',
    priority: priority,
    riskLevel: riskLevel,

    // --- State ---
    status: options.status || TICKET_STATUS.PENDING,
    approvalStatus: options.approvalStatus || APPROVAL_STATUS.WAITING,
    executionMode: options.executionMode || EXECUTION_MODE.DRY_RUN,

    // --- People ---
    reviewer: options.reviewer || null,
    approver: options.approver || null,
    rejectionReason: options.rejectionReason || null,

    // --- Dispatch Plan Snapshot ---
    dispatchPlan: typeof dispatchPlan === 'object' && dispatchPlan !== null ? Object.assign({}, dispatchPlan) : {},

    // --- Meta ---
    createdAt: now,
    updatedAt: now,
    metadata: options.metadata || {}
  };

  return ticket;
}

// ============================================================================
// Factory: createEmptyDispatchTicket
// ============================================================================

/**
 * Create an empty dispatch ticket template (for testing / edge cases).
 */
function createEmptyDispatchTicket() {
  var now = new Date().toISOString();
  return {
    ticketId: createTicketId(),
    dispatchPlanId: '',
    reviewId: '',
    draftId: '',
    strategyId: '',
    goalId: '',
    title: '',
    description: '',
    priority: 'medium',
    riskLevel: RISK_LEVELS.MEDIUM,
    status: TICKET_STATUS.PENDING,
    approvalStatus: APPROVAL_STATUS.WAITING,
    executionMode: EXECUTION_MODE.DRY_RUN,
    reviewer: null,
    approver: null,
    rejectionReason: null,
    dispatchPlan: {},
    createdAt: now,
    updatedAt: now,
    metadata: {}
  };
}

// ============================================================================
// Snapshot Factory
// ============================================================================

/**
 * Create a ticket snapshot summary object.
 */
function createTicketSnapshot(tickets, meta) {
  tickets = Array.isArray(tickets) ? tickets : [];
  meta = meta || {};

  var byStatus = {};
  var byPriority = {};
  var byRisk = {};
  var approvalSummary = {
    waiting: 0,
    humanApproved: 0,
    humanRejected: 0
  };

  for (var i = 0; i < tickets.length; i++) {
    var t = tickets[i];
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    byRisk[t.riskLevel] = (byRisk[t.riskLevel] || 0) + 1;

    if (t.approvalStatus === APPROVAL_STATUS.WAITING) approvalSummary.waiting++;
    if (t.approvalStatus === APPROVAL_STATUS.HUMAN_APPROVED) approvalSummary.humanApproved++;
    if (t.approvalStatus === APPROVAL_STATUS.HUMAN_REJECTED) approvalSummary.humanRejected++;
  }

  return {
    total: tickets.length,
    byStatus: byStatus,
    byPriority: byPriority,
    byRisk: byRisk,
    approvalSummary: approvalSummary,
    generatedAt: new Date().toISOString(),
    meta: meta
  };
}

// ============================================================================
// Lightweight Validation (in types, for factory-level checks)
// ============================================================================

function _validateTicketBasic(ticket) {
  var errors = [];

  if (!ticket || typeof ticket !== 'object') {
    return { valid: false, errors: [{ code: TICKET_ERROR_CODES.INVALID_TICKET, message: 'Ticket must be an object' }] };
  }

  if (!ticket.ticketId || typeof ticket.ticketId !== 'string') {
    errors.push({ field: 'ticketId', code: TICKET_ERROR_CODES.INVALID_TICKET_ID, message: 'ticketId is required and must be a string' });
  }

  if (!TICKET_STATUS_VALUES.includes(ticket.status)) {
    errors.push({ field: 'status', code: TICKET_ERROR_CODES.INVALID_STATUS, message: 'Invalid ticket status: ' + ticket.status });
  }

  if (!APPROVAL_STATUS_VALUES.includes(ticket.approvalStatus)) {
    errors.push({ field: 'approvalStatus', code: TICKET_ERROR_CODES.INVALID_APPROVAL_STATUS, message: 'Invalid approval status: ' + ticket.approvalStatus });
  }

  if (!EXECUTION_MODE_VALUES.includes(ticket.executionMode)) {
    errors.push({ field: 'executionMode', code: TICKET_ERROR_CODES.INVALID_EXECUTION_MODE, message: 'Invalid execution mode: ' + ticket.executionMode });
  }

  if (FORBIDDEN_MODES.includes(ticket.executionMode)) {
    errors.push({ field: 'executionMode', code: TICKET_ERROR_CODES.FORBIDDEN_EXECUTION_MODE, message: 'Forbidden execution mode: ' + ticket.executionMode });
  }

  if (!RISK_LEVEL_VALUES.includes(ticket.riskLevel)) {
    errors.push({ field: 'riskLevel', code: TICKET_ERROR_CODES.INVALID_RISK_LEVEL, message: 'Invalid risk level: ' + ticket.riskLevel });
  }

  if (!ticket.dispatchPlanId || typeof ticket.dispatchPlanId !== 'string') {
    errors.push({ field: 'dispatchPlanId', code: TICKET_ERROR_CODES.MISSING_DISPATCH_PLAN_ID, message: 'dispatchPlanId is required' });
  }

  if (!ticket.goalId || typeof ticket.goalId !== 'string') {
    errors.push({ field: 'goalId', code: TICKET_ERROR_CODES.MISSING_GOAL_ID, message: 'goalId is required' });
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================================
// Transition Helpers
// ============================================================================

function isValidTransition(fromStatus, toStatus) {
  var allowed = ALLOWED_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
}

function isTerminalStatus(status) {
  return status === TICKET_STATUS.ARCHIVED;
}

function canBeApproved(ticket) {
  return ticket && ticket.status === TICKET_STATUS.PENDING;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // --- Status Enums ---
  TICKET_STATUS: TICKET_STATUS,
  TICKET_STATUS_VALUES: TICKET_STATUS_VALUES,
  APPROVAL_STATUS: APPROVAL_STATUS,
  APPROVAL_STATUS_VALUES: APPROVAL_STATUS_VALUES,
  EXECUTION_MODE: EXECUTION_MODE,
  EXECUTION_MODE_VALUES: EXECUTION_MODE_VALUES,
  FORBIDDEN_MODES: FORBIDDEN_MODES,
  RISK_LEVELS: RISK_LEVELS,
  RISK_LEVEL_VALUES: RISK_LEVEL_VALUES,

  // --- Mappings ---
  RISK_EXECUTION_MODE: RISK_EXECUTION_MODE,
  PRIORITY_RISK_MAP: PRIORITY_RISK_MAP,
  ALLOWED_TRANSITIONS: ALLOWED_TRANSITIONS,
  APPROVAL_TO_TICKET_STATUS: APPROVAL_TO_TICKET_STATUS,
  APPROVAL_TO_APPROVAL_STATUS: APPROVAL_TO_APPROVAL_STATUS,
  VALID_APPROVAL_ACTIONS: VALID_APPROVAL_ACTIONS,

  // --- Error Codes ---
  TICKET_ERROR_CODES: TICKET_ERROR_CODES,

  // --- Factory Functions ---
  createTicketId: createTicketId,
  createDispatchTicket: createDispatchTicket,
  createEmptyDispatchTicket: createEmptyDispatchTicket,
  createTicketSnapshot: createTicketSnapshot,

  // --- Validation ---
  _validateTicketBasic: _validateTicketBasic,

  // --- Helpers ---
  isValidTransition: isValidTransition,
  isTerminalStatus: isTerminalStatus,
  canBeApproved: canBeApproved
};
