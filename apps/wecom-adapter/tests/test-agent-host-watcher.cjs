'use strict';

/**
 * test-agent-host-watcher.cjs — Agent Host Watcher unit tests
 *
 * Covers:
 *   1. healthy 200 ok
 *   2. http 500 critical
 *   3. timeout critical
 *   4. invalid JSON critical
 *   5. status !== ok critical
 *   6. wrong service critical
 *   7. high latency warning
 *   8. high taskCount warning
 *   9. high memoryMB warning
 */

var assert = require('assert');
var ah = require('../src/runtime-watchers/agent-host-watcher');

var passed = 0, failed = 0, failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push({ name: name, message: e.message }); }
}

function healthyBody() {
  return JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host', version: '2.0', taskCount: 12, memoryMB: 64 });
}

// ═══════════════════════════════════════════════════════════
// 1. healthy 200 ok
// ═══════════════════════════════════════════════════════════

test('healthy: all checks pass', function () {
  var r = ah.checkAgentHostHealth({ httpStatus: 200, body: healthyBody(), latencyMs: 42 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.status, 'healthy');
  assert.strictEqual(r.anomalies.length, 0);
});

test('healthy: summary contains healthy', function () {
  var r = ah.checkAgentHostHealth({ httpStatus: 200, body: healthyBody(), latencyMs: 10 });
  assert(r.summary.indexOf('healthy') !== -1);
});

// ═══════════════════════════════════════════════════════════
// 2. http 500 critical
// ═══════════════════════════════════════════════════════════

test('HTTP 500: detected as critical', function () {
  var r = ah.checkAgentHostHealth({ httpStatus: 500, body: 'error', latencyMs: 200 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 'critical');
  assert(r.anomalies.some(function (a) { return a.type === 'HTTP_STATUS'; }));
});

test('HTTP 503: also critical', function () {
  var r = ah.checkAgentHostHealth({ httpStatus: 503, body: '', latencyMs: 100 });
  assert.strictEqual(r.ok, false);
});

// ═══════════════════════════════════════════════════════════
// 3. timeout critical
// ═══════════════════════════════════════════════════════════

test('timeout: no httpStatus + latencyMs=-1 → TIMEOUT', function () {
  var r = ah.checkAgentHostHealth({ httpStatus: -1, body: null, latencyMs: -1 });
  assert.strictEqual(r.ok, false);
  assert(r.anomalies.some(function (a) { return a.type === 'TIMEOUT'; }));
});

// ═══════════════════════════════════════════════════════════
// 4. invalid JSON critical
// ═══════════════════════════════════════════════════════════

test('invalid JSON: unparseable body', function () {
  var r = ah.checkAgentHostHealth({ httpStatus: 200, body: '{{{broken', latencyMs: 50 });
  assert(r.anomalies.some(function (a) { return a.type === 'INVALID_JSON'; }));
  assert.strictEqual(r.ok, false);
});

// ═══════════════════════════════════════════════════════════
// 5. status !== ok critical
// ═══════════════════════════════════════════════════════════

test('status not ok: degraded', function () {
  var body = JSON.stringify({ status: 'degraded', service: 'openclaw-ai-agent-host' });
  var r = ah.checkAgentHostHealth({ httpStatus: 200, body: body, latencyMs: 60 });
  assert(r.anomalies.some(function (a) { return a.type === 'STATUS_NOT_OK'; }));
  assert.strictEqual(r.ok, false);
});

// ═══════════════════════════════════════════════════════════
// 6. wrong service critical
// ═══════════════════════════════════════════════════════════

test('wrong service: unexpected service name', function () {
  var body = JSON.stringify({ status: 'ok', service: 'some-other-service' });
  var r = ah.checkAgentHostHealth({ httpStatus: 200, body: body, latencyMs: 50 });
  assert(r.anomalies.some(function (a) { return a.type === 'WRONG_SERVICE'; }));
  assert.strictEqual(r.ok, false);
});

test('wrong service: missing service field → no WRONG_SERVICE', function () {
  var r = ah.checkAgentHostHealth({
    httpStatus: 200,
    body: JSON.stringify({ status: 'ok', version: '1.0' }),
    latencyMs: 30
  });
  assert(!r.anomalies.some(function (a) { return a.type === 'WRONG_SERVICE'; }));
});

// ═══════════════════════════════════════════════════════════
// 7. high latency warning
// ═══════════════════════════════════════════════════════════

test('high latency: 1500ms > 1000ms default', function () {
  var r = ah.checkAgentHostHealth({ httpStatus: 200, body: healthyBody(), latencyMs: 1500 });
  assert(r.anomalies.some(function (a) { return a.type === 'HIGH_LATENCY'; }));
  assert.strictEqual(r.status, 'degraded');
});

test('high latency: custom threshold 2000, 1500 passes', function () {
  var r = ah.checkAgentHostHealth({ httpStatus: 200, body: healthyBody(), latencyMs: 1500 },
    { latencyThresholdMs: 2000 });
  assert.strictEqual(r.anomalies.length, 0);
});

test('latency at threshold: 1000ms not anomalous', function () {
  var r = ah.checkAgentHostHealth({ httpStatus: 200, body: healthyBody(), latencyMs: 1000 });
  assert(!r.anomalies.some(function (a) { return a.type === 'HIGH_LATENCY'; }));
});

// ═══════════════════════════════════════════════════════════
// 8. high taskCount warning
// ═══════════════════════════════════════════════════════════

test('high taskCount: 150 > 100 default threshold', function () {
  var body = JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host', taskCount: 150, memoryMB: 32 });
  var r = ah.checkAgentHostHealth({ httpStatus: 200, body: body, latencyMs: 30 });
  assert(r.anomalies.some(function (a) { return a.type === 'HIGH_TASK_COUNT'; }));
  assert.strictEqual(r.status, 'degraded');
});

test('high taskCount: custom threshold 200, 150 passes', function () {
  var body = JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host', taskCount: 150, memoryMB: 32 });
  var r = ah.checkAgentHostHealth({ httpStatus: 200, body: body, latencyMs: 30 },
    { taskCountThreshold: 200 });
  assert(!r.anomalies.some(function (a) { return a.type === 'HIGH_TASK_COUNT'; }));
});

// ═══════════════════════════════════════════════════════════
// 9. high memoryMB warning
// ═══════════════════════════════════════════════════════════

test('high memoryMB: 512 > 256 default threshold', function () {
  var body = JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host', taskCount: 10, memoryMB: 512 });
  var r = ah.checkAgentHostHealth({ httpStatus: 200, body: body, latencyMs: 30 });
  assert(r.anomalies.some(function (a) { return a.type === 'HIGH_MEMORY'; }));
  assert.strictEqual(r.status, 'degraded');
});

test('high memoryMB: custom threshold 1024, 512 passes', function () {
  var body = JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host', taskCount: 10, memoryMB: 512 });
  var r = ah.checkAgentHostHealth({ httpStatus: 200, body: body, latencyMs: 30 },
    { memoryMBThreshold: 1024 });
  assert(!r.anomalies.some(function (a) { return a.type === 'HIGH_MEMORY'; }));
});

// ═══════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════

test('normalizeAgentHostTarget: string', function () {
  assert.strictEqual(ah.normalizeAgentHostTarget('http://1.2.3.4:8080/h'), 'http://1.2.3.4:8080/h');
});

test('normalizeAgentHostTarget: null → default', function () {
  assert.strictEqual(ah.normalizeAgentHostTarget(null), 'http://127.0.0.1:3002/health');
});

test('summarizeAgentHostHealth: null guard', function () {
  assert.strictEqual(ah.summarizeAgentHostHealth(null), 'Agent Host health unknown');
});

test('URL mode: returns timeout', function () {
  var r = ah.checkAgentHostHealth('http://127.0.0.1:39999/health');
  assert(r.anomalies.some(function (a) { return a.type === 'TIMEOUT'; }));
});

test('combined: 500 + high latency + high memory', function () {
  var body = JSON.stringify({ status: 'ok', service: 'openclaw-ai-agent-host', taskCount: 5, memoryMB: 512 });
  var r = ah.checkAgentHostHealth({ httpStatus: 500, body: body, latencyMs: 2000 });
  assert(r.anomalies.length >= 3);
  assert.strictEqual(r.status, 'critical');
});

// ═══════════════════════════════════════════════════════════

console.log('\n=== Agent Host Watcher Tests: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failures.length) {
  failures.forEach(function (f) { console.error('  FAIL: ' + f.name + ' — ' + f.message); });
  process.exit(1);
}
console.log('All tests passed!\n');
