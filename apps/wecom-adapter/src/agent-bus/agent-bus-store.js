'use strict';

/**
 * agent-bus-store.js - P11.3 Agent Bus Store
 * 
 * Manages agent registry, agent jobs, and agent events.
 * Multi-agent job store with agent-type routing.
 */

var crypto = require('crypto');

// ─── Agent Registry ───────────────────────────────────────

var agents = {};

var AGENT_TYPES = ['workbuddy', 'codex', 'deepseek', 'doubao', 'openclaw-runtime'];

var AGENT_CAPABILITIES = {
  'workbuddy': ['test.run', 'server.audit', 'git.pr.create', 'staging.shadow', 'report.write', 'git.branch.create', 'git.diff'],
  'codex':      ['code.patch', 'docs.write', 'code.review', 'test.authoring', 'git.branch.create', 'git.diff', 'git.pr.create'],
  'deepseek':   ['risk.analysis', 'audit.review', 'reasoning.review', 'architecture.review', 'report.write'],
  'doubao':     ['summary.write', 'copy.write', 'wecom.report', 'report.write'],
  'openclaw-runtime': ['general.execute', 'mission.status', 'artifact.write', 'report.write']
};

var AGENT_STATUSES = ['online', 'offline', 'degraded', 'busy'];

function registerAgent(config) {
  var aid = config.agent_id || 'agent_' + Date.now().toString(36);
  var agentType = config.agent_type || 'openclaw-runtime';

  if (!AGENT_TYPES.includes(agentType)) {
    return { success: false, error: 'unknown agent type: ' + agentType };
  }

  agents[aid] = {
    agent_id: aid,
    agent_type: agentType,
    name: config.name || aid,
    status: config.status || 'online',
    capabilities: config.capabilities || (AGENT_CAPABILITIES[agentType] || []),
    registered_at: new Date().toISOString(),
    last_heartbeat: new Date().toISOString(),
    metadata: config.metadata || {}
  };

  return { success: true, agent: agents[aid] };
}

function getAgent(agentId) {
  if (!agents[agentId]) return null;
  return agents[agentId];
}

function listAgents(filter) {
  var list = Object.values(agents);
  if (filter) {
    if (filter.agent_type) list = list.filter(function(a) { return a.agent_type === filter.agent_type; });
    if (filter.status) list = list.filter(function(a) { return a.status === filter.status; });
  }
  return list;
}

function updateAgentStatus(agentId, status) {
  if (!AGENT_STATUSES.includes(status)) return { success: false, error: 'invalid status' };
  if (!agents[agentId]) return { success: false, error: 'agent not found' };
  agents[agentId].status = status;
  agents[agentId].last_heartbeat = new Date().toISOString();
  return { success: true, agent: agents[agentId] };
}

// ─── Agent Job Store ──────────────────────────────────────

var jobs = {};
var jobEvents = {};

var JOB_STATUSES = ['created', 'queued', 'dispatched', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled'];

var JOB_TRANSITIONS = {
  'created':          ['queued', 'waiting_approval', 'cancelled'],
  'queued':           ['dispatched', 'running', 'cancelled'],
  'dispatched':       ['running', 'completed', 'failed', 'cancelled'],
  'running':          ['completed', 'failed', 'waiting_approval'],
  'waiting_approval': ['queued', 'dispatched', 'cancelled', 'failed'],
  'completed':        [],
  'failed':           ['created', 'cancelled'],
  'cancelled':        ['created']
};

function createAgentJob(params) {
  var agentType = params.agent_type;

  if (!AGENT_TYPES.includes(agentType)) {
    return { success: false, error: 'unknown agent type: ' + agentType };
  }

  var jobId = 'ab_' + agentType + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex');
  var now = new Date().toISOString();

  var job = {
    job_id: jobId,
    mission_id: params.mission_id || null,
    graph_id: params.graph_id || null,
    node_id: params.node_id || null,
    agent_type: agentType,
    action: params.action || 'general.execute',
    status: params.status || 'created',
    requiresApproval: params.requiresApproval || false,
    payload: params.payload || {},
    created_at: now,
    updated_at: now,
    result: null
  };

  jobs[jobId] = job;
  jobEvents[jobId] = [];

  appendAgentEvent(jobId, { type: 'job_created', agent: agentType, timestamp: now });
  return { success: true, job: job };
}

function getAgentJob(jobId) {
  if (!jobs[jobId]) return { success: false, error: 'job not found' };
  return { success: true, job: jobs[jobId], events: jobEvents[jobId] || [] };
}

function listAgentJobs(filter) {
  var list = Object.values(jobs);
  if (filter) {
    if (filter.mission_id) list = list.filter(function(j) { return j.mission_id === filter.mission_id; });
    if (filter.agent_type) list = list.filter(function(j) { return j.agent_type === filter.agent_type; });
    if (filter.status) list = list.filter(function(j) { return j.status === filter.status; });
  }
  list.sort(function(a, b) { return b.created_at.localeCompare(a.created_at); });
  return { success: true, jobs: list, total: list.length };
}

function updateAgentJob(jobId, patch) {
  if (!jobs[jobId]) return { success: false, error: 'job not found' };
  var job = jobs[jobId];
  var now = new Date().toISOString();

  if (patch.status) {
    if (!JOB_STATUSES.includes(patch.status)) return { success: false, error: 'invalid status' };
    var allowed = JOB_TRANSITIONS[job.status] || [];
    if (!allowed.includes(patch.status)) return { success: false, error: 'invalid transition: ' + job.status + ' → ' + patch.status };
    job.status = patch.status;
    job.updated_at = now;
  }

  if (patch.result) { job.result = patch.result; job.updated_at = now; }
  if (patch.payload) { job.payload = Object.assign(job.payload || {}, patch.payload); job.updated_at = now; }

  appendAgentEvent(jobId, { type: 'job_updated', patch: patch, timestamp: now });
  return { success: true, job: job };
}

function appendAgentEvent(jobId, event) {
  if (!jobEvents[jobId]) jobEvents[jobId] = [];
  jobEvents[jobId].push({
    event_id: 'evt_' + Date.now().toString(36),
    timestamp: event.timestamp || new Date().toISOString(),
    type: event.type,
    data: event
  });
  return { success: true };
}

// ─── Dispatch check ───────────────────────────────────────

function canDispatch(agentId) {
  var agent = agents[agentId];
  if (!agent) return { can_dispatch: false, reason: 'agent not registered' };
  if (agent.status === 'offline') return { can_dispatch: false, reason: 'agent offline' };
  if (agent.status === 'degraded') return { can_dispatch: true, degraded: true, reason: 'agent degraded — production-sensitive capabilities blocked' };
  return { can_dispatch: true, degraded: false, reason: 'agent available' };
}

// ─── Stats ────────────────────────────────────────────────

function getBusStats() {
  var totalJobs = Object.keys(jobs).length;
  var byAgent = {};
  var byStatus = {};
  Object.values(jobs).forEach(function(j) {
    byAgent[j.agent_type] = (byAgent[j.agent_type] || 0) + 1;
    byStatus[j.status] = (byStatus[j.status] || 0) + 1;
  });
  return { agents: Object.keys(agents).length, jobs: totalJobs, by_agent: byAgent, by_status: byStatus };
}

// ─── Export ───────────────────────────────────────────────

module.exports = {
  registerAgent: registerAgent,
  getAgent: getAgent,
  listAgents: listAgents,
  updateAgentStatus: updateAgentStatus,
  createAgentJob: createAgentJob,
  getAgentJob: getAgentJob,
  listAgentJobs: listAgentJobs,
  updateAgentJob: updateAgentJob,
  appendAgentEvent: appendAgentEvent,
  canDispatch: canDispatch,
  getBusStats: getBusStats,
  AGENT_TYPES: AGENT_TYPES,
  AGENT_CAPABILITIES: AGENT_CAPABILITIES,
  AGENT_STATUSES: AGENT_STATUSES,
  JOB_STATUSES: JOB_STATUSES
};
