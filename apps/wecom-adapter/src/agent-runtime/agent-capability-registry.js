'use strict';

/**
 * agent-capability-registry.js — P12 Agent Capability Registry v0.1
 *
 * REVIEW_ONLY=true — no deploy, no production mutation.
 * Maps agents to capabilities and task types.
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, 'agents');
const REQUIRED_FIELDS = ['agentId','name','role','capabilities','allowedTaskTypes','forbiddenActions','requiresHumanApproval','reviewOnly'];

/** @type {Object.<string, object>} */
var agents = {};

function loadAgents() {
  if (!fs.existsSync(AGENTS_DIR)) return;
  const files = fs.readdirSync(AGENTS_DIR).filter(function(f) { return f.endsWith('.json'); });
  agents = {};
  files.forEach(function(f) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, f), 'utf-8'));
      if (data.agentId && data.enabled !== false) {
        agents[data.agentId] = data;
      }
    } catch (e) { /* skip invalid */ }
  });
}

// Auto-load on require
loadAgents();

function listAgents() {
  return Object.values(agents).map(function(a) {
    return {
      agentId: a.agentId,
      name: a.name,
      role: a.role,
      provider: a.provider || 'unknown',
      capabilities: a.capabilities || [],
      allowedTaskTypes: a.allowedTaskTypes || [],
      reviewOnly: !!a.reviewOnly,
      requiresHumanApproval: !!a.requiresHumanApproval,
      maxConcurrentTasks: a.maxConcurrentTasks || 1,
      priority: a.priority || 0,
      enabled: true
    };
  });
}

function getAgent(agentId) {
  return agents[agentId] || null;
}

function findAgentsByCapability(capability) {
  return Object.values(agents).filter(function(a) {
    return (a.capabilities || []).indexOf(capability) >= 0;
  });
}

function findAgentsByTaskType(taskType) {
  return Object.values(agents).filter(function(a) {
    return (a.allowedTaskTypes || []).indexOf(taskType) >= 0;
  });
}

function canHandleTask(agentId, task) {
  var agent = agents[agentId];
  if (!agent) return false;

  // Check enabled
  if (agent.enabled === false) return false;

  // Check task type is allowed
  var taskType = (task && task.taskType) || (task && task.type) || '';
  if (taskType && (agent.allowedTaskTypes || []).indexOf(taskType) < 0) return false;

  // Check forbidden actions
  var action = (task && task.action) || '';
  if (action && (agent.forbiddenActions || []).indexOf(action) >= 0) return false;

  // Check capabilities overlap
  if (task && task.requiredCapability) {
    if ((agent.capabilities || []).indexOf(task.requiredCapability) < 0) return false;
  }

  return true;
}

function selectBestAgent(task) {
  var candidates = Object.values(agents).filter(function(a) {
    if (a.enabled === false) return false;

    var taskType = (task && task.taskType) || (task && task.type) || '';
    if (!taskType) return false;

    return (a.allowedTaskTypes || []).indexOf(taskType) >= 0;
  });

  if (candidates.length === 0) return null;

  // Sort by priority desc, then maxConcurrentTasks desc
  candidates.sort(function(a, b) {
    var pa = a.priority || 0;
    var pb = b.priority || 0;
    if (pa !== pb) return pb - pa;
    return (b.maxConcurrentTasks || 1) - (a.maxConcurrentTasks || 1);
  });

  return candidates[0].agentId;
}

function validateAgentConfig(agent) {
  var errors = [];
  REQUIRED_FIELDS.forEach(function(field) {
    if (agent[field] === undefined || agent[field] === null) {
      errors.push('Missing required field: ' + field);
    }
  });

  if (agent.capabilities && (!Array.isArray(agent.capabilities) || agent.capabilities.length === 0)) {
    errors.push('capabilities must be a non-empty array');
  }
  if (agent.allowedTaskTypes && (!Array.isArray(agent.allowedTaskTypes) || agent.allowedTaskTypes.length === 0)) {
    errors.push('allowedTaskTypes must be a non-empty array');
  }
  if (agent.reviewOnly !== true) {
    errors.push('reviewOnly must be true');
  }
  if (agent.requiresHumanApproval !== true) {
    errors.push('requiresHumanApproval must be true');
  }

  return { valid: errors.length === 0, errors: errors };
}

function reloadAgents() {
  loadAgents();
  return Object.keys(agents).length;
}

module.exports = {
  listAgents: listAgents,
  getAgent: getAgent,
  findAgentsByCapability: findAgentsByCapability,
  findAgentsByTaskType: findAgentsByTaskType,
  canHandleTask: canHandleTask,
  selectBestAgent: selectBestAgent,
  validateAgentConfig: validateAgentConfig,
  reloadAgents: reloadAgents,
  _loadAgents: loadAgents
};
