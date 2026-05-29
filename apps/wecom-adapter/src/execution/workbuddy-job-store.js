'use strict';

/**
 * workbuddy-job-store.js - P11.2 WorkBuddy Job Store
 * 
 * In-memory job store with job lifecycle management.
 * States: created → queued → dispatched → running → completed/failed
 *                                     → waiting_approval (blocked)
 */

var crypto = require('crypto');

// ─── In-memory store ───────────────────────────────────────

var jobs = {};
var jobEvents = {};

// ─── Job lifecycle ─────────────────────────────────────────

var VALID_STATUSES = [
  'created', 'queued', 'dispatched', 'running',
  'waiting_approval', 'completed', 'failed', 'cancelled'
];

var STATUS_TRANSITIONS = {
  'created':          ['queued', 'waiting_approval', 'cancelled'],
  'queued':           ['dispatched', 'cancelled'],
  'dispatched':       ['running', 'failed', 'cancelled'],
  'running':          ['completed', 'failed', 'waiting_approval'],
  'waiting_approval': ['queued', 'dispatched', 'cancelled', 'failed'],
  'completed':        [],
  'failed':           ['created', 'cancelled'],
  'cancelled':        ['created']
};

// ─── Validation ────────────────────────────────────────────

function validateJobId(jobId) {
  if (!jobId || typeof jobId !== 'string') return false;
  return /^wb_[a-zA-Z0-9_]+$/.test(jobId);
}

function validateMissionId(missionId) {
  if (!missionId || typeof missionId !== 'string') return false;
  return /^[a-zA-Z0-9._-]+$/.test(missionId);
}

function validateAction(action) {
  if (!action || typeof action !== 'string') return false;
  return /^[a-z0-9]+(\.[a-z0-9]+)*$/.test(action);
}

// ─── CRUD ──────────────────────────────────────────────────

function createWorkBuddyJob(params) {
  var missionId = params.mission_id;
  var action = params.action;

  // Validate inputs
  if (!validateMissionId(missionId)) {
    return { success: false, error: 'invalid mission_id' };
  }
  if (!validateAction(action)) {
    return { success: false, error: 'invalid action' };
  }

  var jobId = 'wb_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
  var now = new Date().toISOString();

  var job = {
    job_id: jobId,
    mission_id: missionId,
    graph_id: params.graph_id || null,
    node_id: params.node_id || null,
    action: action,
    agent: params.agent || 'workbuddy',
    status: params.status || 'created',
    requiresApproval: params.requiresApproval || false,
    payload: params.payload || {},
    created_at: now,
    updated_at: now,
    dispatched_at: null,
    completed_at: null,
    result: null,
    queue_path: null
  };

  jobs[jobId] = job;
  jobEvents[jobId] = [];

  // Record creation event
  appendWorkBuddyEvent(jobId, {
    type: 'job_created',
    action: action,
    status: job.status,
    timestamp: now
  });

  return { success: true, job: job };
}

function getWorkBuddyJob(jobId) {
  if (!validateJobId(jobId)) {
    return { success: false, error: 'invalid job_id' };
  }
  if (!jobs[jobId]) {
    return { success: false, error: 'job not found' };
  }
  return {
    success: true,
    job: jobs[jobId],
    events: jobEvents[jobId] || []
  };
}

function listWorkBuddyJobs(filter) {
  var allJobs = Object.values(jobs);
  
  if (filter) {
    if (filter.mission_id) {
      allJobs = allJobs.filter(function(j) { return j.mission_id === filter.mission_id; });
    }
    if (filter.status) {
      allJobs = allJobs.filter(function(j) { return j.status === filter.status; });
    }
    if (filter.agent) {
      allJobs = allJobs.filter(function(j) { return j.agent === filter.agent; });
    }
    if (filter.action) {
      allJobs = allJobs.filter(function(j) { return j.action === filter.action; });
    }
  }

  // Sort by created_at descending
  allJobs.sort(function(a, b) {
    return b.created_at.localeCompare(a.created_at);
  });

  return { success: true, jobs: allJobs, total: allJobs.length };
}

function updateWorkBuddyJob(jobId, patch) {
  if (!validateJobId(jobId)) {
    return { success: false, error: 'invalid job_id' };
  }
  if (!jobs[jobId]) {
    return { success: false, error: 'job not found' };
  }

  var job = jobs[jobId];
  var now = new Date().toISOString();

  // Validate status transition
  if (patch.status) {
    if (!VALID_STATUSES.includes(patch.status)) {
      return { success: false, error: 'invalid status: ' + patch.status };
    }
    var allowedTransitions = STATUS_TRANSITIONS[job.status] || [];
    if (!allowedTransitions.includes(patch.status)) {
      return {
        success: false,
        error: 'invalid status transition: ' + job.status + ' → ' + patch.status
      };
    }
    job.status = patch.status;
    job.updated_at = now;

    // Set timestamps
    if (patch.status === 'dispatched' && !job.dispatched_at) {
      job.dispatched_at = now;
    }
    if ((patch.status === 'completed' || patch.status === 'failed') && !job.completed_at) {
      job.completed_at = now;
    }
  }

  // Update result
  if (patch.result) {
    job.result = patch.result;
    job.updated_at = now;
  }

  // Update payload
  if (patch.payload) {
    job.payload = Object.assign(job.payload, patch.payload);
    job.updated_at = now;
  }

  // Update graph_id / node_id
  if (patch.graph_id) job.graph_id = patch.graph_id;
  if (patch.node_id) job.node_id = patch.node_id;

  // Update queue path
  if (patch.queue_path) job.queue_path = patch.queue_path;

  // Record update event
  appendWorkBuddyEvent(jobId, {
    type: 'job_updated',
    patch: patch,
    status: job.status,
    timestamp: now
  });

  return { success: true, job: job };
}

function appendWorkBuddyEvent(jobId, event) {
  if (!jobEvents[jobId]) {
    jobEvents[jobId] = [];
  }

  var evt = {
    event_id: 'evt_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex'),
    timestamp: event.timestamp || new Date().toISOString(),
    type: event.type,
    data: event
  };

  jobEvents[jobId].push(evt);
  return { success: true, event: evt };
}

function getJobEvents(jobId) {
  if (!validateJobId(jobId)) {
    return { success: false, error: 'invalid job_id' };
  }
  if (!jobs[jobId]) {
    return { success: false, error: 'job not found' };
  }
  return {
    success: true,
    job_id: jobId,
    events: jobEvents[jobId] || []
  };
}

// ─── Approval ──────────────────────────────────────────────

function approveJob(jobId, approvalInfo) {
  if (!validateJobId(jobId)) {
    return { success: false, error: 'invalid job_id' };
  }
  if (!jobs[jobId]) {
    return { success: false, error: 'job not found' };
  }

  var job = jobs[jobId];
  if (job.status !== 'waiting_approval') {
    return { success: false, error: 'job is not waiting for approval' };
  }

  var result = updateWorkBuddyJob(jobId, { status: 'queued' });

  appendWorkBuddyEvent(jobId, {
    type: 'job_approved',
    approved_by: approvalInfo.operator || 'unknown',
    reason: approvalInfo.reason || '',
    timestamp: new Date().toISOString()
  });

  return result;
}

function rejectJob(jobId, rejectionInfo) {
  if (!validateJobId(jobId)) {
    return { success: false, error: 'invalid job_id' };
  }
  var job = jobs[jobId];
  if (!job) {
    return { success: false, error: 'job not found' };
  }

  if (job.status !== 'waiting_approval') {
    return { success: false, error: 'job is not waiting for approval' };
  }

  // Record rejection event first (before status change)
  appendWorkBuddyEvent(jobId, {
    type: 'job_rejected',
    rejected_by: rejectionInfo.operator || 'unknown',
    reason: rejectionInfo.reason || '',
    timestamp: new Date().toISOString()
  });

  // Then update status
  var result = updateWorkBuddyJob(jobId, { status: 'cancelled' });
  return result;
}

// ─── Stats ─────────────────────────────────────────────────

function getJobStoreStats() {
  var total = Object.keys(jobs).length;
  var byStatus = {};
  
  Object.values(jobs).forEach(function(j) {
    byStatus[j.status] = (byStatus[j.status] || 0) + 1;
  });

  return { total: total, by_status: byStatus };
}

// ─── Export ────────────────────────────────────────────────

module.exports = {
  createWorkBuddyJob: createWorkBuddyJob,
  getWorkBuddyJob: getWorkBuddyJob,
  listWorkBuddyJobs: listWorkBuddyJobs,
  updateWorkBuddyJob: updateWorkBuddyJob,
  appendWorkBuddyEvent: appendWorkBuddyEvent,
  getJobEvents: getJobEvents,
  approveJob: approveJob,
  rejectJob: rejectJob,
  getJobStoreStats: getJobStoreStats,
  VALID_STATUSES: VALID_STATUSES,
  STATUS_TRANSITIONS: STATUS_TRANSITIONS,
  validateJobId: validateJobId,
  validateAction: validateAction
};
