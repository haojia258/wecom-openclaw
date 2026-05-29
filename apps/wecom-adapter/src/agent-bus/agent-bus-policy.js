'use strict';

/**
 * agent-bus-policy.js - P11.3 Agent Bus Policy Engine
 * 
 * Multi-agent unified policy: forbidden / requiresApproval / allowed.
 * Extends P11.2 WorkBuddy policy with agent-type-aware rules.
 */

// ─── Global forbidden (all agents) ────────────────────────

var GLOBAL_FORBIDDEN = [
  'env.write', 'nginx.modify', 'secrets.write', 'vault.modify',
  'rm.rf', 'shell.dangerous', 'docker.prune', 'system.user.modify'
];

// ─── Global requiresApproval (all agents) ─────────────────

var GLOBAL_REQUIRES_APPROVAL = [
  'git.merge', 'pm2.restart', 'deploy.production', 'server.write'
];

// ─── Agent-specific allowed actions ───────────────────────

var ALLOWED_BY_AGENT = {
  'workbuddy': ['test.run', 'server.audit', 'git.pr.create', 'staging.shadow', 'report.write', 'git.branch.create', 'git.diff', 'code.patch'],
  'codex':      ['code.patch', 'docs.write', 'code.review', 'test.authoring', 'git.branch.create', 'git.diff', 'git.pr.create', 'report.write'],
  'deepseek':   ['risk.analysis', 'audit.review', 'reasoning.review', 'architecture.review', 'report.write'],
  'doubao':     ['summary.write', 'copy.write', 'wecom.report', 'report.write'],
  'openclaw-runtime': ['general.execute', 'mission.status', 'artifact.write', 'report.write']
};

// ─── Degraded restrictions ────────────────────────────────

var PRODUCTION_SENSITIVE = ['deploy.production', 'pm2.restart', 'git.merge', 'server.write'];

// ─── Validation ───────────────────────────────────────────

/**
 * Full policy validation for an agent job.
 * Precedence: forbidden > requiresApproval > degraded block > allowed
 */
function validateAgentJob(agentType, action, payload, agentStatus) {
  payload = payload || {};
  agentStatus = agentStatus || 'online';

  // 1. Forbidden (HIGHEST priority, global)
  if (GLOBAL_FORBIDDEN.includes(action)) {
    return { valid: false, forbidden: true, reason: 'forbidden action: ' + action };
  }

  // 2. Degraded agent + production-sensitive → blocked (before requiresApproval)
  if (agentStatus === 'degraded' && PRODUCTION_SENSITIVE.includes(action)) {
    return { valid: false, forbidden: true, reason: 'degraded agent cannot execute production-sensitive: ' + action };
  }

  // 3. Requires approval (global)
  if (GLOBAL_REQUIRES_APPROVAL.includes(action)) {
    return { valid: true, requiresApproval: true, reason: 'requires approval: ' + action };
  }

  // 3. Degraded agent + production-sensitive → blocked
  if (agentStatus === 'degraded' && PRODUCTION_SENSITIVE.includes(action)) {
    return { valid: false, forbidden: true, reason: 'degraded agent cannot execute production-sensitive: ' + action };
  }

  // 4. Agent-specific allowed check
  var agentAllowed = ALLOWED_BY_AGENT[agentType] || [];
  if (agentAllowed.includes(action)) {
    return { valid: true, allowed: true, reason: 'allowed for ' + agentType + ': ' + action };
  }

  // 5. Unknown action → default allow (extensible)
  return { valid: true, allowed: true, reason: 'default allow for ' + agentType + ': ' + action };
}

function isForbidden(action) { return GLOBAL_FORBIDDEN.includes(action); }
function requiresApproval(action) { return GLOBAL_REQUIRES_APPROVAL.includes(action); }
function isProductionSensitive(action) { return PRODUCTION_SENSITIVE.includes(action); }

function generatePolicyReport(agentType, action, payload, agentStatus) {
  var result = validateAgentJob(agentType, action, payload, agentStatus);
  return {
    agent_type: agentType,
    action: action,
    timestamp: new Date().toISOString(),
    forbidden: result.forbidden || false,
    requires_approval: result.requiresApproval || false,
    allowed: result.allowed || false,
    reason: result.reason,
    policy_version: 'v0.1'
  };
}

// ─── Export ───────────────────────────────────────────────

module.exports = {
  validateAgentJob: validateAgentJob,
  generatePolicyReport: generatePolicyReport,
  isForbidden: isForbidden,
  requiresApproval: requiresApproval,
  isProductionSensitive: isProductionSensitive,
  GLOBAL_FORBIDDEN: GLOBAL_FORBIDDEN,
  GLOBAL_REQUIRES_APPROVAL: GLOBAL_REQUIRES_APPROVAL,
  ALLOWED_BY_AGENT: ALLOWED_BY_AGENT,
  PRODUCTION_SENSITIVE: PRODUCTION_SENSITIVE
};
