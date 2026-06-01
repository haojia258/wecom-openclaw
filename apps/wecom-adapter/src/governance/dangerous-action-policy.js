// P48 Dangerous Action Policy — unified interceptor for all dangerous actions
// Flow: intercept → createApproval → audit → blockExecution (if not approved)

var riskClassifier = require('./risk-classifier');
var approvalEnforcer = require('./approval-enforcer');
var auditSink = require('./audit-sink');

// REVIEW_ONLY mode — enforced globally
var REVIEW_ONLY = true;

// Main interceptor
function intercept(action, context) {
  context = context || {};

  // 1. Identify if this is a dangerous action
  if (!riskClassifier.isDangerous(action)) {
    // Safe action — allow through, audit as INFO
    auditSink.sink({
      event_type: action + '_passed',
      action: action,
      status: 'info',
      user_id: context.userId,
      node_id: context.nodeId,
      metadata: context
    });
    return { blocked: false, reason: 'safe_action', auditLogged: true };
  }

  // 2. Dangerous action detected — block direct execution
  var risk = riskClassifier.getRiskLevel(action);

  // 3. Create approval requirement
  auditSink.sinkDangerous({
    event_type: 'dangerous_action_blocked',
    action: action,
    status: 'blocked_pending_approval',
    risk_level: risk,
    user_id: context.userId,
    node_id: context.nodeId,
    metadata: {
      reason: 'Dangerous action "' + action + '" requires approval',
      context: context
    }
  });

  return {
    blocked: true,
    reason: 'dangerous_action_requires_approval',
    riskLevel: risk,
    action: action,
    requiresApproval: true,
    message: 'ACTION BLOCKED: "' + action + '" (' + risk + '). Must go through approval → audit → execute.',
    approvalId: null // Approval ID to be set by approval system
  };
}

// Check if action can proceed (has valid approval)
function canProceed(action, approvalStatus, approvalId) {
  if (!REVIEW_ONLY) return { allowed: true }; // Emergency override (disabled by default)

  var enforcement = approvalEnforcer.enforce(approvalStatus, action, { approvalId: approvalId });

  if (!enforcement.allowed) {
    auditSink.sinkDangerous({
      event_type: 'dangerous_action_rejected',
      action: action,
      status: enforcement.reason,
      risk_level: riskClassifier.getRiskLevel(action),
      approval_id: approvalId,
      metadata: { enforcement: enforcement }
    });
  }

  return enforcement;
}

// REVIEW_ONLY gate
function isReviewOnly() {
  return REVIEW_ONLY;
}

module.exports = { intercept: intercept, canProceed: canProceed, isReviewOnly: isReviewOnly };
