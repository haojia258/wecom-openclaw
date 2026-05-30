'use strict';

/**
 * multi-agent-runtime.js - P11.4 Multi-Agent Runtime
 * 
 * Orchestrates multi-agent mission execution:
 * Plan → Capability Check → Heartbeat → Dispatch → Callback → Report
 */

var planner = require('./multi-agent-planner');
var dispatcher = require('./multi-agent-dispatcher');
var reportGen = require('./multi-agent-report');

// ─── In-memory mission store ──────────────────────────────

var missions = {};

// ─── Mission lifecycle ────────────────────────────────────

function createMission(params) {
  var planResult = planner.createMissionPlan({
    mission_id: params.mission_id || planner.generateId('m'),
    mission_type: params.mission_type || 'general',
    requirements: params.requirements || {}
  });

  if (!planResult.success) return planResult;

  var plan = planResult.plan;
  missions[plan.mission_id] = plan;

  // Generate initial report
  var report = reportGen.generateReport(plan);

  return {
    success: true,
    mission: {
      mission_id: plan.mission_id,
      mission_type: plan.mission_type,
      status: plan.status,
      agents: plan.agents,
      total_nodes: plan.total_nodes,
      progress: 0
    },
    plan: plan,
    report: report
  };
}

function getMission(missionId) {
  var plan = missions[missionId];
  if (!plan) return { success: false, error: 'mission not found' };
  return { success: true, mission: plan, report: reportGen.generateReport(plan) };
}

function listMissions() {
  var list = Object.values(missions);
  list.sort(function(a, b) { return b.created_at.localeCompare(a.created_at); });
  return { success: true, missions: list, total: list.length };
}

function runMission(missionId) {
  var plan = missions[missionId];
  if (!plan) return { success: false, error: 'mission not found' };
  if (plan.status === 'completed' || plan.status === 'failed') {
    return { success: false, error: 'mission already finished: ' + plan.status };
  }

  plan.status = 'in_progress';
  var result = dispatcher.dispatchExecutableNodes(plan);

  return {
    success: true,
    mission_id: missionId,
    status: plan.status,
    dispatched: result.dispatched,
    progress: plan.progress
  };
}

function handleCallback(missionId, body) {
  var plan = missions[missionId];
  if (!plan) return { success: false, error: 'mission not found' };

  var jobId = body.job_id;
  var status = body.status || 'completed';
  var result = body.result || {};

  var nodeResult = dispatcher.handleNodeCallback(plan, jobId, status, result);
  if (!nodeResult.success) return nodeResult;

  // Auto-dispatch next batch
  if (plan.status === 'in_progress') {
    dispatcher.dispatchExecutableNodes(plan);
  }

  return {
    success: true,
    mission_id: missionId,
    plan_status: plan.status,
    progress: plan.progress,
    node: nodeResult.node
  };
}

// ─── Export ────────────────────────────────────────────────

module.exports = {
  createMission: createMission,
  getMission: getMission,
  listMissions: listMissions,
  runMission: runMission,
  handleCallback: handleCallback
};
