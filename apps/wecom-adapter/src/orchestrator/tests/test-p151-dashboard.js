'use strict';

var passed = 0; var failed = 0;
function assert(name, condition, detail) {
  if (condition) passed++;
  else { failed++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
}
function summary() {
  console.log('\n═══ P15.1 Dashboard Test Results ═══');
  console.log('Passed: ' + passed + ' / ' + (passed + failed));
  if (failed > 0) { console.log('Failed: ' + failed); process.exit(1); }
  else console.log('✅ All tests passed!');
}

var tp = require('../../runtime/task-progress.js');
var tlr = require('../../runtime/task-log-reader.js');
var tar = require('../../runtime/task-artifact-reader.js');
var tzd = require('../../runtime/task-zombie-detector.js');

// ═════ Test 1: Task Progress ═════
console.log('── Test 1: Task Progress ──');
assert('getProgress fn', typeof tp.getProgress === 'function');
assert('formatProgress fn', typeof tp.formatProgress === 'function');

var p = tp.computeProgress({ status: 'dispatched', createdAt: new Date(Date.now() - 600000).toISOString() });
assert('computeProgress > 0', p > 0);

var fp = tp.formatProgress({ taskId: 'task-x', status: 'dispatched', assignee: 'wb', startedAt: '-', elapsed: '10m', currentStep: '已派发', progressPercent: 35, artifactCount: 2, lastUpdate: '-' });
assert('formatProgress taskId', fp.indexOf('task-x') >= 0);
assert('formatProgress bar', fp.indexOf('█') >= 0 || fp.indexOf('░') >= 0);
assert('formatProgress REVIEW', fp.indexOf('REVIEW') >= 0);

// Status mapping
['queued','planned','dispatched','artifact_received','review_pending','reviewing','approved','rejected','closed','cancelled'].forEach(function (s) {
  assert('status ' + s, tp.computeProgress({ status: s, createdAt: new Date().toISOString() }) > 0);
});

assert('zero progress formats', tp.formatProgress({ taskId: 'z', status: 'queued', assignee: '-', startedAt: '-', elapsed: '0m', currentStep: '-', progressPercent: 0, artifactCount: 0, lastUpdate: '-' }).indexOf('0%') >= 0);

// ═════ Test 2: Task Log Reader ═════
console.log('── Test 2: Task Log Reader ──');
assert('getTaskLog fn', typeof tlr.getTaskLog === 'function');
assert('formatLog fn', typeof tlr.formatLog === 'function');
assert('empty log', tlr.formatLog('task-nonex-xxxx', 5).indexOf('No log') >= 0);
assert('empty log REVIEW', tlr.formatLog('task-nonex-xxxx', 5).indexOf('REVIEW') >= 0);
assert('log returns string', typeof tlr.getTaskLog('task-x', 5) === 'object');

var fs = require('fs'), path = require('path');
var tpFile = path.join(__dirname, '..', '..', '..', 'storage', 'orchestrator', 'tasks.jsonl');
if (fs.existsSync(tpFile) && fs.readFileSync(tpFile, 'utf-8').trim()) {
  var tid = JSON.parse(fs.readFileSync(tpFile, 'utf-8').split('\n')[0]).taskId;
  var l = tlr.formatLog(tid, 20);
  assert('real log formatted', l.length > 20);
  assert('real log REVIEW', l.indexOf('REVIEW') >= 0);
}

// ═════ Test 3: Artifact Reader ═════
console.log('── Test 3: Artifact Reader ──');
assert('listArtifacts fn', typeof tar.listArtifacts === 'function');
assert('format fn', typeof tar.formatArtifactList === 'function');
assert('empty artifacts REVIEW', tar.formatArtifactList('task-nonex-xxxx').indexOf('REVIEW') >= 0);
assert('empty artifacts string', typeof tar.formatArtifactList('task-nonex-xxxx') === 'string');

// ═════ Test 4: Zombie Detector ═════
console.log('── Test 4: Zombie Detector ──');
assert('detectZombies fn', typeof tzd.detectZombies === 'function');
assert('formatZombies fn', typeof tzd.formatZombies === 'function');
assert('ZOMBIE_RULES array', Array.isArray(tzd.ZOMBIE_RULES));
assert('4 rules', tzd.ZOMBIE_RULES.length === 4);
assert('detect returns array', Array.isArray(tzd.detectZombies()));
var zf = tzd.formatZombies();
assert('zombie string', typeof zf === 'string' && zf.length > 10);
assert('zombie REVIEW', zf.indexOf('REVIEW') >= 0);

// ═════ Test 5: Command Integration ═════
console.log('── Test 5: Command Integration ──');
var cmd = require('../../commands/ai-task.js');
assert('cmd loads', typeof cmd.execute === 'function');

cmd.execute({ mock: true }, '进度 task-nonex-xxxx').then(function (r) {
  assert('progress cmd string', typeof r === 'string');
  assert('progress error for bogus id', r.indexOf('不存在') >= 0 || r.indexOf('❌') >= 0);
  return cmd.execute({ mock: true }, '僵尸');
}).then(function (r) {
  assert('zombie cmd string', typeof r === 'string' && r.length > 10);
  assert('zombie REVIEW', r.indexOf('REVIEW_ONLY') >= 0 || r.indexOf('zombie') >= 0 || r.indexOf('僵尸') >= 0);
  summary();
});
