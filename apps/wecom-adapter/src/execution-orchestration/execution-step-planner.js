/**
 * execution-step-planner.js
 * P9.7.3 — Generates standard 7-step dry-run plan.
 * No real execution. Steps are validation/preparation/checkpoint/finalization only.
 */
'use strict';
var t = require('./execution-orchestration-types');

function planExecutionSteps(executionSession, sandboxSession, options) {
  options = options || {};
  var steps = [];
  var defaults = t.DEFAULT_STEPS;

  for (var i = 0; i < defaults.length; i++) {
    var tmpl = defaults[i];
    steps.push(t.createStepPlan(tmpl.name, tmpl.type, tmpl.dependsOn.slice()));
  }
  return { success: true, steps: steps, count: steps.length };
}

function getDependencyGraph(steps) {
  var graph = {};
  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    if (!s || !s.name) continue;
    graph[s.name] = { step: s, dependsOn: s.dependsOn || [], dependents: [] };
  }
  var names = Object.keys(graph);
  for (var j = 0; j < names.length; j++) {
    var g = graph[names[j]];
    for (var k = 0; k < g.dependsOn.length; k++) {
      var dep = graph[g.dependsOn[k]];
      if (dep) dep.dependents.push(names[j]);
    }
  }
  return graph;
}

function getExecutableSteps(steps) {
  var graph = getDependencyGraph(steps);
  var ready = [];
  var names = Object.keys(graph);
  for (var i = 0; i < names.length; i++) {
    var g = graph[names[i]];
    if (g.step.status === t.STEP_STATUS.PENDING && g.dependsOn.length === 0) {
      ready.push(g.step);
    }
  }
  return { success: true, ready: ready, count: ready.length };
}

module.exports = { planExecutionSteps, getDependencyGraph, getExecutableSteps };
