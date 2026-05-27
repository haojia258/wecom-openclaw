'use strict';

/**
 * test-pm2-watcher.cjs — PM2 Watcher unit tests
 *
 * Covers:
 *   A. healthy — all online, no anomalies
 *   B. errored — NON_ONLINE detected
 *   C. restart storm — HIGH_RESTARTS detected
 *   D. root user — ROOT_USER detected
 *   E. missing process — MISSING_PROCESS detected
 */

const assert = require('assert');
const { checkPM2Status, normalizePM2List, detectPM2Anomalies, summarizePM2Health } = require('../src/runtime-watchers/pm2-watcher');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push({ name, message: e.message });
  }
}

// ─── Test fixtures ─────────────────────────────────────────

function baseFixture() {
  return [
    {
      name: 'wecom-adapter',
      pm2_env: { status: 'online', restart_time: 0, unstable_restarts: 0, username: 'app' },
      monit: { memory: 128 * 1024 * 1024 }
    },
    {
      name: 'openclaw-ai-agent-host',
      pm2_env: { status: 'online', restart_time: 0, unstable_restarts: 0, username: 'app' },
      monit: { memory: 128 * 1024 * 1024 }
    }
  ];
}

// ─── A. Healthy ────────────────────────────────────────────

test('A1: healthy — all online, ok=true', () => {
  const result = checkPM2Status(baseFixture());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, 'healthy');
  assert.strictEqual(result.anomalies.length, 0);
});

test('A2: healthy — correct process count', () => {
  const result = checkPM2Status(baseFixture());
  assert.strictEqual(result.processes.length, 2);
});

test('A3: healthy — summary', () => {
  const result = checkPM2Status(baseFixture());
  assert(result.summary.includes('healthy'));
});

// ─── B. Errored ────────────────────────────────────────────

test('B1: errored — NON_ONLINE anomaly detected', () => {
  const apps = baseFixture();
  apps[0].pm2_env.status = 'errored';
  const result = checkPM2Status(apps, { requiredProcesses: ['wecom-adapter'] });
  const nonOnline = result.anomalies.filter((a) => a.type === 'NON_ONLINE');
  assert.strictEqual(nonOnline.length, 1);
  assert.strictEqual(nonOnline[0].severity, 'critical');
});

test('B2: stopped — NON_ONLINE also detected', () => {
  const apps = [{ name: 'wecom-adapter', pm2_env: { status: 'stopped', restart_time: 0, username: 'app' }, monit: { memory: 0 } }];
  const result = checkPM2Status(apps, { requiredProcesses: ['wecom-adapter'] });
  assert(result.anomalies.some((a) => a.type === 'NON_ONLINE'));
});

// ─── C. Restart Storm ──────────────────────────────────────

test('C1: HIGH_RESTARTS — restart count exceeds threshold (default 10)', () => {
  const apps = baseFixture();
  apps[0].pm2_env.restart_time = 11;
  const result = checkPM2Status(apps, { requiredProcesses: ['wecom-adapter', 'openclaw-ai-agent-host'] });
  assert(result.anomalies.some((a) => a.type === 'HIGH_RESTARTS'));
});

test('C2: HIGH_RESTARTS — custom threshold', () => {
  const apps = [{ name: 'wecom-adapter', pm2_env: { status: 'online', restart_time: 6, username: 'app' }, monit: { memory: 0 } }];
  const result = checkPM2Status(apps, { restartThreshold: 5, requiredProcesses: ['wecom-adapter'] });
  assert(result.anomalies.some((a) => a.type === 'HIGH_RESTARTS'));
});

test('C3: no restart alert when below threshold', () => {
  const apps = baseFixture();
  apps[0].pm2_env.restart_time = 10;
  const result = checkPM2Status(apps, { requiredProcesses: ['wecom-adapter', 'openclaw-ai-agent-host'] });
  assert(!result.anomalies.some((a) => a.type === 'HIGH_RESTARTS'));
});

// ─── D. Root User ──────────────────────────────────────────

test('D1: ROOT_USER — username=root', () => {
  const apps = baseFixture();
  apps[0].pm2_env.username = 'root';
  const result = checkPM2Status(apps, { requiredProcesses: ['wecom-adapter', 'openclaw-ai-agent-host'] });
  assert(result.anomalies.some((a) => a.type === 'ROOT_USER'));
});

test('D2: ROOT_USER — uid=0', () => {
  const apps = [{ name: 'worker', pm2_env: { status: 'online', restart_time: 0, username: 'app' }, uid: 0, monit: { memory: 0 } }];
  const result = checkPM2Status(apps, { requiredProcesses: ['worker'] });
  assert(result.anomalies.some((a) => a.type === 'ROOT_USER'));
});

test('D3: no root alert for normal user', () => {
  const result = checkPM2Status(baseFixture());
  assert(!result.anomalies.some((a) => a.type === 'ROOT_USER'));
});

// ─── E. Missing Process ────────────────────────────────────

test('E1: MISSING_PROCESS — expected process not found', () => {
  const apps = [baseFixture()[0]];
  const result = checkPM2Status(apps);
  assert(result.anomalies.some((a) => a.type === 'MISSING_PROCESS' && a.process === 'openclaw-ai-agent-host'));
});

test('E2: MISSING_PROCESS — custom required list', () => {
  const apps = [{ name: 'app-a', pm2_env: { status: 'online', restart_time: 0, username: 'app' }, monit: { memory: 0 } }];
  const result = checkPM2Status(apps, { requiredProcesses: ['app-a', 'app-b', 'app-c'] });
  const missing = result.anomalies.filter((a) => a.type === 'MISSING_PROCESS');
  assert.strictEqual(missing.length, 2);
});

// ─── F. normalizePM2List / summarizePM2Health ──────────────

test('F1: normalizePM2List handles raw pm2_env format', () => {
  const list = normalizePM2List(baseFixture());
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].name, 'wecom-adapter');
  assert.strictEqual(list[0].status, 'online');
});

test('F2: summarizePM2Health with anomalies', () => {
  const result = checkPM2Status(baseFixture());
  const summary = summarizePM2Health(result);
  assert(summary.includes('healthy'));
});

test('F3: summarizePM2Health null guard', () => {
  assert.strictEqual(summarizePM2Health(null), 'PM2 health unknown');
  assert.strictEqual(summarizePM2Health({}), 'PM2 health unknown');
});

// ─── Results ───────────────────────────────────────────────

console.log(`\n=== PM2 Watcher Tests: ${passed} passed, ${failed} failed ===\n`);

if (failures.length > 0) {
  failures.forEach((f) => console.error(`  FAIL: ${f.name} — ${f.message}`));
  process.exit(1);
} else {
  console.log('All tests passed!\n');
  process.exit(0);
}
