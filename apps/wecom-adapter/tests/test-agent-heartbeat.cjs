'use strict';

/**
 * test-agent-heartbeat.cjs - P10.7 Agent Heartbeat 测试
 *
 * 测试组:
 *   A: Heartbeat Store (unit tests) ~16 assertions
 *   B: Status Derivation ~6 assertions
 *   C: Health Report ~6 assertions
 *   D: API Routes (integration tests) ~10 assertions
 *   E: Dashboard v0.8 ~4 assertions
 */

var http = require('http');
var path = require('path');
var fs = require('fs');

// ─── Test Helpers ─────────────────────────────────────

var passed = 0;
var failed = 0;
var total = 0;

function assert(condition, label) {
  total++;
  if (condition) { passed++; }
  else { failed++; console.error('  FAIL: ' + label); }
}

function assertEqual(actual, expected, label) {
  total++;
  if (actual === expected) { passed++; }
  else { failed++; console.error('  FAIL: ' + label + ' (expected: ' + JSON.stringify(expected) + ', actual: ' + JSON.stringify(actual) + ')'); }
}

function assertContains(str, substring, label) {
  total++;
  if (str && str.indexOf(substring) !== -1) { passed++; }
  else { failed++; console.error('  FAIL: ' + label + ' (string does not contain: ' + substring + ')'); }
}

// ─── Load Store Module ────────────────────────────────

var projectDir = path.join(__dirname, '..');
var storePath = path.join(projectDir, 'src', 'mission', 'agent-heartbeat-store.js');

// Clear require cache to get fresh store
delete require.cache[require.resolve(storePath)];
var store = require(storePath);

// ─── Group A: Heartbeat Store Unit Tests ──────────────

console.log('\n--- Group A: Heartbeat Store ---');

// A1: Default agents initialized
store._reset();
var agents = store.listAgents();
assertEqual(agents.total, 5, 'A1: Default agents initialized (5 agents exist)');

// A2: listAgents returns all 5 default agents
assert(agents.agents.length === 5, 'A2: listAgents returns all 5 default agents');

// A3: getAgent returns specific agent
var codex = store.getAgent('codex');
assert(codex.success && codex.agent.agent === 'codex', 'A3: getAgent returns specific agent');

// A4: getAgent returns error for unknown agent
var unknown = store.getAgent('unknown');
assert(!unknown.success, 'A4: getAgent returns error for unknown agent');

// A5: recordHeartbeat updates last_seen
store._reset();
var beforeTs = store.getAgent('workbuddy').agent.last_seen;
// Small delay to ensure timestamp changes
var startTime = Date.now();
while (Date.now() === startTime) { /* wait for next ms */ }
var result = store.recordHeartbeat({ agent: 'workbuddy', cpu: 45.0, memory: 512.0 });
assert(result.success, 'A5a: recordHeartbeat returns success');
var afterTs = store.getAgent('workbuddy').agent.last_seen;
assert(beforeTs !== afterTs, 'A5: recordHeartbeat updates last_seen');

// A6: recordHeartbeat increments total_heartbeats
store._reset();
store.recordHeartbeat({ agent: 'workbuddy' });
var hb1 = store.getAgent('workbuddy');
assertEqual(hb1.agent.total_heartbeats, 1, 'A6a: First heartbeat = 1');
store.recordHeartbeat({ agent: 'workbuddy' });
var hb2 = store.getAgent('workbuddy');
assertEqual(hb2.agent.total_heartbeats, 2, 'A6: recordHeartbeat increments total_heartbeats');

// A7: recordHeartbeat updates cpu and memory
store._reset();
store.recordHeartbeat({ agent: 'codex', cpu: 75.5, memory: 1024.0 });
var updated = store.getAgent('codex');
assertEqual(updated.agent.cpu, 75.5, 'A7: recordHeartbeat updates cpu');
assertEqual(updated.agent.memory, 1024.0, 'A7b: recordHeartbeat updates memory');

// A8: recordHeartbeat updates active_tasks
store._reset();
store.recordHeartbeat({ agent: 'deepseek', active_tasks: 3 });
var ds = store.getAgent('deepseek');
assertEqual(ds.agent.active_tasks, 3, 'A8: recordHeartbeat updates active_tasks');

// A9: recordHeartbeat updates current_mission
store._reset();
store.recordHeartbeat({ agent: 'doubao', current_mission: 'P10.7-implementation' });
var db = store.getAgent('doubao');
assertEqual(db.agent.current_mission, 'P10.7-implementation', 'A9: recordHeartbeat updates current_mission');

// A10: recordHeartbeat updates error_count
store._reset();
store.recordHeartbeat({ agent: 'openclaw-runtime', error_count: 2 });
var oclaw = store.getAgent('openclaw-runtime');
assertEqual(oclaw.agent.error_count, 2, 'A10: recordHeartbeat updates error_count');

// A11: getAgentHealth returns health report
store._reset();
store.recordHeartbeat({ agent: 'workbuddy' });
var health = store.getAgentHealth('workbuddy');
assert(health.success, 'A11: getAgentHealth returns success');
assert(health.health !== undefined, 'A11b: getAgentHealth returns health object');

// A12: getAgentHealth returns can_dispatch flag
assert(health.health.can_dispatch === true, 'A12: getAgentHealth returns can_dispatch=true for healthy agent');

// A13: getAgentHealth returns warnings array
assert(Array.isArray(health.health.warnings), 'A13: getAgentHealth returns warnings array');

// A14: recordHeartbeat with error_count > 5 → status 'degraded'
store._reset();
store.recordHeartbeat({ agent: 'codex', error_count: 6 });
var degradedCodex = store.getAgent('codex');
assertEqual(degradedCodex.agent.status, 'degraded', 'A14: error_count > 5 → status degraded');

// A15: recordHeartbeat with active_tasks > 0 → status 'busy'
store._reset();
store.recordHeartbeat({ agent: 'deepseek', active_tasks: 2 });
var busyDs = store.getAgent('deepseek');
assertEqual(busyDs.agent.status, 'busy', 'A15: active_tasks > 0 → status busy');

// A16: recordHeartbeat with active_tasks = 0 → status 'idle'
store._reset();
store.recordHeartbeat({ agent: 'doubao', active_tasks: 0 });
var idleDb = store.getAgent('doubao');
assertEqual(idleDb.agent.status, 'idle', 'A16: active_tasks = 0 → status idle');

// ─── Group B: Status Derivation ───────────────────────

console.log('\n--- Group B: Status Derivation ---');

// B1: Default status after init is 'idle'
store._reset();
var defAgent = store.getAgent('codex');
assertEqual(defAgent.agent.status, 'idle', 'B1: Default status after init is idle');

// B2: busy agent has correct status
store._reset();
store.recordHeartbeat({ agent: 'workbuddy', active_tasks: 1 });
var busyWb = store.getAgent('workbuddy');
assertEqual(busyWb.agent.status, 'busy', 'B2: busy agent has correct status');

// B3: degraded agent has correct status and reason
store._reset();
store.recordHeartbeat({ agent: 'codex', error_count: 7 });
var degradedCx = store.getAgent('codex');
assertEqual(degradedCx.agent.status, 'degraded', 'B3a: degraded agent has correct status');
var degradedHealth = store.getAgentHealth('codex');
assertContains(degradedHealth.health.degraded_reason, 'error_count', 'B3b: degraded agent has degraded reason');

// B4: _isTimedOut returns true for old timestamp
var oldTs = new Date(Date.now() - 130 * 1000).toISOString();
assert(store._isTimedOut(oldTs), 'B4: _isTimedOut returns true for old timestamp');

// B5: _isTimedOut returns false for recent timestamp
var recentTs = new Date().toISOString();
assert(!store._isTimedOut(recentTs), 'B5: _isTimedOut returns false for recent timestamp');

// B6: can_dispatch is false for offline agent
store._reset();
// Store a record with old timestamp directly (bypass heartbeat)
store.recordHeartbeat({ agent: 'offline-test' });
// Manually set last_seen to old time
var offlineRecord = store.getAgent('offline-test');
var healthOff = store.getAgentHealth('offline-test');
// Set it back manually - test the derivation rule
store._reset();
// Make an agent offline by recording heartbeat with old last_seen
store.recordHeartbeat({ agent: 'workbuddy', active_tasks: 0, error_count: 0 });
// Directly tamper the store to simulate timeout
// We'll test via _deriveStatus directly
var testRecord = {
  agent: 'test',
  status: 'online',
  last_seen: oldTs,
  active_tasks: 0,
  error_count: 0
};
var derivedStatus = store._deriveStatus(testRecord);
assertEqual(derivedStatus, 'offline', 'B6: _deriveStatus returns offline for timed-out agent');

// ─── Group C: Health Report ───────────────────────────

console.log('\n--- Group C: Health Report ---');

// C1: Health report includes uptime_seconds
store._reset();
store.recordHeartbeat({ agent: 'workbuddy' });
var wbHealth = store.getAgentHealth('workbuddy');
assert(typeof wbHealth.health.uptime_seconds === 'number', 'C1: Health report includes uptime_seconds');

// C2: Health report includes is_online flag
assert(wbHealth.health.is_online === true, 'C2: Health report includes is_online flag');

// C3: Health report includes is_healthy flag
assert(wbHealth.health.is_healthy === true, 'C3: Health report includes is_healthy flag');

// C4: Health report includes all required fields
var requiredFields = ['agent', 'status', 'last_seen', 'uptime_seconds', 'active_tasks',
  'cpu', 'memory', 'current_mission', 'capabilities', 'degraded_reason',
  'error_count', 'total_heartbeats', 'is_online', 'is_healthy', 'can_dispatch', 'warnings'];
var allFieldsPresent = true;
for (var fi = 0; fi < requiredFields.length; fi++) {
  if (!(requiredFields[fi] in wbHealth.health)) {
    console.error('  Missing health field: ' + requiredFields[fi]);
    allFieldsPresent = false;
  }
}
assert(allFieldsPresent, 'C4: Health report includes all required fields');

// C5: Offline agent shows offline warning
store._reset();
// Record heartbeat first to create agent, then directly set old last_seen
store.recordHeartbeat({ agent: 'workbuddy' });
// Directly set old timestamp via the record reference from getAgent
var offlineRec = store.getAgent('workbuddy').agent;
// store._reset() has initDefaults which sets current time
// We need to access internal store directly to set old timestamp
// Use _reset + recordHeartbeat then tamper with the record
store.recordHeartbeat({ agent: 'workbuddy' });
var offlineAgent = store.getAgent('workbuddy').agent;
var oldTs = new Date(Date.now() - 130 * 1000).toISOString();
offlineAgent.last_seen = oldTs;
var offlineHealth = store.getAgentHealth('workbuddy');
assert(offlineHealth.health.can_dispatch === false, 'C5: Offline agent cannot dispatch');
assert(offlineHealth.health.warnings.length > 0, 'C5b: Offline agent shows warnings');

// C6: Degraded agent shows degraded warning
store._reset();
store.recordHeartbeat({ agent: 'codex', error_count: 10 });
var degHealth = store.getAgentHealth('codex');
assert(degHealth.health.can_dispatch === false, 'C6: Degraded agent cannot dispatch');
var hasDegradedWarning = false;
for (var wi = 0; wi < degHealth.health.warnings.length; wi++) {
  if (degHealth.health.warnings[wi].indexOf('降级') !== -1) {
    hasDegradedWarning = true;
  }
}
assert(hasDegradedWarning, 'C6b: Degraded agent shows degraded warning');

// ─── Group D: API Routes (Integration Tests) ──────────

console.log('\n--- Group D: API Routes ---');

// We need to start a temporary server for integration tests
var express;
try {
  express = require('express');
} catch (e) {
  express = null;
}

if (express) {
  var app = express();
  var heartbeatRoutes = require(path.join(projectDir, 'src', 'mission', 'agent-heartbeat-routes'));

  // Register routes
  heartbeatRoutes.registerAgentHeartbeatRoutes(app);

  // Reset store before API tests
  store._reset();

  // Helper to make HTTP requests
  function apiRequest(method, urlPath, body, callback) {
    var options = {
      hostname: '127.0.0.1',
      port: 0,
      path: urlPath,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    var req;
    try {
      // Use a simple approach: start server on random port
    } catch (e) {}

    // Since we can't easily test Express routes without starting a server,
    // let's test the handlers directly
    // We'll test the route handlers from heartbeatRoutes
    callback(null, null);
  }

  // ─── Direct Handler Tests ───────────────────────────

  // D1: handleListAgents returns agents array
  var mockResD1 = {
    _status: 0,
    _json: null,
    status: function(s) { this._status = s; return this; },
    json: function(obj) { this._json = obj; return this; }
  };
  heartbeatRoutes._handleListAgents({ query: {} }, mockResD1);
  assert(mockResD1._json.success === true, 'D1: GET /mission/agents returns 200');
  assert(Array.isArray(mockResD1._json.agents), 'D1b: agents is an array');

  // D2: total = 5 (after reset)
  assertEqual(mockResD1._json.total, 5, 'D2: GET /mission/agents returns total=5');

  // D3: handleGetAgent for codex
  var mockResD3 = {
    _status: 0,
    _json: null,
    status: function(s) { this._status = s; return this; },
    json: function(obj) { this._json = obj; return this; }
  };
  heartbeatRoutes._handleGetAgent({ params: { agent: 'codex' } }, mockResD3);
  assert(mockResD3._json.success === true, 'D3: GET /mission/agents/codex returns 200');
  assert(mockResD3._json.agent.agent === 'codex', 'D3b: returns correct agent');

  // D4: handleGetAgent for unknown
  var mockResD4 = {
    _status: 0,
    _json: null,
    status: function(s) { this._status = s; return this; },
    json: function(obj) { this._json = obj; return this; }
  };
  heartbeatRoutes._handleGetAgent({ params: { agent: 'unknown' } }, mockResD4);
  assert(mockResD4._json.success === false, 'D4: GET /mission/agents/unknown returns 404');
  assertEqual(mockResD4._status, 404, 'D4b: status code is 404');

  // D5: handleHeartbeat returns success
  var mockReqD5 = {
    params: { agent: 'workbuddy' },
    _missionBody: { cpu: 30, memory: 256, active_tasks: 1 }
  };
  var mockResD5 = {
    _status: 0,
    _json: null,
    status: function(s) { this._status = s; return this; },
    json: function(obj) { this._json = obj; return this; }
  };
  heartbeatRoutes._handleHeartbeat(mockReqD5, mockResD5);
  assert(mockResD5._json.success === true, 'D5: POST heartbeat returns 200');

  // D6: POST heartbeat updates agent data
  var wbAfterHb = store.getAgent('workbuddy');
  assertEqual(wbAfterHb.agent.cpu, 30, 'D6a: heartbeat updates cpu');
  assertEqual(wbAfterHb.agent.memory, 256, 'D6b: heartbeat updates memory');
  assertEqual(wbAfterHb.agent.active_tasks, 1, 'D6c: heartbeat updates active_tasks');

  // D7: handleGetAgentHealth returns health report
  var mockResD7 = {
    _status: 0,
    _json: null,
    status: function(s) { this._status = s; return this; },
    json: function(obj) { this._json = obj; return this; }
  };
  heartbeatRoutes._handleGetAgentHealth({ params: { agent: 'workbuddy' } }, mockResD7);
  assert(mockResD7._json.success === true, 'D7: GET /mission/agents/workbuddy/health returns 200');
  assert(mockResD7._json.health !== undefined, 'D7b: has health object');

  // D8: Health report includes can_dispatch
  assert(typeof mockResD7._json.health.can_dispatch === 'boolean', 'D8: Health report includes can_dispatch');

  // D9: Health report includes warnings
  assert(Array.isArray(mockResD7._json.health.warnings), 'D9: Health report includes warnings');

  // D10: handleGetAgentHealth returns 404 for unknown
  var mockResD10 = {
    _status: 0,
    _json: null,
    status: function(s) { this._status = s; return this; },
    json: function(obj) { this._json = obj; return this; }
  };
  heartbeatRoutes._handleGetAgentHealth({ params: { agent: 'unknown' } }, mockResD10);
  assert(mockResD10._json.success === false, 'D10: Health report returns 404 for unknown');
  assertEqual(mockResD10._status, 404, 'D10b: status code 404');
}

// ─── Group E: Dashboard v1.1 ───────────────────────────

console.log('\n--- Group E: Dashboard v1.1 ---');

var dashboardPath = path.join(projectDir, 'public', 'mission-control.html');
var dashboardHtml = fs.readFileSync(dashboardPath, 'utf-8');

// E1: Dashboard contains v1.1
assertContains(dashboardHtml, 'v1.1', 'E1: Dashboard HTML contains v1.1');

// E2: Dashboard contains Agent Health
assertContains(dashboardHtml, 'Agent Health', 'E2: Dashboard HTML contains Agent Health');

// E3: Dashboard contains loadAgentHealth function
assertContains(dashboardHtml, 'loadAgentHealth', 'E3: Dashboard HTML contains loadAgentHealth function');

// E4: Dashboard contains agent-health-panel
assertContains(dashboardHtml, 'agent-health-panel', 'E4: Dashboard HTML contains agent-health-panel');

// ─── Results ──────────────────────────────────────────

console.log('\n========================================');
console.log('  P10.7 Agent Heartbeat 测试结果');
console.log('========================================');
console.log('  Total:  ' + total);
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
}
