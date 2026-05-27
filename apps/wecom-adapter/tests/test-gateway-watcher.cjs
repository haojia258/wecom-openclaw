'use strict';

/**
 * test-gateway-watcher.cjs — Gateway Watcher unit tests
 *
 * Covers:
 *   1. healthy 200 ok
 *   2. http 500 critical
 *   3. timeout critical
 *   4. invalid JSON critical
 *   5. status !== ok critical
 *   6. high latency warning
 *   7. missing version warning
 */

var assert = require('assert');
var gw = require('../src/runtime-watchers/gateway-watcher');

var passed = 0;
var failed = 0;
var failures = [];

function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push({ name: name, message: e.message }); }
}

// ═══════════════════════════════════════════════════════════
// 1. healthy 200 ok
// ═══════════════════════════════════════════════════════════

test('healthy: 200 + ok status + version', function () {
  var r = gw.checkGatewayHealth({
    httpStatus: 200,
    body: JSON.stringify({ status: 'ok', version: '1.2.3' }),
    latencyMs: 42
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.status, 'healthy');
  assert.strictEqual(r.anomalies.length, 0);
});

test('healthy: summary contains healthy', function () {
  var r = gw.checkGatewayHealth({
    httpStatus: 200,
    body: JSON.stringify({ status: 'ok', version: '1.0' }),
    latencyMs: 10
  });
  assert(r.summary.indexOf('healthy') !== -1);
});

// ═══════════════════════════════════════════════════════════
// 2. http 500 critical
// ═══════════════════════════════════════════════════════════

test('HTTP 500: detected as HTTP_STATUS critical', function () {
  var r = gw.checkGatewayHealth({
    httpStatus: 500,
    body: 'Internal Server Error',
    latencyMs: 200
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 'critical');
  assert(r.anomalies.some(function (a) { return a.type === 'HTTP_STATUS'; }));
});

test('HTTP 503: also critical', function () {
  var r = gw.checkGatewayHealth({ httpStatus: 503, body: '', latencyMs: 100 });
  assert.strictEqual(r.ok, false);
});

// ═══════════════════════════════════════════════════════════
// 3. timeout critical
// ═══════════════════════════════════════════════════════════

test('timeout: no httpStatus + latencyMs=-1 → TIMEOUT critical', function () {
  var r = gw.checkGatewayHealth({ httpStatus: -1, body: null, latencyMs: -1 });
  assert.strictEqual(r.ok, false);
  assert(r.anomalies.some(function (a) { return a.type === 'TIMEOUT'; }));
});

// ═══════════════════════════════════════════════════════════
// 4. invalid JSON critical
// ═══════════════════════════════════════════════════════════

test('invalid JSON: body is not parseable', function () {
  var r = gw.checkGatewayHealth({
    httpStatus: 200,
    body: 'not-json{{{',
    latencyMs: 50
  });
  assert(r.anomalies.some(function (a) { return a.type === 'INVALID_JSON'; }));
  assert.strictEqual(r.ok, false);
});

test('invalid JSON: HTML body instead of JSON', function () {
  var r = gw.checkGatewayHealth({
    httpStatus: 200,
    body: '<html><body>502 Bad Gateway</body></html>',
    latencyMs: 80
  });
  assert(r.anomalies.some(function (a) { return a.type === 'INVALID_JSON'; }));
});

// ═══════════════════════════════════════════════════════════
// 5. status !== ok critical
// ═══════════════════════════════════════════════════════════

test('status not ok: degraded status in body', function () {
  var r = gw.checkGatewayHealth({
    httpStatus: 200,
    body: JSON.stringify({ status: 'degraded', version: '1.0' }),
    latencyMs: 60
  });
  assert(r.anomalies.some(function (a) { return a.type === 'STATUS_NOT_OK'; }));
  assert.strictEqual(r.ok, false);
});

test('status not ok: error status in body', function () {
  var r = gw.checkGatewayHealth({
    httpStatus: 200,
    body: JSON.stringify({ status: 'error', version: '1.0' }),
    latencyMs: 70
  });
  assert(r.anomalies.some(function (a) { return a.type === 'STATUS_NOT_OK'; }));
});

// ═══════════════════════════════════════════════════════════
// 6. high latency warning
// ═══════════════════════════════════════════════════════════

test('high latency: 1500ms > 1000ms default threshold', function () {
  var r = gw.checkGatewayHealth({
    httpStatus: 200,
    body: JSON.stringify({ status: 'ok', version: '1.0' }),
    latencyMs: 1500
  });
  assert(r.anomalies.some(function (a) { return a.type === 'HIGH_LATENCY'; }));
  // Still healthy because only warning, no critical
  assert.strictEqual(r.status, 'degraded');
});

test('high latency: custom threshold 2000ms, 1500ms passes', function () {
  var r = gw.checkGatewayHealth({
    httpStatus: 200,
    body: JSON.stringify({ status: 'ok', version: '1.0' }),
    latencyMs: 1500
  }, { latencyThresholdMs: 2000 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.anomalies.length, 0);
});

test('latency at threshold: 1000ms not anomalous', function () {
  var r = gw.checkGatewayHealth({
    httpStatus: 200,
    body: JSON.stringify({ status: 'ok', version: '1.0' }),
    latencyMs: 1000
  });
  assert(!r.anomalies.some(function (a) { return a.type === 'HIGH_LATENCY'; }));
});

// ═══════════════════════════════════════════════════════════
// 7. missing version warning
// ═══════════════════════════════════════════════════════════

test('missing version: warning but not critical', function () {
  var r = gw.checkGatewayHealth({
    httpStatus: 200,
    body: JSON.stringify({ status: 'ok' }),
    latencyMs: 30
  });
  assert(r.anomalies.some(function (a) { return a.type === 'MISSING_VERSION'; }));
  assert.strictEqual(r.status, 'degraded'); // warning only
  assert.strictEqual(r.ok, true);           // no criticals
});

// ═══════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════

test('normalizeGatewayTarget: string', function () {
  assert.strictEqual(gw.normalizeGatewayTarget('http://1.2.3.4:8080/ping'), 'http://1.2.3.4:8080/ping');
});

test('normalizeGatewayTarget: object with url', function () {
  assert.strictEqual(gw.normalizeGatewayTarget({ url: '/custom' }), '/custom');
});

test('normalizeGatewayTarget: null → default', function () {
  assert.strictEqual(gw.normalizeGatewayTarget(null), 'http://127.0.0.1:3001/health');
});

test('summarizeGatewayHealth: null guard', function () {
  assert.strictEqual(gw.summarizeGatewayHealth(null), 'Gateway health unknown');
});

test('checkGatewayHealth: URL mode returns timeout anomaly', function () {
  var r = gw.checkGatewayHealth('http://127.0.0.1:39999/health');
  assert.strictEqual(r.httpStatus, -1);
  assert(r.anomalies.some(function (a) { return a.type === 'TIMEOUT'; }));
});

test('combined: 500 + high latency yields multiple anomalies', function () {
  var r = gw.checkGatewayHealth({
    httpStatus: 500,
    body: 'boom',
    latencyMs: 2000
  });
  assert(r.anomalies.length >= 2);
  assert.strictEqual(r.status, 'critical');
});

// ═══════════════════════════════════════════════════════════

console.log('\n=== Gateway Watcher Tests: ' + passed + ' passed, ' + failed + ' failed ===\n');

if (failures.length) {
  failures.forEach(function (f) { console.error('  FAIL: ' + f.name + ' — ' + f.message); });
  process.exit(1);
}
console.log('All tests passed!\n');
