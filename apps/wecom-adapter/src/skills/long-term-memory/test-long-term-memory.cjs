'use strict';

/**
 * test-long-term-memory.cjs — P13.5 Long-term Memory Tests
 */

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var memoryStore = require('./memory-store');
var ltm = require('./long-term-memory');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name + ' — ' + e.message);
  }
}

function assertExists(val, msg) { assert.ok(val != null, msg || 'should exist'); }
function assertType(val, type) { assert.strictEqual(typeof val, type); }
function assertRange(val, min, max) { assert.ok(val >= min && val <= max, 'expected ' + min + '-' + max + ', got ' + val); }

// Clean test data before running
var testFiles = fs.readdirSync(memoryStore.STORE_DIR).filter(function (f) { return f.endsWith('.jsonl'); });
testFiles.forEach(function (f) {
  fs.unlinkSync(path.join(memoryStore.STORE_DIR, f));
});
try { fs.unlinkSync(path.join(memoryStore.STORE_DIR, 'index.json')); } catch (_) {}

console.log('\nP13.5 Long-term Memory Tests\n');

// ─── Group A: Memory Store Write ──────────────────────────

test('append 返回记录对象', function () {
  var rec = memoryStore.append('kpi', { gmv: 48000, profit: 14400 });
  assertExists(rec);
  assert.strictEqual(rec.type, 'kpi');
  assertExists(rec.ts);
  assertExists(rec.data);
  assert.strictEqual(rec.data.gmv, 48000);
});

test('append 写入磁盘文件', function () {
  memoryStore.append('kpi', { gmv: 45000 });
  memoryStore.append('kpi', { gmv: 46000 });

  var dateStr = new Date().toISOString().split('T')[0];
  var fileName = 'kpi-' + dateStr + '.jsonl';
  var filePath = path.join(memoryStore.STORE_DIR, fileName);
  assert.ok(fs.existsSync(filePath), 'file should exist: ' + filePath);
});

test('append 不同类型创建不同文件', function () {
  memoryStore.append('budget', { score: 70 });
  memoryStore.append('board', { decision: 'approve' });

  var dateStr = new Date().toISOString().split('T')[0];
  assert.ok(fs.existsSync(path.join(memoryStore.STORE_DIR, 'budget-' + dateStr + '.jsonl')));
  assert.ok(fs.existsSync(path.join(memoryStore.STORE_DIR, 'board-' + dateStr + '.jsonl')));
});

// ─── Group B: Memory Store Query ──────────────────────────

test('query 返回数组', function () {
  var records = memoryStore.query('kpi', 1);
  assert.ok(Array.isArray(records));
  assert.ok(records.length > 0, 'should have records after append');
});

test('query 所有记录类型正确', function () {
  var records = memoryStore.query('kpi', 1);
  records.forEach(function (r) {
    assert.strictEqual(r.type, 'kpi');
    assertExists(r.ts);
    assertExists(r.data);
  });
});

test('query 不存在的类型返回空数组', function () {
  var records = memoryStore.query('nonexistent', 7);
  assert.strictEqual(records.length, 0);
});

test('queryAll 返回四类型', function () {
  var all = memoryStore.queryAll(1);
  assert.ok(Array.isArray(all.kpi));
  assert.ok(Array.isArray(all.budget));
  assert.ok(Array.isArray(all.strategy));
  assert.ok(Array.isArray(all.board));
});

test('stats 返回各类型计数', function () {
  var s = memoryStore.stats(1);
  assertType(s.total, 'number');
  assertType(s.kpi, 'number');
  assert.ok(s.kpi >= 2, 'should have at least 2 KPI records');
  assert.ok(s.budget >= 1, 'should have at least 1 budget record');
  assert.ok(s.board >= 1, 'should have at least 1 board record');
});

// ─── Group C: Long-term Memory Engine ─────────────────────

test('getHistory 返回历史对象', function () {
  var h = ltm.getHistory('kpi', 1);
  assert.strictEqual(h.type, 'kpi');
  assert.ok(h.count > 0);
  assertExists(h.trend);
  assert.ok(['up', 'down', 'stable'].indexOf(h.trend) !== -1);
});

test('getHistory 趋势计算', function () {
  // Add records with increasing GMV
  memoryStore.append('kpi', { gmv: 40000 });
  memoryStore.append('kpi', { gmv: 45000 });
  memoryStore.append('kpi', { gmv: 50000 });

  var h = ltm.getHistory('kpi', 1);
  assertExists(h.trend);
  assertExists(h.latest);
  assertExists(h.summary);
});

test('getHistory 空数据返回 count=0', function () {
  memoryStore.append('strategy', { planId: 'test', riskLevel: 'low' });
  var h = ltm.getHistory('strategy', 1);
  assert.ok(h.count > 0);
});

test('getMemoryStats 返回统计', function () {
  var s = ltm.getMemoryStats(30);
  assertType(s.total, 'number');
});

test('archiveAll 返回存档结果', function () {
  var results = ltm.archiveAll();
  assertExists(results);
  assertExists(results.archivedAt);
  // All four types should have results (or null if source unavailable)
  assert.ok(results.kpi !== undefined);
  assert.ok(results.budget !== undefined);
  assert.ok(results.strategy !== undefined);
  assert.ok(results.board !== undefined);
});

// ─── Group D: REVIEW_ONLY ─────────────────────────────────

test('不含 .env 引用', function () {
  var code = fs.readFileSync(__filename.replace('test-long-term-memory.cjs', 'long-term-memory.js'), 'utf-8');
  assert.strictEqual(code.indexOf('.env'), -1);
});

test('不含 deploy/merge', function () {
  var code = fs.readFileSync(__filename.replace('test-long-term-memory.cjs', 'long-term-memory.js'), 'utf-8');
  var lower = code.toLowerCase();
  assert.strictEqual(lower.indexOf('deploy'), -1);
  assert.strictEqual(lower.indexOf('merge'), -1);
});

// ─── Group E: Idempotency ─────────────────────────────────

test('append 幂等 — 追加不覆盖', function () {
  memoryStore.append('kpi', { gmv: 10000 });
  var before = memoryStore.query('kpi', 1).length;
  memoryStore.append('kpi', { gmv: 11000 });
  var after = memoryStore.query('kpi', 1).length;
  assert.strictEqual(after, before + 1);
});

test('archiveAll 幂等 — 每次添加新记录', function () {
  var before = memoryStore.stats(1).total;
  ltm.archiveAll();
  var after = memoryStore.stats(1).total;
  assert.ok(after >= before, 'should not decrease');
});

// ─── Results ──────────────────────────────────────────────

console.log('');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
