'use strict';

/**
 * test-bridge-watcher.cjs — Bridge Watcher unit tests
 *
 * Covers:
 *   1. healthy bridge
 *   2. missing jsonl warning
 *   3. high jsonl size warning
 *   4. stale write warning
 *   5. error count warning
 *   6. rejected count warning
 *   7. zero allowed warning
 *   8. high duration warning
 *   9. secret leak critical
 */

var assert = require('assert');
var bw = require('../src/runtime-watchers/bridge-watcher');

var passed = 0, failed = 0, failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push({ name: name, message: e.message }); }
}

function healthyInput() {
  return {
    jsonlExists: true, jsonlSizeBytes: 1024 * 1024,
    lastWriteAt: new Date().toISOString(),
    recentEvents: [{ type: 'allowed', id: 'evt1' }],
    errorCount: 0, rejectedCount: 3, allowedCount: 42, avgDurationMs: 120
  };
}

// ═══════════════════════════════════════════════════════════
// 1. healthy bridge
// ═══════════════════════════════════════════════════════════

test('healthy: all checks pass', function () {
  var r = bw.checkBridgeHealth(healthyInput());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.status, 'healthy');
  assert.strictEqual(r.anomalies.length, 0);
});

test('healthy: summary contains healthy', function () {
  var r = bw.checkBridgeHealth(healthyInput());
  assert(r.summary.indexOf('healthy') !== -1);
});

// ═══════════════════════════════════════════════════════════
// 2. missing jsonl warning
// ═══════════════════════════════════════════════════════════

test('missing jsonl: jsonlExists=false → MISSING_JSONL warning', function () {
  var input = healthyInput();
  input.jsonlExists = false;
  var r = bw.checkBridgeHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'MISSING_JSONL'; }));
  assert.strictEqual(r.status, 'degraded');
  assert.strictEqual(r.ok, true);
});

// ═══════════════════════════════════════════════════════════
// 3. high jsonl size warning
// ═══════════════════════════════════════════════════════════

test('high jsonl size: 300MB > 256MB default', function () {
  var input = healthyInput();
  input.jsonlSizeBytes = 300 * 1024 * 1024;
  var r = bw.checkBridgeHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'HIGH_JSONL_SIZE'; }));
  assert.strictEqual(r.status, 'degraded');
});

test('high jsonl size: custom 512MB, 300MB passes', function () {
  var input = healthyInput();
  input.jsonlSizeBytes = 300 * 1024 * 1024;
  var r = bw.checkBridgeHealth(input, { sizeThresholdBytes: 512 * 1024 * 1024 });
  assert(!r.anomalies.some(function (a) { return a.type === 'HIGH_JSONL_SIZE'; }));
});

// ═══════════════════════════════════════════════════════════
// 4. stale write warning
// ═══════════════════════════════════════════════════════════

test('stale write: lastWriteAt 48h ago → STALE_WRITE', function () {
  var input = healthyInput();
  input.lastWriteAt = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  var r = bw.checkBridgeHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'STALE_WRITE'; }));
  assert.strictEqual(r.status, 'degraded');
});

test('stale write: null lastWriteAt → no anomaly', function () {
  var input = healthyInput();
  input.lastWriteAt = null;
  var r = bw.checkBridgeHealth(input);
  assert(!r.anomalies.some(function (a) { return a.type === 'STALE_WRITE'; }));
});

// ═══════════════════════════════════════════════════════════
// 5. error count warning
// ═══════════════════════════════════════════════════════════

test('error count: errorCount=5 → ERROR_COUNT warning', function () {
  var input = healthyInput();
  input.errorCount = 5;
  var r = bw.checkBridgeHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'ERROR_COUNT'; }));
  assert.strictEqual(r.status, 'degraded');
});

test('error count: errorCount=0 → no anomaly', function () {
  var r = bw.checkBridgeHealth(healthyInput());
  assert(!r.anomalies.some(function (a) { return a.type === 'ERROR_COUNT'; }));
});

// ═══════════════════════════════════════════════════════════
// 6. rejected count warning
// ═══════════════════════════════════════════════════════════

test('rejected count: rejectedCount=50 > 20 default', function () {
  var input = healthyInput();
  input.rejectedCount = 50;
  var r = bw.checkBridgeHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'HIGH_REJECTED'; }));
  assert.strictEqual(r.status, 'degraded');
});

test('rejected count: custom threshold 100, 50 passes', function () {
  var input = healthyInput();
  input.rejectedCount = 50;
  var r = bw.checkBridgeHealth(input, { rejectedThreshold: 100 });
  assert(!r.anomalies.some(function (a) { return a.type === 'HIGH_REJECTED'; }));
});

test('rejected count: at threshold exactly → no anomaly', function () {
  var input = healthyInput();
  input.rejectedCount = 20;
  var r = bw.checkBridgeHealth(input);
  assert(!r.anomalies.some(function (a) { return a.type === 'HIGH_REJECTED'; }));
});

// ═══════════════════════════════════════════════════════════
// 7. zero allowed warning
// ═══════════════════════════════════════════════════════════

test('zero allowed: allowedCount=0 → ZERO_ALLOWED warning', function () {
  var input = healthyInput();
  input.allowedCount = 0;
  var r = bw.checkBridgeHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'ZERO_ALLOWED'; }));
  assert.strictEqual(r.status, 'degraded');
});

// ═══════════════════════════════════════════════════════════
// 8. high duration warning
// ═══════════════════════════════════════════════════════════

test('high duration: 2500ms > 1000ms default', function () {
  var input = healthyInput();
  input.avgDurationMs = 2500;
  var r = bw.checkBridgeHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'HIGH_DURATION'; }));
  assert.strictEqual(r.status, 'degraded');
});

test('high duration: custom 5000ms, 2500ms passes', function () {
  var input = healthyInput();
  input.avgDurationMs = 2500;
  var r = bw.checkBridgeHealth(input, { durationThresholdMs: 5000 });
  assert(!r.anomalies.some(function (a) { return a.type === 'HIGH_DURATION'; }));
});

// ═══════════════════════════════════════════════════════════
// 9. secret leak critical
// ═══════════════════════════════════════════════════════════

test('secret leak: event with "bearer" → SECRET_LEAK critical', function () {
  var input = healthyInput();
  input.recentEvents = [
    { type: 'allowed', id: 'evt1' },
    { type: 'error', raw: 'Authorization: bearer abc123' }
  ];
  var r = bw.checkBridgeHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'SECRET_LEAK'; }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 'critical');
});

test('secret leak: string event with "token" triggers', function () {
  var input = healthyInput();
  input.recentEvents = ['normal event', 'x-gateway-token=sk-xxx'];
  var r = bw.checkBridgeHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'SECRET_LEAK'; }));
});

test('secret leak: "bridge_token" pattern triggers', function () {
  var input = healthyInput();
  input.recentEvents = [{ msg: 'bridge_token = "secret"' }];
  var r = bw.checkBridgeHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'SECRET_LEAK'; }));
});

test('secret leak: clean events → no alert', function () {
  var r = bw.checkBridgeHealth(healthyInput());
  assert(!r.anomalies.some(function (a) { return a.type === 'SECRET_LEAK'; }));
});

// ═══════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════

test('normalizeBridgeStatus: null → defaults', function () {
  var s = bw.normalizeBridgeStatus(null);
  assert.strictEqual(s.jsonlExists, true);
  assert.strictEqual(s.errorCount, 0);
  assert.strictEqual(s.allowedCount, 0);
  assert.deepStrictEqual(s.recentEvents, []);
});

test('normalizeBridgeStatus: preserves extra fields', function () {
  var s = bw.normalizeBridgeStatus({ customField: 'hello', jsonlExists: true });
  assert.strictEqual(s.customField, 'hello');
});

test('summarizeBridgeHealth: null guard', function () {
  assert.strictEqual(bw.summarizeBridgeHealth(null), 'Bridge health unknown');
});

test('summarizeBridgeHealth: missing anomalies', function () {
  assert.strictEqual(bw.summarizeBridgeHealth({}), 'Bridge health unknown');
});

test('combined: missing jsonl + high rejected + high duration', function () {
  var input = {
    jsonlExists: false, jsonlSizeBytes: 0,
    lastWriteAt: null, recentEvents: [],
    errorCount: 0, rejectedCount: 50, allowedCount: 10, avgDurationMs: 2000
  };
  var r = bw.checkBridgeHealth(input);
  assert(r.anomalies.length >= 3);
  assert.strictEqual(r.status, 'degraded');
});

test('combined: secret leak + errors → critical', function () {
  var input = {
    jsonlExists: true, jsonlSizeBytes: 1024,
    lastWriteAt: new Date().toISOString(),
    recentEvents: [{ raw: 'Authorization: bearer leak' }],
    errorCount: 3, rejectedCount: 0, allowedCount: 5, avgDurationMs: 50
  };
  var r = bw.checkBridgeHealth(input);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 'critical');
});

// ═══════════════════════════════════════════════════════════

console.log('\n=== Bridge Watcher Tests: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failures.length) {
  failures.forEach(function (f) { console.error('  FAIL: ' + f.name + ' — ' + f.message); });
  process.exit(1);
}
console.log('All tests passed!\n');
