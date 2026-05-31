'use strict';

/**
 * agent-bus.js - P11.3 Agent Bus Core
 * 
 * Main bus: unified dispatch to WorkBuddy/Codex/DeepSeek/Doubao.
 * Routes to appropriate adapter based on agent type.
 */

var store = require('./agent-bus-store');
var policy = require('./agent-bus-policy');

// ─── Dispatch ──────────────────────────────────────────────

/**
 * Dispatch a job to the appropriate agent adapter.
 * v0.1 file-queue mode: writes to workspace/artifacts/agent-bus/queue/<agent_type>/<job_id>.json
 */
function dispatchJob(job, opts) {
  opts = opts || {};

  // Check agent availability
  var agentId = opts.agent_id || job.agent_type;
  var dispatchCheck = store.canDispatch(agentId);
  if (!dispatchCheck.can_dispatch) {
    return { success: false, error: dispatchCheck.reason };
  }

  // Check degraded + production-sensitive
  if (dispatchCheck.degraded && policy.isProductionSensitive(job.action)) {
    return { success: false, error: 'degraded agent blocked from production-sensitive action: ' + job.action };
  }

  // Update status
  var result = store.updateAgentJob(job.job_id, { status: 'dispatched' });
  if (!result.success) return result;

  // Write queue file
  try {
    var path = require('path');
    var fs = require('fs');
    var root = process.env.ARTIFACT_WORKSPACE_ROOT;
    if (!root) root = path.resolve(__dirname, '..', '..', '..', '..', '..', 'workspace', 'artifacts');
    var queueDir = path.join(root, 'agent-bus', 'queue', job.agent_type);
    if (!fs.existsSync(queueDir)) fs.mkdirSync(queueDir, { recursive: true });
    
    var queueFile = path.join(queueDir, job.job_id + '.json');
    fs.writeFileSync(queueFile, JSON.stringify({
      job_id: job.job_id,
      agent_type: job.agent_type,
      action: job.action,
      payload: job.payload,
      dispatched_at: new Date().toISOString()
    }, null, 2), 'utf-8');

    store.appendAgentEvent(job.job_id, { type: 'dispatched_to_queue', queue_file: queueFile });

    return { success: true, job: result.job, queue_file: queueFile };
  } catch (e) {
    return { success: false, error: 'queue write failed: ' + e.message };
  }
}

// ─── Adapter routing ──────────────────────────────────────

/**
 * Get adapter module path for an agent type.
 * Currently routes all to file-queue (v0.1).
 */
function getAdapterForAgent(agentType) {
  var adapters = {
    'workbuddy': 'workbuddy-file-queue',
    'codex': 'codex-file-queue',
    'deepseek': 'deepseek-file-queue',
    'doubao': 'doubao-file-queue',
    'openclaw-runtime': 'openclaw-file-queue'
  };
  return adapters[agentType] || 'file-queue';
}

// ─── Unified callback ─────────────────────────────────────

/**
 * Process a callback from any agent type.
 */
function processCallback(jobId, body) {
  var jobResult = store.getAgentJob(jobId);
  if (!jobResult.success) return jobResult;

  var job = jobResult.job;
  var newStatus = body.status || 'completed';

  var result = store.updateAgentJob(jobId, {
    status: newStatus,
    result: body.result || {}
  });

  if (!result.success) return result;

  store.appendAgentEvent(jobId, {
    type: 'callback_received',
    agent: job.agent_type,
    status: newStatus,
    result: body.result || {},
    timestamp: new Date().toISOString()
  });

  return { success: true, job: result.job };
}

// ─── Export ───────────────────────────────────────────────

module.exports = {
  dispatchJob: dispatchJob,
  getAdapterForAgent: getAdapterForAgent,
  processCallback: processCallback
};
