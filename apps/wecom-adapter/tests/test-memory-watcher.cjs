'use strict';

/**
 * test-memory-watcher.cjs — Memory Watcher unit tests
 *
 * Covers:
 *   1. healthy memory
 *   2. missing db warning
 *   3. high db size warning
 *   4. high wal size warning
 *   5. stale last write warning
 *   6. write errors critical
 *   7. jsonl append error critical
 *   8. record count high warning
 *   9. secret text critical
 */

var assert = require('assert');
var mw = require('../src/runtime-watchers/memory-watcher');

var passed = 0, failed = 0, failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push({ name: name, message: e.message }); }
}

function healthyInput() {
  return {
    dbExists: true, dbSizeBytes: 1024 * 1024, walSizeBytes: 4096,
    jsonlFiles: [], lastWriteAt: new Date().toISOString(),
    writeErrors: 0,
    recordCounts: { agent_events: 200, mission_tasks: 50 }
  };
}

// ═══════════════════════════════════════════════════════════
// 1. healthy memory
// ═══════════════════════════════════════════════════════════

test('healthy: all checks pass', function () {
  var r = mw.checkMemoryHealth(healthyInput());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.status, 'healthy');
  assert.strictEqual(r.anomalies.length, 0);
});

test('healthy: summary contains healthy', function () {
  var r = mw.checkMemoryHealth(healthyInput());
  assert(r.summary.indexOf('healthy') !== -1);
});

// ═══════════════════════════════════════════════════════════
// 2. missing db warning
// ═══════════════════════════════════════════════════════════

test('missing db: dbExists=false → MISSING_DB warning', function () {
  var input = healthyInput();
  input.dbExists = false;
  var r = mw.checkMemoryHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'MISSING_DB'; }));
  assert.strictEqual(r.status, 'degraded');
  assert.strictEqual(r.ok, true);
});

// ═══════════════════════════════════════════════════════════
// 3. high db size warning
// ═══════════════════════════════════════════════════════════

test('high db size: 300MB > 256MB default', function () {
  var input = healthyInput();
  input.dbSizeBytes = 300 * 1024 * 1024; // 300 MB
  var r = mw.checkMemoryHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'HIGH_DB_SIZE'; }));
  assert.strictEqual(r.status, 'degraded');
});

test('high db size: custom threshold 512MB, 300MB passes', function () {
  var input = healthyInput();
  input.dbSizeBytes = 300 * 1024 * 1024;
  var r = mw.checkMemoryHealth(input, { dbSizeThresholdBytes: 512 * 1024 * 1024 });
  assert(!r.anomalies.some(function (a) { return a.type === 'HIGH_DB_SIZE'; }));
});

// ═══════════════════════════════════════════════════════════
// 4. high wal size warning
// ═══════════════════════════════════════════════════════════

test('high wal size: 80MB > 64MB default', function () {
  var input = healthyInput();
  input.walSizeBytes = 80 * 1024 * 1024;
  var r = mw.checkMemoryHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'HIGH_WAL_SIZE'; }));
  assert.strictEqual(r.status, 'degraded');
});

test('high wal size: custom threshold 128MB, 80MB passes', function () {
  var input = healthyInput();
  input.walSizeBytes = 80 * 1024 * 1024;
  var r = mw.checkMemoryHealth(input, { walSizeThresholdBytes: 128 * 1024 * 1024 });
  assert(!r.anomalies.some(function (a) { return a.type === 'HIGH_WAL_SIZE'; }));
});

// ═══════════════════════════════════════════════════════════
// 5. stale last write warning
// ═══════════════════════════════════════════════════════════

test('stale write: lastWriteAt 48h ago → STALE_WRITE', function () {
  var input = healthyInput();
  input.lastWriteAt = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  var r = mw.checkMemoryHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'STALE_WRITE'; }));
  assert.strictEqual(r.status, 'degraded');
});

test('stale write: null lastWriteAt → no anomaly', function () {
  var input = healthyInput();
  input.lastWriteAt = null;
  var r = mw.checkMemoryHealth(input);
  assert(!r.anomalies.some(function (a) { return a.type === 'STALE_WRITE'; }));
});

test('stale write: custom maxAge 72h, 48h passes', function () {
  var input = healthyInput();
  input.lastWriteAt = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  var r = mw.checkMemoryHealth(input, { maxWriteAgeMs: 72 * 3600 * 1000 });
  assert(!r.anomalies.some(function (a) { return a.type === 'STALE_WRITE'; }));
});

// ═══════════════════════════════════════════════════════════
// 6. write errors critical
// ═══════════════════════════════════════════════════════════

test('write errors: 3 errors → WRITE_ERRORS critical', function () {
  var input = healthyInput();
  input.writeErrors = 3;
  var r = mw.checkMemoryHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'WRITE_ERRORS' && a.severity === 'critical'; }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 'critical');
});

// ═══════════════════════════════════════════════════════════
// 7. jsonl append error critical
// ═══════════════════════════════════════════════════════════

test('jsonl error: file with errors > 0 → JSONL_ERROR critical', function () {
  var input = healthyInput();
  input.jsonlFiles = [{ name: 'memory.jsonl', errors: 5 }];
  var r = mw.checkMemoryHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'JSONL_ERROR'; }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 'critical');
});

test('jsonl error: appendErrors field also detected', function () {
  var input = healthyInput();
  input.jsonlFiles = [{ name: 'events.jsonl', appendErrors: 2 }];
  var r = mw.checkMemoryHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'JSONL_ERROR'; }));
});

test('jsonl error: multiple files with errors', function () {
  var input = healthyInput();
  input.jsonlFiles = [
    { name: 'a.jsonl', errors: 1 },
    { name: 'b.jsonl', errors: 2 }
  ];
  var r = mw.checkMemoryHealth(input);
  assert.strictEqual(r.anomalies.filter(function (a) { return a.type === 'JSONL_ERROR'; }).length, 2);
});

// ═══════════════════════════════════════════════════════════
// 8. record count high warning
// ═══════════════════════════════════════════════════════════

test('high record count: 15000 > 10000 default', function () {
  var input = healthyInput();
  input.recordCounts = { agent_events: 15000, mission_tasks: 200 };
  var r = mw.checkMemoryHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'HIGH_RECORD_COUNT'; }));
  assert.strictEqual(r.status, 'degraded');
});

test('high record count: multiple types over threshold', function () {
  var input = healthyInput();
  input.recordCounts = { agent_events: 15000, mission_tasks: 12000, sessions: 500 };
  var r = mw.checkMemoryHealth(input);
  assert.strictEqual(r.anomalies.filter(function (a) { return a.type === 'HIGH_RECORD_COUNT'; }).length, 2);
});

test('high record count: custom threshold 20000, 15000 passes', function () {
  var input = healthyInput();
  input.recordCounts = { agent_events: 15000 };
  var r = mw.checkMemoryHealth(input, { recordCountThreshold: 20000 });
  assert(!r.anomalies.some(function (a) { return a.type === 'HIGH_RECORD_COUNT'; }));
});

// ═══════════════════════════════════════════════════════════
// 9. secret text critical
// ═══════════════════════════════════════════════════════════

test('secret text: "bearer" in field → SUSPICIOUS_SECRET critical', function () {
  var input = healthyInput();
  // Inject a field that would contain secret-like text
  input.sampleField = 'Authorization: bearer abc123';
  var r = mw.checkMemoryHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'SUSPICIOUS_SECRET'; }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 'critical');
});

test('secret text: "gateway-token" pattern triggers', function () {
  var input = healthyInput();
  input.sampleField = 'x-gateway-token: secret-value';
  var r = mw.checkMemoryHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'SUSPICIOUS_SECRET'; }));
});

test('secret text: "bridge_token" pattern triggers', function () {
  var input = healthyInput();
  input.sampleField = 'bridge_token = "abc123"';
  var r = mw.checkMemoryHealth(input);
  assert(r.anomalies.some(function (a) { return a.type === 'SUSPICIOUS_SECRET'; }));
});

test('secret text: clean input → no alert', function () {
  var r = mw.checkMemoryHealth(healthyInput());
  assert(!r.anomalies.some(function (a) { return a.type === 'SUSPICIOUS_SECRET'; }));
});

// ═══════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════

test('normalizeMemoryStatus: null → defaults', function () {
  var s = mw.normalizeMemoryStatus(null);
  assert.strictEqual(s.dbExists, true);
  assert.strictEqual(s.writeErrors, 0);
  assert.deepStrictEqual(s.jsonlFiles, []);
  assert.deepStrictEqual(s.recordCounts, {});
});

test('normalizeMemoryStatus: string → defaults', function () {
  var s = mw.normalizeMemoryStatus('not-an-object');
  assert.strictEqual(s.dbExists, true);
  assert.strictEqual(s.dbSizeBytes, 0);
});

test('summarizeMemoryHealth: null guard', function () {
  assert.strictEqual(mw.summarizeMemoryHealth(null), 'Shared Memory health unknown');
});

test('summarizeMemoryHealth: missing anomalies array', function () {
  assert.strictEqual(mw.summarizeMemoryHealth({}), 'Shared Memory health unknown');
});

test('combined: missing db + high wal + write errors', function () {
  var input = {
    dbExists: false,
    dbSizeBytes: 0,
    walSizeBytes: 100 * 1024 * 1024,
    jsonlFiles: [],
    lastWriteAt: null,
    writeErrors: 2,
    recordCounts: {}
  };
  var r = mw.checkMemoryHealth(input);
  assert(r.anomalies.length >= 3);
  assert.strictEqual(r.status, 'critical');
  assert.strictEqual(r.ok, false);
});

// ═══════════════════════════════════════════════════════════

console.log('\n=== Memory Watcher Tests: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failures.length) {
  failures.forEach(function (f) { console.error('  FAIL: ' + f.name + ' — ' + f.message); });
  process.exit(1);
}
console.log('All tests passed!\n');
