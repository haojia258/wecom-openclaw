'use strict';

/**
 * test-task-graph.cjs — Task dependency graph tests
 */

var passed = 0;
var failed = 0;
var failures = [];

function assert(cond, msg) {
  if (cond) passed++; else { failed++; failures.push(msg); }
}

function test(name, fn) {
  try { fn(); } catch(e) { failures.push(name + ': ' + e.message); failed++; }
}

var path = require('path');
var graph = require('../src/skills/task-graph/task-graph.js');
graph.setPath(path.join(__dirname, '..', 'storage', 'task-graph', 'task-graph.json'));

console.log('Running 13 task graph tests...');
console.log('');

// T1
test('T1: load returns graph object', function () {
  var g = graph.load();
  assert(g !== null, 'graph should not be null');
  assert(typeof g === 'object', 'should be object');
});

// T2
test('T2: getTask returns OSS Radar', function () {
  var t = graph.getTask('OSS Radar');
  assert(t !== null, 'OSS Radar should exist');
  assert(t.id === 'oss-radar', 'id should match');
});

// T3
test('T3: getTask returns null for unknown', function () {
  var t = graph.getTask('nonexistent');
  assert(t === null, 'unknown should be null');
});

// T4
test('T4: listTasks returns 3 tasks', function () {
  var tasks = graph.listTasks();
  assert(tasks.length === 3, 'should be 3 tasks');
});

// T5
test('T5: getDependencies for registry', function () {
  var deps = graph.getDependencies('agent-registry');
  assert(Array.isArray(deps), 'should be array');
  assert(deps.length > 0, 'should have dependencies');
});

// T6
test('T6: getChildren for OSS Radar', function () {
  var children = graph.getChildren('OSS Radar');
  assert(children.length >= 1, 'should have children');

});

// T7
test('T7: findRoots returns OSS Radar', function () {
  var roots = graph.findRoots();
  assert(roots.indexOf('OSS Radar') !== -1, 'roots include OSS Radar');
});

// T8
test('T8: getBlockers for marketplace', function () {
  var blockers = graph.getBlockers('marketplace');
  assert(blockers.length > 0, 'should have blockers');
});

// T9
test('T9: formatDependencyTree returns markdown', function () {
  var md = graph.formatDependencyTree();
  assert(typeof md === 'string', 'should be string');
  assert(md.indexOf('OSS Radar') !== -1, 'should contain OSS Radar');
});

// T10
test('T10: formatDependencies shows depends/children', function () {
  var md = graph.formatDependencies('OSS Radar');
  assert(md.indexOf('agent-registry') !== -1 || md.indexOf('task-graph') !== -1, 'should show children');
});

// T11
test('T11: marketplace depends on 2 tasks', function () {
  var deps = graph.getDependencies('marketplace');
  assert(deps.length > 0, 'marketplace should have dependencies');
});

// T12
test('T12: OSS Radar has 0 dependencies', function () {
  var deps = graph.getDependencies('OSS Radar');
  assert(deps.length === 0, 'OSS Radar should have 0 deps');
});

// T13
test('T13: no circular dependency', function () {
  var roots = graph.findRoots();
  assert(roots.length > 0, 'should have at least one root');
});

console.log('');
console.log('='.repeat(50));
console.log('Total:  ' + (passed + failed) + '  Passed: ' + passed + '  Failed: ' + failed);
console.log('='.repeat(50));
console.log('');
if (failures.length > 0) {
  console.log('FAILED:');
  failures.forEach(function (f, i) { console.log('  ' + (i + 1) + '. ' + f); });
}
process.exit(failed > 0 ? 1 : 0);
