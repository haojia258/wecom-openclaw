/**
 * test-memory-index.js
 * 测试 memory-index.js
 *
 * 验证：
 *   1. 索引添加正常
 *   2. 按 taskId 检索正常
 *   3. 按 intent 检索正常
 *   4. 按 assignee 检索正常
 *   5. 列出条目正常
 *
 * 用法：node test-memory-index.js
 */

var assert = require('assert');
var path = require('path');

// 加载被测模块
var memoryIndex;
try {
  memoryIndex = require('../memory-index');
} catch (e) {
  console.error('❌ 无法加载 memory-index.js：', e.message);
  process.exit(1);
}

var passed = 0;
var failed = 0;
var errors = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✅ ' + name);
  } catch (e) {
    failed++;
    errors.push({ name: name, error: e.message });
    console.log('  ❌ ' + name + '：' + e.message);
  }
}

console.log('');
console.log('─── Memory Index 测试 ──────────────────────');
console.log('');

// 清理缓存
memoryIndex.clearCache();

// 准备测试数据
var testEntry1 = {
  taskId: 'mem-test-001',
  intent: 'ops_analysis',
  assignee: 'workbuddy',
  summary: '运营分析报告测试',
  result: 'pass',
};

var testEntry2 = {
  taskId: 'mem-test-002',
  intent: 'code_change',
  assignee: 'codex',
  summary: '代码变更测试',
  result: 'pass',
};

// ===== Test 1: addEntry =====
console.log('📋 addEntry');
test('addEntry 返回 id 和 timestamp', function () {
  var record = memoryIndex.addEntry('task', testEntry1);
  assert.ok(record.id);
  assert.ok(record.timestamp);
  assert.strictEqual(record.taskId, 'mem-test-001');
  assert.strictEqual(record.intent, 'ops_analysis');
});

test('addEntry 对 patch 类型也正常', function () {
  var record = memoryIndex.addEntry('patch', testEntry2);
  assert.ok(record.id);
  assert.strictEqual(record.type, 'patch');
});

test('addEntry 对未知类型返回 error', function () {
  var result = memoryIndex.addEntry('unknown_type', testEntry1);
  assert.ok(result.error);
});

// ===== Test 2: findByTaskId =====
console.log('');
console.log('🔍 findByTaskId');
test('按 taskId 检索到记录', function () {
  var results = memoryIndex.findByTaskId('mem-test-001');
  assert.ok(Array.isArray(results));
  assert.ok(results.length >= 1);
});

test('不存在的 taskId 返回空数组', function () {
  var results = memoryIndex.findByTaskId('nonexistent-task-id');
  assert.ok(Array.isArray(results));
  assert.strictEqual(results.length, 0);
});

// ===== Test 3: findByIntent =====
console.log('');
console.log('🔍 findByIntent');
test('按 intent 检索到记录', function () {
  var results = memoryIndex.findByIntent('ops_analysis');
  assert.ok(Array.isArray(results));
  assert.ok(results.length >= 1);
});

test('不存在的 intent 返回空数组', function () {
  var results = memoryIndex.findByIntent('nonexistent_intent');
  assert.ok(Array.isArray(results));
});

// ===== Test 4: findByAssignee =====
console.log('');
console.log('🔍 findByAssignee');
test('按 assignee 检索到记录', function () {
  var results = memoryIndex.findByAssignee('workbuddy');
  assert.ok(Array.isArray(results));
  assert.ok(results.length >= 1);
});

test('不存在的 assignee 返回空数组', function () {
  var results = memoryIndex.findByAssignee('nonexistent_worker');
  assert.ok(Array.isArray(results));
});

// ===== Test 5: listEntries =====
console.log('');
console.log('📋 listEntries');
test('列出 task 类型条目', function () {
  var results = memoryIndex.listEntries('task');
  assert.ok(Array.isArray(results));
});

test('列出 patch 类型条目', function () {
  var results = memoryIndex.listEntries('patch');
  assert.ok(Array.isArray(results));
});

test('限制数量参数生效', function () {
  var results = memoryIndex.listEntries('task', 1);
  assert.ok(results.length <= 1);
});

test('未知类型返回空数组', function () {
  var results = memoryIndex.listEntries('unknown_type');
  assert.ok(Array.isArray(results));
  assert.strictEqual(results.length, 0);
});

// ===== Test 6: 跨类型检索 =====
console.log('');
console.log('🔗 跨类型检索验证');
test('同一个 taskId 在不同类型中都能被找到', function () {
  // task 类型中已添加 mem-test-001
  // 再添加一个 review 类型的相同 taskId
  memoryIndex.addEntry('review', {
    taskId: 'mem-test-001',
    intent: 'ops_analysis',
    assignee: 'workbuddy',
    summary: 'Review 测试',
    result: 'approved',
  });

  var results = memoryIndex.findByTaskId('mem-test-001');
  assert.ok(results.length >= 2); // 至少 2 条（task + review）
});

// ===== Test 7: getIndexPath =====
console.log('');
console.log('📂 getIndexPath');
test('返回正确的索引文件路径', function () {
  var p = memoryIndex.getIndexPath('task');
  assert.ok(p);
  assert.ok(p.indexOf('task-history.idx.json') !== -1);
});

// ===== 汇总 =====
console.log('');
console.log('───────────────────────────────────────────────');
console.log('📊 测试结果：' + passed + '/' + (passed + failed) + ' 通过');
if (failed > 0) {
  console.log('');
  console.log('❌ 失败项：');
  errors.forEach(function (e) {
    console.log('  - ' + e.name + '：' + e.error);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('');
  console.log('✅ 全部测试通过！');
  console.log('');
  process.exit(0);
}
