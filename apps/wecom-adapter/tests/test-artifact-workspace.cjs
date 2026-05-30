/**
 * test-artifact-workspace.cjs — Artifact Workspace tests
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
var fs = require('fs');
var workspace = require('../src/skills/artifact-workspace/artifact-workspace.js');

// Test 1: Module exports
test('M1: module exports functions', function () {
  assert(typeof workspace.listArtifacts === 'function');
  assert(typeof workspace.listTasks === 'function');
  assert(typeof workspace.readArtifact === 'function');
  assert(typeof workspace.formatSummary === 'function');
});

test('M2: getWorkspaceSummary returns object', function () {
  var s = workspace.getWorkspaceSummary();
  assert(typeof s === 'object');
  assert(typeof s.tasks === 'number');
  assert(typeof s.files === 'number');
  assert(typeof s.sizeKB === 'string');
});

test('M3: formatSummary returns markdown', function () {
  var md = workspace.formatSummary();
  assert(md.indexOf('# Artifact Workspace') !== -1);
  assert(md.indexOf('Tasks') !== -1);
  assert(md.indexOf('Files') !== -1);
});

test('M4: formatTaskList returns markdown', function () {
  var md = workspace.formatTaskList();
  assert(md.indexOf('# Artifact Tasks') !== -1);
});

// Test 5: Source safety
test('S1: no child_process in source', function () {
  var src = fs.readFileSync(
    require.resolve('../src/skills/artifact-workspace/artifact-workspace.js'), 'utf-8');
  assert(src.indexOf('child_process') === -1);
});

test('S2: no exec/spawn in source', function () {
  var src = fs.readFileSync(
    require.resolve('../src/skills/artifact-workspace/artifact-workspace.js'), 'utf-8');
  assert(src.indexOf('exec(') === -1);
  assert(src.indexOf('spawn(') === -1);
});

// Run
console.log('Running ' + tests.length + ' artifact workspace tests...\n');
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
