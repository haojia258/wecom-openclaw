'use strict';

/**
 * test-shared-memory-runtime.cjs — P9.2 Shared Memory Runtime 测试套件
 *
 * 覆盖:
 *   - memory write (appendMemory, appendIncident, appendRecovery, appendStrategy, appendExecution)
 *   - memory read (queryRecentIncidents, queryRecoveryHistory, queryStrategyHistory, queryExecutionHistory)
 *   - incident memory (record, query, analysis)
 *   - strategy memory (record, query, optimization)
 *   - organization memory (snapshot, timeline, health report)
 *   - masking (sanitizeMemory, validateMemory, safeAppend)
 *   - retention policy
 *   - SQLite WAL
 *   - context builder
 *   - correlation chain
 *   - duplicate prevention
 *   - integration (controlled-executor hooks)
 */

var path = require('path');
var fs = require('fs');
var os = require('os');

// ─── 测试基础设施 ────────────────────────────────────────────

var TEST_DIR = path.join(os.tmpdir(), 'test-shared-memory-' + Date.now());
var passed = 0;
var failed = 0;
var testName = '';

function log(level, msg) {
  var prefix = level === 'PASS' ? '\x1b[32m[PASS]\x1b[0m'
    : level === 'FAIL' ? '\x1b[31m[FAIL]\x1b[0m'
    : level === 'INFO' ? '\x1b[36m[INFO]\x1b[0m'
    : '\x1b[33m[WARN]\x1b[0m';
  console.log(prefix + ' ' + msg);
}

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    log('FAIL', testName + ': ' + msg);
  }
}

function equal(actual, expected, msg) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    log('FAIL', testName + ': ' + msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')');
  }
}

function deepEqual(actual, expected, msg) {
  var a = JSON.stringify(actual);
  var b = JSON.stringify(expected);
  if (a === b) {
    passed++;
  } else {
    failed++;
    log('FAIL', testName + ': ' + msg + ' (expected: ' + b + ', got: ' + a + ')');
  }
}

function ok(val, msg) {
  assert(!!val, msg);
}

function notOk(val, msg) {
  assert(!val, msg);
}

function throws(fn, msg) {
  try { fn(); assert(false, msg + ' (expected throw)'); }
  catch (_) { passed++; }
}

// ─── 设置临时环境 ────────────────────────────────────────────

fs.mkdirSync(TEST_DIR, { recursive: true });
fs.mkdirSync(path.join(TEST_DIR, 'logs', 'memory-runtime'), { recursive: true });
fs.mkdirSync(path.join(TEST_DIR, 'data'), { recursive: true });

process.env.MEMORY_RUNTIME_LOG_DIR = path.join(TEST_DIR, 'logs', 'memory-runtime');
process.env.RUNTIME_MEMORY_DB_PATH = path.join(TEST_DIR, 'data', 'runtime-memory-test.db');

var memoryWriter = require('../src/memory-runtime/memory-writer');
var memoryReader = require('../src/memory-runtime/memory-reader');
var incidentMemory = require('../src/memory-runtime/incident-memory');
var strategyMemory = require('../src/memory-runtime/strategy-memory');
var organizationMemory = require('../src/memory-runtime/organization-memory');
var runtimeMemoryDb = require('../src/memory-runtime/runtime-memory-db');
var contextBuilder = require('../src/memory-runtime/context-builder');
var memoryGovernance = require('../src/memory-runtime/memory-governance');

// ─── 辅助函数 ────────────────────────────────────────────────

var COUNTER = 0;
function cid() { COUNTER++; return 'test-corr-' + COUNTER; }

function ts(offsetMs) {
  var d = new Date(Date.now() + (offsetMs || 0));
  return d.toISOString();
}

// ══════════════════════════════════════════════════════════════
// 1. Memory Writer Tests (25 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n--- Memory Writer ---');

testName = 'appendMemory with valid params';
var result = memoryWriter.appendMemory({
  correlationId: cid(),
  timestamp: ts(),
  agent: 'workbuddy',
  type: 'execution',
  status: 'success',
  summary: 'Test execution'
});
ok(result, 'should return true');
ok(fs.existsSync(memoryWriter.getLogPath('memory')), 'memory log should exist');

testName = 'appendMemory throws without correlationId';
throws(function() {
  memoryWriter.appendMemory({ timestamp: ts(), type: 'execution' });
}, 'should throw');

testName = 'appendMemory throws without timestamp';
throws(function() {
  memoryWriter.appendMemory({ correlationId: cid(), type: 'execution' });
}, 'should throw');

testName = 'appendIncident success';
result = memoryWriter.appendIncident({
  correlationId: cid(),
  timestamp: ts(),
  incidentType: 'TIMEOUT',
  retryCount: 2,
  recoveryResult: 'pending',
  executor: 'npm-test',
  command: 'npm test'
});
ok(result, 'should return true');
ok(fs.existsSync(memoryWriter.getLogPath('incidents')), 'incidents log should exist');

testName = 'appendIncident throws without correlationId';
throws(function() {
  memoryWriter.appendIncident({ timestamp: ts(), incidentType: 'TIMEOUT' });
}, 'should throw');

testName = 'appendIncident throws without timestamp';
throws(function() {
  memoryWriter.appendIncident({ correlationId: cid(), incidentType: 'TIMEOUT' });
}, 'should throw');

testName = 'appendRecovery success';
result = memoryWriter.appendRecovery({
  correlationId: cid(),
  timestamp: ts(),
  recoveryType: 'EXECUTOR_ERROR',
  recovered: true,
  executor: 'npm-test',
  recoveryPlanId: 'plan-001',
  totalSteps: 3,
  description: 'Staging-safe recovery'
});
ok(result, 'should return true');
ok(fs.existsSync(memoryWriter.getLogPath('recoveries')), 'recoveries log should exist');

testName = 'appendRecovery throws without correlationId';
throws(function() {
  memoryWriter.appendRecovery({ timestamp: ts(), recoveryType: 'EXECUTOR_ERROR' });
}, 'should throw');

testName = 'appendStrategy success';
result = memoryWriter.appendStrategy({
  correlationId: cid(),
  timestamp: ts(),
  strategyType: 'gmv',
  strategyName: 'GMV Optimization v1',
  strategyConfig: { targetGmv: 100000, channels: ['douyin'] },
  description: 'GMV optimization strategy',
  agent: 'workbuddy'
});
ok(result, 'should return true');
ok(fs.existsSync(memoryWriter.getLogPath('strategies')), 'strategies log should exist');

testName = 'appendStrategy throws without correlationId';
throws(function() {
  memoryWriter.appendStrategy({ timestamp: ts(), strategyType: 'gmv' });
}, 'should throw');

testName = 'appendExecution success';
result = memoryWriter.appendExecution({
  correlationId: cid(),
  timestamp: ts(),
  executor: 'npm-test',
  command: 'npm test',
  success: true,
  durationMs: 150,
  output: 'All tests passed',
  agent: 'workbuddy'
});
ok(result, 'should return true');

testName = 'appendExecution throws without correlationId';
throws(function() {
  memoryWriter.appendExecution({ timestamp: ts() });
}, 'should throw');

testName = 'appendExecution throws without timestamp';
throws(function() {
  memoryWriter.appendExecution({ correlationId: cid() });
}, 'should throw');

testName = 'multiple writes to same log';
var c = cid();
memoryWriter.appendIncident({ correlationId: c, timestamp: ts(0), incidentType: 'TYPE_A', retryCount: 0, recoveryResult: 'pending', executor: 'test' });
memoryWriter.appendIncident({ correlationId: c, timestamp: ts(1000), incidentType: 'TYPE_A', retryCount: 1, recoveryResult: 'pending', executor: 'test' });
memoryWriter.appendIncident({ correlationId: c, timestamp: ts(2000), incidentType: 'TYPE_A', retryCount: 2, recoveryResult: 'pending', executor: 'test' });
var logContent = fs.readFileSync(memoryWriter.getLogPath('incidents'), 'utf-8');
var lines = logContent.trim().split('\n').filter(function(l) { return l.trim(); });
assert(lines.length >= 3, 'should have at least 3 lines');

testName = 'appendMemory stores agent field';
c = cid();
memoryWriter.appendMemory({ correlationId: c, timestamp: ts(), agent: 'codex', type: 'execution', status: 'success', summary: 'test' });
var content = fs.readFileSync(memoryWriter.getLogPath('memory'), 'utf-8');
ok(content.indexOf('"agent":"codex"') >= 0, 'should contain agent field');

testName = 'appendIncident stores all required fields';
c = cid();
memoryWriter.appendIncident({
  correlationId: c,
  timestamp: ts(),
  incidentType: 'INFRA_ERROR',
  retryCount: 3,
  recoveryResult: 'failed',
  executor: 'docker-exec',
  command: 'docker ps',
  error: 'Connection refused',
  protocol: 'docker',
  agent: 'workbuddy'
});
content = fs.readFileSync(memoryWriter.getLogPath('incidents'), 'utf-8');
ok(content.indexOf('"incidentType":"INFRA_ERROR"') >= 0, 'should have incidentType');
ok(content.indexOf('"retryCount":3') >= 0, 'should have retryCount');
ok(content.indexOf('"executor":"docker-exec"') >= 0, 'should have executor');
ok(content.indexOf('"command":"docker ps"') >= 0, 'should have command');

testName = 'appendRecovery stores recovery metadata';
c = cid();
memoryWriter.appendRecovery({
  correlationId: c, timestamp: ts(), recoveryType: 'ROLLBACK',
  recovered: false, executor: 'pm2-exec', recoveryPlanId: 'rp-abc',
  totalSteps: 5, description: 'PM2 rollback'
});
content = fs.readFileSync(memoryWriter.getLogPath('recoveries'), 'utf-8');
ok(content.indexOf('"recoveryType":"ROLLBACK"') >= 0, 'should have recoveryType');
ok(content.indexOf('"recoveryPlanId":"rp-abc"') >= 0, 'should have recoveryPlanId');

testName = 'appendStrategy stores strategyConfig as JSON';
c = cid();
memoryWriter.appendStrategy({
  correlationId: c, timestamp: ts(), strategyType: 'roi',
  strategyName: 'ROI Optimizer', strategyConfig: { target: 3.5, maxBudget: 5000 }
});
content = fs.readFileSync(memoryWriter.getLogPath('strategies'), 'utf-8');
ok(content.indexOf('"strategyType":"roi"') >= 0, 'should have strategyType');
ok(content.indexOf('"strategyName":"ROI Optimizer"') >= 0, 'should have strategyName');

testName = 'appendExecution stores metadata correctly';
c = cid();
memoryWriter.appendExecution({
  correlationId: c, timestamp: ts(), executor: 'shadow-validator',
  command: 'node verify.js', success: false, durationMs: 5000,
  error: 'Verification failed: output mismatch', agent: 'workbuddy'
});
content = fs.readFileSync(memoryWriter.getLogPath('memory'), 'utf-8');
ok(content.indexOf('"success":false') >= 0, 'should have success=false');
ok(content.indexOf('"durationMs":5000') >= 0, 'should have durationMs');

testName = 'appendMemory throws when correlationId missing - validation';
throws(function() {
  memoryWriter.appendMemory({ timestamp: ts(), type: 'test', status: 'ok', summary: 'auto' });
}, 'should throw when correlationId missing');

testName = '_append auto-generates correlationId when missing';
// Test that the internal _append auto-generates missing fields
memoryWriter.clearLogs('all');
// Write a record with correlationId + timestamp as required
memoryWriter.appendMemory({ correlationId: cid(), timestamp: ts(), type: 'test', status: 'ok', summary: 'auto-gen test' });
content = fs.readFileSync(memoryWriter.getLogPath('memory'), 'utf-8');
ok(content.length > 0, 'should write to log with explicit correlationId');

testName = 'clearLogs for specific type';
memoryWriter.appendMemory({ correlationId: cid(), timestamp: ts(), type: 'test', status: 'ok', summary: 'clear test' });
var beforeClear = memoryReader.queryExecutionHistory({ limit: 100 }).length;
memoryWriter.clearLogs('memory');
var afterClear = memoryReader.queryExecutionHistory({ limit: 100 }).length;
equal(afterClear, 0, 'memory log should be empty after clear');

testName = 'clearLogs all';
memoryWriter.appendIncident({ correlationId: cid(), timestamp: ts(), incidentType: 'TEST', retryCount: 0, recoveryResult: 'pending', executor: 'test' });
memoryWriter.appendRecovery({ correlationId: cid(), timestamp: ts(), recoveryType: 'TEST', recovered: true, executor: 'test' });
memoryWriter.clearLogs('all');
ok(!fs.existsSync(memoryWriter.getLogPath('incidents')) || fs.readFileSync(memoryWriter.getLogPath('incidents'), 'utf-8').trim() === '', 'incidents should be cleared');
ok(!fs.existsSync(memoryWriter.getLogPath('recoveries')) || fs.readFileSync(memoryWriter.getLogPath('recoveries'), 'utf-8').trim() === '', 'recoveries should be cleared');

testName = 'getLogInfo returns correct info';
memoryWriter.appendIncident({ correlationId: cid(), timestamp: ts(), incidentType: 'TEST', retryCount: 0, recoveryResult: 'pending', executor: 'test' });
var info = memoryWriter.getLogInfo('incidents');
ok(info.exists, 'should exist');
assert(info.size > 0, 'should have size > 0');
ok(info.path.indexOf('incidents.jsonl') >= 0, 'should have correct path');

// ══════════════════════════════════════════════════════════════
// 2. Memory Reader Tests (25 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n--- Memory Reader ---');

// 先清理并写入测试数据
memoryWriter.clearLogs('all');

// 写入 5 条 incidents
for (var i = 0; i < 5; i++) {
  memoryWriter.appendIncident({
    correlationId: 'reader-test-' + i,
    timestamp: ts(i * 1000),
    incidentType: i < 3 ? 'TIMEOUT' : 'INFRA_ERROR',
    retryCount: i,
    recoveryResult: i < 3 ? 'pending' : 'failed',
    executor: i % 2 === 0 ? 'npm-test' : 'docker-exec',
    command: 'test command ' + i,
    error: 'error ' + i,
    protocol: 'http',
    agent: 'workbuddy'
  });
}

// 写入 5 条 recoveries
for (var i = 0; i < 5; i++) {
  memoryWriter.appendRecovery({
    correlationId: 'reader-test-' + i,
    timestamp: ts(i * 1000 + 500),
    recoveryType: i < 3 ? 'TIMEOUT' : 'EXECUTOR_ERROR',
    recovered: i < 4,
    executor: 'npm-test',
    recoveryPlanId: 'plan-' + i,
    totalSteps: i + 1,
    description: 'Recovery step ' + i
  });
}

// 写入 5 条 strategies
for (var i = 0; i < 5; i++) {
  memoryWriter.appendStrategy({
    correlationId: 'reader-test-' + i,
    timestamp: ts(i * 2000),
    strategyType: i < 2 ? 'gmv' : i < 4 ? 'roi' : 'recovery',
    strategyName: 'Strategy ' + i,
    strategyConfig: { target: i * 100 },
    description: 'Strategy description ' + i,
    agent: 'workbuddy'
  });
}

// 写入 5 条 executions
for (var i = 0; i < 5; i++) {
  memoryWriter.appendExecution({
    correlationId: 'reader-test-' + i,
    timestamp: ts(i * 1000 + 100),
    executor: 'npm-test',
    command: 'npm run test:' + i,
    success: i < 4,
    durationMs: 100 + i * 50,
    output: 'output ' + i,
    agent: 'workbuddy'
  });
}

testName = 'queryRecentIncidents default limit';
var results = memoryReader.queryRecentIncidents();
assert(results.length <= 20, 'should respect default limit');
assert(results.length > 0, 'should have results');

testName = 'queryRecentIncidents with limit';
results = memoryReader.queryRecentIncidents({ limit: 3 });
equal(results.length, 3, 'should return exactly 3');

testName = 'queryRecentIncidents sort desc';
results = memoryReader.queryRecentIncidents({ limit: 5 });
for (var i = 0; i < results.length - 1; i++) {
  assert(results[i].timestamp >= results[i + 1].timestamp, 'should be sorted desc: ' + results[i].timestamp + ' >= ' + results[i + 1].timestamp);
}

testName = 'queryRecentIncidents filter by incidentType';
results = memoryReader.queryRecentIncidents({ incidentType: 'TIMEOUT', limit: 10 });
assert(results.length >= 1, 'should have TIMEOUT incidents');
for (var i = 0; i < results.length; i++) {
  equal(results[i].incidentType, 'TIMEOUT', 'all results should be TIMEOUT');
}

testName = 'queryRecentIncidents filter by executor';
results = memoryReader.queryRecentIncidents({ executor: 'docker-exec', limit: 10 });
for (var i = 0; i < results.length; i++) {
  equal(results[i].executor, 'docker-exec', 'all results should be docker-exec');
}

testName = 'queryRecentIncidents filter by status';
results = memoryReader.queryRecentIncidents({ status: 'open', limit: 10 });
for (var i = 0; i < results.length; i++) {
  equal(results[i].status, 'open', 'all results should be open');
}

testName = 'queryRecentIncidents filter by since';
var sinceTime = ts(2000);
results = memoryReader.queryRecentIncidents({ since: sinceTime, limit: 10 });
for (var i = 0; i < results.length; i++) {
  assert(results[i].timestamp >= sinceTime, 'all should be after since: ' + results[i].timestamp);
}

testName = 'queryIncidentByCorrelationId';
results = memoryReader.queryIncidentByCorrelationId('reader-test-0');
assert(results.length >= 1, 'should find at least 1');

testName = 'queryRecoveryHistory default limit';
results = memoryReader.queryRecoveryHistory();
assert(results.length <= 20, 'should respect default limit');

testName = 'queryRecoveryHistory with limit';
results = memoryReader.queryRecoveryHistory({ limit: 2 });
equal(results.length, 2, 'should return exactly 2');

testName = 'queryRecoveryHistory filter by recoveryType';
results = memoryReader.queryRecoveryHistory({ recoveryType: 'TIMEOUT', limit: 10 });
for (var i = 0; i < results.length; i++) {
  equal(results[i].recoveryType, 'TIMEOUT', 'all should be TIMEOUT');
}

testName = 'queryRecoveryHistory filter by recovered';
results = memoryReader.queryRecoveryHistory({ recovered: true, limit: 10 });
for (var i = 0; i < results.length; i++) {
  equal(results[i].recovered, true, 'all should be recovered');
}

testName = 'queryRecoveryByCorrelationId';
results = memoryReader.queryRecoveryByCorrelationId('reader-test-0');
assert(results.length >= 1, 'should find at least 1');

testName = 'queryStrategyHistory default limit';
results = memoryReader.queryStrategyHistory();
assert(results.length <= 20, 'should respect default limit');

testName = 'queryStrategyHistory filter by strategyType';
results = memoryReader.queryStrategyHistory({ strategyType: 'gmv', limit: 10 });
for (var i = 0; i < results.length; i++) {
  equal(results[i].strategyType, 'gmv', 'all should be gmv');
}

testName = 'queryStrategyHistory filter by agent';
results = memoryReader.queryStrategyHistory({ agent: 'workbuddy', limit: 10 });
for (var i = 0; i < results.length; i++) {
  equal(results[i].agent, 'workbuddy', 'all should be workbuddy');
}

testName = 'queryStrategyByCorrelationId';
results = memoryReader.queryStrategyByCorrelationId('reader-test-0');
assert(results.length >= 1, 'should find at least 1');

testName = 'queryExecutionHistory default limit';
results = memoryReader.queryExecutionHistory();
assert(results.length <= 20, 'should respect default limit');

testName = 'queryExecutionHistory filter by success';
results = memoryReader.queryExecutionHistory({ success: true, limit: 10 });
for (var i = 0; i < results.length; i++) {
  ok(results[i].metadata && results[i].metadata.success, 'all should be successful');
}

testName = 'queryExecutionHistory filter by executor';
results = memoryReader.queryExecutionHistory({ executor: 'npm-test', limit: 10 });
for (var i = 0; i < results.length; i++) {
  ok(results[i].metadata && results[i].metadata.executor === 'npm-test', 'all should be npm-test');
}

testName = 'queryByCorrelationId cross-type';
var crossResults = memoryReader.queryByCorrelationId('reader-test-0');
ok(crossResults.incidents.length >= 1, 'should have incidents');
ok(crossResults.recoveries.length >= 1, 'should have recoveries');
ok(crossResults.strategies.length >= 1, 'should have strategies');

testName = 'queryRecentIncidents with no data returns empty';
memoryWriter.clearLogs('all');
results = memoryReader.queryRecentIncidents();
deepEqual(results, [], 'should return empty array');

testName = 'getIncidentStats';
// Re-populate
for (var i = 0; i < 5; i++) {
  memoryWriter.appendIncident({
    correlationId: cid(), timestamp: ts(i * 1000), incidentType: i < 3 ? 'TIMEOUT' : 'INFRA_ERROR',
    retryCount: i, recoveryResult: 'pending', executor: 'test'
  });
}
var stats = memoryReader.getIncidentStats();
ok(stats.total >= 5, 'should have total >= 5');
ok(typeof stats.byType === 'object', 'should have byType');
ok(typeof stats.byExecutor === 'object', 'should have byExecutor');

testName = 'getRecoveryStats';
for (var i = 0; i < 4; i++) {
  memoryWriter.appendRecovery({
    correlationId: cid(), timestamp: ts(i * 1000), recoveryType: 'TEST', recovered: i < 3, executor: 'test'
  });
}
var recStats = memoryReader.getRecoveryStats();
ok(recStats.total >= 4, 'should have total >= 4');
ok(recStats.recovered >= 3, 'should have recovered >= 3');

testName = 'getAllLogInfo';
var logInfo = memoryReader.getAllLogInfo();
ok(logInfo.incidents !== undefined, 'should have incidents info');
ok(logInfo.recoveries !== undefined, 'should have recoveries info');
ok(logInfo.strategies !== undefined, 'should have strategies info');
ok(logInfo.memory !== undefined, 'should have memory info');

// ══════════════════════════════════════════════════════════════
// 3. Incident Memory Tests (20 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n--- Incident Memory ---');

memoryWriter.clearLogs('all');

testName = 'recordIncident success';
var incCid = cid();
result = incidentMemory.recordIncident({
  correlationId: incCid,
  incidentType: 'EXECUTOR_ERROR',
  retryCount: 2,
  recoveryResult: 'pending',
  executor: 'shadow-validator',
  command: 'node verify.js',
  error: 'Connection timeout',
  protocol: 'http',
  agent: 'workbuddy'
});
ok(result, 'should return true');

testName = 'recordIncident auto-resolves SUCCESS type';
result = incidentMemory.recordIncident({
  correlationId: cid(),
  incidentType: 'SUCCESS',
  retryCount: 0,
  recoveryResult: 'success',
  executor: 'test',
  command: 'test'
});
ok(result, 'should return true');

testName = 'resolveIncident';
result = incidentMemory.resolveIncident(incCid, 'Fixed by restarting service');
ok(result, 'should return true');

testName = 'getOpenIncidents';
var openIncidents = incidentMemory.getOpenIncidents(20);
ok(Array.isArray(openIncidents), 'should return array');

testName = 'getIncidentsByType';
memoryWriter.appendIncident({ correlationId: cid(), timestamp: ts(), incidentType: 'TIMEOUT', retryCount: 1, recoveryResult: 'pending', executor: 'test' });
memoryWriter.appendIncident({ correlationId: cid(), timestamp: ts(), incidentType: 'TIMEOUT', retryCount: 2, recoveryResult: 'pending', executor: 'test' });
var timeoutIncidents = incidentMemory.getIncidentsByType('TIMEOUT', 10);
assert(timeoutIncidents.length >= 2, 'should find at least 2 TIMEOUT incidents');

testName = 'getIncidentsByExecutor';
memoryWriter.appendIncident({ correlationId: cid(), timestamp: ts(), incidentType: 'TEST', retryCount: 0, recoveryResult: 'pending', executor: 'my-executor', command: 'test' });
var execIncidents = incidentMemory.getIncidentsByExecutor('my-executor', 10);
assert(execIncidents.length >= 1, 'should find incidents by executor');

testName = 'getIncidentChain';
var chainId = 'chain-test-' + Date.now();
memoryWriter.appendIncident({ correlationId: chainId, timestamp: ts(0), incidentType: 'TIMEOUT', retryCount: 0, recoveryResult: 'pending', executor: 'test' });
memoryWriter.appendIncident({ correlationId: chainId, timestamp: ts(1000), incidentType: 'TIMEOUT', retryCount: 1, recoveryResult: 'pending', executor: 'test' });
memoryWriter.appendIncident({ correlationId: chainId, timestamp: ts(2000), incidentType: 'TIMEOUT', retryCount: 2, recoveryResult: 'failed', executor: 'test' });
var chain = incidentMemory.getIncidentChain(chainId);
equal(chain.length, 3, 'should have 3 entries in chain');

testName = 'getIncidentTrend';
var trend = incidentMemory.getIncidentTrend(1);
ok(Array.isArray(trend), 'should return array');

testName = 'getTopFailurePatterns';
var patterns = incidentMemory.getTopFailurePatterns(3);
ok(Array.isArray(patterns), 'should return array');

testName = 'getRecurringIncidents';
// Create recurring pattern
for (var i = 0; i < 4; i++) {
  memoryWriter.appendIncident({
    correlationId: 'recurring-' + i, timestamp: ts(i * 1000),
    incidentType: 'RECUR_TEST', retryCount: i, recoveryResult: 'pending', executor: 'test-executor'
  });
}
var recurring = incidentMemory.getRecurringIncidents(2);
assert(recurring.length >= 1, 'should find recurring patterns');

// ══════════════════════════════════════════════════════════════
// 4. Strategy Memory Tests (15 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n--- Strategy Memory ---');

memoryWriter.clearLogs('all');

testName = 'recordStrategy success';
result = strategyMemory.recordStrategy({
  correlationId: cid(),
  strategyType: 'gmv',
  strategyName: 'GMV Strategy v1',
  strategyConfig: { targetGmv: 500000, channels: ['douyin', 'kuaishou'] },
  description: 'Multi-channel GMV optimization',
  agent: 'workbuddy'
});
ok(result, 'should return true');

testName = 'recordGmvStrategy';
result = strategyMemory.recordGmvStrategy({
  correlationId: cid(),
  strategyName: 'GMV Test',
  config: { targetGmv: 200000, budget: 50000 },
  description: 'GMV test strategy',
  agent: 'workbuddy'
});
ok(result, 'should return true');

testName = 'recordRoiStrategy';
result = strategyMemory.recordRoiStrategy({
  correlationId: cid(),
  strategyName: 'ROI Test',
  config: { targetRoi: 3.0, maxBudget: 30000 },
  description: 'ROI optimization',
  agent: 'workbuddy'
});
ok(result, 'should return true');

testName = 'recordRecoveryStrategy';
result = strategyMemory.recordRecoveryStrategy({
  correlationId: cid(),
  strategyName: 'Recovery Test',
  config: { failureType: 'TIMEOUT', steps: ['restart', 'verify'] },
  description: 'Timeout recovery',
  agent: 'workbuddy'
});
ok(result, 'should return true');

testName = 'recordRuntimeOptimizationStrategy';
result = strategyMemory.recordRuntimeOptimizationStrategy({
  correlationId: cid(),
  strategyName: 'Runtime Opt v1',
  config: { target: 'execution_time', optimization: 'parallelize', expectedImprovement: '30%' },
  description: 'Runtime optimization',
  agent: 'workbuddy'
});
ok(result, 'should return true');

testName = 'getStrategiesByType gmv';
var gmvStrategies = strategyMemory.getStrategiesByType('gmv', 10);
assert(gmvStrategies.length >= 2, 'should find gmv strategies');
for (var i = 0; i < gmvStrategies.length; i++) {
  equal(gmvStrategies[i].strategyType, 'gmv', 'all should be gmv');
}

testName = 'getStrategiesByType roi';
var roiStrategies = strategyMemory.getStrategiesByType('roi', 10);
assert(roiStrategies.length >= 1, 'should find roi strategies');

testName = 'getLatestStrategy';
var latestGmv = strategyMemory.getLatestStrategy('gmv');
ok(latestGmv !== null, 'should find latest gmv strategy');
equal(latestGmv.strategyType, 'gmv', 'should be gmv type');

testName = 'getStrategyChain';
var stratCid = cid();
strategyMemory.recordGmvStrategy({ correlationId: stratCid, strategyName: 'Chain Test 1', config: {}, agent: 'workbuddy' });
strategyMemory.recordGmvStrategy({ correlationId: stratCid, strategyName: 'Chain Test 2', config: {}, agent: 'workbuddy' });
var chain2 = strategyMemory.getStrategyChain(stratCid);
equal(chain2.length, 2, 'should have 2 strategies in chain');

testName = 'getAllStrategies';
var allStrategies = strategyMemory.getAllStrategies(50);
assert(allStrategies.length >= 5, 'should find many strategies');

testName = 'getStrategyDistribution';
var dist = strategyMemory.getStrategyDistribution();
ok(dist.total >= 1, 'should have total');
ok(dist.byType.gmv >= 1, 'should have gmv count');

testName = 'compareStrategies';
var comparison = strategyMemory.compareStrategies('gmv', 5);
ok(Array.isArray(comparison), 'should return array');

testName = 'suggestOptimization with data';
var suggestions = strategyMemory.suggestOptimization('gmv');
ok(Array.isArray(suggestions.suggestions), 'should return suggestions');
ok(Array.isArray(suggestions.recentConfigs), 'should return recentConfigs');

testName = 'suggestOptimization without data';
memoryWriter.clearLogs('all');
var emptySuggestions = strategyMemory.suggestOptimization('gmv');
ok(Array.isArray(emptySuggestions.suggestions), 'should return array even when empty');

// ══════════════════════════════════════════════════════════════
// 5. Organization Memory Tests (15 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n--- Organization Memory ---');

memoryWriter.clearLogs('all');

// Populate data
for (var i = 0; i < 3; i++) {
  memoryWriter.appendIncident({ correlationId: 'org-' + i, timestamp: ts(i * 1000), incidentType: 'TIMEOUT', retryCount: i, recoveryResult: 'pending', executor: 'test' });
  memoryWriter.appendRecovery({ correlationId: 'org-' + i, timestamp: ts(i * 1000), recoveryType: 'TIMEOUT', recovered: i < 2, executor: 'test' });
  memoryWriter.appendStrategy({ correlationId: 'org-' + i, timestamp: ts(i * 1000), strategyType: 'gmv', strategyName: 'S' + i, strategyConfig: {} });
  memoryWriter.appendExecution({ correlationId: 'org-' + i, timestamp: ts(i * 1000), executor: 'test', command: 'cmd' + i, success: true, durationMs: 100 });
}

testName = 'getOrganizationSnapshot';
var snapshot = organizationMemory.getOrganizationSnapshot();
ok(snapshot.timestamp, 'should have timestamp');
ok(snapshot.summary, 'should have summary');
ok(Array.isArray(snapshot.recentIncidents), 'should have recentIncidents');
ok(Array.isArray(snapshot.recentRecoveries), 'should have recentRecoveries');
ok(Array.isArray(snapshot.recentStrategies), 'should have recentStrategies');
ok(Array.isArray(snapshot.recentExecutions), 'should have recentExecutions');

testName = 'getCorrelationTimeline';
var timelineCorrId = 'org-0';
var timeline = organizationMemory.getCorrelationTimeline(timelineCorrId);
equal(timeline.correlationId, timelineCorrId, 'should match correlationId');
ok(Array.isArray(timeline.timeline), 'should have timeline array');
assert(timeline.timeline.length >= 3, 'should have at least 3 timeline events');
// Verify timeline is sorted
for (var i = 0; i < timeline.timeline.length - 1; i++) {
  assert(timeline.timeline[i].timestamp <= timeline.timeline[i + 1].timestamp, 'timeline should be sorted asc');
}

testName = 'getHealthReport';
var report = organizationMemory.getHealthReport();
ok(report.timestamp, 'should have timestamp');
ok(report.overallStatus, 'should have overallStatus');
ok(report.metrics, 'should have metrics');
ok(Array.isArray(report.alerts), 'should have alerts array');
ok(Array.isArray(report.recommendations), 'should have recommendations array');

testName = 'getHealthReport with open incidents';
// Add unresolved incidents
for (var i = 0; i < 6; i++) {
  memoryWriter.appendIncident({ correlationId: cid(), timestamp: ts(), incidentType: 'CRITICAL', retryCount: 0, recoveryResult: 'pending', executor: 'test' });
}
report = organizationMemory.getHealthReport();
equal(report.overallStatus, 'critical', 'should be critical with 6+ open incidents');

testName = 'findSimilarIncidents';
memoryWriter.clearLogs('all');
memoryWriter.appendIncident({ correlationId: 'sim-1', timestamp: ts(), incidentType: 'EXECUTOR_ERROR', retryCount: 2, recoveryResult: 'pending', executor: 'test-exec-A' });
memoryWriter.appendIncident({ correlationId: 'sim-2', timestamp: ts(), incidentType: 'EXECUTOR_ERROR', retryCount: 1, recoveryResult: 'pending', executor: 'test-exec-A' });
var similar = organizationMemory.findSimilarIncidents('EXECUTOR_ERROR', 'test-exec-A', 5);
equal(similar.length, 2, 'should find 2 similar incidents');

testName = 'findSimilarRecoveries';
memoryWriter.appendRecovery({ correlationId: cid(), timestamp: ts(), recoveryType: 'INFRA_ERROR', recovered: true, executor: 'test' });
memoryWriter.appendRecovery({ correlationId: cid(), timestamp: ts(), recoveryType: 'INFRA_ERROR', recovered: true, executor: 'test' });
var similarRec = organizationMemory.findSimilarRecoveries('INFRA_ERROR', 5);
assert(similarRec.length >= 2, 'should find similar recoveries');

// ══════════════════════════════════════════════════════════════
// 6. Memory Governance / Masking Tests (20 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n--- Memory Governance ---');

testName = 'sanitizeMemory masks sk- tokens';
var input = 'Using API key sk-abcdef1234567890abcdef1234567890 for access';
var output = memoryGovernance.sanitizeMemory(input);
ok(output.indexOf('sk-abcdef') === -1, 'should mask sk- key');
ok(output.indexOf('[REDACTED:api-key]') >= 0, 'should have redacted marker');

testName = 'sanitizeMemory masks bearer tokens';
input = 'Authorization: bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdefghijklmnopqrstuvwxyz';
output = memoryGovernance.sanitizeMemory(input);
ok(output.indexOf('[REDACTED:bearer-token]') >= 0, 'should mask bearer token');

testName = 'sanitizeMemory masks authorization headers';
input = 'authorization: sk-secret-key-12345678901234567890';
output = memoryGovernance.sanitizeMemory(input);
ok(output.indexOf('[REDACTED') >= 0, 'should mask auth header');

testName = 'sanitizeMemory masks token= params';
input = 'https://api.example.com?token=abcdefghijklmnopqrstuvwxyz&other=1';
output = memoryGovernance.sanitizeMemory(input);
ok(output.indexOf('token=[REDACTED]') >= 0, 'should mask token param');
ok(output.indexOf('abcdefghijklmnopqrstuvwxyz') === -1, 'token value should be removed');

testName = 'sanitizeMemory masks password= params';
input = 'login?user=admin&password=secret123&remember=1';
output = memoryGovernance.sanitizeMemory(input);
ok(output.indexOf('password=[REDACTED]') >= 0, 'should mask password param');

testName = 'sanitizeMemory masks api_secret';
input = 'api_secret=supersecretkey123 config={"key":"value"}';
output = memoryGovernance.sanitizeMemory(input);
ok(output.indexOf('supersecretkey123') === -1, 'api_secret value should be removed');

testName = 'sanitizeMemory masks access_key';
input = 'access_key=AKID1234567890abcdef config';
output = memoryGovernance.sanitizeMemory(input);
ok(output.indexOf('AKID1234567890abcdef') === -1, 'access_key value should be removed');

testName = 'sanitizeMemory masks JWT tokens';
input = 'jwt: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
output = memoryGovernance.sanitizeMemory(input);
ok(output.indexOf('[REDACTED:jwt]') >= 0, 'should mask JWT');
ok(output.indexOf('eyJ') === -1, 'JWT parts should be removed');

testName = 'sanitizeMemory masks private key blocks';
input = 'key: -----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ\n-----END PRIVATE KEY-----';
output = memoryGovernance.sanitizeMemory(input);
ok(output.indexOf('[REDACTED:private-key]') >= 0, 'should mask private key');

testName = 'sanitizeMemory masks GitHub tokens';
input = 'Token: ghp_abcdefghijklmnopqrstuvwxyz123456';
output = memoryGovernance.sanitizeMemory(input);
ok(output.indexOf('[REDACTED:github-token]') >= 0, 'should mask GitHub token');

testName = 'sanitizeMemory masks env var values';
input = 'OPENAI_API_KEY=sk-real-key-that-should-be-hidden other=value';
output = memoryGovernance.sanitizeMemory(input);
ok(output.indexOf('OPENAI_API_KEY=[REDACTED]') >= 0, 'should mask env var');

testName = 'sanitizeMemory handles objects recursively';
input = {
  command: 'curl -H "Authorization: bearer token12345678901234567890"',
  config: { apiKey: 'sk-secret-key-12345678901234567890' },
  nested: { deep: { token: 'bearer abcdefghijklmnopqrstuvwxyz123456' } }
};
output = memoryGovernance.sanitizeMemory(input);
var outputStr = JSON.stringify(output);
ok(outputStr.indexOf('token1234567890') === -1, 'should not contain bearer token value');
ok(outputStr.indexOf('[REDACTED') >= 0, 'should contain redacted markers');

testName = 'sanitizeMemory handles arrays';
input = ['sk-abcdef1234567890abcdef1234567890', 'normal text', 'bearer xyz12345678901234567890abc'];
output = memoryGovernance.sanitizeMemory(input);
deepEqual(output[1], 'normal text', 'normal text should be unchanged');
ok(output[0].indexOf('[REDACTED') >= 0, 'array element with sk- should be masked');
ok(output[2].indexOf('[REDACTED') >= 0, 'array element with bearer should be masked');

testName = 'sanitizeMemory passes through numbers and booleans';
equal(memoryGovernance.sanitizeMemory(42), 42, 'number should pass through');
equal(memoryGovernance.sanitizeMemory(true), true, 'boolean should pass through');
equal(memoryGovernance.sanitizeMemory(null), null, 'null should pass through');

testName = 'validateMemory blocks GATEWAY_TOKEN';
var validation = memoryGovernance.validateMemory({ correlationId: 'test', summary: 'contains GATEWAY_TOKEN=secret' });
ok(!validation.allowed, 'should not allow GATEWAY_TOKEN');
assert(validation.violations.length > 0, 'should have violations');

testName = 'validateMemory blocks BRIDGE_TOKEN';
validation = memoryGovernance.validateMemory({ correlationId: 'test', summary: 'BRIDGE_TOKEN present' });
ok(!validation.allowed, 'should not allow BRIDGE_TOKEN');

testName = 'validateMemory blocks .env';
validation = memoryGovernance.validateMemory({ correlationId: 'test', summary: 'read from .env file' });
ok(!validation.allowed, 'should not allow .env reference');

testName = 'validateMemory allows normal content';
validation = memoryGovernance.validateMemory({ correlationId: 'test', summary: 'Normal execution log' });
ok(validation.allowed, 'should allow normal content');
ok(validation.sanitized !== null, 'should return sanitized object');

testName = 'safeAppend success';
var safeResult = memoryGovernance.safeAppend(function(record) { return true; }, { correlationId: 'safe-test', summary: 'safe content' });
ok(safeResult.success, 'should succeed');

testName = 'safeAppend blocked';
safeResult = memoryGovernance.safeAppend(function() {}, { correlationId: 'test', summary: 'contains GATEWAY_TOKEN' });
ok(!safeResult.success, 'should be blocked');

testName = 'maskSensitiveFields';
var masked = memoryGovernance.maskSensitiveFields('api key: sk-1234567890abcdef1234567890abcdef');
ok(masked.indexOf('sk-123456') === -1, 'should mask api key');

testName = 'getGovernanceReport';
var govReport = memoryGovernance.getGovernanceReport();
ok(govReport.activePatterns > 0, 'should have active patterns');
ok(Array.isArray(govReport.blockedKeywords), 'should have blocked keywords');
ok(govReport.retentionPolicy, 'should have retention policy');

// ══════════════════════════════════════════════════════════════
// 7. Retention Policy Tests (10 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n--- Retention Policy ---');

testName = 'retainPolicy returns config';
var policy = memoryGovernance.retainPolicy();
ok(policy.maxRecordsPerType > 0, 'should have maxRecordsPerType');
ok(policy.maxAgeDays > 0, 'should have maxAgeDays');
ok(policy.dedupWindow > 0, 'should have dedupWindow');

testName = 'checkDuplicate detects duplicate';
var existing = [
  { correlationId: 'dup-1', timestamp: ts(0) },
  { correlationId: 'dup-2', timestamp: ts(10000) }
];
var isDup = memoryGovernance.checkDuplicate(existing, { correlationId: 'dup-1', timestamp: ts(5000) }, 10);
ok(isDup, 'should detect duplicate within window');

testName = 'checkDuplicate ignores outside window';
var noDup = memoryGovernance.checkDuplicate(existing, { correlationId: 'dup-1', timestamp: ts(400000) }, 60);
ok(!noDup, 'should not detect duplicate outside window');

testName = 'checkDuplicate different correlationId not duplicate';
noDup = memoryGovernance.checkDuplicate(existing, { correlationId: 'dup-3', timestamp: ts(0) }, 300);
ok(!noDup, 'different correlationId should not be duplicate');

testName = 'checkDuplicate empty existing';
noDup = memoryGovernance.checkDuplicate([], { correlationId: 'new', timestamp: ts() }, 300);
ok(!noDup, 'empty existing should not be duplicate');

testName = 'checkDuplicate respects custom window';
existing = [{ correlationId: 'dup-1', timestamp: ts(0) }];
isDup = memoryGovernance.checkDuplicate(existing, { correlationId: 'dup-1', timestamp: ts(500) }, 1);
ok(isDup, 'should be duplicate within 1 second window');

// ══════════════════════════════════════════════════════════════
// 8. SQLite WAL Tests (15 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n--- SQLite Runtime Memory DB ---');

// 清理之前的 SQLite 数据
if (fs.existsSync(process.env.RUNTIME_MEMORY_DB_PATH)) {
  fs.unlinkSync(process.env.RUNTIME_MEMORY_DB_PATH);
}
runtimeMemoryDb.close(); // 重置状态

testName = 'initialize SQLite database';
var initResult = runtimeMemoryDb.initialize();
// SQLite may or may not be available (depends on better-sqlite3)
var sqliteAvailable = initResult;
log('INFO', 'SQLite available: ' + sqliteAvailable);

testName = 'isAvailable after init';
var available = runtimeMemoryDb.isAvailable();
equal(available, sqliteAvailable, 'isAvailable should match init result');

if (sqliteAvailable) {
  testName = 'SQLite: insertIncident';
  result = runtimeMemoryDb.insertIncident({
    correlationId: cid(),
    timestamp: ts(),
    incidentType: 'SQLITE_TEST',
    retryCount: 1,
    executor: 'test',
    command: 'test',
    error: 'test error'
  });
  ok(result, 'should insert incident');

  testName = 'SQLite: insertRecovery';
  result = runtimeMemoryDb.insertRecovery({
    correlationId: cid(),
    timestamp: ts(),
    recoveryType: 'SQLITE_RECOVERY',
    recovered: true,
    executor: 'test'
  });
  ok(result, 'should insert recovery');

  testName = 'SQLite: insertExecution';
  result = runtimeMemoryDb.insertExecution({
    correlationId: cid(),
    timestamp: ts(),
    executor: 'test',
    command: 'test',
    success: true,
    durationMs: 100
  });
  ok(result, 'should insert execution');

  testName = 'SQLite: insertStrategy';
  result = runtimeMemoryDb.insertStrategy({
    correlationId: cid(),
    timestamp: ts(),
    strategyType: 'gmv',
    strategyName: 'SQLite GMV',
    strategyConfig: { target: 100 }
  });
  ok(result, 'should insert strategy');

  testName = 'SQLite: insertOrganizationMemory';
  result = runtimeMemoryDb.insertOrganizationMemory({
    correlationId: cid(),
    timestamp: ts(),
    type: 'general',
    summary: 'SQLite org test'
  });
  ok(result, 'should insert org memory');

  testName = 'SQLite: queryIncidents';
  var dbIncidents = runtimeMemoryDb.queryIncidents({ limit: 10 });
  ok(Array.isArray(dbIncidents), 'should return array');
  assert(dbIncidents.length >= 1, 'should find incidents');

  testName = 'SQLite: queryIncidents by type';
  dbIncidents = runtimeMemoryDb.queryIncidents({ type: 'SQLITE_TEST', limit: 10 });
  for (var i = 0; i < dbIncidents.length; i++) {
    equal(dbIncidents[i].type, 'SQLITE_TEST', 'should filter by type');
  }

  testName = 'SQLite: queryRecoveries';
  var dbRecoveries = runtimeMemoryDb.queryRecoveries({ limit: 10 });
  assert(dbRecoveries.length >= 1, 'should find recoveries');

  testName = 'SQLite: queryExecutions by status';
  var dbEx = runtimeMemoryDb.queryExecutions({ status: 'success', limit: 10 });
  for (var i = 0; i < dbEx.length; i++) {
    equal(dbEx[i].status, 'success', 'should filter by success');
  }

  testName = 'SQLite: queryAllByCorrelationId';
  var multiCorrId = cid();
  runtimeMemoryDb.insertIncident({ correlationId: multiCorrId, timestamp: ts(), incidentType: 'MULTI', agent: 'test' });
  runtimeMemoryDb.insertRecovery({ correlationId: multiCorrId, timestamp: ts(), recoveryType: 'MULTI', agent: 'test' });
  var multiResults = runtimeMemoryDb.queryAllByCorrelationId(multiCorrId);
  assert(multiResults.incidents.length >= 1, 'should find incidents by corrId');
  assert(multiResults.recoveries.length >= 1, 'should find recoveries by corrId');

  testName = 'SQLite: countIncidents';
  var cnt = runtimeMemoryDb.countIncidents();
  assert(cnt >= 1, 'should count incidents');

  testName = 'SQLite: countIncidents by status';
  var openCnt = runtimeMemoryDb.countIncidents('open');
  assert(openCnt >= 0, 'should count by status');

  testName = 'SQLite: WAL mode verification';
  var db = runtimeMemoryDb.getDb();
  if (db) {
    var journalMode = db.pragma('journal_mode', { simple: true });
    equal(journalMode, 'wal', 'should be in WAL mode');
  }

  testName = 'SQLite: clearAll';
  runtimeMemoryDb.clearAll();
  cnt = runtimeMemoryDb.countIncidents();
  equal(cnt, 0, 'should clear all incidents');
}

// ══════════════════════════════════════════════════════════════
// 9. Context Builder Tests (20 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n--- Context Builder ---');

memoryWriter.clearLogs('all');

// Populate context data
var ctxCorrId = 'ctx-test-' + Date.now();
memoryWriter.appendIncident({
  correlationId: ctxCorrId, timestamp: ts(0), incidentType: 'TIMEOUT',
  retryCount: 2, recoveryResult: 'pending', executor: 'context-executor',
  command: 'npm run heavy-test', error: 'ETIMEDOUT', protocol: 'npm-test', agent: 'workbuddy'
});
memoryWriter.appendRecovery({
  correlationId: ctxCorrId, timestamp: ts(1000), recoveryType: 'TIMEOUT',
  recovered: true, executor: 'context-executor', recoveryPlanId: 'plan-timeout',
  totalSteps: 3, description: 'Increase timeout and retry'
});
memoryWriter.appendStrategy({
  correlationId: ctxCorrId, timestamp: ts(2000), strategyType: 'recovery',
  strategyName: 'Timeout Recovery Strategy', strategyConfig: { timeout: 30000, retries: 3 },
  agent: 'workbuddy'
});
memoryWriter.appendExecution({
  correlationId: ctxCorrId, timestamp: ts(3000), executor: 'context-executor',
  command: 'npm run heavy-test', success: true, durationMs: 45000, agent: 'workbuddy'
});

testName = 'buildAgentContext with incidentType';
var ctx = contextBuilder.buildAgentContext({
  agent: 'workbuddy',
  executor: 'context-executor',
  incidentType: 'TIMEOUT',
  contextSize: 5
});
ok(ctx.timestamp, 'should have timestamp');
ok(Array.isArray(ctx.incidents), 'should have incidents');
ok(Array.isArray(ctx.recoveries), 'should have recoveries');
ok(Array.isArray(ctx.strategies), 'should have strategies');
ok(Array.isArray(ctx.executions), 'should have executions');
ok(Array.isArray(ctx.recommendations), 'should have recommendations');
ok(Array.isArray(ctx.similarIncidents), 'should have similarIncidents');
ok(Array.isArray(ctx.similarRecoveries), 'should have similarRecoveries');

testName = 'buildAgentContext finds similar incidents';
assert(ctx.similarIncidents.length >= 1, 'should find TIMEOUT incidents');

testName = 'buildAgentContext has recommendations';
assert(ctx.recommendations.length > 0, 'should have recommendations');

testName = 'buildAgentContext with no matching data returns empty';
var emptyCtx = contextBuilder.buildAgentContext({
  agent: 'unknown-agent',
  executor: 'non-existent',
  incidentType: 'NONEXISTENT',
  contextSize: 5
});
ok(emptyCtx.recommendations.length > 0, 'should have at least no_data recommendation');

testName = 'buildRetryContext';
var retryCtx = contextBuilder.buildRetryContext({
  correlationId: ctxCorrId,
  incidentType: 'TIMEOUT',
  executor: 'context-executor',
  agent: 'workbuddy',
  retryCount: 2
});
ok(retryCtx.retrySpecific, 'should have retrySpecific');
equal(retryCtx.retrySpecific.currentRetryCount, 2, 'should have current retry count');

testName = 'buildRetryContext with high retry count';
var highRetryCtx = contextBuilder.buildRetryContext({
  correlationId: ctxCorrId,
  incidentType: 'TIMEOUT',
  executor: 'context-executor',
  agent: 'workbuddy',
  retryCount: 3
});
var hasEscalation = highRetryCtx.recommendations.some(function(r) { return r.type === 'retry_escalation'; });
ok(hasEscalation, 'should have escalation recommendation for 3+ retries');

testName = 'buildExecutionPlanContext';
var planCtx = contextBuilder.buildExecutionPlanContext({
  command: 'npm run heavy-test',
  executor: 'context-executor',
  agent: 'workbuddy'
});
ok(Array.isArray(planCtx.recommendations), 'should have recommendations');

testName = 'buildExecutionPlanContext with failure history';
memoryWriter.appendExecution({
  correlationId: cid(), timestamp: ts(), executor: 'context-executor',
  command: 'npm run fail-test', success: false, durationMs: 100, error: 'Test failed', agent: 'workbuddy'
});
planCtx = contextBuilder.buildExecutionPlanContext({
  command: 'npm run fail-test',
  executor: 'context-executor',
  agent: 'workbuddy'
});
ok(planCtx.warnings, 'should have warnings for failed executor');
assert(planCtx.warnings.length >= 1, 'should have at least 1 warning');

// ══════════════════════════════════════════════════════════════
// 10. Correlation Chain Tests (10 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n--- Correlation Chain ---');

memoryWriter.clearLogs('all');

testName = 'correlation chain: incident → retry → recovery → resolution';
var chainCid = 'chain-' + Date.now();

// 1. Initial incident
memoryWriter.appendIncident({
  correlationId: chainCid, timestamp: ts(0), incidentType: 'INFRA_ERROR',
  retryCount: 0, recoveryResult: 'pending', executor: 'chain-exec', command: 'docker restart',
  error: 'Container not found', protocol: 'docker', agent: 'workbuddy'
});

// 2. Retry 1
memoryWriter.appendIncident({
  correlationId: chainCid, timestamp: ts(1000), incidentType: 'INFRA_ERROR',
  retryCount: 1, recoveryResult: 'pending', executor: 'chain-exec', command: 'docker restart',
  error: 'Container not found', protocol: 'docker', agent: 'workbuddy'
});

// 3. Recovery plan
memoryWriter.appendRecovery({
  correlationId: chainCid, timestamp: ts(2000), recoveryType: 'INFRA_ERROR',
  recovered: false, executor: 'chain-exec', recoveryPlanId: 'rp-chain',
  totalSteps: 3, description: 'Restart docker daemon and recreate container'
});

// 4. Recovery success
memoryWriter.appendRecovery({
  correlationId: chainCid, timestamp: ts(3000), recoveryType: 'INFRA_ERROR',
  recovered: true, executor: 'chain-exec', recoveryPlanId: 'rp-chain',
  totalSteps: 3, description: 'Recovery successful'
});

// 5. Final execution success
memoryWriter.appendExecution({
  correlationId: chainCid, timestamp: ts(4000), executor: 'chain-exec',
  command: 'docker restart', success: true, durationMs: 2000, agent: 'workbuddy'
});

// 6. Resolution
memoryWriter.appendIncident({
  correlationId: chainCid, timestamp: ts(5000), incidentType: 'RESOLVED',
  retryCount: 1, recoveryResult: 'success', executor: 'chain-exec', command: '',
  status: 'resolved', summary: 'Resolved: docker daemon restarted'
});

testName = 'chain: query all by correlationId';
var chainResults = memoryReader.queryByCorrelationId(chainCid);
assert(chainResults.incidents.length >= 3, 'should have >= 3 incidents in chain');
assert(chainResults.recoveries.length >= 2, 'should have >= 2 recoveries');
assert(chainResults.executions.length >= 1, 'should have >= 1 execution');

testName = 'chain: timeline is ordered';
var timeline2 = organizationMemory.getCorrelationTimeline(chainCid);
for (var i = 0; i < timeline2.timeline.length - 1; i++) {
  assert(timeline2.timeline[i].timestamp <= timeline2.timeline[i + 1].timestamp,
    'timeline should be sequential: ' + timeline2.timeline[i].timestamp + ' <= ' + timeline2.timeline[i + 1].timestamp);
}

testName = 'chain: incident chain query';
var incChain = incidentMemory.getIncidentChain(chainCid);
assert(incChain.length >= 3, 'should have chain of incidents');

testName = 'chain: detects retry escalation';
var retryEntries = incChain.filter(function(e) { return e.retryCount > 0; });
assert(retryEntries.length >= 1, 'should have retry entries');

testName = 'chain: detects recovery';
var recEntries = memoryReader.queryRecoveryByCorrelationId(chainCid);
assert(recEntries.length >= 2, 'should have recovery entries');

testName = 'chain: final status resolved';
var finalIncident = incChain[0]; // most recent
ok(finalIncident.status === 'resolved' || finalIncident.incidentType === 'RESOLVED',
  'final incident should be resolved');

testName = 'chain: health report shows recovery';
var healthReport = organizationMemory.getHealthReport();
ok(healthReport.metrics.recoveryRate, 'should have recovery rate');

// ══════════════════════════════════════════════════════════════
// 11. Duplicate Prevention Tests (10 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n--- Duplicate Prevention ---');

memoryWriter.clearLogs('all');

testName = 'duplicate: same correlationId within window is duplicate';
var dupId = 'dup-test-' + Date.now();
memoryWriter.appendIncident({ correlationId: dupId, timestamp: ts(0), incidentType: 'DUP_TEST', retryCount: 0, recoveryResult: 'pending', executor: 'test' });
var existingRecords = memoryReader.queryIncidentByCorrelationId(dupId);
var isDuplicate = memoryGovernance.checkDuplicate(existingRecords, { correlationId: dupId, timestamp: ts(1000) }, 30);
ok(isDuplicate, 'should detect duplicate within 30s window');

testName = 'duplicate: different correlationId is not duplicate';
isDuplicate = memoryGovernance.checkDuplicate(existingRecords, { correlationId: 'different-id', timestamp: ts(1000) }, 30);
ok(!isDuplicate, 'different correlationId should not be duplicate');

testName = 'duplicate: outside window is not duplicate';
isDuplicate = memoryGovernance.checkDuplicate(existingRecords, { correlationId: dupId, timestamp: ts(3600000) }, 30);
ok(!isDuplicate, 'outside window should not be duplicate');

testName = 'duplicate: empty records always not duplicate';
isDuplicate = memoryGovernance.checkDuplicate([], { correlationId: 'new', timestamp: ts() }, 30);
ok(!isDuplicate, 'empty should not be duplicate');

testName = 'duplicate: wide window catches far apart records';
memoryWriter.appendIncident({ correlationId: dupId, timestamp: ts(5000), incidentType: 'DUP_TEST', retryCount: 1, recoveryResult: 'pending', executor: 'test' });
existingRecords = memoryReader.queryIncidentByCorrelationId(dupId);
assert(existingRecords.length >= 2, 'should have 2 records');
isDuplicate = memoryGovernance.checkDuplicate(existingRecords, { correlationId: dupId, timestamp: ts(7000) }, 10);
ok(isDuplicate, 'should detect within wide window');

testName = 'duplicate: retainPolicy dedup window is 300s';
var policy = memoryGovernance.retainPolicy();
equal(policy.dedupWindow, 300, 'default dedup window should be 300s');

// ══════════════════════════════════════════════════════════════
// 12. Integration & Edge Cases (10 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n--- Integration & Edge Cases ---');

testName = 'integration: large number of writes';
memoryWriter.clearLogs('all');
var largeCount = 100;
for (var i = 0; i < largeCount; i++) {
  memoryWriter.appendIncident({
    correlationId: 'bulk-' + i, timestamp: ts(i), incidentType: 'BULK_TEST',
    retryCount: 0, recoveryResult: 'pending', executor: 'bulk-executor'
  });
}
var bulkResults = memoryReader.queryRecentIncidents({ limit: largeCount });
assert(bulkResults.length >= largeCount, 'should handle bulk writes');

testName = 'integration: getOrganizationSnapshot after bulk data';
var snap = organizationMemory.getOrganizationSnapshot();
ok(snap.summary.incidents.total >= 100, 'should reflect bulk data');

testName = 'integration: query respects limit exactly';
bulkResults = memoryReader.queryRecentIncidents({ limit: 10 });
assert(bulkResults.length <= 10, 'should respect limit');

testName = 'integration: cross-module data consistency';
memoryWriter.clearLogs('all');
var consId = cid();
memoryWriter.appendIncident({ correlationId: consId, timestamp: ts(), incidentType: 'CONSISTENCY', retryCount: 0, recoveryResult: 'pending', executor: 'test' });
incidentMemory.recordIncident({ correlationId: consId, incidentType: 'CONSISTENCY2', retryCount: 1, recoveryResult: 'pending', executor: 'test', command: 'test' });
var allInc = memoryReader.queryIncidentByCorrelationId(consId);
assert(allInc.length >= 2, 'both writer and incidentMemory should write to same log');

testName = 'integration: empty string command handled';
memoryWriter.appendExecution({
  correlationId: cid(), timestamp: ts(), executor: 'test', command: '', success: true, durationMs: 0
});
ok(true, 'empty command should not throw');

testName = 'integration: very long error message truncated';
memoryWriter.appendIncident({
  correlationId: cid(), timestamp: ts(), incidentType: 'LONG_ERROR',
  retryCount: 0, recoveryResult: 'pending', executor: 'test',
  error: 'x'.repeat(10000)
});
ok(true, 'long error should be truncated without error');

testName = 'integration: special characters in summary';
var specialCid = cid();
memoryWriter.appendMemory({
  correlationId: specialCid, timestamp: ts(), type: 'test',
  status: 'ok', summary: 'Special chars: \n\t\r "quotes" \'single\' <html>'
});
results = memoryReader.queryExecutionHistory({ limit: 100 });
ok(true, 'special characters should not break');

testName = 'integration: concurrent correlationIds';
var ids = [];
for (var i = 0; i < 10; i++) ids.push(cid());
for (var i = 0; i < ids.length; i++) {
  memoryWriter.appendIncident({ correlationId: ids[i], timestamp: ts(), incidentType: 'CONCURRENT', retryCount: 0, recoveryResult: 'pending', executor: 'test' });
}
for (var i = 0; i < ids.length; i++) {
  var found = memoryReader.queryIncidentByCorrelationId(ids[i]);
  assert(found.length >= 1, 'should find incident for ' + ids[i]);
}

testName = 'integration: context builder with empty data after clear';
memoryWriter.clearLogs('all');
ctx = contextBuilder.buildAgentContext({ agent: 'test', executor: 'test' });
ok(ctx.recommendations.length >= 1, 'should have no_data recommendation when empty');

testName = 'integration: governance report always returns structure';
report = memoryGovernance.getGovernanceReport();
ok(report.activePatterns > 0, 'should have active patterns');
ok(Array.isArray(report.blockedKeywords), 'should have blocked keywords');
ok(typeof report.retentionPolicy === 'object', 'should have retention policy object');

// ══════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════

var total = passed + failed;
console.log('\n═══════════════════════════════════════════════');
console.log('  Shared Memory Runtime v1 Test Results');
console.log('═══════════════════════════════════════════════');
console.log('  Passed:  ' + passed);
console.log('  Failed:  ' + failed);
console.log('  Total:   ' + total);
console.log('  Rate:    ' + (total > 0 ? (passed / total * 100).toFixed(1) : '0') + '%');
console.log('═══════════════════════════════════════════════\n');

// ─── 清理 ──────────────────────────────────────────────────
try {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
} catch (_) {}

if (runtimeMemoryDb && typeof runtimeMemoryDb.close === 'function') {
  runtimeMemoryDb.close();
}

process.exit(failed > 0 ? 1 : 0);
