'use strict';

/**
 * test-task-graph.cjs — P11 Task Graph v0.1 test suite
 */

const taskGraph = require('./task-graph');
const assert = require('assert');

var passed = 0;
function ok(name) { passed++; console.log('  ✅ ' + name); }
function fail(name, e) { console.log('  ❌ ' + name + ': ' + e.message); process.exit(1); }

// ─── Create Graph ───
console.log('── Create Graph ──');
const g = taskGraph.createGraph({ title: 'P11 Test Graph', owner: 'dev', goal: 'Verify task graph engine' });
assert(g.id, 'Graph ID exists'); ok('Graph ID: ' + g.id);
assert(g.title === 'P11 Test Graph'); ok('Graph title correct');
assert(g.tasks && typeof g.tasks === 'object'); ok('Graph has tasks map');

// ─── Add Task ───
console.log('── Add Task ──');
const t = taskGraph.addTask(g.id, { title: 'Task1 - Design', role: 'developer', reviewRequired: true });
assert(t.taskId, 'Task ID exists'); ok('Task1 ID: ' + t.taskId);
assert(t.status === 'pending'); ok('Task1 status: pending');
assert(t.reviewRequired === true); ok('Task1 reviewRequired: true');

// ─── Update Status ───
console.log('── Update Status ──');
taskGraph.updateTaskStatus(g.id, t.taskId, 'running');
const updated = taskGraph.getGraph(g.id).tasks[t.taskId];
assert(updated.status === 'running'); ok('Task1 → running');

// Invalid status test
try {
  taskGraph.updateTaskStatus(g.id, t.taskId, 'invalid-status');
  fail('Should have thrown');
} catch (e) {
  ok('Invalid status rejected: ' + e.message);
}

// ─── Add Dependency ───
console.log('── Dependencies ──');
const t2 = taskGraph.addTask(g.id, { title: 'Task2 - Implement', role: 'developer' });
ok('Task2 created: ' + t2.taskId);

taskGraph.addDependency(g.id, t2.taskId, t.taskId);
const graph = taskGraph.getGraph(g.id);
assert(graph.tasks[t2.taskId].dependsOn.includes(t.taskId)); ok('Task2 depends on Task1');

// ─── Attach Artifact ───
console.log('── Artifacts ──');
taskGraph.attachArtifact(g.id, t.taskId, 'artifact-design-v1.md');
taskGraph.attachArtifact(g.id, t.taskId, 'artifact-review-v1.md');
const t1 = taskGraph.getGraph(g.id).tasks[t.taskId];
assert(t1.artifacts.includes('artifact-design-v1.md')); ok('Artifact 1 attached');
assert(t1.artifacts.includes('artifact-review-v1.md')); ok('Artifact 2 attached');
assert(t1.artifacts.length === 2); ok('Total 2 artifacts');

// ─── List Graphs ───
console.log('── List Graphs ──');
const list = taskGraph.listGraphs();
assert(list.length > 0); ok('List has ' + list.length + ' graph(s)');

// ─── Second Graph ───
console.log('── Second Graph ──');
const g2 = taskGraph.createGraph({ title: 'P11 Graph 2', owner: 'qa', goal: 'Test QA workflow' });
const t3 = taskGraph.addTask(g2.id, { title: 'QA Task', role: 'qa', reviewRequired: true });
taskGraph.updateTaskStatus(g2.id, t3.taskId, 'review');
ok('Graph2 Task status: ' + taskGraph.getGraph(g2.id).tasks[t3.taskId].status);

const list2 = taskGraph.listGraphs();
assert(list2.length === 2); ok('2 graphs total');

// ─── Update to Done ───
console.log('── Final Status ──');
taskGraph.updateTaskStatus(g.id, t.taskId, 'done');
taskGraph.updateTaskStatus(g.id, t2.taskId, 'done');
assert(taskGraph.getGraph(g.id).tasks[t.taskId].status === 'done'); ok('Task1 → done');
assert(taskGraph.getGraph(g.id).tasks[t2.taskId].status === 'done'); ok('Task2 → done');

console.log('\n✅ All P11 Task Graph tests passed (' + passed + ' assertions)');
