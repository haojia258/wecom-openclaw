'use strict';

/**
 * multi-agent-policy.js - P11.4 Multi-Agent Policy Engine
 * 
 * Validates agent assignments, capability mappings, and security boundaries
 * for multi-agent missions.
 */

// ─── Agent-capability mapping ─────────────────────────────

var DEFAULT_AGENT_MAP = {
  'codex':      ['code.patch', 'docs.write', 'test.authoring', 'code.review', 'git.branch.create', 'git.diff'],
  'workbuddy':  ['server.audit', 'test.run', 'staging.shadow', 'deploy.review', 'git.pr.create', 'report.write'],
  'deepseek':   ['risk.analysis', 'audit.review', 'architecture.review', 'reasoning.review', 'report.write'],
  'doubao':     ['summary.write', 'report.write', 'wecom.reply', 'copy.write']
};

// ─── Mission-type → default agent assignments ─────────────

var MISSION_TO_AGENTS = {
  'development':    ['codex', 'workbuddy', 'deepseek'],
  'audit':          ['deepseek', 'workbuddy'],
  'deployment':     ['workbuddy', 'deepseek'],
  'report':         ['doubao', 'deepseek'],
  'full_cycle':     ['codex', 'workbuddy', 'deepseek', 'doubao'],
  'autonomous':     ['workbuddy'],
  'commerce':       ['codex', 'workbuddy', 'doubao'],
  'general':        ['workbuddy', 'deepseek']
};

// ─── Node template generator ──────────────────────────────

var NODE_TEMPLATES = {
  'code_development': { agent: 'codex',   capabilities: ['code.patch', 'docs.write'], label: 'Code Development' },
  'test_execution':   { agent: 'workbuddy', capabilities: ['test.run', 'staging.shadow'], label: 'Test Execution' },
  'risk_audit':       { agent: 'deepseek',  capabilities: ['risk.analysis', 'audit.review'], label: 'Risk Audit' },
  'report_generation': { agent: 'doubao',   capabilities: ['report.write', 'summary.write'], label: 'Report Generation' },
  'architecture_review': { agent: 'deepseek', capabilities: ['architecture.review'], label: 'Architecture Review' },
  'pr_management':    { agent: 'workbuddy', capabilities: ['git.pr.create', 'deploy.review'], label: 'PR Management' },
  'code_review':      { agent: 'codex',     capabilities: ['code.review'], label: 'Code Review' },
  'deploy_review':    { agent: 'workbuddy', capabilities: ['deploy.review', 'staging.shadow'], label: 'Deploy Review' }
};

// ─── Validation ───────────────────────────────────────────

function validateAgentMapping(agentType, capability) {
  var caps = DEFAULT_AGENT_MAP[agentType];
  if (!caps) return { valid: false, reason: 'unknown agent type: ' + agentType };
  return caps.includes(capability)
    ? { valid: true }
    : { valid: false, reason: agentType + ' does not support: ' + capability };
}

function getMissionAgents(missionType) {
  return MISSION_TO_AGENTS[missionType] || MISSION_TO_AGENTS['general'];
}

function getNodeTemplate(nodeType) {
  return NODE_TEMPLATES[nodeType] || null;
}

function generatePlanNodes(missionType, requirements) {
  requirements = requirements || {};
  var agents = getMissionAgents(missionType);
  var nodes = [];

  if (agents.includes('codex')) {
    nodes.push(generateNode('code_development', requirements));
    nodes.push(generateNode('code_review', requirements));
  }
  if (agents.includes('workbuddy')) {
    nodes.push(generateNode('test_execution', requirements));
    nodes.push(generateNode('pr_management', requirements));
  }
  if (agents.includes('deepseek')) {
    nodes.push(generateNode('risk_audit', requirements));
    nodes.push(generateNode('architecture_review', requirements));
  }
  if (agents.includes('doubao')) {
    nodes.push(generateNode('report_generation', requirements));
  }

  return nodes;
}

function generateNode(nodeType, requirements) {
  var tpl = NODE_TEMPLATES[nodeType];
  if (!tpl) return null;
  return {
    node_type: nodeType,
    agent: tpl.agent,
    capabilities: tpl.capabilities,
    label: tpl.label,
    required: true,
    can_fail: nodeType !== 'deploy_review'
  };
}

// ─── Export ────────────────────────────────────────────────

module.exports = {
  validateAgentMapping: validateAgentMapping,
  getMissionAgents: getMissionAgents,
  generatePlanNodes: generatePlanNodes,
  generateNode: generateNode,
  getNodeTemplate: getNodeTemplate,
  DEFAULT_AGENT_MAP: DEFAULT_AGENT_MAP,
  MISSION_TO_AGENTS: MISSION_TO_AGENTS,
  NODE_TEMPLATES: NODE_TEMPLATES
};
