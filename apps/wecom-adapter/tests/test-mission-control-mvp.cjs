'use strict';

/**
 * test-mission-control-mvp.cjs — Mission Control MVP integration tests
 * Covers: state machine, mission CRUD, trigger engine, full pipeline
 * Target: ≥80 tests
 */

var assert = require('assert');
var sm     = require('../src/mission-control/mission-state-machine');
var mm     = require('../src/mission-control/mission-manager');
var te     = require('../src/mission-control/trigger-engine');
var mc     = require('../src/mission-control');

var passed = 0, failed = 0, failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push({ name: name, message: e.message }); }
}

// ══════════════════════════════════════════════════════════
// PART 1: State Machine (tests 1-18)
// ══════════════════════════════════════════════════════════

test('1  canTransition CREATED→RUNNING true', function () {
  assert.strictEqual(sm.canTransition('CREATED', 'RUNNING'), true);
});

test('2  canTransition CREATED→COMPLETED false', function () {
  assert.strictEqual(sm.canTransition('CREATED', 'COMPLETED'), false);
});

test('3  canTransition CREATED→CANCELLED true', function () {
  assert.strictEqual(sm.canTransition('CREATED', 'CANCELLED'), true);
});

test('4  canTransition RUNNING→COMPLETED true', function () {
  assert.strictEqual(sm.canTransition('RUNNING', 'COMPLETED'), true);
});

test('5  canTransition RUNNING→FAILED true', function () {
  assert.strictEqual(sm.canTransition('RUNNING', 'FAILED'), true);
});

test('6  canTransition RUNNING→CANCELLED true', function () {
  assert.strictEqual(sm.canTransition('RUNNING', 'CANCELLED'), true);
});

test('7  canTransition FAILED→RUNNING true', function () {
  assert.strictEqual(sm.canTransition('FAILED', 'RUNNING'), true);
});

test('8  canTransition FAILED→COMPLETED false', function () {
  assert.strictEqual(sm.canTransition('FAILED', 'COMPLETED'), false);
});

test('9  canTransition COMPLETED→RUNNING false', function () {
  assert.strictEqual(sm.canTransition('COMPLETED', 'RUNNING'), false);
});

test('10 canTransition CANCELLED→RUNNING false', function () {
  assert.strictEqual(sm.canTransition('CANCELLED', 'RUNNING'), false);
});

test('11 canTransition null input false', function () {
  assert.strictEqual(sm.canTransition(null, 'RUNNING'), false);
  assert.strictEqual(sm.canTransition('CREATED', null), false);
});

test('12 validateTransition valid → {valid:true}', function () {
  var r = sm.validateTransition('CREATED', 'RUNNING');
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.reason, null);
});

test('13 validateTransition invalid → {valid:false, reason}', function () {
  var r = sm.validateTransition('CREATED', 'COMPLETED');
  assert.strictEqual(r.valid, false);
  assert(r.reason.indexOf('Cannot transition') !== -1);
});

test('14 validateTransition unknown source', function () {
  var r = sm.validateTransition('UNKNOWN', 'RUNNING');
  assert.strictEqual(r.valid, false);
});

test('15 validateTransition unknown target', function () {
  var r = sm.validateTransition('CREATED', 'UNKNOWN');
  assert.strictEqual(r.valid, false);
});

test('16 normalizeMission defaults', function () {
  var m = sm.normalizeMission({ correlationId: 'c1', type: 'pm2-health' });
  assert.strictEqual(m.priority, 'medium');
  assert.strictEqual(m.status, 'CREATED');
  assert(m.missionId && m.missionId.length > 0);
  assert.strictEqual(m.correlationId, 'c1');
});

test('17 normalizeMission preserves fields', function () {
  var m = sm.normalizeMission({
    missionId: 'm1', type: 'test', priority: 'high', status: 'RUNNING', title: 'T'
  });
  assert.strictEqual(m.missionId, 'm1');
  assert.strictEqual(m.priority, 'high');
  assert.strictEqual(m.status, 'RUNNING');
  assert.strictEqual(m.title, 'T');
});

test('18 normalizeMission null → defaults', function () {
  var m = sm.normalizeMission(null);
  assert.strictEqual(m.status, 'CREATED');
  assert(m.missionId);
});

test('19 MISSION_STATES has 5 states', function () {
  var s = sm.MISSION_STATES;
  assert.strictEqual(Object.keys(s).length, 5);
  assert.strictEqual(s.CREATED, 'CREATED');
  assert.strictEqual(s.RUNNING, 'RUNNING');
  assert.strictEqual(s.COMPLETED, 'COMPLETED');
  assert.strictEqual(s.FAILED, 'FAILED');
  assert.strictEqual(s.CANCELLED, 'CANCELLED');
});

// ══════════════════════════════════════════════════════════
// PART 2: Mission Manager (tests 20-45)
// ══════════════════════════════════════════════════════════

// reset store before mission manager tests
mm._reset();

test('20 createMission success', function () {
  var m = mm.createMission({ correlationId: 'corr-1', type: 'pm2-health' });
  assert.strictEqual(m.status, 'CREATED');
  assert.strictEqual(m.type, 'pm2-health');
  assert.strictEqual(m.priority, 'medium');
  assert(m.missionId);
});

test('21 createMission missing correlationId throws', function () {
  try { mm.createMission({ type: 'pm2-health' }); assert.fail('should throw'); }
  catch (e) { assert.strictEqual(e.code, 'MISSING_CORRELATION_ID'); }
});

test('22 createMission missing type throws', function () {
  try { mm.createMission({ correlationId: 'c2' }); assert.fail('should throw'); }
  catch (e) { assert.strictEqual(e.code, 'MISSING_TYPE'); }
});

test('23 createMission default priority=medium', function () {
  var m = mm.createMission({ correlationId: 'corr-3', type: 'bridge-health' });
  assert.strictEqual(m.priority, 'medium');
});

test('24 createMission custom priority', function () {
  var m = mm.createMission({ correlationId: 'corr-4', type: 'gateway-health', priority: 'high' });
  assert.strictEqual(m.priority, 'high');
});

test('25 createMission sets createdAt/updatedAt', function () {
  var m = mm.createMission({ correlationId: 'corr-5', type: 'memory-health' });
  assert(m.createdAt);
  assert(m.updatedAt);
  assert.strictEqual(m.createdAt, m.updatedAt);
});

test('26 getMission exists', function () {
  var m = mm.createMission({ correlationId: 'corr-6', type: 'agent-host-health' });
  var found = mm.getMission(m.missionId);
  assert.strictEqual(found.missionId, m.missionId);
});

test('27 getMission not found → null', function () {
  assert.strictEqual(mm.getMission('nonexistent'), null);
});

test('28 listMissions all', function () {
  mm._reset();
  mm.createMission({ correlationId: 'ca', type: 'pm2-health' });
  mm.createMission({ correlationId: 'cb', type: 'gateway-health' });
  var list = mm.listMissions();
  assert.strictEqual(list.length, 2);
});

test('29 listMissions filter by status', function () {
  mm._reset();
  mm.createMission({ correlationId: 'c1', type: 'pm2-health' });
  var list = mm.listMissions({ status: 'CREATED' });
  assert.strictEqual(list.length, 1);
});

test('30 listMissions filter by type', function () {
  mm._reset();
  mm.createMission({ correlationId: 'ca', type: 'pm2-health' });
  mm.createMission({ correlationId: 'cb', type: 'bridge-health' });
  var list = mm.listMissions({ type: 'pm2-health' });
  assert.strictEqual(list.length, 1);
});

test('31 listMissions filter by priority', function () {
  mm._reset();
  mm.createMission({ correlationId: 'c1', type: 'pm2-health', priority: 'high' });
  mm.createMission({ correlationId: 'c2', type: 'pm2-health', priority: 'medium' });
  var list = mm.listMissions({ priority: 'high' });
  assert.strictEqual(list.length, 1);
});

test('32 listMissions filter by source', function () {
  mm._reset();
  mm.createMission({ correlationId: 'c1', type: 'pm2-health', source: 'pm2-watcher' });
  mm.createMission({ correlationId: 'c2', type: 'pm2-health', source: 'other' });
  var list = mm.listMissions({ source: 'pm2-watcher' });
  assert.strictEqual(list.length, 1);
});

test('33 listMissions filter by correlationId', function () {
  mm._reset();
  mm.createMission({ correlationId: 'special', type: 'pm2-health' });
  var list = mm.listMissions({ correlationId: 'special' });
  assert.strictEqual(list.length, 1);
});

test('34 listMissions multi-filter', function () {
  mm._reset();
  mm.createMission({ correlationId: 'x', type: 'pm2-health', status: 'CREATED', priority: 'high' });
  mm.createMission({ correlationId: 'y', type: 'pm2-health', status: 'RUNNING', priority: 'medium' });
  var list = mm.listMissions({ status: 'CREATED', priority: 'high' });
  assert.strictEqual(list.length, 1);
});

test('35 updateMission success', function () {
  mm._reset();
  var m = mm.createMission({ correlationId: 'corr-upd', type: 'pm2-health' });
  var updated = mm.updateMission(m.missionId, { title: 'updated title' });
  assert.strictEqual(updated.title, 'updated title');
});

test('36 updateMission not found → null', function () {
  assert.strictEqual(mm.updateMission('nonexistent', { title: 'x' }), null);
});

test('37 updateMission cannot change missionId', function () {
  mm._reset();
  var m = mm.createMission({ correlationId: 'c1', type: 'pm2-health' });
  var updated = mm.updateMission(m.missionId, { missionId: 'hacked' });
  assert.strictEqual(updated.missionId, m.missionId);
});

test('38 completeMission success', function () {
  mm._reset();
  var m = mm.createMission({ correlationId: 'corr-comp', type: 'pm2-health' });
  // need to transition CREATED→RUNNING first
  mm.updateMission(m.missionId, { status: 'RUNNING' });
  var done = mm.completeMission(m.missionId, { output: 'ok' });
  assert.strictEqual(done.status, 'COMPLETED');
  assert.strictEqual(done.result.output, 'ok');
});

test('39 completeMission invalid from CREATED', function () {
  mm._reset();
  var m = mm.createMission({ correlationId: 'corr-invalid', type: 'pm2-health' });
  try {
    mm.completeMission(m.missionId, { output: 'ok' });
    assert.fail('should throw');
  } catch (e) {
    assert.strictEqual(e.code, 'INVALID_TRANSITION');
  }
});

test('40 completeMission not found → null', function () {
  assert.strictEqual(mm.completeMission('nonexistent', {}), null);
});

test('41 failMission from RUNNING', function () {
  mm._reset();
  var m = mm.createMission({ correlationId: 'corr-fail', type: 'pm2-health' });
  mm.updateMission(m.missionId, { status: 'RUNNING' });
  var failed = mm.failMission(m.missionId, 'timeout');
  assert.strictEqual(failed.status, 'FAILED');
  assert.strictEqual(failed.error, 'timeout');
});

test('42 cancelMission from CREATED', function () {
  mm._reset();
  var m = mm.createMission({ correlationId: 'corr-cancel', type: 'pm2-health' });
  var c = mm.cancelMission(m.missionId, 'no longer needed');
  assert.strictEqual(c.status, 'CANCELLED');
  assert.strictEqual(c.reason, 'no longer needed');
});

test('43 cancelMission from RUNNING', function () {
  mm._reset();
  var m = mm.createMission({ correlationId: 'corr-c2', type: 'pm2-health' });
  mm.updateMission(m.missionId, { status: 'RUNNING' });
  var c = mm.cancelMission(m.missionId, 'aborted');
  assert.strictEqual(c.status, 'CANCELLED');
});

test('44 cancelMission from COMPLETED invalid', function () {
  mm._reset();
  var m = mm.createMission({ correlationId: 'corr-c3', type: 'pm2-health' });
  mm.updateMission(m.missionId, { status: 'RUNNING' });
  mm.completeMission(m.missionId, {});
  try {
    mm.cancelMission(m.missionId, 'late');
    assert.fail('should throw');
  } catch (e) {
    assert.strictEqual(e.code, 'INVALID_TRANSITION');
  }
});

test('45 FAILED→RUNNING retry', function () {
  mm._reset();
  var m = mm.createMission({ correlationId: 'corr-retry', type: 'pm2-health' });
  mm.updateMission(m.missionId, { status: 'RUNNING' });
  mm.failMission(m.missionId, 'err');
  mm.updateMission(m.missionId, { status: 'RUNNING' });
  var m2 = mm.getMission(m.missionId);
  assert.strictEqual(m2.status, 'RUNNING');
});

// ══════════════════════════════════════════════════════════
// PART 3: Trigger Engine (tests 46-70)
// ══════════════════════════════════════════════════════════

mm._reset();
te.resetTriggerState();

test('46 evaluateTriggers critical→high mission', function () {
  mm._reset();
  var results = [{
    watcher: 'pm2-watcher', target: 'process:api',
    status: 'critical',
    anomalies: [{ type: 'NON_ONLINE', severity: 'critical', message: 'process down' }]
  }];
  var out = te.evaluateTriggers(results);
  assert.strictEqual(out.triggered.length, 1);
  assert.strictEqual(out.triggered[0].mission.priority, 'high');
  assert.strictEqual(out.triggered[0].mission.type, 'pm2-health');
});

test('47 evaluateTriggers warning→medium mission', function () {
  mm._reset();
  var results = [{
    watcher: 'memory-watcher', target: 'runtime-memory.db',
    status: 'degraded',
    anomalies: [{ type: 'HIGH_DB_SIZE', severity: 'warning', message: 'DB too large' }]
  }];
  var out = te.evaluateTriggers(results);
  assert.strictEqual(out.triggered.length, 1);
  assert.strictEqual(out.triggered[0].mission.priority, 'medium');
});

test('48 evaluateTriggers empty results', function () {
  mm._reset();
  var out = te.evaluateTriggers([]);
  assert.strictEqual(out.triggered.length, 0);
  assert.strictEqual(out.suppressed.length, 0);
});

test('49 evaluateTriggers null input', function () {
  mm._reset();
  var out = te.evaluateTriggers(null);
  assert.strictEqual(out.triggered.length, 0);
});

test('50 evaluateTriggers no anomalies', function () {
  mm._reset();
  var results = [{ watcher: 'pm2-watcher', anomalies: [] }];
  var out = te.evaluateTriggers(results);
  assert.strictEqual(out.triggered.length, 0);
});

test('51 shouldSuppressTrigger first call → false', function () {
  te.resetTriggerState();
  var r = te.shouldSuppressTrigger('key1', Date.now());
  assert.strictEqual(r, false);
});

test('52 shouldSuppressTrigger within cooldown → true', function () {
  te.resetTriggerState();
  var now = Date.now();
  // trigger first time
  te.shouldSuppressTrigger('key2', now);
  // simulate that a mission was triggered
  mm._reset();
  var results = [{ watcher: 'test', anomalies: [{ type: 'X', severity: 'critical' }] }];
  te.evaluateTriggers(results);
  // second call within cooldown
  var r = te.shouldSuppressTrigger('test|X|', now + 1000);
  assert.strictEqual(r, true);
});

test('53 shouldSuppressTrigger after cooldown → false', function () {
  te.resetTriggerState();
  var now = Date.now();
  // trigger
  mm._reset();
  var results = [{ watcher: 'test', anomalies: [{ type: 'Y', severity: 'critical' }] }];
  te.evaluateTriggers(results);
  // after cooldown
  var r = te.shouldSuppressTrigger('test|Y|', now + 6 * 60 * 1000);
  assert.strictEqual(r, false);
});

test('54 dedup: same watcher+type+target suppressed', function () {
  mm._reset();
  te.resetTriggerState();
  var results = [{
    watcher: 'bridge-watcher', target: 'bridge.jsonl',
    anomalies: [
      { type: 'MISSING_JSONL', severity: 'warning', message: 'missing' },
      { type: 'MISSING_JSONL', severity: 'warning', message: 'still missing' }
    ]
  }];
  var out = te.evaluateTriggers(results);
  assert.strictEqual(out.triggered.length, 1);
  assert.strictEqual(out.suppressed.length, 1);
});

test('55 dedup: different watchers not suppressed', function () {
  mm._reset();
  te.resetTriggerState();
  var results = [
    { watcher: 'pm2-watcher', target: 'p1', anomalies: [{ type: 'HIGH_MEMORY', severity: 'warning' }] },
    { watcher: 'gateway-watcher', target: '127.0.0.1:3001', anomalies: [{ type: 'HIGH_LATENCY', severity: 'warning' }] }
  ];
  var out = te.evaluateTriggers(results);
  assert.strictEqual(out.triggered.length, 2);
});

test('56 dedup: different anomaly types not suppressed', function () {
  mm._reset();
  te.resetTriggerState();
  var results = [{
    watcher: 'pm2-watcher', target: 'p1',
    anomalies: [
      { type: 'HIGH_MEMORY', severity: 'warning' },
      { type: 'HIGH_RESTARTS', severity: 'warning' }
    ]
  }];
  var out = te.evaluateTriggers(results);
  assert.strictEqual(out.triggered.length, 2);
});

test('57 resetTriggerState clears cooldown', function () {
  mm._reset();
  te.resetTriggerState();
  var results = [{ watcher: 'test', anomalies: [{ type: 'A', severity: 'warning' }] }];
  te.evaluateTriggers(results);
  te.resetTriggerState();
  var out2 = te.evaluateTriggers(results);
  assert.strictEqual(out2.triggered.length, 1);
});

test('58 buildMissionFromAnomaly pm2 type', function () {
  mm._reset();
  var m = te.buildMissionFromAnomaly(
    { type: 'NON_ONLINE', severity: 'critical', message: 'down' },
    { watcher: 'pm2-watcher', target: 'api' }
  );
  assert.strictEqual(m.type, 'pm2-health');
  assert.strictEqual(m.priority, 'high');
});

test('59 buildMissionFromAnomaly gateway type', function () {
  mm._reset();
  var m = te.buildMissionFromAnomaly(
    { type: 'TIMEOUT', severity: 'critical', message: 'no response' },
    { watcher: 'gateway-watcher', target: 'http://127.0.0.1:3001' }
  );
  assert.strictEqual(m.type, 'gateway-health');
});

test('60 buildMissionFromAnomaly agent-host type', function () {
  mm._reset();
  var m = te.buildMissionFromAnomaly(
    { type: 'HIGH_TASK_COUNT', severity: 'warning' },
    { watcher: 'agent-host-watcher', target: 'http://127.0.0.1:3002' }
  );
  assert.strictEqual(m.type, 'agent-host-health');
});

test('61 buildMissionFromAnomaly memory type', function () {
  mm._reset();
  var m = te.buildMissionFromAnomaly(
    { type: 'HIGH_DB_SIZE', severity: 'warning' },
    { watcher: 'memory-watcher', target: 'runtime-memory.db' }
  );
  assert.strictEqual(m.type, 'memory-health');
});

test('62 buildMissionFromAnomaly bridge type', function () {
  mm._reset();
  var m = te.buildMissionFromAnomaly(
    { type: 'SECRET_LEAK', severity: 'critical' },
    { watcher: 'bridge-watcher', target: 'bridge.jsonl' }
  );
  assert.strictEqual(m.type, 'bridge-health');
});

test('63 buildMissionFromAnomaly unknown watcher → generic-health', function () {
  mm._reset();
  var m = te.buildMissionFromAnomaly(
    { type: 'UNKNOWN', severity: 'warning' },
    { watcher: 'unknown-watcher' }
  );
  assert.strictEqual(m.type, 'generic-health');
});

test('64 buildMissionFromAnomaly metadata includes context', function () {
  mm._reset();
  var m = te.buildMissionFromAnomaly(
    { type: 'HIGH_LATENCY', severity: 'warning', message: 'slow' },
    { watcher: 'gateway-watcher', target: 'http://127.0.0.1:3001', status: 'degraded' }
  );
  assert.strictEqual(m.metadata.anomalyType, 'HIGH_LATENCY');
  assert.strictEqual(m.metadata.target, 'http://127.0.0.1:3001');
  assert.strictEqual(m.metadata.watcherStatus, 'degraded');
});

test('65 multiple watcher results', function () {
  mm._reset();
  te.resetTriggerState();
  var results = [
    {
      watcher: 'pm2-watcher', target: 'api',
      anomalies: [{ type: 'NON_ONLINE', severity: 'critical' }]
    },
    {
      watcher: 'gateway-watcher', target: 'http://127.0.0.1:3001',
      anomalies: [{ type: 'TIMEOUT', severity: 'critical' }]
    },
    {
      watcher: 'memory-watcher', target: 'db',
      anomalies: [{ type: 'HIGH_DB_SIZE', severity: 'warning' }]
    }
  ];
  var out = te.evaluateTriggers(results);
  assert.strictEqual(out.triggered.length, 3);
  assert(out.suppressed.length === 0);
});

test('66 no anomaly → no triggers', function () {
  mm._reset();
  te.resetTriggerState();
  var results = [
    { watcher: 'pm2-watcher', target: 'api', status: 'healthy', anomalies: [] },
    { watcher: 'gateway-watcher', target: 'http://127.0.0.1:3001', status: 'healthy', anomalies: [] }
  ];
  var out = te.evaluateTriggers(results);
  assert.strictEqual(out.triggered.length, 0);
  assert.strictEqual(out.suppressed.length, 0);
});

test('67 checkedAt is set', function () {
  mm._reset();
  var out = te.evaluateTriggers([]);
  assert(out.checkedAt);
});

test('68 triggered mission has all required fields', function () {
  mm._reset();
  te.resetTriggerState();
  var results = [{
    watcher: 'pm2-watcher', target: 'api',
    anomalies: [{ type: 'NON_ONLINE', severity: 'critical', message: 'down' }]
  }];
  var out = te.evaluateTriggers(results);
  var m = out.triggered[0].mission;
  assert(m.missionId);
  assert(m.correlationId);
  assert(m.type);
  assert(m.source);
  assert(m.priority);
  assert(m.status === 'CREATED');
  assert(m.title);
  assert(m.createdAt);
  assert(m.metadata);
});

test('69 custom cooldown option respected', function () {
  mm._reset();
  te.resetTriggerState();
  var results = [{ watcher: 'test', anomalies: [{ type: 'X', severity: 'warning' }] }];
  // first trigger
  te.evaluateTriggers(results);
  // should NOT suppress with cooldown=0
  var r = te.shouldSuppressTrigger('test|X|', Date.now(), { cooldownMs: 0 });
  assert.strictEqual(r, false);
});

test('70 shouldSuppressTrigger without options uses default cooldown', function () {
  te.resetTriggerState();
  // trigger via evaluateTriggers
  mm._reset();
  var results = [{ watcher: 'test2', anomalies: [{ type: 'Z', severity: 'warning' }] }];
  var out1 = te.evaluateTriggers(results);
  assert.strictEqual(out1.triggered.length, 1);
  // check suppression immediately after
  var r = te.shouldSuppressTrigger('test2|Z|', Date.now());
  assert.strictEqual(r, true);
});

// ══════════════════════════════════════════════════════════
// PART 4: Full Pipeline Integration (tests 71-82)
// ══════════════════════════════════════════════════════════

test('71 pipeline: pm2 critical → mission → complete', function () {
  mm._reset();
  te.resetTriggerState();

  // Observe → Detect → Trigger
  var results = [{
    watcher: 'pm2-watcher', target: 'api',
    status: 'critical',
    anomalies: [{ type: 'NON_ONLINE', severity: 'critical', message: 'api down' }]
  }];
  var out = te.evaluateTriggers(results);
  assert.strictEqual(out.triggered.length, 1);

  var mission = out.triggered[0].mission;
  assert.strictEqual(mission.type, 'pm2-health');
  assert.strictEqual(mission.priority, 'high');
  assert.strictEqual(mission.status, 'CREATED');

  // Transition: CREATED→RUNNING→COMPLETED
  mm.updateMission(mission.missionId, { status: 'RUNNING' });
  mm.completeMission(mission.missionId, { output: 'restarted' });

  var final = mm.getMission(mission.missionId);
  assert.strictEqual(final.status, 'COMPLETED');
  assert.strictEqual(final.result.output, 'restarted');
});

test('72 pipeline: memory warning → mission → ignore', function () {
  mm._reset();
  te.resetTriggerState();

  var results = [{
    watcher: 'memory-watcher', target: 'runtime-memory.db',
    status: 'degraded',
    anomalies: [{ type: 'HIGH_DB_SIZE', severity: 'warning', message: 'DB near limit' }]
  }];
  var out = te.evaluateTriggers(results);
  assert.strictEqual(out.triggered.length, 1);

  var mission = out.triggered[0].mission;
  assert.strictEqual(mission.type, 'memory-health');
  assert.strictEqual(mission.priority, 'medium');

  // Cancel from CREATED
  mm.cancelMission(mission.missionId, 'monitoring');
  assert.strictEqual(mm.getMission(mission.missionId).status, 'CANCELLED');
});

test('73 pipeline: bridge secret leak critical → mission → fail → retry', function () {
  mm._reset();
  te.resetTriggerState();

  var results = [{
    watcher: 'bridge-watcher', target: 'bridge.jsonl',
    status: 'critical',
    anomalies: [{ type: 'SECRET_LEAK', severity: 'critical', message: 'token found' }]
  }];
  var out = te.evaluateTriggers(results);
  var m = out.triggered[0].mission;
  assert.strictEqual(m.type, 'bridge-health');
  assert.strictEqual(m.priority, 'high');

  // RUNNING → FAILED → RUNNING → COMPLETED
  mm.updateMission(m.missionId, { status: 'RUNNING' });
  mm.failMission(m.missionId, 'unable to rotate');
  assert.strictEqual(mm.getMission(m.missionId).status, 'FAILED');

  mm.updateMission(m.missionId, { status: 'RUNNING' });
  mm.completeMission(m.missionId, { output: 'secret rotated' });
  assert.strictEqual(mm.getMission(m.missionId).status, 'COMPLETED');
});

test('74 pipeline: gateway + agent-host combined', function () {
  mm._reset();
  te.resetTriggerState();

  var results = [
    {
      watcher: 'gateway-watcher', target: 'http://127.0.0.1:3001',
      status: 'critical',
      anomalies: [{ type: 'TIMEOUT', severity: 'critical', message: 'no response' }]
    },
    {
      watcher: 'agent-host-watcher', target: 'http://127.0.0.1:3002',
      status: 'degraded',
      anomalies: [{ type: 'HIGH_MEMORY', severity: 'warning', message: '512MB used' }]
    }
  ];
  var out = te.evaluateTriggers(results);
  assert.strictEqual(out.triggered.length, 2);

  var types = out.triggered.map(function (t) { return t.mission.type; }).sort();
  assert.deepStrictEqual(types, ['agent-host-health', 'gateway-health']);
});

test('75 pipeline: cooldown prevents duplicate missions', function () {
  mm._reset();
  te.resetTriggerState();

  var results = [{
    watcher: 'pm2-watcher', target: 'api',
    anomalies: [{ type: 'ROOT_USER', severity: 'warning' }]
  }];

  var out1 = te.evaluateTriggers(results);
  assert.strictEqual(out1.triggered.length, 1);

  var out2 = te.evaluateTriggers(results);
  assert.strictEqual(out2.triggered.length, 0);
  assert.strictEqual(out2.suppressed.length, 1);
});

test('76 pipeline: all watchers healthy → no triggers', function () {
  mm._reset();
  te.resetTriggerState();

  var results = [
    { watcher: 'pm2-watcher', target: 'all', status: 'healthy', anomalies: [] },
    { watcher: 'gateway-watcher', target: 'http://127.0.0.1:3001', status: 'healthy', anomalies: [] },
    { watcher: 'agent-host-watcher', target: 'http://127.0.0.1:3002', status: 'healthy', anomalies: [] },
    { watcher: 'memory-watcher', target: 'runtime-memory.db', status: 'healthy', anomalies: [] },
    { watcher: 'bridge-watcher', target: 'bridge.jsonl', status: 'healthy', anomalies: [] }
  ];
  var out = te.evaluateTriggers(results);
  assert.strictEqual(out.triggered.length, 0);
  assert.strictEqual(out.suppressed.length, 0);
});

test('77 mission type mapping: all 5 watchers', function () {
  mm._reset();
  var ctx = { target: '.' };
  var cases = [
    { watcher: 'pm2-watcher',       expected: 'pm2-health' },
    { watcher: 'gateway-watcher',   expected: 'gateway-health' },
    { watcher: 'agent-host-watcher', expected: 'agent-host-health' },
    { watcher: 'memory-watcher',    expected: 'memory-health' },
    { watcher: 'bridge-watcher',    expected: 'bridge-health' }
  ];
  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    var m = te.buildMissionFromAnomaly(
      { type: 'TEST', severity: 'warning' },
      { watcher: c.watcher }
    );
    assert.strictEqual(m.type, c.expected, 'Failed for ' + c.watcher);
  }
});

test('78 full lifecycle: CREATED→RUNNING→FAILED→RUNNING→COMPLETED', function () {
  mm._reset();
  var m = mm.createMission({ correlationId: 'lifecycle', type: 'pm2-health' });
  assert.strictEqual(m.status, 'CREATED');

  mm.updateMission(m.missionId, { status: 'RUNNING' });
  assert.strictEqual(mm.getMission(m.missionId).status, 'RUNNING');

  mm.failMission(m.missionId, 'first attempt');
  assert.strictEqual(mm.getMission(m.missionId).status, 'FAILED');

  mm.updateMission(m.missionId, { status: 'RUNNING' });
  mm.completeMission(m.missionId, { ok: true });
  assert.strictEqual(mm.getMission(m.missionId).status, 'COMPLETED');
});

test('79 mission manager: listMissions no filter after reset', function () {
  mm._reset();
  mm.createMission({ correlationId: 'x1', type: 'pm2-health' });
  mm.createMission({ correlationId: 'x2', type: 'bridge-health' });
  mm.createMission({ correlationId: 'x3', type: 'gateway-health' });
  assert.strictEqual(mm.listMissions().length, 3);
});

test('80 updateMission updates updatedAt', function () {
  mm._reset();
  var m = mm.createMission({ correlationId: 'time', type: 'pm2-health' });
  var old = m.updatedAt;
  // small delay
  var start = Date.now();
  while (Date.now() - start < 5) {} // ~5ms delay
  mm.updateMission(m.missionId, { title: 'new title' });
  var updated = mm.getMission(m.missionId);
  assert(updated.updatedAt !== old);
});

test('81 triggerEngine: corrupted watcher result (no anomalies array)', function () {
  mm._reset();
  te.resetTriggerState();
  var out = te.evaluateTriggers([{ watcher: 'bad', anomalies: null }]);
  assert.strictEqual(out.triggered.length, 0);
});

test('82 index exports all 3 modules', function () {
  assert(mc.stateMachine);
  assert(mc.missionManager);
  assert(mc.triggerEngine);
  assert.strictEqual(typeof mc.stateMachine.canTransition, 'function');
  assert.strictEqual(typeof mc.missionManager.createMission, 'function');
  assert.strictEqual(typeof mc.triggerEngine.evaluateTriggers, 'function');
});

// ══════════════════════════════════════════════════════════

console.log('\n=== Mission Control MVP Tests: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failures.length) {
  failures.forEach(function (f) { console.error('  FAIL: ' + f.name + ' — ' + f.message); });
  process.exit(1);
}
console.log('All tests passed! (' + passed + ' total)\n');
