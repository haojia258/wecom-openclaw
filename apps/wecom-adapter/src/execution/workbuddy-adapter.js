'use strict';

/**
 * workbuddy-adapter.js - P11.2 WorkBuddy Execution Adapter
 * 
 * Registers Express routes for WorkBuddy job management and dispatch.
 * Creates file-based queue for v0.1 (no real WorkBuddy API dependency).
 */

var path = require('path');
var fs = require('fs');
var jobStore = require('./workbuddy-job-store');
var policy = require('./workbuddy-policy');
var reporter = require('../commander/commander-report');

// ─── Constants ─────────────────────────────────────────────

var MAX_BODY_SIZE = 16 * 1024; // 16KB
var MAX_TEXT_LENGTH = 2000;
var QUEUE_DIR = null;

function getQueueDir() {
  if (QUEUE_DIR) return QUEUE_DIR;
  var root = process.env.ARTIFACT_WORKSPACE_ROOT;
  if (!root) {
    root = path.resolve(__dirname, '..', '..', '..', '..', '..', 'workspace', 'artifacts');
  }
  QUEUE_DIR = path.join(root, 'workbuddy', 'queue');
  return QUEUE_DIR;
}

// ─── Helpers ───────────────────────────────────────────────

function getBodySize(req) {
  var body = req.body;
  if (!body) return 0;
  try { return Buffer.byteLength(JSON.stringify(body), 'utf-8'); } catch (e) { return 0; }
}

function parseJson(str) {
  try { return typeof str === 'string' ? JSON.parse(str) : str; } catch (e) { return str; }
}

// ─── Route Registration ────────────────────────────────────

function registerWorkBuddyRoutes(app) {
  // JSON body parser for execution routes
  app.use('/execution/workbuddy', require('express').json({ limit: '16kb' }));

  // POST /execution/workbuddy/jobs - Create job
  app.post('/execution/workbuddy/jobs', function(req, res) {
    var bodySize = getBodySize(req);
    if (bodySize > MAX_BODY_SIZE) {
      return res.status(413).json({ success: false, error: 'body too large (max 16KB)' });
    }

    var body = req.body || {};

    // Validate inputs
    if (!body.mission_id || !body.action) {
      return res.status(400).json({ success: false, error: 'mission_id and action are required' });
    }

    if (!jobStore.validateMissionId(body.mission_id)) {
      return res.status(400).json({ success: false, error: 'invalid mission_id' });
    }

    if (!jobStore.validateAction(body.action)) {
      return res.status(400).json({ success: false, error: 'invalid action' });
    }

    // Run policy
    var policyResult = policy.validateWorkBuddyAction(body.action, body.payload);

    // Forbidden → 403
    if (policyResult.forbidden) {
      return res.status(403).json({
        success: false,
        error: policyResult.reason,
        policy: policy.generatePolicyReport(body.action, body.payload)
      });
    }

    // Determine initial status
    var initialStatus = policyResult.requiresApproval ? 'waiting_approval' : 'created';
    var requiresApproval = policyResult.requiresApproval;

    // Create job
    var result = jobStore.createWorkBuddyJob({
      mission_id: body.mission_id,
      graph_id: body.graph_id || null,
      node_id: body.node_id || null,
      action: body.action,
      agent: body.agent || 'workbuddy',
      status: initialStatus,
      requiresApproval: requiresApproval,
      payload: body.payload || {}
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json({
      success: true,
      job: result.job,
      policy: policy.generatePolicyReport(body.action, body.payload)
    });
  });

  // GET /execution/workbuddy/jobs - List jobs
  app.get('/execution/workbuddy/jobs', function(req, res) {
    var filter = {};
    if (req.query.mission_id) filter.mission_id = req.query.mission_id;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.agent) filter.agent = req.query.agent;
    if (req.query.action) filter.action = req.query.action;

    var result = jobStore.listWorkBuddyJobs(filter);
    res.json(result);
  });

  // GET /execution/workbuddy/jobs/:job_id - Get single job
  app.get('/execution/workbuddy/jobs/:job_id', function(req, res) {
    var result = jobStore.getWorkBuddyJob(req.params.job_id);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  });

  // POST /execution/workbuddy/jobs/:job_id/approve
  app.post('/execution/workbuddy/jobs/:job_id/approve', function(req, res) {
    var result = jobStore.approveJob(req.params.job_id, {
      operator: (req.body || {}).operator || 'unknown',
      reason: (req.body || {}).reason || ''
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json({ success: true, job: result.job });
  });

  // POST /execution/workbuddy/jobs/:job_id/reject
  app.post('/execution/workbuddy/jobs/:job_id/reject', function(req, res) {
    var result = jobStore.rejectJob(req.params.job_id, {
      operator: (req.body || {}).operator || 'unknown',
      reason: (req.body || {}).reason || ''
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json({ success: true, job: result.job });
  });

  // POST /execution/workbuddy/jobs/:job_id/dispatch
  app.post('/execution/workbuddy/jobs/:job_id/dispatch', function(req, res) {
    var jobResult = jobStore.getWorkBuddyJob(req.params.job_id);
    if (!jobResult.success) {
      return res.status(404).json(jobResult);
    }

    var job = jobResult.job;
    
    // Only allowed jobs can be dispatched
    if (job.requiresApproval && job.status !== 'queued') {
      if (job.status === 'waiting_approval') {
        return res.status(400).json({ success: false, error: 'job requires approval before dispatch' });
      }
    }

    // If job is in 'created' status, transition to 'queued' first
    if (job.status === 'created') {
      var queuedResult = jobStore.updateWorkBuddyJob(req.params.job_id, { status: 'queued' });
      if (!queuedResult.success) {
        return res.status(400).json(queuedResult);
      }
      job = queuedResult.job;
    }

    // Update status to dispatched
    var updateResult = jobStore.updateWorkBuddyJob(req.params.job_id, { status: 'dispatched' });
    if (!updateResult.success) {
      return res.status(400).json(updateResult);
    }

    // Write queue file
    try {
      var queueDir = getQueueDir();
      if (!fs.existsSync(queueDir)) {
        fs.mkdirSync(queueDir, { recursive: true });
      }
      
      var queueFile = path.join(queueDir, req.params.job_id + '.json');
      var queueData = {
        job_id: job.job_id,
        mission_id: job.mission_id,
        action: job.action,
        agent: job.agent,
        payload: job.payload,
        dispatched_at: new Date().toISOString(),
        status: 'dispatched'
      };
      
      fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

      jobStore.updateWorkBuddyJob(req.params.job_id, { queue_path: queueFile });

      res.json({ 
        success: true, 
        job: updateResult.job,
        queue_file: queueFile
      });
    } catch (e) {
      res.status(500).json({ success: false, error: 'queue file write failed: ' + e.message });
    }
  });

  // POST /execution/workbuddy/callback - Execution result callback
  app.post('/execution/workbuddy/callback', function(req, res) {
    var body = req.body || {};
    var jobId = body.job_id;

    if (!jobId || !jobStore.validateJobId(jobId)) {
      return res.status(400).json({ success: false, error: 'invalid job_id' });
    }

    var bodySize = getBodySize(req);
    if (bodySize > MAX_BODY_SIZE) {
      return res.status(413).json({ success: false, error: 'body too large' });
    }

    var jobResult = jobStore.getWorkBuddyJob(jobId);
    if (!jobResult.success) {
      return res.status(404).json(jobResult);
    }

    // Update status
    var newStatus = body.status || 'completed';
    var updateResult = jobStore.updateWorkBuddyJob(jobId, {
      status: newStatus,
      result: body.result || {}
    });

    if (!updateResult.success) {
      return res.status(400).json(updateResult);
    }

    // Record callback event
    jobStore.appendWorkBuddyEvent(jobId, {
      type: 'callback_received',
      status: newStatus,
      message: body.message || '',
      result: body.result || {},
      timestamp: new Date().toISOString()
    });

    // Write artifacts
    try {
      var job = updateResult.job;
      
      // workbuddy-result.json
      reporter.writeMissionArtifact(job.mission_id, 'workbuddy-result.json', JSON.stringify({
        job_id: jobId,
        mission_id: job.mission_id,
        action: job.action,
        status: newStatus,
        result: body.result || {},
        timestamp: new Date().toISOString()
      }, null, 2));

      // test-report.json (if test results present)
      if (body.result && body.result.tests) {
        reporter.writeMissionArtifact(job.mission_id, 'test-report.json', JSON.stringify({
          job_id: jobId,
          tests: body.result.tests,
          timestamp: new Date().toISOString()
        }, null, 2));
      }

      // audit.md (if audit data present)
      if (body.result && body.result.audit) {
        reporter.writeMissionArtifact(job.mission_id, 'audit.md', 
          '# WorkBuddy Audit Report\n\n' +
          '**Job:** ' + jobId + '\n\n' +
          '**Action:** ' + job.action + '\n\n' +
          '**Result:** ' + JSON.stringify(body.result.audit, null, 2) + '\n'
        );
      }
    } catch (e) {
      // Artifact write failure is non-fatal
      jobStore.appendWorkBuddyEvent(jobId, {
        type: 'artifact_write_failed',
        error: e.message,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      job: updateResult.job,
      artifacts_written: true
    });
  });
}

// ─── Export ────────────────────────────────────────────────

module.exports = {
  registerWorkBuddyRoutes: registerWorkBuddyRoutes,
  getQueueDir: getQueueDir
};
