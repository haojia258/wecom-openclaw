'use strict';

/**
 * agent-bus-routes.js - P11.3 Agent Bus Express Routes
 * 
 * API:
 *   POST /agent-bus/jobs              → Create agent job
 *   GET  /agent-bus/jobs              → List jobs (filterable)
 *   GET  /agent-bus/jobs/:job_id      → Get job + events
 *   POST /agent-bus/jobs/:job_id/dispatch → Dispatch
 *   POST /agent-bus/callback          → Unified callback
 *   GET  /agent-bus/agents            → List registered agents
 *   GET  /agent-bus/agents/:agent_id  → Get single agent
 */

var store = require('./agent-bus-store');
var policy = require('./agent-bus-policy');
var bus = require('./agent-bus');

var MAX_BODY = 16 * 1024;

function getBodySize(req) {
  if (!req.body) return 0;
  try { return Buffer.byteLength(JSON.stringify(req.body), 'utf-8'); } catch (_) { return 0; }
}

function registerAgentBusRoutes(app) {
  // POST /agent-bus/jobs
  app.post('/agent-bus/jobs', function(req, res) {
    if (getBodySize(req) > MAX_BODY) return res.status(413).json({ success: false, error: 'body too large' });

    var body = req.body || {};
    if (!body.agent_type || !body.action) {
      return res.status(400).json({ success: false, error: 'agent_type and action required' });
    }

    // Policy check
    var pResult = policy.validateAgentJob(body.agent_type, body.action, body.payload);
    if (pResult.forbidden) {
      return res.status(403).json({ success: false, error: pResult.reason, policy: policy.generatePolicyReport(body.agent_type, body.action, body.payload) });
    }

    var initialStatus = pResult.requiresApproval ? 'waiting_approval' : 'created';

    var result = store.createAgentJob({
      agent_type: body.agent_type,
      mission_id: body.mission_id || null,
      action: body.action,
      status: initialStatus,
      requiresApproval: pResult.requiresApproval || false,
      payload: body.payload || {}
    });

    if (!result.success) return res.status(400).json(result);

    res.status(201).json({
      success: true,
      job: result.job,
      policy: policy.generatePolicyReport(body.agent_type, body.action, body.payload)
    });
  });

  // GET /agent-bus/jobs
  app.get('/agent-bus/jobs', function(req, res) {
    var filter = {};
    if (req.query.mission_id) filter.mission_id = req.query.mission_id;
    if (req.query.agent_type) filter.agent_type = req.query.agent_type;
    if (req.query.status) filter.status = req.query.status;
    res.json(store.listAgentJobs(filter));
  });

  // GET /agent-bus/jobs/:job_id
  app.get('/agent-bus/jobs/:job_id', function(req, res) {
    var result = store.getAgentJob(req.params.job_id);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  });

  // POST /agent-bus/jobs/:job_id/dispatch
  app.post('/agent-bus/jobs/:job_id/dispatch', function(req, res) {
    var jr = store.getAgentJob(req.params.job_id);
    if (!jr.success) return res.status(404).json(jr);

    var job = jr.job;
    if (job.requiresApproval && job.status === 'waiting_approval') {
      return res.status(400).json({ success: false, error: 'job requires approval' });
    }

    if (job.status === 'created') {
      var qr = store.updateAgentJob(req.params.job_id, { status: 'queued' });
      if (!qr.success) return res.status(400).json(qr);
      job = qr.job;
    }

    var dResult = bus.dispatchJob(job);
    if (!dResult.success) return res.status(400).json(dResult);
    res.json(dResult);
  });

  // POST /agent-bus/callback
  app.post('/agent-bus/callback', function(req, res) {
    var body = req.body || {};
    if (getBodySize(req) > MAX_BODY) return res.status(413).json({ success: false, error: 'body too large' });

    var result = bus.processCallback(body.job_id, body);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  });

  // GET /agent-bus/agents
  app.get('/agent-bus/agents', function(req, res) {
    var filter = {};
    if (req.query.agent_type) filter.agent_type = req.query.agent_type;
    if (req.query.status) filter.status = req.query.status;
    res.json({ success: true, agents: store.listAgents(filter), total: store.listAgents(filter).length });
  });

  // GET /agent-bus/agents/:agent_id
  app.get('/agent-bus/agents/:agent_id', function(req, res) {
    var agent = store.getAgent(req.params.agent_id);
    if (!agent) return res.status(404).json({ success: false, error: 'agent not found' });
    var dc = store.canDispatch(req.params.agent_id);
    res.json({ success: true, agent: agent, dispatch_status: dc });
  });
}

// ─── Export ───────────────────────────────────────────────

module.exports = { registerAgentBusRoutes: registerAgentBusRoutes };
