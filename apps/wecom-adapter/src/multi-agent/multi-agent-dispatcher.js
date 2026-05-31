'use strict';

/**
 * multi-agent-dispatcher.js - P11.4 Multi-Agent Dispatcher
 * 
 * Dispatches DAG nodes to Agent Bus for parallel execution.
 */

var crypto = require('crypto');

function dispatchNode(plan, node) {
  var jobId = 'ab_' + node.agent + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex');
  node.job_id = jobId;
  node.status = 'dispatched';
  node.started_at = new Date().toISOString();
  return { success: true, job_id: jobId };
}

function dispatchExecutableNodes(plan) {
  var planner = require('./multi-agent-planner');
  var nodes = planner.getNextExecutableNodes(plan);
  var results = [];

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var result = dispatchNode(plan, node);
    results.push({ node_id: node.id, success: true, job_id: node.job_id });
  }

  updatePlanProgress(plan);
  return { success: true, dispatched: results, total: nodes.length };
}

function handleNodeCallback(plan, jobId, status, result) {
  var node = plan.nodes.find(function(n) { return n.job_id === jobId; });
  if (!node) return { success: false, error: 'node not found for job: ' + jobId };

  node.status = status === 'completed' ? 'completed' : 'failed';
  node.result = result || {};
  node.completed_at = new Date().toISOString();

  if (status === 'failed' && !node.can_fail) {
    plan.status = 'failed';
  }

  updatePlanProgress(plan);
  return { success: true, node: node, plan_progress: plan.progress };
}

function updatePlanProgress(plan) {
  var completed = 0, failed = 0;
  plan.nodes.forEach(function(n) {
    if (n.status === 'completed' || n.status === 'success') completed++;
    if (n.status === 'failed') failed++;
  });

  plan.completed_nodes = completed;
  plan.failed_nodes = failed;
  plan.progress = plan.total_nodes > 0 ? Math.round((completed / plan.total_nodes) * 100) : 0;

  if (completed + failed >= plan.total_nodes) {
    plan.status = failed > 0 ? 'partial_success' : 'completed';
  } else if (completed > 0) {
    plan.status = 'in_progress';
  }

  return plan;
}

module.exports = {
  dispatchNode: dispatchNode,
  dispatchExecutableNodes: dispatchExecutableNodes,
  handleNodeCallback: handleNodeCallback,
  updatePlanProgress: updatePlanProgress
};
