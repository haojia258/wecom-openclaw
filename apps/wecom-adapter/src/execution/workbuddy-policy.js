'use strict';

/**
 * workbuddy-policy.js - P11.2 WorkBuddy Execution Policy
 * 
 * Validates WorkBuddy actions against security policies.
 * Allowed / RequiresApproval / Forbidden with clear precedence.
 */

// ─── Policy Rules ──────────────────────────────────────────

// IMPORTANT: forbidden has HIGHEST priority
var FORBIDDEN_ACTIONS = [
  'env.write',
  'nginx.modify',
  'secrets.write',
  'vault.modify',
  'rm.rf',
  'shell.dangerous',
  'docker.prune',
  'system.user.modify'
];

var ACTIONS_REQUIRING_APPROVAL = [
  'git.merge',
  'pm2.restart',
  'deploy.production',
  'server.write'
];

var ALLOWED_ACTIONS = [
  'repo.status',
  'git.branch.create',
  'git.diff',
  'git.pr.create',
  'test.run',
  'audit.run',
  'staging.shadow',
  'report.write',
  'code.patch',
  'general.execute',
  'artifact.write',
  'mission.status',
  'callback.test'
];

// ─── Validation ────────────────────────────────────────────

/**
 * Validate a WorkBuddy action against policy.
 * 
 * @param {string} action - e.g. "git.branch.create"
 * @param {object} payload - optional payload for contextual checks
 * @returns {{ valid: boolean, allowed: boolean, requiresApproval: boolean, forbidden: boolean, reason: string }}
 */
function validateWorkBuddyAction(action, payload) {
  payload = payload || {};

  // 1. Forbidden check (HIGHEST priority)
  if (FORBIDDEN_ACTIONS.includes(action)) {
    return {
      valid: false,
      allowed: false,
      requiresApproval: false,
      forbidden: true,
      reason: 'forbidden action: ' + action
    };
  }

  // 2. Requires approval check
  if (ACTIONS_REQUIRING_APPROVAL.includes(action)) {
    return {
      valid: true,
      allowed: false,
      requiresApproval: true,
      forbidden: false,
      reason: 'action requires approval: ' + action
    };
  }

  // 3. Allowed check
  if (ALLOWED_ACTIONS.includes(action)) {
    return {
      valid: true,
      allowed: true,
      requiresApproval: false,
      forbidden: false,
      reason: 'allowed action: ' + action
    };
  }

  // 4. Unknown action → allowed but logged
  // In v0.1, unknown actions are allowed for extensibility
  return {
    valid: true,
    allowed: true,
    requiresApproval: false,
    forbidden: false,
    reason: 'unknown action (default allow): ' + action
  };
}

/**
 * Check if an action is in the allowed list.
 */
function isAllowed(action) {
  return ALLOWED_ACTIONS.includes(action);
}

/**
 * Check if an action requires approval.
 */
function requiresApproval(action) {
  return ACTIONS_REQUIRING_APPROVAL.includes(action);
}

/**
 * Check if an action is forbidden.
 */
function isForbidden(action) {
  return FORBIDDEN_ACTIONS.includes(action);
}

// ─── Payload validation ────────────────────────────────────

/**
 * Validate the payload size against policy.
 * Max 1MB for safety.
 */
function validatePayloadSize(payload) {
  if (!payload) return { valid: true };

  try {
    var size = Buffer.byteLength(JSON.stringify(payload), 'utf-8');
    if (size > 1024 * 1024) {
      return { valid: false, reason: 'payload exceeds 1MB limit' };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, reason: 'payload serialization failed' };
  }
}

/**
 * Generate a policy report for a job (for dispatch.json).
 */
function generatePolicyReport(action, payload) {
  var result = validateWorkBuddyAction(action, payload);

  return {
    action: action,
    timestamp: new Date().toISOString(),
    forbidden: result.forbidden,
    requires_approval: result.requiresApproval,
    allowed: result.allowed,
    reason: result.reason,
    policy_version: 'v0.1'
  };
}

// ─── Export ────────────────────────────────────────────────

module.exports = {
  validateWorkBuddyAction: validateWorkBuddyAction,
  generatePolicyReport: generatePolicyReport,
  validatePayloadSize: validatePayloadSize,
  isAllowed: isAllowed,
  requiresApproval: requiresApproval,
  isForbidden: isForbidden,
  FORBIDDEN_ACTIONS: FORBIDDEN_ACTIONS,
  ACTIONS_REQUIRING_APPROVAL: ACTIONS_REQUIRING_APPROVAL,
  ALLOWED_ACTIONS: ALLOWED_ACTIONS
};
