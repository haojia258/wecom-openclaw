'use strict';

/**
 * P9.3.2 Passive Monitoring Runtime — Comprehensive Test Suite
 *
 * Coverage:
 *   Part A — mission-audit-log (25 tests)
 *   Part B — monitoring-status (18 tests)
 *   Part C — autonomous-safety-guard (35 tests)
 *   Part D — passive-monitor-loop (unit, 20 tests)
 *   Part E — passive-monitor-loop (integration, 30 tests)
 *   Part F — panic stop & safe mode (15 tests)
 *
 * Total target: >= 120 tests
 */

var path   = require('path');
var fs     = require('fs');
var os     = require('os');

var auditLog         = require('../src/mission-control/mission-audit-log');
var monitoringStatus = require('../src/mission-control/monitoring-status');
var safetyGuard      = require('../src/mission-control/autonomous-safety-guard');
var passiveLoop      = require('../src/mission-control/passive-monitor-loop');
var missionManager   = require('../src/mission-control/mission-manager');
var triggerEngine    = require('../src/mission-control/trigger-engine');

var HEALTHY_PM2 = [
  {
    name: 'wecom-adapter',
    pm2_env: {
      status: 'online',
      restart_time: 0,
      unstable_restarts: 0,
      username: 'ubuntu'
    },
    monit: { memory: 128 * 1024 * 1024 }
  },
  {
    name: 'openclaw-ai-agent-host',
    pm2_env: {
      status: 'online',
      restart_time: 0,
      unstable_restarts: 0,
      username: 'ubuntu'
    },
    monit: { memory: 128 * 1024 * 1024 }
  }
];

var passed = 0;
var failed = 0;
var errors = [];

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; errors.push('FAIL: ' + msg); }
}

function assertEqual(actual, expected, msg) {
  if (actual === expected) { passed++; }
  else { failed++; errors.push('FAIL: ' + msg + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')'); }
}

function assertDeepEqual(actual, expected, msg) {
  var a = JSON.stringify(actual);
  var b = JSON.stringify(expected);
  if (a === b) { passed++; }
  else { failed++; errors.push('FAIL: ' + msg + ' (expected ' + b + ', got ' + a + ')'); }
}

function assertOk(val, msg) {
  if (val) { passed++; }
  else { failed++; errors.push('FAIL: ' + msg); }
}

function assertThrows(fn, expectedCode, msg) {
  try { fn(); failed++; errors.push('FAIL: ' + msg + ' (did not throw)'); }
  catch (e) {
    if (expectedCode && e.code !== expectedCode) {
      failed++; errors.push('FAIL: ' + msg + ' (expected code ' + expectedCode + ', got ' + e.code + ')');
    } else { passed++; }
  }
}

var tmpdir = path.join(os.tmpdir(), 'test-p93-passive-' + Date.now());
try { fs.mkdirSync(tmpdir, { recursive: true }); } catch (_) {}

// ================================================================
// PART A: mission-audit-log (25 tests)
// ================================================================
console.log('\n=== PART A: mission-audit-log ===');

// A1: init with logDir
auditLog._reset();
var initResult = auditLog.init({ logDir: tmpdir });
assert(initResult.logDir === tmpdir, 'A1a: init sets logDir');
assert(initResult.logPath.indexOf(tmpdir) === 0, 'A1b: init sets logPath under logDir');

// A2: init with custom logPath
auditLog._reset();
auditLog.init({ logPath: path.join(tmpdir, 'custom-audit.jsonl') });
assertEqual(auditLog.getLogPath(), path.join(tmpdir, 'custom-audit.jsonl'), 'A2: custom logPath');

// A3: logTrigger requires correlationId
auditLog._reset();
auditLog.init({ logDir: tmpdir });
assertThrows(function() { auditLog.logTrigger({}); }, null, 'A3: logTrigger throws without correlationId');

// A4: logTrigger success
auditLog._reset();
auditLog.init({ logDir: tmpdir });
var triggerOk = auditLog.logTrigger({
  correlationId: 'test_trigger_1',
  type: 'TRIGGER',
  watcher: 'pm2',
  anomaly: { type: 'NON_ONLINE', severity: 'critical', message: 'test' },
  mission: { missionId: 'm_1', type: 'pm2-health', priority: 'high' }
});
assert(triggerOk === true, 'A4a: logTrigger returns true');
assert(fs.existsSync(auditLog.getLogPath()), 'A4b: log file created');

// A5: logSuppress with cooldown reason
var suppressOk = auditLog.logSuppress({
  correlationId: 'test_suppress_1',
  type: 'SUPPRESS_COOLDOWN',
  watcher: 'gateway',
  anomaly: { type: 'HTTP_STATUS', severity: 'critical', message: 'test' },
  reason: 'cooldown'
});
assert(suppressOk === true, 'A5: logSuppress returns true');

// A6: logSuppress requires correlationId
assertThrows(function() { auditLog.logSuppress({}); }, null, 'A6: logSuppress throws without correlationId');

// A7: logCycle
var cycleOk = auditLog.logCycle({
  correlationId: 'cycle_1',
  cycleIndex: 1,
  totalChecks: 5,
  totalTriggers: 2,
  totalSuppressed: 3,
  activeMissions: 4,
  watcherResults: { pm2: { ok: true } }
});
assert(cycleOk === true, 'A7: logCycle returns true');

// A8: logCycle requires correlationId
assertThrows(function() { auditLog.logCycle({}); }, null, 'A8: logCycle throws without correlationId');

// A9: logSafeMode
var safeOk = auditLog.logSafeMode({
  correlationId: 'safe_1',
  reason: 'MAX_MISSIONS_PER_HOUR',
  metadata: { totalMissions: 61 }
});
assert(safeOk === true, 'A9: logSafeMode returns true');

// A10: getLogStats
var stats = auditLog.getLogStats();
assert(stats.exists === true, 'A10a: log file exists');
assert(stats.sizeBytes > 0, 'A10b: log file has content');

// A11: token masking — Bearer token
auditLog._reset();
auditLog.init({ logDir: tmpdir, logPath: path.join(tmpdir, 'mask-test.jsonl') });
auditLog.logTrigger({
  correlationId: 'mask_bearer',
  type: 'TRIGGER',
  watcher: 'gateway',
  anomaly: { type: 'test', severity: 'warning', message: 'Authorization: Bearer abcdef1234567890' }
});
var maskContent = fs.readFileSync(path.join(tmpdir, 'mask-test.jsonl'), 'utf8');
assert(maskContent.indexOf('Bearer abcdef') === -1, 'A11a: Bearer token redacted');
assert(maskContent.indexOf('***REDACTED***') !== -1, 'A11b: REDACTED marker present');

// A12: token masking — sk- key
auditLog._reset();
auditLog.init({ logDir: tmpdir, logPath: path.join(tmpdir, 'mask-sk.jsonl') });
auditLog.logTrigger({
  correlationId: 'mask_sk',
  type: 'TRIGGER',
  watcher: 'memory',
  anomaly: { type: 'test', severity: 'warning', message: 'Key: sk-abcdefghijklmnopqrstuvwxyz123456' }
});
var skContent = fs.readFileSync(path.join(tmpdir, 'mask-sk.jsonl'), 'utf8');
assert(skContent.indexOf('sk-abcdef') === -1, 'A12: sk- key redacted');

// A13: token masking — JWT
auditLog._reset();
auditLog.init({ logDir: tmpdir, logPath: path.join(tmpdir, 'mask-jwt.jsonl') });
auditLog.logTrigger({
  correlationId: 'mask_jwt',
  type: 'TRIGGER',
  watcher: 'memory',
  anomaly: { type: 'test', severity: 'warning', message: 'Token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgN' }
});
var jwtContent = fs.readFileSync(path.join(tmpdir, 'mask-jwt.jsonl'), 'utf8');
assert(jwtContent.indexOf('eyJhbGci') === -1, 'A13a: JWT token redacted');
assert(jwtContent.indexOf('JWT_REDACTED') !== -1, 'A13b: JWT REDACTED marker present');

// A14: blocked keywords — entry with "password" key in anomaly
auditLog._reset();
auditLog.init({ logDir: tmpdir });
assertThrows(function() {
  auditLog.logTrigger({
    correlationId: 'blocked_test',
    type: 'TRIGGER',
    watcher: 'test',
    anomaly: null,
    metadata: { password: 'secret123' }
  });
}, null, 'A14: blocked keyword throws');

// A15: blocked keywords — entry with "token" key
assertThrows(function() {
  auditLog.logTrigger({
    correlationId: 'blocked_token',
    type: 'TRIGGER',
    watcher: 'test',
    anomaly: null,
    metadata: { api_token: 'abc' }
  });
}, null, 'A15: blocked token key throws');

// A16: read back log entries
auditLog._reset();
auditLog.init({ logDir: tmpdir, logPath: path.join(tmpdir, 'readback.jsonl') });
auditLog.logTrigger({ correlationId: 'rb_1', type: 'TRIGGER', watcher: 'pm2' });
auditLog.logSuppress({ correlationId: 'rb_2', type: 'SUPPRESS', watcher: 'gateway', reason: 'cooldown' });
var lines = fs.readFileSync(path.join(tmpdir, 'readback.jsonl'), 'utf8').trim().split('\n');
assertEqual(lines.length, 2, 'A16a: 2 lines written');
var parsed1 = JSON.parse(lines[0]);
var parsed2 = JSON.parse(lines[1]);
assertEqual(parsed1.correlationId, 'rb_1', 'A16b: first entry correlationId');
assertEqual(parsed2.correlationId, 'rb_2', 'A16c: second entry correlationId');

// A17: not initialized throws
auditLog._reset();
assertThrows(function() { auditLog.logTrigger({ correlationId: 'x' }); }, null, 'A17: throws when not initialized');

// A18: type defaults to UNKNOWN
auditLog._reset();
auditLog.init({ logDir: tmpdir, logPath: path.join(tmpdir, 'default-type.jsonl') });
auditLog.logTrigger({ correlationId: 'dt_1', watcher: 'test' });
var dtLine = JSON.parse(fs.readFileSync(path.join(tmpdir, 'default-type.jsonl'), 'utf8').trim());
assertEqual(dtLine.type, 'UNKNOWN', 'A18: default type is UNKNOWN');

// A19: timestamp auto-generated
assert(typeof dtLine.timestamp === 'string', 'A19a: timestamp is string');
assert(dtLine.timestamp.indexOf('T') !== -1, 'A19b: timestamp is ISO format');

// A20: multiple trigger entries in same file
auditLog._reset();
auditLog.init({ logDir: tmpdir, logPath: path.join(tmpdir, 'multi.jsonl') });
for (var mi = 0; mi < 10; mi++) {
  auditLog.logTrigger({ correlationId: 'multi_' + mi, type: 'TRIGGER', watcher: 'pm2' });
}
var multiLines = fs.readFileSync(path.join(tmpdir, 'multi.jsonl'), 'utf8').trim().split('\n');
assertEqual(multiLines.length, 10, 'A20: 10 entries written');

// A21: logSuppress type defaults
auditLog._reset();
auditLog.init({ logDir: tmpdir, logPath: path.join(tmpdir, 'suppress-default.jsonl') });
auditLog.logSuppress({ correlationId: 'sd_1', watcher: 'memory', reason: 'test' });
var sdLine = JSON.parse(fs.readFileSync(path.join(tmpdir, 'suppress-default.jsonl'), 'utf8').trim());
assertEqual(sdLine.type, 'SUPPRESS', 'A21: suppress default type');

// A22: token masking — apiKey JSON
auditLog._reset();
auditLog.init({ logDir: tmpdir, logPath: path.join(tmpdir, 'mask-apikey.jsonl') });
auditLog.logTrigger({
  correlationId: 'mask_apikey',
  type: 'TRIGGER',
  watcher: 'test',
  anomaly: { type: 'test', severity: 'warning', message: '{"apiKey":"sk-real-secret-key-12345"}' }
});
var akContent = fs.readFileSync(path.join(tmpdir, 'mask-apikey.jsonl'), 'utf8');
assert(akContent.indexOf('sk-real-secret') === -1, 'A22: apiKey redacted');

// A23: token masking — secret JSON
auditLog._reset();
auditLog.init({ logDir: tmpdir, logPath: path.join(tmpdir, 'mask-secret.jsonl') });
auditLog.logTrigger({
  correlationId: 'mask_secret',
  type: 'TRIGGER',
  watcher: 'test',
  anomaly: { type: 'test', severity: 'warning', message: '{"secret":"my-secret-123"}' }
});
var scContent = fs.readFileSync(path.join(tmpdir, 'mask-secret.jsonl'), 'utf8');
assert(scContent.indexOf('my-secret') === -1, 'A23: secret redacted');

// A24: logTrigger with mission null is valid
auditLog._reset();
auditLog.init({ logDir: tmpdir, logPath: path.join(tmpdir, 'no-mission.jsonl') });
var noMissionOk = auditLog.logTrigger({
  correlationId: 'nm_1',
  type: 'TRIGGER',
  watcher: 'test',
  anomaly: { type: 'test', severity: 'info' },
  mission: null
});
assert(noMissionOk === true, 'A24: mission null is valid');

// A25: log path is stable across calls
var path1 = auditLog.getLogPath();
var path2 = auditLog.getLogPath();
assertEqual(path1, path2, 'A25: getLogPath is stable');

// ================================================================
// PART B: monitoring-status (18 tests)
// ================================================================
console.log('\n=== PART B: monitoring-status ===');

monitoringStatus._reset();

// B1: initial state
var s1 = monitoringStatus.getMonitoringStatus();
assertEqual(s1.running, false, 'B1a: not running initially');
assertEqual(s1.totalChecks, 0, 'B1b: zero checks');
assertEqual(s1.totalTriggers, 0, 'B1c: zero triggers');
assertEqual(s1.totalSuppressed, 0, 'B1d: zero suppressed');

// B2: setRunning
monitoringStatus.setRunning(true);
var s2 = monitoringStatus.getMonitoringStatus();
assertEqual(s2.running, true, 'B2: running set to true');

// B3: setSafeMode
monitoringStatus.setSafeMode(true);
var s3 = monitoringStatus.getMonitoringStatus();
assertEqual(s3.safeMode, true, 'B3: safe mode set');

// B4: setIntervalMs
monitoringStatus.setIntervalMs(30000);
var s4 = monitoringStatus.getMonitoringStatus();
assertEqual(s4.intervalMs, 30000, 'B4: interval set to 30s');

// B5: setIntervalMs min 100
monitoringStatus.setIntervalMs(50);
var s5 = monitoringStatus.getMonitoringStatus();
assertEqual(s5.intervalMs, 30000, 'B5: interval below 100ms rejected (should keep old value)');

// B6: setActiveWatchers
monitoringStatus.setActiveWatchers(['pm2', 'gateway']);
var s6 = monitoringStatus.getMonitoringStatus();
assertDeepEqual(s6.activeWatchers, ['pm2', 'gateway'], 'B6: watchers set');

// B7: markRun with cycle result
monitoringStatus._reset();
monitoringStatus.setRunning(true);
monitoringStatus.markRun({ totalChecks: 5, totalTriggers: 2, totalSuppressed: 3 });
var s7 = monitoringStatus.getMonitoringStatus();
assertEqual(s7.totalChecks, 5, 'B7a: totalChecks accumulated');
assertEqual(s7.totalTriggers, 2, 'B7b: totalTriggers accumulated');
assertEqual(s7.totalSuppressed, 3, 'B7c: totalSuppressed accumulated');
assertEqual(s7.totalCycles, 1, 'B7d: totalCycles incremented');
assert(s7.lastRunAt !== null, 'B7e: lastRunAt set');

// B8: multiple cycles accumulate
monitoringStatus.markRun({ totalChecks: 5, totalTriggers: 1, totalSuppressed: 1 });
var s8 = monitoringStatus.getMonitoringStatus();
assertEqual(s8.totalChecks, 10, 'B8a: checks accumulate');
assertEqual(s8.totalTriggers, 3, 'B8b: triggers accumulate');
assertEqual(s8.totalCycles, 2, 'B8c: cycles accumulate');

// B9: setActiveMissions
monitoringStatus.setActiveMissions(7);
var s9 = monitoringStatus.getMonitoringStatus();
assertEqual(s9.activeMissions, 7, 'B9: active missions set');

// B10: incrementChecks
monitoringStatus._reset();
monitoringStatus.incrementChecks(3);
var s10 = monitoringStatus.getMonitoringStatus();
assertEqual(s10.totalChecks, 3, 'B10: incrementChecks works');

// B11: incrementTriggers
monitoringStatus.incrementTriggers(2);
var s11 = monitoringStatus.getMonitoringStatus();
assertEqual(s11.totalTriggers, 2, 'B11: incrementTriggers works');

// B12: incrementSuppressed
monitoringStatus.incrementSuppressed(5);
var s12 = monitoringStatus.getMonitoringStatus();
assertEqual(s12.totalSuppressed, 5, 'B12: incrementSuppressed works');

// B13: markRun without result
monitoringStatus.markRun();
var s13 = monitoringStatus.getMonitoringStatus();
assertEqual(s13.totalCycles, 1, 'B13: markRun without result still increments cycles');

// B14: reset returns to initial
monitoringStatus._reset();
var s14 = monitoringStatus.getMonitoringStatus();
assertEqual(s14.running, false, 'B14a: reset running');
assertEqual(s14.totalChecks, 0, 'B14b: reset checks');
assertEqual(s14.totalCycles, 0, 'B14c: reset cycles');

// B15: safe mode survives markRun
monitoringStatus.setSafeMode(true);
monitoringStatus.markRun({ totalChecks: 5 });
var s15 = monitoringStatus.getMonitoringStatus();
assertEqual(s15.safeMode, true, 'B15: safe mode preserved');

// B16: setRunning false while safe mode
monitoringStatus.setRunning(false);
var s16 = monitoringStatus.getMonitoringStatus();
assertEqual(s16.running, false, 'B16a: running false');
assertEqual(s16.safeMode, true, 'B16b: safe mode still true');

// B17: setIntervalMs with non-number
monitoringStatus._reset();
monitoringStatus.setIntervalMs('abc');
var s17 = monitoringStatus.getMonitoringStatus();
assertEqual(s17.intervalMs, 60000, 'B17: non-number interval rejected');

// B18: getMonitoringStatus returns a copy
monitoringStatus._reset();
monitoringStatus.setActiveWatchers(['a', 'b']);
var s18a = monitoringStatus.getMonitoringStatus();
s18a.activeWatchers.push('c');
var s18b = monitoringStatus.getMonitoringStatus();
assertEqual(s18b.activeWatchers.length, 2, 'B18: getMonitoringStatus returns copy');

// ================================================================
// PART C: autonomous-safety-guard (35 tests)
// ================================================================
console.log('\n=== PART C: autonomous-safety-guard ===');

// C1: initial state — not safe mode
safetyGuard._reset();
var c1 = safetyGuard.getStats();
assertEqual(c1.safeMode, false, 'C1a: not safe mode');
assertEqual(c1.missionsInWindow, 0, 'C1b: zero missions');

// C2: beforeCycle — first cycle allowed
var cc1 = safetyGuard.beforeCycle();
assert(cc1.allowed === true, 'C2: first cycle allowed');

// C3: beforeCycle — within cooldown is blocked
var cc2 = safetyGuard.beforeCycle();
assert(cc2.allowed === false, 'C3a: second immediate cycle blocked');
assertEqual(cc2.reason, 'global_cooldown', 'C3b: reason is global_cooldown');

// C4: configure — change global cooldown
safetyGuard._reset();
safetyGuard.configure({ globalCooldownMs: 0 });
var cc3 = safetyGuard.beforeCycle();
assert(cc3.allowed === true, 'C4a: first cycle with zero cooldown allowed');
var cc4 = safetyGuard.beforeCycle();
assert(cc4.allowed === true, 'C4b: second cycle with zero cooldown also allowed');

// C5: beforeMissionCreate — normal mission allowed
safetyGuard._reset();
var mc1 = safetyGuard.beforeMissionCreate({
  metadata: { anomalySeverity: 'warning' }
});
assert(mc1.allowed === true, 'C5: normal mission allowed');

// C6: configure thresholds
safetyGuard._reset();
var cfg = safetyGuard.configure({ maxMissionsPerHour: 5, maxCriticalPerHour: 2, globalCooldownMs: 100 });
assertEqual(cfg.maxMissionsPerHour, 5, 'C6a: maxMissionsPerHour configured');
assertEqual(cfg.maxCriticalPerHour, 2, 'C6b: maxCriticalPerHour configured');
assertEqual(cfg.globalCooldownMs, 100, 'C6c: globalCooldownMs configured');

// C7: beforeMissionCreate — hits max missions → safe mode
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 3, maxCriticalPerHour: 10 });
for (var ci = 0; ci < 3; ci++) {
  var r = safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
  assert(r.allowed === true, 'C7_' + ci + ': mission ' + (ci + 1) + ' allowed');
}
var overflow = safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
assert(overflow.allowed === false, 'C7a: 4th mission blocked');
assert(overflow.reason === 'safe_mode_triggered', 'C7b: reason is safe_mode_triggered');
assert(safetyGuard.isSafeMode() === true, 'C7c: safe mode activated');

// C8: resetSafeMode
safetyGuard.resetSafeMode();
assert(safetyGuard.isSafeMode() === false, 'C8: safe mode reset');

// C9: hits max critical → safe mode
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 100, maxCriticalPerHour: 2 });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'critical' } });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'critical' } });
var critOverflow = safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'critical' } });
assert(critOverflow.allowed === false, 'C9a: 3rd critical blocked');
assert(safetyGuard.isSafeMode() === true, 'C9b: safe mode activated on critical overflow');

// C10: safe mode blocks missions
var safeBlock = safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
assert(safeBlock.allowed === false, 'C10a: safe mode blocks');
assertEqual(safeBlock.reason, 'safe_mode_active', 'C10b: reason is safe_mode_active');

// C11: safe mode blocks cycles
var safeCycle = safetyGuard.beforeCycle();
assert(safeCycle.allowed === false, 'C11: safe mode blocks cycles');

// C12: getSafeModeReason returns reason
assert(safetyGuard.getSafeModeReason() !== null, 'C12: safe mode reason available');

// C13: resetSafeMode restores normal operation
safetyGuard.resetSafeMode();
safetyGuard.configure({ maxMissionsPerHour: 100, maxCriticalPerHour: 10, globalCooldownMs: 0 });
var afterReset = safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
assert(afterReset.allowed === true, 'C13: missions allowed after reset');

// C14: afterTriggers — normal
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 100, maxCriticalPerHour: 10 });
var at1 = safetyGuard.afterTriggers(1, 0);
assertEqual(at1.safeMode, false, 'C14: afterTriggers normal — no safe mode');

// C15: afterTriggers — triggers safe mode at threshold
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 5, maxCriticalPerHour: 10, globalCooldownMs: 0 });
// pre-load some missions
for (var cj = 0; cj < 5; cj++) {
  safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
}
var at2 = safetyGuard.afterTriggers(1, 0);
assert(at2.safeMode === true, 'C15: afterTriggers detects threshold');

// C16: configure rejects invalid values
safetyGuard._reset();
var cfg2 = safetyGuard.configure({ maxMissionsPerHour: -1 });
assertEqual(cfg2.maxMissionsPerHour, 60, 'C16: negative value rejected (keeps default)');

// C17: configure accepts valid values
safetyGuard._reset();
var cfg3 = safetyGuard.configure({ windowMs: 120000 });
assertEqual(cfg3.windowMs, 120000, 'C17: windowMs configured');

// C18: getConfig returns full config
safetyGuard._reset();
var cfg4 = safetyGuard.getConfig();
assert(typeof cfg4.maxMissionsPerHour === 'number', 'C18a: maxMissionsPerHour in config');
assert(typeof cfg4.maxCriticalPerHour === 'number', 'C18b: maxCriticalPerHour in config');
assert(typeof cfg4.safeMode === 'boolean', 'C18c: safeMode in config');

// C19: mission count sliding window — old entries expire
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 100, windowMs: 10 }); // 10ms window
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
// wait for window to expire
var startWait = Date.now();
while (Date.now() - startWait < 20) { /* busy wait */ }
var c19 = safetyGuard.getStats();
assertEqual(c19.missionsInWindow, 0, 'C19: old missions expire from window');

// C20: beforeMissionCreate without metadata
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 100, maxCriticalPerHour: 10 });
var mcNoMeta = safetyGuard.beforeMissionCreate(null);
assert(mcNoMeta.allowed === true, 'C20: null mission allowed (severity defaults to warning)');

// C21: beforeMissionCreate with empty object
var mcEmpty = safetyGuard.beforeMissionCreate({});
assert(mcEmpty.allowed === true, 'C21: empty mission allowed');

// C22: panic reason stored
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 1 });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
assert(safetyGuard.getSafeModeReason().indexOf('MAX_MISSIONS_PER_HOUR') !== -1, 'C22: panic reason contains threshold name');

// C23: setAuditLog — does not crash
safetyGuard._reset();
var mockAudit = { logSafeMode: function() {} };
safetyGuard.setAuditLog(mockAudit);
assert(true, 'C23: setAuditLog works');

// C24: _enterSafeMode via audit log does not crash
safetyGuard._reset();
safetyGuard.setAuditLog(mockAudit);
safetyGuard.configure({ maxMissionsPerHour: 1 });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
assert(safetyGuard.isSafeMode(), 'C24: safe mode with mock audit log');

// C25: double safe mode entry is idempotent
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 1 });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
var reason1 = safetyGuard.getSafeModeReason();
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } }); // second entry attempt
var reason2 = safetyGuard.getSafeModeReason();
assertEqual(reason1, reason2, 'C25: safe mode entry is idempotent');

// C26: getStats includes all fields
safetyGuard._reset();
var stats1 = safetyGuard.getStats();
assert('safeMode' in stats1, 'C26a: safeMode field');
assert('missionsInWindow' in stats1, 'C26b: missionsInWindow field');
assert('criticalInWindow' in stats1, 'C26c: criticalInWindow field');
assert('maxPerHour' in stats1, 'C26d: maxPerHour field');
assert('maxCritical' in stats1, 'C26e: maxCritical field');
assert('lastCycleAt' in stats1, 'C26f: lastCycleAt field');

// C27: beforeCycle updates lastCycleAt
safetyGuard._reset();
safetyGuard.configure({ globalCooldownMs: 0 });
safetyGuard.beforeCycle();
var stats2 = safetyGuard.getStats();
assert(stats2.lastCycleAt !== null, 'C27: lastCycleAt set after cycle');

// C28: configure with zero values
safetyGuard._reset();
var cfg5 = safetyGuard.configure({ globalCooldownMs: 0 });
assertEqual(cfg5.globalCooldownMs, 0, 'C28: zero cooldown accepted');

// C29: windowMs accepts short values for testing
safetyGuard._reset();
safetyGuard.configure({ windowMs: 1000 });
var cfg6 = safetyGuard.getConfig();
assertEqual(cfg6.windowMs, 1000, 'C29a: windowMs accepted (>= 1)');

// C30: windowMs rejects zero
safetyGuard._reset();
var cfg7 = safetyGuard.configure({ windowMs: 0 });
assertEqual(cfg7.windowMs, 60000, 'C30: windowMs=0 rejected (keeps default)');

// C31: windowMs rejects negative
safetyGuard._reset();
var cfg8 = safetyGuard.configure({ windowMs: -1 });
assertEqual(cfg8.windowMs, 60000, 'C31: windowMs=-1 rejected (keeps default)');

// C30: critical missions tracked correctly
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 100, maxCriticalPerHour: 10 });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'critical' } });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'critical' } });
var stats3 = safetyGuard.getStats();
assertEqual(stats3.missionsInWindow, 3, 'C30a: 3 total missions');
assertEqual(stats3.criticalInWindow, 2, 'C30b: 2 critical missions');

// C31: afterTriggers with critical count
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 100, maxCriticalPerHour: 2 });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'critical' } });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'critical' } });
var at3 = safetyGuard.afterTriggers(0, 0);
assert(at3.safeMode === true, 'C31: afterTriggers detects critical threshold');

// C32: beforeCycle blocked during safe mode
var ccBlocked = safetyGuard.beforeCycle();
assert(ccBlocked.allowed === false, 'C32: beforeCycle blocked in safe mode');

// C33: resetSafeMode clears reason
safetyGuard.resetSafeMode();
assertEqual(safetyGuard.getSafeModeReason(), null, 'C33: reason cleared after reset');

// C34: _reset clears all state
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 100, maxCriticalPerHour: 10, globalCooldownMs: 0 });
safetyGuard.beforeCycle();
safetyGuard._reset();
var afterFullReset = safetyGuard.getStats();
assertEqual(afterFullReset.missionsInWindow, 0, 'C34a: missions cleared');
assertEqual(afterFullReset.lastCycleAt, null, 'C34b: lastCycleAt cleared');

// C35: beforeMissionCreate with safe_mode_active returns detail
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 1 });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
var blockResult = safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
assert(blockResult.detail !== null, 'C35: blocked mission includes detail');

// ================================================================
// PART D: passive-monitor-loop (unit tests, 20 tests)
// ================================================================
console.log('\n=== PART D: passive-monitor-loop (unit) ===');

passiveLoop._reset();

// D1: initial state — not running
assert(passiveLoop.isRunning() === false, 'D1: not running initially');

// D2: start with minimal config
var start1 = passiveLoop.startPassiveMonitoring({
  intervalMs: 100,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host', taskCount: 5, memoryMB: 100 }), latencyMs: 50 },
  memoryData: { dbExists: true, dbSizeBytes: 1024, walSizeBytes: 512, jsonlFiles: [], lastWriteAt: new Date().toISOString(), writeErrors: 0, recordCounts: {} },
  bridgeData: { jsonlExists: true, jsonlSizeBytes: 1024, lastWriteAt: new Date().toISOString(), recentEvents: [], errorCount: 0, rejectedCount: 0, allowedCount: 10, avgDurationMs: 50 },
  safetyGuard: { maxMissionsPerHour: 100, maxCriticalPerHour: 20, globalCooldownMs: 0 }
});
assert(start1.started === true, 'D2a: started');
assertEqual(start1.intervalMs, 100, 'D2b: interval set');
assertDeepEqual(start1.watchers, ['pm2', 'gateway', 'agent-host', 'memory', 'bridge'], 'D2c: watchers');

// D3: cannot start twice
var start2 = passiveLoop.startPassiveMonitoring({ intervalMs: 200 });
assert(start2.started === false, 'D3a: second start rejected');
assertEqual(start2.reason, 'already_running', 'D3b: reason');

// D4: stop
var stop1 = passiveLoop.stopPassiveMonitoring();
assert(stop1.stopped === true, 'D4a: stopped');
assert(passiveLoop.isRunning() === false, 'D4b: not running after stop');

// D5: cannot stop twice
var stop2 = passiveLoop.stopPassiveMonitoring();
assert(stop2.stopped === false, 'D5: second stop rejected');

// D6: runOnce with healthy data
passiveLoop._reset();
passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host', taskCount: 5, memoryMB: 100 }), latencyMs: 50 },
  memoryData: { dbExists: true, dbSizeBytes: 1024, walSizeBytes: 512, jsonlFiles: [], lastWriteAt: new Date().toISOString(), writeErrors: 0, recordCounts: {} },
  bridgeData: { jsonlExists: true, jsonlSizeBytes: 1024, lastWriteAt: new Date().toISOString(), recentEvents: [], errorCount: 0, rejectedCount: 0, allowedCount: 10, avgDurationMs: 50 },
  safetyGuard: { maxMissionsPerHour: 100, maxCriticalPerHour: 20, globalCooldownMs: 0 }
});
var snap1 = passiveLoop.runOnce();
assert(snap1 !== undefined, 'D6a: snapshot returned');
assert(snap1.watcherResults !== undefined, 'D6b: watcherResults present');
assertEqual(snap1.watcherResults.pm2.status, 'healthy', 'D6c: PM2 healthy');
assertEqual(snap1.watcherResults.gateway.status, 'healthy', 'D6d: Gateway healthy');

// D7: runOnce with anomaly data — triggers mission
passiveLoop._reset();
passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: [{ name: 'wecom-adapter', pm_id: 0, pid: 12345, status: 'stopped', restarts: 0, unstableRestarts: 0, user: 'nobody', uid: 1000, memory: 1024 }],
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host', taskCount: 5, memoryMB: 100 }), latencyMs: 50 },
  memoryData: { dbExists: true, dbSizeBytes: 1024, walSizeBytes: 512, jsonlFiles: [], lastWriteAt: new Date().toISOString(), writeErrors: 0, recordCounts: {} },
  bridgeData: { jsonlExists: true, jsonlSizeBytes: 1024, lastWriteAt: new Date().toISOString(), recentEvents: [], errorCount: 0, rejectedCount: 0, allowedCount: 10, avgDurationMs: 50 },
  safetyGuard: { maxMissionsPerHour: 100, maxCriticalPerHour: 20, globalCooldownMs: 0 }
});
var snap2 = passiveLoop.runOnce();
assertEqual(snap2.watcherResults.pm2.status, 'critical', 'D7a: PM2 critical');
assert(snap2.triggerResult.triggered.length >= 1, 'D7b: at least 1 trigger');
assert(snap2.triggerResult.triggered[0].mission !== undefined, 'D7c: mission created');
assertEqual(snap2.watcherResults.gateway.status, 'healthy', 'D7d: Gateway still healthy');

// D8: runOnce with gateway anomaly
passiveLoop._reset();
passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 500, body: JSON.stringify({ status: 'error' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host', taskCount: 5, memoryMB: 100 }), latencyMs: 50 },
  memoryData: { dbExists: true, dbSizeBytes: 1024, walSizeBytes: 512, jsonlFiles: [], lastWriteAt: new Date().toISOString(), writeErrors: 0, recordCounts: {} },
  bridgeData: { jsonlExists: true, jsonlSizeBytes: 1024, lastWriteAt: new Date().toISOString(), recentEvents: [], errorCount: 0, rejectedCount: 0, allowedCount: 10, avgDurationMs: 50 },
  safetyGuard: { maxMissionsPerHour: 100, maxCriticalPerHour: 20, globalCooldownMs: 0 }
});
var snap3 = passiveLoop.runOnce();
assertEqual(snap3.watcherResults.gateway.status, 'critical', 'D8a: Gateway critical');
assert(snap3.triggerResult.triggered.length >= 1, 'D8b: anomaly triggered');

// D9: watcher errors are caught
passiveLoop._reset();
passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: 'invalid json that will break parser {{{',
  gatewayData: null,
  agentHostData: null,
  memoryData: null,
  bridgeData: null,
  safetyGuard: { maxMissionsPerHour: 100, maxCriticalPerHour: 20, globalCooldownMs: 0 }
});
var snap4 = passiveLoop.runOnce();
assert(snap4.watcherResults.pm2 !== undefined, 'D9a: PM2 result present even on error');
assert(snap4.watcherResults.gateway !== undefined, 'D9b: Gateway result present');
assert(snap4.watcherResults.agentHost !== undefined, 'D9c: Agent Host result present');
assert(snap4.watcherResults.memory !== undefined, 'D9d: Memory result present');
assert(snap4.watcherResults.bridge !== undefined, 'D9e: Bridge result present');

// D10: getMonitoringStatus after runOnce
var status1 = passiveLoop.getMonitoringStatus();
assert(typeof status1.running === 'boolean', 'D10a: running field');
assert(typeof status1.totalCycles === 'number', 'D10b: totalCycles field');
assert(status1.missionsByStatus !== undefined, 'D10c: missionsByStatus field');
assert(status1.safetyGuard !== undefined, 'D10d: safetyGuard field');

// D11: runOnce returns snapshot with all fields
assert(snap4.cycleIndex !== undefined, 'D11a: cycleIndex');
assert(snap4.timestamp !== undefined, 'D11b: timestamp');
assert(snap4.triggerResult !== undefined, 'D11c: triggerResult');
assert(snap4.safeMode !== undefined, 'D11d: safeMode');

// D12: cooldown between runOnce calls
passiveLoop._reset();
passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: [{ name: 'wecom-adapter', pm_id: 0, pid: 12345, status: 'stopped', restarts: 0, unstableRestarts: 0, user: 'nobody', uid: 1000, memory: 1024 }],
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host', taskCount: 5, memoryMB: 100 }), latencyMs: 50 },
  memoryData: { dbExists: true, dbSizeBytes: 1024, walSizeBytes: 512, jsonlFiles: [], lastWriteAt: new Date().toISOString(), writeErrors: 0, recordCounts: {} },
  bridgeData: { jsonlExists: true, jsonlSizeBytes: 1024, lastWriteAt: new Date().toISOString(), recentEvents: [], errorCount: 0, rejectedCount: 0, allowedCount: 10, avgDurationMs: 50 },
  safetyGuard: { maxMissionsPerHour: 100, maxCriticalPerHour: 20, globalCooldownMs: 0 }
});
triggerEngine.resetTriggerState();
var run1 = passiveLoop.runOnce();
var triggerCount1 = run1.triggerResult.triggered.length;
var run2 = passiveLoop.runOnce();
var triggerCount2 = run2.triggerResult.triggered.length;
// Second run should have fewer triggers due to cooldown
assert(triggerCount1 > 0, 'D12a: first run triggers anomalies');
assert(triggerCount2 < triggerCount1, 'D12b: second run suppressed by cooldown');

// D13: setWatcherData changes data for next cycle
passiveLoop._reset();
passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host', taskCount: 5, memoryMB: 100 }), latencyMs: 50 },
  memoryData: { dbExists: true, dbSizeBytes: 1024 },
  bridgeData: { jsonlExists: true, jsonlSizeBytes: 1024 },
  safetyGuard: { maxMissionsPerHour: 100, maxCriticalPerHour: 20, globalCooldownMs: 0 }
});
passiveLoop.setWatcherData('pm2', [{ name: 'test', pm_id: 0, pid: 1, status: 'stopped', restarts: 0 }]);
var snap5 = passiveLoop.runOnce();
assertEqual(snap5.watcherResults.pm2.status, 'critical', 'D13: setWatcherData changes PM2 result');

// D14: setWatcherOptions
passiveLoop._reset();
passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 5000 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { maxMissionsPerHour: 100, maxCriticalPerHour: 20, globalCooldownMs: 0 }
});
// Set very high latency threshold so 5000ms is not anomalous
passiveLoop.setWatcherOptions('gateway', { latencyThresholdMs: 10000 });
var snap6 = passiveLoop.runOnce();
assertEqual(snap6.watcherResults.gateway.status, 'healthy', 'D14: custom options suppress high latency anomaly');

// D15: getMonitoringStatus shows safetyGuard
passiveLoop._reset();
passiveLoop.startPassiveMonitoring({
  intervalMs: 100,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { maxMissionsPerHour: 5, maxCriticalPerHour: 2, globalCooldownMs: 0 }
});
var status2 = passiveLoop.getMonitoringStatus();
assertEqual(status2.safetyGuard.maxPerHour, 5, 'D15: safety guard config in status');

// D16: stop then get status
passiveLoop.stopPassiveMonitoring();
var status3 = passiveLoop.getMonitoringStatus();
assertEqual(status3.running, false, 'D16: not running after stop');

// D17: runOnce in safe mode returns error
passiveLoop._reset();
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 1 });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
passiveLoop.startPassiveMonitoring({
  intervalMs: 100,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { maxMissionsPerHour: 100, globalCooldownMs: 0 }
});
// Reset safety guard first, then force safe mode
safetyGuard.resetSafeMode();
var runSafe = passiveLoop.runOnce();
assert(runSafe.error === undefined || runSafe.safeMode === false, 'D17: runOnce works after safety reset');

// D18: isRunning after start
passiveLoop._reset();
passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { maxMissionsPerHour: 100, maxCriticalPerHour: 20, globalCooldownMs: 0 }
});
assert(passiveLoop.isRunning() === true, 'D18: isRunning returns true');
passiveLoop.stopPassiveMonitoring();

// D19: getMonitoringStatus all fields populated
passiveLoop._reset();
passiveLoop.startPassiveMonitoring({
  intervalMs: 100,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { globalCooldownMs: 0 }
});
passiveLoop.runOnce();
var fullStatus = passiveLoop.getMonitoringStatus();
assert('intervalMs' in fullStatus, 'D19a: intervalMs');
assert('activeWatchers' in fullStatus, 'D19b: activeWatchers');
assert('lastRunAt' in fullStatus, 'D19c: lastRunAt');
assert('totalChecks' in fullStatus, 'D19d: totalChecks');
assert('totalTriggers' in fullStatus, 'D19e: totalTriggers');
assert('totalSuppressed' in fullStatus, 'D19f: totalSuppressed');
assert('totalCycles' in fullStatus, 'D19g: totalCycles');
assert('activeMissions' in fullStatus, 'D19h: activeMissions');
assert('missionsByStatus' in fullStatus, 'D19i: missionsByStatus');
assert('safetyGuard' in fullStatus, 'D19j: safetyGuard');
passiveLoop.stopPassiveMonitoring();

// D20: runOnce with all healthy = zero triggers
passiveLoop._reset();
triggerEngine.resetTriggerState();
passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host', taskCount: 5, memoryMB: 100 }), latencyMs: 50 },
  memoryData: { dbExists: true, dbSizeBytes: 1024, walSizeBytes: 512, jsonlFiles: [], lastWriteAt: new Date().toISOString(), writeErrors: 0, recordCounts: {} },
  bridgeData: { jsonlExists: true, jsonlSizeBytes: 1024, lastWriteAt: new Date().toISOString(), recentEvents: [], errorCount: 0, rejectedCount: 0, allowedCount: 10, avgDurationMs: 50 },
  safetyGuard: { maxMissionsPerHour: 100, maxCriticalPerHour: 20, globalCooldownMs: 0 }
});
var healthySnap = passiveLoop.runOnce();
assertEqual(healthySnap.triggerResult.triggered.length, 0, 'D20: healthy run = zero triggers');

// ================================================================
// PART E: Integration Tests (30 tests)
// ================================================================
console.log('\n=== PART E: Integration Tests ===');

// E1: Full pipeline: all 5 watchers with 1 anomaly each
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 100, maxCriticalPerHour: 30, globalCooldownMs: 0 });

passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: [{ name: 'wecom-adapter', pm_id: 0, pid: 1, status: 'errored', restarts: 0, user: 'nobody', memory: 1024 }],
  gatewayData: { httpStatus: 503, body: 'Service Unavailable', latencyMs: 100 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'error', service: 'openclaw-ai-agent-host', taskCount: 200, memoryMB: 512 }), latencyMs: 100 },
  memoryData: { dbExists: true, dbSizeBytes: 500 * 1024 * 1024, walSizeBytes: 10 * 1024, jsonlFiles: [{ name: 'test.jsonl', errors: 3 }], lastWriteAt: new Date().toISOString(), writeErrors: 5, recordCounts: {} },
  bridgeData: { jsonlExists: true, jsonlSizeBytes: 500 * 1024 * 1024, lastWriteAt: new Date().toISOString(), recentEvents: [{ body: '{"token":"abc123"}' }], errorCount: 10, rejectedCount: 50, allowedCount: 0, avgDurationMs: 5000 },
  safetyGuard: { maxMissionsPerHour: 100, maxCriticalPerHour: 30, globalCooldownMs: 0 }
});

var intSnap = passiveLoop.runOnce();
assert(intSnap.triggerResult.triggered.length > 0, 'E1a: anomalies triggered');
assert(intSnap.watcherResults.pm2.status === 'critical', 'E1b: PM2 critical');
assert(intSnap.watcherResults.gateway.status === 'critical', 'E1c: Gateway critical');
assert(intSnap.watcherResults.agentHost.status === 'critical', 'E1d: Agent Host critical');
assert(intSnap.watcherResults.memory.status === 'critical', 'E1e: Memory critical');
assert(intSnap.watcherResults.bridge.status === 'critical', 'E1f: Bridge critical');

// E2: Dedup — same anomaly twice only triggers once
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 100, maxCriticalPerHour: 30, globalCooldownMs: 0 });

passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: [{ name: 'wecom-adapter', pm_id: 0, pid: 1, status: 'stopped', restarts: 0, user: 'nobody', memory: 1024 }],
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { globalCooldownMs: 0 }
});

var dedup1 = passiveLoop.runOnce();
var triggered1 = dedup1.triggerResult.triggered.length;
var dedup2 = passiveLoop.runOnce();
var triggered2 = dedup2.triggerResult.triggered.length;
var suppressed2 = dedup2.triggerResult.suppressed.length;
assert(triggered1 > 0, 'E2a: first run triggers PM2 anomaly');
assert(triggered2 === 0, 'E2b: second run triggers none (cooldown)');
assert(suppressed2 > 0, 'E2c: second run has suppressed entries');

// E3: Cooldown — after reset trigger state, anomalies trigger again
triggerEngine.resetTriggerState();
var dedup3 = passiveLoop.runOnce();
var triggered3 = dedup3.triggerResult.triggered.length;
assert(triggered3 > 0, 'E3: after resetTriggerState, anomalies trigger again');

// E4: 5 different watchers produce missions with different types
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();

passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: [{ name: 'wecom-adapter', pm_id: 0, pid: 1, status: 'stopped', restarts: 0, user: 'nobody', memory: 1024 }],
  gatewayData: { httpStatus: 500, body: 'err', latencyMs: 50 },
  agentHostData: { httpStatus: 500, body: 'err', latencyMs: 50 },
  memoryData: { dbExists: false },
  bridgeData: { recentEvents: [{ body: 'token: secret' }] },
  safetyGuard: { maxMissionsPerHour: 100, maxCriticalPerHour: 30, globalCooldownMs: 0 }
});

var multiSnap = passiveLoop.runOnce();
var types = {};
for (var ti = 0; ti < multiSnap.triggerResult.triggered.length; ti++) {
  types[multiSnap.triggerResult.triggered[ti].mission.type] = true;
}
assert(types['pm2-health'] === true, 'E4a: pm2-health mission type');
assert(types['gateway-health'] === true, 'E4b: gateway-health mission type');
assert(types['agent-host-health'] === true, 'E4c: agent-host-health mission type');
assert(types['memory-health'] === true, 'E4d: memory-health mission type');
assert(types['bridge-health'] === true, 'E4e: bridge-health mission type');

// E5: Missions created in mission-manager
var allMissions = missionManager.listMissions();
assert(allMissions.length >= 5, 'E5a: at least 5 missions created');
// Verify mission states
var createdMissions = missionManager.listMissions({ status: 'CREATED' });
assert(createdMissions.length > 0, 'E5b: missions in CREATED state');

// E6: Audit log has trigger entries
var logStats6 = auditLog.getLogStats();
assert(logStats6.exists === true, 'E6a: audit log exists');
assert(logStats6.sizeBytes > 0, 'E6b: audit log has content');

// E7: Cycle audit log entry
var logPath7 = auditLog.getLogPath();
var logContent7 = fs.readFileSync(logPath7, 'utf8');
var logLines7 = logContent7.trim().split('\n');
var hasCycleEntry = false;
for (var li = 0; li < logLines7.length; li++) {
  try {
    var entry = JSON.parse(logLines7[li]);
    if (entry.type === 'MONITOR_CYCLE') { hasCycleEntry = true; break; }
  } catch (_) {}
}
assert(hasCycleEntry === true, 'E7: cycle entry in audit log');

// E8: Active missions count in status
var statusE8 = passiveLoop.getMonitoringStatus();
assert(statusE8.activeMissions >= 5, 'E8: active missions reflected in status');

// E9: snaphot callback called
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();

var callbackCalled = false;
var callbackData = null;
passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { globalCooldownMs: 0 },
  onSnapshot: function(snap) { callbackCalled = true; callbackData = snap; }
});
passiveLoop.runOnce();
assert(callbackCalled === true, 'E9a: onSnapshot callback called');
assert(callbackData.cycleIndex !== undefined, 'E9b: callback data has cycleIndex');

// E10: Panic callback called
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();

var panicCalled = false;
var panicReason = null;
passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: [{ name: 'wecom-adapter', pm_id: 0, pid: 1, status: 'stopped', restarts: 0, user: 'nobody', memory: 1024 }],
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { maxMissionsPerHour: 1, maxCriticalPerHour: 1, globalCooldownMs: 0 },
  onPanic: function(reason) { panicCalled = true; panicReason = reason; }
});
passiveLoop.runOnce();
assert(panicCalled === true, 'E10a: onPanic callback called');
assert(panicReason !== null, 'E10b: panic reason provided');

// E11: After panic, monitoring stopped
assert(passiveLoop.isRunning() === false, 'E11: monitoring stopped after panic');

// E12: panic callback received MAX_MISSIONS reason
assert(panicReason.indexOf('MAX_MISSIONS') !== -1, 'E12: panic reason contains MAX_MISSIONS');

// E13: safe mode reflected in status
var statusE13 = passiveLoop.getMonitoringStatus();
assert(statusE13.safeMode === true, 'E13a: safe mode in status');
assert(statusE13.safeModeReason !== null, 'E13b: safe mode reason in status');

// E14: audit log has SAFE_MODE entry
var logLinesE14 = fs.readFileSync(auditLog.getLogPath(), 'utf8').trim().split('\n');
var hasSafeModeEntry = false;
for (var lj = 0; lj < logLinesE14.length; lj++) {
  try {
    var e14 = JSON.parse(logLinesE14[lj]);
    if (e14.type === 'SAFE_MODE') { hasSafeModeEntry = true; break; }
  } catch (_) {}
}
assert(hasSafeModeEntry === true, 'E14: SAFE_MODE entry in audit log');

// E15: mission-manager has missions
var mmMissions = missionManager.listMissions();
assert(mmMissions.length > 0, 'E15a: missions exist in mission manager');
assert(mmMissions[0].missionId !== undefined, 'E15b: mission has missionId');
assert(mmMissions[0].correlationId !== undefined, 'E15c: mission has correlationId');

// E16: trigger result has suppressed items
var intSnap2 = intSnap; // from E1
assert(intSnap2.triggerResult.suppressed !== undefined, 'E16: suppressed list exists');

// E17: trigger result has checkedAt timestamp
assert(intSnap2.triggerResult.checkedAt !== undefined, 'E17: checkedAt exists');

// E18: full cycle through all states — CREATED → RUNNING → COMPLETED
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 100, maxCriticalPerHour: 30, globalCooldownMs: 0 });

passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: [{ name: 'wecom-adapter', pm_id: 0, pid: 1, status: 'stopped', restarts: 0, user: 'nobody', memory: 1024 }],
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { globalCooldownMs: 0 }
});
var fsmSnap = passiveLoop.runOnce();
var missions = missionManager.listMissions();
// Transition first mission to RUNNING
if (missions.length > 0) {
  missionManager.updateMission(missions[0].missionId, { status: 'RUNNING' });
  var afterRunning = missionManager.getMission(missions[0].missionId);
  assertEqual(afterRunning.status, 'RUNNING', 'E18a: transitioned to RUNNING');
  // Complete it
  missionManager.completeMission(missions[0].missionId);
  var afterDone = missionManager.getMission(missions[0].missionId);
  assertEqual(afterDone.status, 'COMPLETED', 'E18b: transitioned to COMPLETED');
}

// E19: getMonitoringStatus shows missionsByStatus
var statusE19 = passiveLoop.getMonitoringStatus();
assert(typeof statusE19.missionsByStatus.total === 'number', 'E19a: total missions');
assert(typeof statusE19.missionsByStatus.completed === 'number', 'E19b: completed count');
assert(statusE19.missionsByStatus.completed >= 1, 'E19c: at least 1 completed');

// E20: runOnce on empty data = healthy snapshot
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();

passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host', taskCount: 5, memoryMB: 100 }), latencyMs: 50 },
  memoryData: { dbExists: true, dbSizeBytes: 1024, walSizeBytes: 512, jsonlFiles: [], lastWriteAt: new Date().toISOString(), writeErrors: 0, recordCounts: {} },
  bridgeData: { jsonlExists: true, jsonlSizeBytes: 1024, lastWriteAt: new Date().toISOString(), recentEvents: [], errorCount: 0, rejectedCount: 0, allowedCount: 10, avgDurationMs: 50 },
  safetyGuard: { globalCooldownMs: 0 }
});
var emptySnap = passiveLoop.runOnce();
assertEqual(emptySnap.watcherResults.pm2.status, 'healthy', 'E20a: PM2 healthy');
assertEqual(emptySnap.watcherResults.gateway.status, 'healthy', 'E20b: Gateway healthy');
assertEqual(emptySnap.watcherResults.agentHost.status, 'healthy', 'E20c: Agent Host healthy');
assertEqual(emptySnap.watcherResults.memory.status, 'healthy', 'E20d: Memory healthy');
assertEqual(emptySnap.watcherResults.bridge.status, 'healthy', 'E20e: Bridge healthy');
assertEqual(emptySnap.triggerResult.triggered.length, 0, 'E20f: zero triggers');

// E21: all 5 watcher names in snapshot
var watcherNames = Object.keys(emptySnap.watcherResults);
assert(watcherNames.indexOf('pm2') !== -1, 'E21a: pm2 in snapshot');
assert(watcherNames.indexOf('gateway') !== -1, 'E21b: gateway in snapshot');
assert(watcherNames.indexOf('agentHost') !== -1, 'E21c: agentHost in snapshot');
assert(watcherNames.indexOf('memory') !== -1, 'E21d: memory in snapshot');
assert(watcherNames.indexOf('bridge') !== -1, 'E21e: bridge in snapshot');

// E22: mission type mapping i18n — all types are correct
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();

passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: [{ name: 'wecom-adapter', pm_id: 0, pid: 1, status: 'stopped', restarts: 0, user: 'nobody', memory: 1024 }],
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { maxMissionsPerHour: 100, globalCooldownMs: 0 }
});
var typeSnap = passiveLoop.runOnce();
var pm2Mission = typeSnap.triggerResult.triggered[0].mission;
assertEqual(pm2Mission.type, 'pm2-health', 'E22: mission type is pm2-health');

// E23: suppressed missions have correct reason in audit
var logPath23 = auditLog.getLogPath();
var logContent23 = fs.readFileSync(logPath23, 'utf8');
assert(logContent23.indexOf('SUPPRESS_COOLDOWN') !== -1 || logContent23.indexOf('SUPPRESS_DEDUP') !== -1, 'E23: suppress type in audit log');

// E24: total cycles incremented after multiple runs
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();

passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { maxMissionsPerHour: 100, globalCooldownMs: 0 }
});
passiveLoop.runOnce();
passiveLoop.runOnce();
passiveLoop.runOnce();
var statusE24 = passiveLoop.getMonitoringStatus();
assertEqual(statusE24.totalCycles, 3, 'E24: 3 cycles after 3 runOnce calls');

// E25: totalChecks = 5 * cycles (5 watchers per cycle)
assertEqual(statusE24.totalChecks, 15, 'E25: 15 total checks (5 watchers x 3 cycles)');

// E26: watcher results contain summary
var wr = emptySnap.watcherResults.pm2;
assert(typeof wr.summary === 'string', 'E26a: summary is string');
assert(wr.summary.length > 0, 'E26b: summary not empty');

// E27: watcher results contain checkedAt
assert(typeof wr.checkedAt === 'string', 'E27: checkedAt is string');

// E28: runOnce returns snapshot with expected structure even on watcher error
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();

passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: 'invalid {{',
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { maxMissionsPerHour: 100, globalCooldownMs: 0 }
});
var errSnap = passiveLoop.runOnce();
assert(errSnap.watcherResults.pm2.status === 'error', 'E28: PM2 error captured in snapshot');

// E29: onPanic not called when no panic
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();

var panicNotCalled = true;
passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { maxMissionsPerHour: 100, globalCooldownMs: 0 },
  onPanic: function() { panicNotCalled = false; }
});
passiveLoop.runOnce();
assert(panicNotCalled === true, 'E29: onPanic not called when healthy');

// E30: stop status includes totalCycles
var stopStatus = passiveLoop.stopPassiveMonitoring();
assert(stopStatus.status.totalCycles > 0, 'E30: stop status includes cycles');

// ================================================================
// PART F: Panic Stop & Safe Mode (15 tests)
// ================================================================
console.log('\n=== PART F: Panic Stop & Safe Mode ===');

// F1: Panic stop when max missions reached
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();

passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: [{ name: 'p1', pm_id: 0, pid: 1, status: 'stopped', restarts: 0, user: 'nobody', memory: 1024 }],
  gatewayData: { httpStatus: 500, body: 'error', latencyMs: 50 },
  agentHostData: { httpStatus: 500, body: 'error', latencyMs: 50 },
  memoryData: { dbExists: false },
  bridgeData: { recentEvents: [{ body: 'token: s' }] },
  safetyGuard: { maxMissionsPerHour: 5, maxCriticalPerHour: 10, globalCooldownMs: 0 }
});
var pSnap1 = passiveLoop.runOnce();
assert(pSnap1.safeMode === true, 'F1a: safe mode triggered');
assert(passiveLoop.isRunning() === false, 'F1b: monitoring stopped');

// F2: safe mode reason accessible
var statusF2 = passiveLoop.getMonitoringStatus();
assert(statusF2.safeMode === true, 'F2a: safe mode in status');
assert(statusF2.safeModeReason !== null, 'F2b: reason available');

// F3: runOnce blocked in safe mode
var blockedSnap = passiveLoop.runOnce();
assert(blockedSnap.error === 'safe_mode_active', 'F3: runOnce blocked in safe mode');

// F4: Safe mode audit log entry exists
var logLinesF4 = fs.readFileSync(auditLog.getLogPath(), 'utf8').trim().split('\n');
var safeCountF4 = 0;
for (var lk = 0; lk < logLinesF4.length; lk++) {
  try {
    var ef4 = JSON.parse(logLinesF4[lk]);
    if (ef4.type === 'SAFE_MODE') safeCountF4++;
  } catch (_) {}
}
assert(safeCountF4 >= 1, 'F4: SAFE_MODE entry in audit log');

// F5: Panic stop prevents new missions in mission-manager
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 1 });

passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: [{ name: 'p1', pm_id: 0, pid: 1, status: 'stopped', restarts: 0, user: 'nobody', memory: 1024 }],
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { globalCooldownMs: 0 }
});
passiveLoop.runOnce();
// Safe mode should be active
assert(safetyGuard.isSafeMode() === true, 'F5a: safety guard in safe mode');
assert(passiveLoop.isRunning() === false, 'F5b: monitoring stopped');

// F6: safety guard blocks beforeMissionCreate after panic
var blockedMc = safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
assert(blockedMc.allowed === false, 'F6a: mission creation blocked');
assertEqual(blockedMc.reason, 'safe_mode_active', 'F6b: reason is safe_mode_active');

// F7: safety guard blocks beforeCycle after panic
var blockedCycle = safetyGuard.beforeCycle();
assert(blockedCycle.allowed === false, 'F7: cycle blocked');

// F8: reset safe mode via safetyGuard.resetSafeMode
safetyGuard.resetSafeMode();
assert(safetyGuard.isSafeMode() === false, 'F8: safe mode reset');

// F9: after reset, monitoring can restart
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard.configure({ maxMissionsPerHour: 100, maxCriticalPerHour: 30, globalCooldownMs: 0 });

passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: HEALTHY_PM2,
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { globalCooldownMs: 0 }
});
assert(passiveLoop.isRunning() === true, 'F9: monitoring restarted after safe mode reset');

// F10: second panic with different reason
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();

passiveLoop.startPassiveMonitoring({
  intervalMs: 1000,
  pm2Data: [{ name: 'p1', pm_id: 0, pid: 1, status: 'stopped', restarts: 0, user: 'nobody', memory: 1024 }],
  gatewayData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', version: '1.0' }), latencyMs: 50 },
  agentHostData: { httpStatus: 200, body: JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host' }), latencyMs: 50 },
  memoryData: { dbExists: true },
  bridgeData: { jsonlExists: true },
  safetyGuard: { maxMissionsPerHour: 1, maxCriticalPerHour: 10, globalCooldownMs: 0 }
});
passiveLoop.runOnce();
assert(safetyGuard.isSafeMode() === true, 'F10a: safe mode from max missions');
assert(safetyGuard.getSafeModeReason().indexOf('MAX_MISSIONS') !== -1, 'F10b: reason contains MAX_MISSIONS');

// F11: critical-only panic
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 100, maxCriticalPerHour: 2, globalCooldownMs: 0 });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'critical' } });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'critical' } });
// 3rd critical should trigger panic
var critBlock = safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'critical' } });
assert(critBlock.allowed === false, 'F11a: 3rd critical blocked');
assert(safetyGuard.isSafeMode() === true, 'F11b: safe mode from critical overflow');
assert(safetyGuard.getSafeModeReason().indexOf('MAX_CRITICAL') !== -1, 'F11c: reason contains MAX_CRITICAL');

// F12: getSafeModeReason returns null when not in safe mode
safetyGuard.resetSafeMode();
assertEqual(safetyGuard.getSafeModeReason(), null, 'F12: reason is null after reset');

// F13: configure during safe mode does not reset safe mode
safetyGuard._reset();
safetyGuard.configure({ maxMissionsPerHour: 1 });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
safetyGuard.beforeMissionCreate({ metadata: { anomalySeverity: 'warning' } });
assert(safetyGuard.isSafeMode() === true, 'F13a: in safe mode');
safetyGuard.configure({ maxMissionsPerHour: 100 });
assert(safetyGuard.isSafeMode() === true, 'F13b: configure does not exit safe mode');

// F14: safety guard getStats in safe mode
var statsF14 = safetyGuard.getStats();
assertEqual(statsF14.safeMode, true, 'F14a: safeMode true in stats');
assert(statsF14.panicReason !== null, 'F14b: panicReason non-null');
assert(statsF14.panicAt !== null, 'F14c: panicAt non-null');

// F15: reset all state — clean test
passiveLoop._reset();
triggerEngine.resetTriggerState();
missionManager._reset();
safetyGuard._reset();
monitoringStatus._reset();
var afterAllReset = monitoringStatus.getMonitoringStatus();
assertEqual(afterAllReset.running, false, 'F15a: all reset — not running');
assertEqual(afterAllReset.totalCycles, 0, 'F15b: all reset — zero cycles');
assertEqual(afterAllReset.safeMode, false, 'F15c: all reset — no safe mode');

// ================================================================
// Cleanup
// ================================================================
try {
  var files = fs.readdirSync(tmpdir);
  for (var fi = 0; fi < files.length; fi++) {
    try { fs.unlinkSync(path.join(tmpdir, files[fi])); } catch (_) {}
  }
  try { fs.rmdirSync(tmpdir); } catch (_) {}
} catch (_) {}

// ================================================================
// Report
// ================================================================
console.log('\n========================================');
console.log('P9.3.2 Passive Monitoring Runtime — Results');
console.log('========================================');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('Total:  ' + (passed + failed));

if (errors.length > 0) {
  console.log('\n--- Failures ---');
  for (var ei = 0; ei < errors.length; ei++) {
    console.log('  ' + errors[ei]);
  }
}

console.log('\nTarget: >= 120 tests');
console.log('Actual: ' + (passed + failed) + ' tests');
if ((passed + failed) >= 120 && failed === 0) {
  console.log('RESULT: PASS');
} else {
  console.log('RESULT: FAIL');
}

process.exit(failed > 0 ? 1 : 0);
