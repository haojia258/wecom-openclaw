/**
 * test-task-graph.cjs — Task Graph tests
 */
'use strict';

var tests = [];
var passed = 0;
var failed = 0;
var errors = [];

function test(name, fn) { tests.push({ name: name, fn: fn }); }
function assert(condition, message) {
  if (!condition) { throw new Error(message || 'Assertion failed'); }
}

var path = require('path');
var graph = require('../src/skills/task-graph/task-graph.js');
graph.setPath(path.join(__dirname, '..', '..', 'storage', 'task-graph', 'task-graph.json'));

test('T1: load returns graph object', function () {
  var g = graph.load();
  assert(typeof g === 'object');
  assert(g.tasks);
});

test('T2: getTask returns OSS Radar', function () {
  var t = graph.getTask('p11-oss-radar');
  assert(t.name === 'OSS Radar');
  assert(t.children.length === 2);
});

test('T3: getTask returns null for unknown', function () {
  assert(graph.getTask('nonexistent') === null);
});

test('T4: listTasks returns 3 tasks', function () {
  var list = graph.listTasks();
  assert(list.length === 3);
});

test('T5: getDependencies for registry', function () {
  var deps = graph.getDependencies('p11-registry');
  assert(deps.length === 1);
  assert(deps[0].id === 'p11-oss-radar');
});

test('T6: getChildren for OSS Radar', function () {
  var children = graph.getChildren('p11-oss-radar');
  assert(children.length === 2);
});

test('T7: findRoots returns OSS Radar', function () {
  var roots = graph.findRoots();
  assert(roots.indexOf('p11-oss-radar') !== -1);
  assert(roots.length === 1);
});

test('T8: getBlockers for marketplace', function () {
  var blockers = graph.getBlockers('p11-marketplace');
  assert(blockers.indexOf('p11-oss-radar') !== -1);
  assert(blockers.indexOf('p11-registry') !== -1);
});

test('T9: formatDependencyTree returns markdown', function () {
  var tree = graph.formatDependencyTree();
  assert(tree.indexOf('OSS Radar') !== -1);
  assert(tree.indexOf('Registry') !== -1);
  assert(tree.indexOf('Marketplace') !== -1);
});

test('T10: formatDependencies shows depends/children', function () {
  var dep = graph.formatDependencies('p11-registry');
  assert(dep.indexOf('Depends On') !== -1);
  assert(dep.indexOf('p11-oss-radar') !== -1);
  assert(dep.indexOf('Children') !== -1);
});

test('T11: marketplace depends on 2 tasks', function () {
  var t = graph.getTask('p11-marketplace');
  assert(t.dependsOn.length === 2);
});

test('T12: OSS Radar has 0 dependencies', function () {
  var t = graph.getTask('p11-oss-radar');
  assert(t.dependsOn.length === 0);
});

test('T13: no circular dependency', function () {
  var visited = [];
  function check(id) {
    if (visited.indexOf(id) !== -1) return;
    visited.push(id);
    var t = graph.getTask(id);
    if (t && t.children) t.children.forEach(check);
  }
  check('p11-oss-radar');
  assert(visited.length === 3);
});

// Run
console.log('Running ' + tests.length + ' task graph tests...\n');
tests.forEach(function (t) {
  try { t.fn(); passed++; process.stdout.write('.'); }
  catch (e) { failed++; errors.push({ name: t.name, error: e.message }); process.stdout.write('F'); }
});
console.log('\n\n' + '='.repeat(50));
console.log('Total:  ' + tests.length + '  Passed: ' + passed + '  Failed: ' + failed);
console.log('='.repeat(50));
if (failed > 0) { console.log('\nFAILED:'); errors.forEach(function(e){console.log('  '+e.name+': '+e.error);}); process.exit(1); }
console.log('\nAll tests passed!\n');
process.exit(0);
