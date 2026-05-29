/**
 * agent-assignment — Barrel export
 * P9.6.4 Agent Assignment Matrix
 *
 * Provides capability-based agent-to-session matching for approved
 * Controlled Dispatch Sessions.
 */

'use strict';

var types = require('./agent-assignment-types');
var matrix = require('./agent-capability-matrix');
var validator = require('./agent-assignment-validator');
var runtime = require('./agent-assignment-runtime');

// ============================================================================
// Types
// ============================================================================
module.exports.AGENT = types.AGENT;
module.exports.AGENT_VALUES = types.AGENT_VALUES;
module.exports.ASSIGNMENT_STATUS = types.ASSIGNMENT_STATUS;
module.exports.ASSIGNMENT_STATUS_VALUES = types.ASSIGNMENT_STATUS_VALUES;
module.exports.ASSIGNMENT_MODE = types.ASSIGNMENT_MODE;
module.exports.ALLOWED_MODES = types.ALLOWED_MODES;
module.exports.FORBIDDEN_MODES = types.FORBIDDEN_MODES;
module.exports.ALLOWED_ASSIGNMENT_TRANSITIONS = types.ALLOWED_ASSIGNMENT_TRANSITIONS;
module.exports.CATEGORY_CAPABILITY_MAP = types.CATEGORY_CAPABILITY_MAP;
module.exports.CATEGORY_VALUES = types.CATEGORY_VALUES;
module.exports.AGENT_PRIORITY = types.AGENT_PRIORITY;
module.exports.ASSIGNMENT_ERROR_CODES = types.ASSIGNMENT_ERROR_CODES;

// Type factory functions
module.exports.createAssignmentId = types.createAssignmentId;
module.exports.createAssignmentPlan = types.createAssignmentPlan;
module.exports.createEmptyAssignmentPlan = types.createEmptyAssignmentPlan;
module.exports.createAssignmentSnapshot = types.createAssignmentSnapshot;

// Type helpers
module.exports.isValidAgent = types.isValidAgent;
module.exports.isTerminalAssignmentStatus = types.isTerminalAssignmentStatus;
module.exports.isValidAssignmentTransition = types.isValidAssignmentTransition;
module.exports.canUpdateAssignmentPlan = types.canUpdateAssignmentPlan;
module.exports.deriveRequiredCapabilities = types.deriveRequiredCapabilities;

// ============================================================================
// Capability Matrix
// ============================================================================
module.exports.AGENT_CAPABILITY_MATRIX = matrix.AGENT_CAPABILITY_MATRIX;
module.exports.CATEGORY_DEFAULT_AGENT = matrix.CATEGORY_DEFAULT_AGENT;

module.exports.getAgentCapabilities = matrix.getAgentCapabilities;
module.exports.listAgents = matrix.listAgents;
module.exports.listAgentNames = matrix.listAgentNames;
module.exports.matchAgentForSession = matrix.matchAgentForSession;
module.exports.agentHasCapability = matrix.agentHasCapability;
module.exports.getDefaultAgentForCategory = matrix.getDefaultAgentForCategory;

// ============================================================================
// Validator
// ============================================================================
module.exports.validateAssignmentPlan = validator.validateAssignmentPlan;
module.exports.validateSessionForAssignment = validator.validateSessionForAssignment;
module.exports.validateAgent = validator.validateAgent;
module.exports.validateCapabilities = validator.validateCapabilities;
module.exports.validateAssignmentTransition = validator.validateAssignmentTransition;
module.exports.validateBatchPlans = validator.validateBatchPlans;

// ============================================================================
// Runtime
// ============================================================================
module.exports.createAssignmentPlanFromSession = runtime.createAssignmentPlan;
module.exports.createAssignmentPlans = runtime.createAssignmentPlans;
module.exports.getAssignmentPlan = runtime.getAssignmentPlan;
module.exports.listAssignmentPlans = runtime.listAssignmentPlans;
module.exports.findAssignmentBySession = runtime.findAssignmentBySession;
module.exports.updateAssignmentStatus = runtime.updateAssignmentStatus;
module.exports.generateAssignmentSnapshot = runtime.generateAssignmentSnapshot;
module.exports.clearAllPlans = runtime.clearAllPlans;
module.exports.getPlanCount = runtime.getPlanCount;

// Convenience aliases
module.exports.createPlan = runtime.createAssignmentPlan;
module.exports.getPlan = runtime.getAssignmentPlan;
module.exports.listPlans = runtime.listAssignmentPlans;
module.exports.generateSnapshot = runtime.generateAssignmentSnapshot;

// ============================================================================
// Sub-module references (for test probing)
// ============================================================================
module.exports._types = types;
module.exports._matrix = matrix;
module.exports._validator = validator;
module.exports._runtime = runtime;
