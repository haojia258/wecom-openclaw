'use strict';

/**
 * multi-agent-planner.js - P11.4 DAG Planner
 * 
 * Generates multi-agent task graphs from mission requirements.
 * Maps mission types to agent assignments with parallel execution support.
 */

var policy = require('./multi-agent-policy');
var crypto = require('crypto');

function generateId(prefix) {
  return (prefix || 'node') + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex');
}

/**
 * Create a mission plan with multi-agent DAG nodes.
 */
function createMissionPlan(params) {
  var missionId = params.mission_id || generateId('m');
  var missionType = params.mission_type || 'general';
  var requirements = params.requirements || {};

  var nodes = policy.generatePlanNodes(missionType, requirements);

  if (nodes.length === 0) {
    return { success: false, error: 'no agents available for mission type: ' + missionType };
  }

  // Build the DAG
  var graphNodes = [];
  var nodeIds = [];

  // Assign node IDs and dependencies
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var nodeId = generateId(node.agent);

    var deps = [];
    // Code review depends on code development
    if (node.node_type === 'code_review') {
      var codeNode = graphNodes.find(function(n) { return n.node_type === 'code_development'; });
      if (codeNode) deps.push(codeNode.id);
    }
    // PR management depends on test execution
    if (node.node_type === 'pr_management') {
      var testNode = graphNodes.find(function(n) { return n.node_type === 'test_execution'; });
      if (testNode) deps.push(testNode.id);
    }
    // Report depends on all others completing
    if (node.node_type === 'report_generation') {
      var others = graphNodes.filter(function(n) { return n.node_type !== 'report_generation'; });
      deps = others.map(function(n) { return n.id; });
    }

    graphNodes.push({
      id: nodeId,
      node_type: node.node_type,
      agent: node.agent,
      capabilities: node.capabilities,
      label: node.label,
      status: 'pending',
      dependencies: deps,
      required: node.required || true,
      can_fail: node.can_fail !== false,
      job_id: null,
      result: null,
      started_at: null,
      completed_at: null
    });
    nodeIds.push(nodeId);
  }

  // Determine which nodes can run in parallel (no dependencies on each other)
  var parallelGroups = computeParallelGroups(graphNodes);

  var plan = {
    mission_id: missionId,
    mission_type: missionType,
    graph_id: generateId('graph'),
    created_at: new Date().toISOString(),
    agents: policy.getMissionAgents(missionType),
    nodes: graphNodes,
    parallel_groups: parallelGroups,
    status: 'planned',
    progress: 0,
    total_nodes: graphNodes.length,
    completed_nodes: 0,
    failed_nodes: 0
  };

  return { success: true, plan: plan };
}

/**
 * Compute which nodes can execute in parallel groups.
 */
function computeParallelGroups(nodes) {
  var groups = [];
  var processed = {}; // Track which nodes have been placed in previous groups
  var remaining = nodes.slice();

  while (remaining.length > 0) {
    var group = [];
    var nextRound = [];

    for (var i = 0; i < remaining.length; i++) {
      var node = remaining[i];
      var depsMet = node.dependencies.every(function(depId) {
        return processed[depId] === true;
      });

      if (depsMet) {
        group.push(node);
      } else {
        nextRound.push(node);
      }
    }

    if (group.length === 0 && nextRound.length > 0) {
      // Stuck — circular dependency or orphan. Place remaining anyway.
      group = nextRound;
      nextRound = [];
    }

    for (var j = 0; j < group.length; j++) {
      processed[group[j].id] = true;
    }
    groups.push(group);
    remaining = nextRound;
  }

  return groups;
}

/**
 * Get next executable nodes from a plan.
 */
function getNextExecutableNodes(plan) {
  var executable = [];

  for (var i = 0; i < plan.nodes.length; i++) {
    var node = plan.nodes[i];
    if (node.status !== 'pending') continue;

    // Check if all dependencies are completed
    var depsReady = node.dependencies.every(function(depId) {
      var dep = plan.nodes.find(function(n) { return n.id === depId; });
      return dep && (dep.status === 'completed' || dep.status === 'success');
    });

    if (depsReady) {
      executable.push(node);
    }
  }

  return executable;
}

// ─── Export ────────────────────────────────────────────────

module.exports = {
  createMissionPlan: createMissionPlan,
  computeParallelGroups: computeParallelGroups,
  getNextExecutableNodes: getNextExecutableNodes,
  generateId: generateId
};
