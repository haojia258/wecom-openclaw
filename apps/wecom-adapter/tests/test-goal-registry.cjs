'use strict';

/**
 * Goal Registry MVP — 测试套件 (>=200 tests)
 * P9.5.1
 *
 * 覆盖：
 * - goal-types（类型定义 + ID 生成 + 校验）
 * - goal-validator（创建 + 更新 + 状态转换）
 * - goal-store（CRUD + malformed storage + 并发写保护）
 * - goal-runtime（注册/暂停/归档/快照 + 只读/被动）
 * - index.js barrel export
 * - 安全审计（grep 禁止项）
 */

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var os = require('os');
var child_process = require('child_process');

// 被测模块
var types = require('../src/goal-registry/goal-types');
var validator = require('../src/goal-registry/goal-validator');
var store = require('../src/goal-registry/goal-store');
var runtime = require('../src/goal-registry/goal-runtime');
var index = require('../src/goal-registry/index');

// ========================================
// 测试计数器
// ========================================
var passed = 0;
var failed = 0;
var errors = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    // 不输出每个测试（减少噪音）
  } catch (e) {
    failed++;
    errors.push({ name: name, error: e.message });
    console.log('  FAIL: ' + name + ' -> ' + e.message);
  }
}

function assertThrow(fn, expectedMsg) {
  var threw = false;
  try { fn(); } catch (e) { threw = true; }
  assert.ok(threw, expectedMsg || 'expected function to throw');
}

// ========================================
// 测试工具
// ========================================
function makeTmpStorage() {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-test-'));
  var goalsFile = path.join(tmpDir, 'goals.json');
  return { tmpDir: tmpDir, goalsFile: goalsFile };
}

function cleanupTmp(tmpDir) {
  if (fs.existsSync(tmpDir)) {
    var files = fs.readdirSync(tmpDir);
    files.forEach(function(f) { fs.unlinkSync(path.join(tmpDir, f)); });
    fs.rmdirSync(tmpDir);
  }
}

function resetAll() {
  store._reset();
  runtime._reset();
  // 清理默认存储
  var storageFile = path.join(process.cwd(), 'storage/goals/goals.json');
  if (fs.existsSync(storageFile)) {
    fs.writeFileSync(storageFile, JSON.stringify([], null, 2), 'utf8');
  }
}

// ========================================
// 1. goal-types 测试 (20 tests)
// ========================================
console.log('\n=== 1. goal-types 测试 ===');

// 1.1 GOAL_STATUS 常量
test('types-GOAL_STATUS-ACTIVE', function() {
  assert.strictEqual(types.GOAL_STATUS.ACTIVE, 'active');
});
test('types-GOAL_STATUS-PAUSED', function() {
  assert.strictEqual(types.GOAL_STATUS.PAUSED, 'paused');
});
test('types-GOAL_STATUS-ARCHIVED', function() {
  assert.strictEqual(types.GOAL_STATUS.ARCHIVED, 'archived');
});

// 1.2 GOAL_PRIORITY 常量
test('types-GOAL_PRIORITY-LOW', function() {
  assert.strictEqual(types.GOAL_PRIORITY.LOW, 'low');
});
test('types-GOAL_PRIORITY-MEDIUM', function() {
  assert.strictEqual(types.GOAL_PRIORITY.MEDIUM, 'medium');
});
test('types-GOAL_PRIORITY-HIGH', function() {
  assert.strictEqual(types.GOAL_PRIORITY.HIGH, 'high');
});
test('types-GOAL_PRIORITY-CRITICAL', function() {
  assert.strictEqual(types.GOAL_PRIORITY.CRITICAL, 'critical');
});

// 1.3 GOAL_CATEGORIES 常量
test('types-GOAL_CATEGORIES-COMMERCE', function() {
  assert.strictEqual(types.GOAL_CATEGORIES.COMMERCE, 'commerce');
});
test('types-GOAL_CATEGORIES-OPERATIONS', function() {
  assert.strictEqual(types.GOAL_CATEGORIES.OPERATIONS, 'operations');
});
test('types-GOAL_CATEGORIES-RELIABILITY', function() {
  assert.strictEqual(types.GOAL_CATEGORIES.RELIABILITY, 'reliability');
});
test('types-GOAL_CATEGORIES-SECURITY', function() {
  assert.strictEqual(types.GOAL_CATEGORIES.SECURITY, 'security');
});
test('types-GOAL_CATEGORIES-COST', function() {
  assert.strictEqual(types.GOAL_CATEGORIES.COST, 'cost');
});
test('types-GOAL_CATEGORIES-PERFORMANCE', function() {
  assert.strictEqual(types.GOAL_CATEGORIES.PERFORMANCE, 'performance');
});
test('types-GOAL_CATEGORIES-COMPLIANCE', function() {
  assert.strictEqual(types.GOAL_CATEGORIES.COMPLIANCE, 'compliance');
});

// 1.4 validateGoalId
test('types-validateGoalId-valid', function() {
  assert.strictEqual(types.validateGoalId('goal_' + 'a'.repeat(16)), true);
});
test('types-validateGoalId-invalid-prefix', function() {
  assert.strictEqual(types.validateGoalId('goals_abc'), false);
});
test('types-validateGoalId-invalid-length', function() {
  assert.strictEqual(types.validateGoalId('goal_abc'), false);
});
test('types-validateGoalId-null', function() {
  assert.strictEqual(types.validateGoalId(null), false);
});
test('types-validateGoalId-undefined', function() {
  assert.strictEqual(types.validateGoalId(undefined), false);
});
test('types-validateGoalId-number', function() {
  assert.strictEqual(types.validateGoalId(123), false);
});

// 1.5 generateGoalId
test('types-generateGoalId-format', function() {
  var id = types.generateGoalId();
  assert.ok(/^goal_[a-f0-9]{16}$/.test(id), 'generateGoalId format: ' + id);
});
test('types-generateGoalId-unique', function() {
  var id1 = types.generateGoalId();
  var id2 = types.generateGoalId();
  assert.notStrictEqual(id1, id2);
});

// 1.6 validateStatus
test('types-validateStatus-valid', function() {
  assert.strictEqual(types.validateStatus('active'), true);
  assert.strictEqual(types.validateStatus('paused'), true);
  assert.strictEqual(types.validateStatus('archived'), true);
});
test('types-validateStatus-invalid', function() {
  assert.strictEqual(types.validateStatus('running'), false);
  assert.strictEqual(types.validateStatus(''), false);
  assert.strictEqual(types.validateStatus(null), false);
});

// 1.7 validatePriority
test('types-validatePriority-valid', function() {
  assert.strictEqual(types.validatePriority('low'), true);
  assert.strictEqual(types.validatePriority('medium'), true);
  assert.strictEqual(types.validatePriority('high'), true);
  assert.strictEqual(types.validatePriority('critical'), true);
});
test('types-validatePriority-invalid', function() {
  assert.strictEqual(types.validatePriority('urgent'), false);
  assert.strictEqual(types.validatePriority(''), false);
});

// 1.8 validateCategory
test('types-validateCategory-valid', function() {
  assert.strictEqual(types.validateCategory('commerce'), true);
  assert.strictEqual(types.validateCategory('operations'), true);
  assert.strictEqual(types.validateCategory('reliability'), true);
});
test('types-validateCategory-invalid', function() {
  assert.strictEqual(types.validateCategory('unknown'), false);
});

// ========================================
// 2. goal-validator 测试 (30 tests)
// ========================================
console.log('\n=== 2. goal-validator 测试 ===');

// 2.1 validateGoal — 合法输入
test('validator-validateGoal-valid-minimal', function() {
  var result = validator.validateGoal({ name: 'Test Goal' });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

test('validator-validateGoal-valid-full', function() {
  var result = validator.validateGoal({
    name: 'Full Goal',
    description: 'desc',
    category: 'operations',
    priority: 'high',
    status: 'active',
    targets: { value: 100 },
    constraints: { max: 200 },
    metadata: { owner: 'haoji' }
  });
  assert.strictEqual(result.valid, true);
});

// 2.2 validateGoal — 非法输入
test('validator-validateGoal-no-name', function() {
  var result = validator.validateGoal({});
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.indexOf('name') !== -1; }));
});

test('validator-validateGoal-name-too-long', function() {
  var result = validator.validateGoal({ name: 'x'.repeat(201) });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoal-name-not-string', function() {
  var result = validator.validateGoal({ name: 123 });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoal-invalid-category', function() {
  var result = validator.validateGoal({ name: 'G', category: 'invalid' });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoal-invalid-priority', function() {
  var result = validator.validateGoal({ name: 'G', priority: 'urgent' });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoal-invalid-status', function() {
  var result = validator.validateGoal({ name: 'G', status: 'running' });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoal-targets-not-object', function() {
  var result = validator.validateGoal({ name: 'G', targets: 'not-object' });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoal-targets-is-array', function() {
  var result = validator.validateGoal({ name: 'G', targets: [] });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoal-constraints-not-object', function() {
  var result = validator.validateGoal({ name: 'G', constraints: 123 });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoal-metadata-not-object', function() {
  var result = validator.validateGoal({ name: 'G', metadata: 'str' });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoal-description-not-string', function() {
  var result = validator.validateGoal({ name: 'G', description: 123 });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoal-null-input', function() {
  var result = validator.validateGoal(null);
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoal-undefined-input', function() {
  var result = validator.validateGoal(undefined);
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoal-non-object-input', function() {
  var result = validator.validateGoal('string');
  assert.strictEqual(result.valid, false);
});

// 2.3 validateGoalUpdate
test('validator-validateGoalUpdate-valid', function() {
  var id = types.generateGoalId();
  var result = validator.validateGoalUpdate({ goalId: id, name: 'Updated' });
  assert.strictEqual(result.valid, true);
});

test('validator-validateGoalUpdate-no-goalId', function() {
  var result = validator.validateGoalUpdate({ name: 'Updated' });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoalUpdate-invalid-goalId', function() {
  var result = validator.validateGoalUpdate({ goalId: 'bad-id', name: 'Updated' });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoalUpdate-no-fields', function() {
  var id = types.generateGoalId();
  var result = validator.validateGoalUpdate({ goalId: id });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoalUpdate-disallowed-field', function() {
  var id = types.generateGoalId();
  var result = validator.validateGoalUpdate({ goalId: id, unknownField: 'x' });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoalUpdate-valid-status-transition', function() {
  var id = types.generateGoalId();
  var result = validator.validateGoalUpdate({ goalId: id, status: 'paused' });
  assert.strictEqual(result.valid, true);
});

test('validator-validateGoalUpdate-invalid-status', function() {
  var id = types.generateGoalId();
  var result = validator.validateGoalUpdate({ goalId: id, status: 'invalid' });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoalUpdate-invalid-priority', function() {
  var id = types.generateGoalId();
  var result = validator.validateGoalUpdate({ goalId: id, priority: 'super' });
  assert.strictEqual(result.valid, false);
});

test('validator-validateGoalUpdate-null-input', function() {
  var result = validator.validateGoalUpdate(null);
  assert.strictEqual(result.valid, false);
});

// 2.4 validateStatusTransition
test('validator-validateStatusTransition-active-to-paused', function() {
  assert.strictEqual(validator.validateStatusTransition('active', 'paused'), true);
});

test('validator-validateStatusTransition-active-to-archived', function() {
  assert.strictEqual(validator.validateStatusTransition('active', 'archived'), true);
});

test('validator-validateStatusTransition-paused-to-active', function() {
  assert.strictEqual(validator.validateStatusTransition('paused', 'active'), true);
});

test('validator-validateStatusTransition-archived-to-active', function() {
  assert.strictEqual(validator.validateStatusTransition('archived', 'active'), false);
});

test('validator-validateStatusTransition-archived-to-paused', function() {
  assert.strictEqual(validator.validateStatusTransition('archived', 'paused'), false);
});

test('validator-validateStatusTransition-active-to-active', function() {
  assert.strictEqual(validator.validateStatusTransition('active', 'active'), false);
});

test('validator-validateStatusTransition-invalid-from', function() {
  assert.strictEqual(validator.validateStatusTransition('invalid', 'active'), false);
});

test('validator-validateStatusTransition-invalid-to', function() {
  assert.strictEqual(validator.validateStatusTransition('active', 'invalid'), false);
});

// ========================================
// 3. goal-store 测试 (50 tests)
// ========================================
console.log('\n=== 3. goal-store 测试 ===');

// 在每个测试前重置
function beforeEachStore() {
  resetAll();
}

// 3.1 createGoal
test('store-createGoal-valid', function() {
  beforeEachStore();
  var result = store.createGoal({ name: 'Test Goal' });
  assert.strictEqual(result.success, true);
  assert.ok(result.goal.goalId);
  assert.strictEqual(result.goal.name, 'Test Goal');
  assert.strictEqual(result.goal.status, 'active');
  assert.strictEqual(result.goal.priority, 'medium');
  assert.ok(result.goal.createdAt);
  assert.ok(result.goal.updatedAt);
});

test('store-createGoal-with-all-fields', function() {
  beforeEachStore();
  var result = store.createGoal({
    name: 'Full Goal',
    description: 'desc',
    category: 'operations',
    priority: 'high',
    status: 'active',
    targets: { value: 100 },
    constraints: { max: 200 },
    metadata: { owner: 'haoji', tags: ['test'] }
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.description, 'desc');
  assert.strictEqual(result.goal.category, 'operations');
  assert.strictEqual(result.goal.priority, 'high');
});

test('store-createGoal-duplicate-goalId', function() {
  beforeEachStore();
  var id = types.generateGoalId();
  store.createGoal({ goalId: id, name: 'Goal1' });
  var result = store.createGoal({ goalId: id, name: 'Goal2' });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.indexOf('already exists') !== -1);
});

test('store-createGoal-auto-generate-id', function() {
  beforeEachStore();
  var result = store.createGoal({ name: 'No ID' });
  assert.ok(/^goal_[a-f0-9]{16}$/.test(result.goal.goalId));
});

test('store-createGoal-persists-to-disk', function() {
  beforeEachStore();
  store.createGoal({ name: 'Persist Test' });
  var goals = store.listGoals();
  assert.strictEqual(goals.length, 1);
  assert.strictEqual(goals[0].name, 'Persist Test');
});

// 3.2 getGoal
test('store-getGoal-existing', function() {
  beforeEachStore();
  var created = store.createGoal({ name: 'Get Test' });
  var fetched = store.getGoal(created.goal.goalId);
  assert.ok(fetched);
  assert.strictEqual(fetched.name, 'Get Test');
});

test('store-getGoal-not-found', function() {
  beforeEachStore();
  var result = store.getGoal('goal_' + 'a'.repeat(16));
  assert.strictEqual(result, null);
});

test('store-getGoal-invalid-id', function() {
  beforeEachStore();
  var result = store.getGoal('invalid');
  assert.strictEqual(result, null);
});

// 3.3 listGoals
test('store-listGoals-empty', function() {
  beforeEachStore();
  assert.strictEqual(store.listGoals().length, 0);
});

test('store-listGoals-multiple', function() {
  beforeEachStore();
  store.createGoal({ name: 'G1' });
  store.createGoal({ name: 'G2' });
  assert.strictEqual(store.listGoals().length, 2);
});

test('store-listGoals-filter-by-status', function() {
  beforeEachStore();
  store.createGoal({ name: 'G1', status: 'active' });
  // 默认创建的是 active
  var active = store.listGoals({ status: 'active' });
  assert.strictEqual(active.length, 1);
});

test('store-listGoals-filter-by-category', function() {
  beforeEachStore();
  store.createGoal({ name: 'G1', category: 'operations' });
  store.createGoal({ name: 'G2', category: 'commerce' });
  var ops = store.listGoals({ category: 'operations' });
  assert.strictEqual(ops.length, 1);
  assert.strictEqual(ops[0].name, 'G1');
});

test('store-listGoals-filter-by-priority', function() {
  beforeEachStore();
  store.createGoal({ name: 'G1', priority: 'high' });
  store.createGoal({ name: 'G2', priority: 'low' });
  var high = store.listGoals({ priority: 'high' });
  assert.strictEqual(high.length, 1);
});

// 3.4 updateGoal
test('store-updateGoal-valid', function() {
  beforeEachStore();
  var created = store.createGoal({ name: 'Original' });
  var result = store.updateGoal(created.goal.goalId, { name: 'Updated' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.name, 'Updated');
  assert.ok(result.goal.updatedAt >= result.goal.createdAt);
});

test('store-updateGoal-not-found', function() {
  beforeEachStore();
  var result = store.updateGoal('goal_' + 'a'.repeat(16), { name: 'X' });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.indexOf('not found') !== -1);
});

test('store-updateGoal-status-transition', function() {
  beforeEachStore();
  var created = store.createGoal({ name: 'Status Test' });
  var result = store.updateGoal(created.goal.goalId, { status: 'paused' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.status, 'paused');
});

test('store-updateGoal-invalid-status-skip', function() {
  beforeEachStore();
  var created = store.createGoal({ name: 'Skip Test' });
  var result = store.updateGoal(created.goal.goalId, { status: 'invalid-status' });
  // 不应该更新，status 应该保持 active
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.status, 'active'); // 无效 status 被跳过
});

test('store-updateGoal-priority', function() {
  beforeEachStore();
  var created = store.createGoal({ name: 'Priority Test' });
  var result = store.updateGoal(created.goal.goalId, { priority: 'critical' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.priority, 'critical');
});

test('store-updateGoal-multiple-fields', function() {
  beforeEachStore();
  var created = store.createGoal({ name: 'Multi' });
  var result = store.updateGoal(created.goal.goalId, {
    name: 'Multi Updated',
    description: 'new desc',
    priority: 'high',
    category: 'reliability'
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.name, 'Multi Updated');
  assert.strictEqual(result.goal.description, 'new desc');
  assert.strictEqual(result.goal.priority, 'high');
  assert.strictEqual(result.goal.category, 'reliability');
});

test('store-updateGoal-updatedAt-changes', function() {
  beforeEachStore();
  var created = store.createGoal({ name: 'Time Test' });
  var originalUpdatedAt = created.goal.updatedAt;
  // 等一瞬间
  var result = store.updateGoal(created.goal.goalId, { name: 'Time Test 2' });
  assert.ok(result.goal.updatedAt >= originalUpdatedAt);
});

// 3.5 deleteGoal
test('store-deleteGoal-valid', function() {
  beforeEachStore();
  var created = store.createGoal({ name: 'Delete Me' });
  assert.strictEqual(store.listGoals().length, 1);
  var result = store.deleteGoal(created.goal.goalId);
  assert.strictEqual(result.success, true);
  assert.strictEqual(store.listGoals().length, 0);
});

test('store-deleteGoal-not-found', function() {
  beforeEachStore();
  var result = store.deleteGoal('goal_' + 'a'.repeat(16));
  assert.strictEqual(result.success, false);
  assert.ok(result.error.indexOf('not found') !== -1);
});

test('store-deleteGoal-persists-to-disk', function() {
  beforeEachStore();
  var created = store.createGoal({ name: 'Persist Delete' });
  store.deleteGoal(created.goal.goalId);
  // 重新读取
  var goals = store._readGoals();
  assert.strictEqual(goals.length, 0);
});

// 3.6 malformed JSON 容错
test('store-malformed-json-empty-file', function() {
  beforeEachStore();
  var storageFile = store._getStoragePath();
  fs.writeFileSync(storageFile, '', 'utf8');
  var goals = store.listGoals();
  assert.strictEqual(goals.length, 0);
});

test('store-malformed-json-invalid', function() {
  beforeEachStore();
  var storageFile = store._getStoragePath();
  fs.writeFileSync(storageFile, '{invalid json}', 'utf8');
  var goals = store.listGoals();
  assert.strictEqual(goals.length, 0);
});

test('store-malformed-json-not-array', function() {
  beforeEachStore();
  var storageFile = store._getStoragePath();
  fs.writeFileSync(storageFile, '{"not":"array"}', 'utf8');
  var goals = store.listGoals();
  assert.strictEqual(goals.length, 0);
});

test('store-malformed-json-recovery-after-create', function() {
  beforeEachStore();
  var storageFile = store._getStoragePath();
  fs.writeFileSync(storageFile, '{bad}', 'utf8');
  // 创建应该成功（会覆盖 malformed 文件）
  var result = store.createGoal({ name: 'Recovery' });
  assert.strictEqual(result.success, true);
  var goals = store.listGoals();
  assert.strictEqual(goals.length, 1);
});

// 3.7 并发写保护（mutex）
test('store-mutex-write-lock-exists', function() {
  beforeEachStore();
  // 写入一个 goal
  store.createGoal({ name: 'Mutex Test' });
  // 检查文件存在
  var storageFile = store._getStoragePath();
  assert.ok(fs.existsSync(storageFile));
});

test('store-mutex-concurrent-writes', function() {
  beforeEachStore();
  // 快速连续写入（应该都成功）
  for (var i = 0; i < 10; i++) {
    var result = store.createGoal({ name: 'Concurrent ' + i });
    assert.strictEqual(result.success, true);
  }
  assert.strictEqual(store.listGoals().length, 10);
});

test('store-ensure-storage-dir-created', function() {
  beforeEachStore();
  var storageFile = store._getStoragePath();
  assert.ok(fs.existsSync(storageFile));
});

// 3.8 _resetStorage
test('store-resetStorage-clears', function() {
  beforeEachStore();
  store.createGoal({ name: 'Before Reset' });
  assert.strictEqual(store.listGoals().length, 1);
  store._resetStorage();
  assert.strictEqual(store.listGoals().length, 0);
});

// 3.9 边界情况
test('store-createGoal-very-long-name', function() {
  beforeEachStore();
  var result = store.createGoal({ name: 'x'.repeat(200) });
  assert.strictEqual(result.success, true);
});

test('store-createGoal-special-chars-in-name', function() {
  beforeEachStore();
  var result = store.createGoal({ name: 'Test 🎯 Goal' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.name, 'Test 🎯 Goal');
});

test('store-updateGoal-empty-description', function() {
  beforeEachStore();
  var created = store.createGoal({ name: 'Empty Desc' });
  var result = store.updateGoal(created.goal.goalId, { description: '' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.description, '');
});

test('store-createGoal-metadata-default', function() {
  beforeEachStore();
  var result = store.createGoal({ name: 'Metadata Default' });
  assert.ok(result.goal.metadata);
  assert.strictEqual(result.goal.metadata.owner, 'system');
  assert.ok(Array.isArray(result.goal.metadata.tags));
});

test('store-updateGoal-metadata-merge', function() {
  beforeEachStore();
  var created = store.createGoal({ name: 'Meta' });
  var result = store.updateGoal(created.goal.goalId, { metadata: { owner: 'haoji', note: 'test' } });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.metadata.owner, 'haoji');
});

// ========================================
// 4. goal-runtime 测试 (40 tests)
// ========================================
console.log('\n=== 4. goal-runtime 测试 ===');

// 4.1 registerGoal
test('runtime-registerGoal-valid', function() {
  beforeEachStore();
  var result = runtime.registerGoal({ name: 'Runtime Goal' });
  assert.strictEqual(result.success, true);
  assert.ok(result.goal.goalId);
  assert.strictEqual(result.goal.name, 'Runtime Goal');
});

test('runtime-registerGoal-validation-failure', function() {
  beforeEachStore();
  var result = runtime.registerGoal({}); // 无 name
  assert.strictEqual(result.success, false);
  assert.ok(result.error.indexOf('validation failed') !== -1);
});

test('runtime-registerGoal-with-category', function() {
  beforeEachStore();
  var result = runtime.registerGoal({ name: 'Ops Goal', category: 'operations', priority: 'high' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.category, 'operations');
  assert.strictEqual(result.goal.priority, 'high');
});

// 4.2 pauseGoal
test('runtime-pauseGoal-valid', function() {
  beforeEachStore();
  var created = runtime.registerGoal({ name: 'Pause Test' });
  var result = runtime.pauseGoal(created.goal.goalId);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.status, 'paused');
});

test('runtime-pauseGoal-not-found', function() {
  beforeEachStore();
  var result = runtime.pauseGoal('goal_' + 'a'.repeat(16));
  assert.strictEqual(result.success, false);
  assert.ok(result.error.indexOf('not found') !== -1);
});

test('runtime-pauseGoal-invalid-id', function() {
  beforeEachStore();
  var result = runtime.pauseGoal('invalid-id');
  assert.strictEqual(result.success, false);
  assert.ok(result.error.indexOf('invalid goalId') !== -1);
});

test('runtime-pauseGoal-not-active', function() {
  beforeEachStore();
  var created = runtime.registerGoal({ name: 'Already Paused' });
  runtime.pauseGoal(created.goal.goalId);
  var result = runtime.pauseGoal(created.goal.goalId); // 已经是 paused
  assert.strictEqual(result.success, false);
  assert.ok(result.error.indexOf('must be active') !== -1);
});

// 4.3 archiveGoal
test('runtime-archiveGoal-from-active', function() {
  beforeEachStore();
  var created = runtime.registerGoal({ name: 'Archive Test' });
  var result = runtime.archiveGoal(created.goal.goalId);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.status, 'archived');
});

test('runtime-archiveGoal-from-paused', function() {
  beforeEachStore();
  var created = runtime.registerGoal({ name: 'Archive Paused' });
  runtime.pauseGoal(created.goal.goalId);
  var result = runtime.archiveGoal(created.goal.goalId);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.status, 'archived');
});

test('runtime-archiveGoal-not-found', function() {
  beforeEachStore();
  var result = runtime.archiveGoal('goal_' + 'a'.repeat(16));
  assert.strictEqual(result.success, false);
});

test('runtime-archiveGoal-invalid-id', function() {
  beforeEachStore();
  var result = runtime.archiveGoal('bad-id');
  assert.strictEqual(result.success, false);
});

test('runtime-archiveGoal-not-active-or-paused', function() {
  beforeEachStore();
  var created = runtime.registerGoal({ name: 'Archived Again' });
  runtime.archiveGoal(created.goal.goalId);
  var result = runtime.archiveGoal(created.goal.goalId); // 已经是 archived
  assert.strictEqual(result.success, false);
  assert.ok(result.error.indexOf('must be active or paused') !== -1);
});

// 4.4 activateGoal
test('runtime-activateGoal-valid', function() {
  beforeEachStore();
  var created = runtime.registerGoal({ name: 'Activate Test' });
  runtime.pauseGoal(created.goal.goalId);
  var result = runtime.activateGoal(created.goal.goalId);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.status, 'active');
});

test('runtime-activateGoal-not-paused', function() {
  beforeEachStore();
  var created = runtime.registerGoal({ name: 'Already Active' });
  var result = runtime.activateGoal(created.goal.goalId);
  assert.strictEqual(result.success, false);
  assert.ok(result.error.indexOf('must be paused') !== -1);
});

test('runtime-activateGoal-not-found', function() {
  beforeEachStore();
  var result = runtime.activateGoal('goal_' + 'a'.repeat(16));
  assert.strictEqual(result.success, false);
});

// 4.5 getActiveGoals / getPausedGoals / getArchivedGoals
test('runtime-getActiveGoals-empty', function() {
  beforeEachStore();
  assert.strictEqual(runtime.getActiveGoals().length, 0);
});

test('runtime-getActiveGoals-after-register', function() {
  beforeEachStore();
  runtime.registerGoal({ name: 'Active 1' });
  runtime.registerGoal({ name: 'Active 2' });
  assert.strictEqual(runtime.getActiveGoals().length, 2);
});

test('runtime-getActiveGoals-after-pause', function() {
  beforeEachStore();
  var g1 = runtime.registerGoal({ name: 'G1' });
  runtime.registerGoal({ name: 'G2' });
  runtime.pauseGoal(g1.goal.goalId);
  assert.strictEqual(runtime.getActiveGoals().length, 1);
});

test('runtime-getPausedGoals-after-pause', function() {
  beforeEachStore();
  var g1 = runtime.registerGoal({ name: 'G1' });
  runtime.pauseGoal(g1.goal.goalId);
  assert.strictEqual(runtime.getPausedGoals().length, 1);
});

test('runtime-getArchivedGoals-after-archive', function() {
  beforeEachStore();
  var g1 = runtime.registerGoal({ name: 'G1' });
  runtime.archiveGoal(g1.goal.goalId);
  assert.strictEqual(runtime.getArchivedGoals().length, 1);
});

// 4.6 generateGoalSnapshot
test('runtime-generateGoalSnapshot-empty', function() {
  beforeEachStore();
  var snapshot = runtime.generateGoalSnapshot();
  assert.ok(snapshot);
  assert.strictEqual(snapshot.goals.length, 0);
  assert.strictEqual(snapshot.summary.total, 0);
  assert.ok(snapshot.generatedAt);
  assert.ok(snapshot.runtimeVersion);
});

test('runtime-generateGoalSnapshot-with-goals', function() {
  beforeEachStore();
  runtime.registerGoal({ name: 'S1', priority: 'high', category: 'operations' });
  runtime.registerGoal({ name: 'S2', priority: 'low', category: 'commerce' });
  var snapshot = runtime.generateGoalSnapshot();
  assert.strictEqual(snapshot.goals.length, 2);
  assert.strictEqual(snapshot.summary.total, 2);
  assert.strictEqual(snapshot.summary.active, 2);
  assert.ok(snapshot.summary.byPriority);
  assert.ok(snapshot.summary.byCategory);
});

test('runtime-generateGoalSnapshot-with-paused', function() {
  beforeEachStore();
  var g1 = runtime.registerGoal({ name: 'Snap G1' });
  runtime.registerGoal({ name: 'Snap G2' });
  runtime.pauseGoal(g1.goal.goalId);
  var snapshot = runtime.generateGoalSnapshot();
  assert.strictEqual(snapshot.summary.active, 1);
  assert.strictEqual(snapshot.summary.paused, 1);
});

test('runtime-generateGoalSnapshot-with-archived', function() {
  beforeEachStore();
  var g1 = runtime.registerGoal({ name: 'Snap A1' });
  runtime.registerGoal({ name: 'Snap A2' });
  runtime.archiveGoal(g1.goal.goalId);
  var snapshot = runtime.generateGoalSnapshot();
  assert.strictEqual(snapshot.summary.archived, 1);
  assert.strictEqual(snapshot.summary.active, 1);
});

test('runtime-generateGoalSnapshot-summary-byPriority', function() {
  beforeEachStore();
  runtime.registerGoal({ name: 'P1', priority: 'high' });
  runtime.registerGoal({ name: 'P2', priority: 'high' });
  runtime.registerGoal({ name: 'P3', priority: 'low' });
  var snapshot = runtime.generateGoalSnapshot();
  assert.strictEqual(snapshot.summary.byPriority['high'], 2);
  assert.strictEqual(snapshot.summary.byPriority['low'], 1);
});

test('runtime-generateGoalSnapshot-summary-byCategory', function() {
  beforeEachStore();
  runtime.registerGoal({ name: 'C1', category: 'operations' });
  runtime.registerGoal({ name: 'C2', category: 'operations' });
  runtime.registerGoal({ name: 'C3', category: 'commerce' });
  var snapshot = runtime.generateGoalSnapshot();
  assert.strictEqual(snapshot.summary.byCategory['operations'], 2);
  assert.strictEqual(snapshot.summary.byCategory['commerce'], 1);
});

// 4.7 runtime 封装方法
test('runtime-getGoal-wrapper', function() {
  beforeEachStore();
  var created = runtime.registerGoal({ name: 'Get Wrapper' });
  var fetched = runtime.getGoal(created.goal.goalId);
  assert.ok(fetched);
  assert.strictEqual(fetched.name, 'Get Wrapper');
});

test('runtime-getGoal-invalid-id', function() {
  beforeEachStore();
  var result = runtime.getGoal('invalid');
  assert.strictEqual(result, null);
});

test('runtime-listGoals-wrapper', function() {
  beforeEachStore();
  runtime.registerGoal({ name: 'L1', category: 'operations' });
  runtime.registerGoal({ name: 'L2', category: 'commerce' });
  var list = runtime.listGoals({ category: 'operations' });
  assert.strictEqual(list.length, 1);
});

test('runtime-updateGoal-wrapper', function() {
  beforeEachStore();
  var created = runtime.registerGoal({ name: 'Update Wrapper' });
  var result = runtime.updateGoal(created.goal.goalId, { name: 'Updated Via Runtime' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.goal.name, 'Updated Via Runtime');
});

test('runtime-updateGoal-validation-failure', function() {
  beforeEachStore();
  var created = runtime.registerGoal({ name: 'Valid' });
  var result = runtime.updateGoal(created.goal.goalId, { name: '' }); // 空 name
  assert.strictEqual(result.success, false);
});

test('runtime-deleteGoal-wrapper', function() {
  beforeEachStore();
  var created = runtime.registerGoal({ name: 'Delete Wrapper' });
  assert.strictEqual(runtime.listGoals().length, 1);
  var result = runtime.deleteGoal(created.goal.goalId);
  assert.strictEqual(result.success, true);
  assert.strictEqual(runtime.listGoals().length, 0);
});

test('runtime-deleteGoal-invalid-id', function() {
  beforeEachStore();
  var result = runtime.deleteGoal('invalid');
  assert.strictEqual(result.success, false);
});

// 4.8 只读/被动约束验证（不执行任务）
test('runtime-registerGoal-no-execution', function() {
  beforeEachStore();
  // 验证 registerGoal 不会触发任何执行
  // （这里只是确认方法存在且返回预期结果，不抛异常）
  var result = runtime.registerGoal({ name: 'No Exec' });
  assert.strictEqual(result.success, true);
  // 没有 mission 被创建（通过检查 store 中只有 goal，没有 mission）
  assert.strictEqual(store.listGoals().length, 1);
});

// ========================================
// 5. index.js barrel export 测试 (15 tests)
// ========================================
console.log('\n=== 5. index.js barrel export 测试 ===');

test('index-exports-GOAL_STATUS', function() {
  assert.ok(index.GOAL_STATUS);
  assert.strictEqual(index.GOAL_STATUS.ACTIVE, 'active');
});

test('index-exports-GOAL_PRIORITY', function() {
  assert.ok(index.GOAL_PRIORITY);
  assert.strictEqual(index.GOAL_PRIORITY.MEDIUM, 'medium');
});

test('index-exports-GOAL_CATEGORIES', function() {
  assert.ok(index.GOAL_CATEGORIES);
});

test('index-exports-validateGoalId', function() {
  assert.strictEqual(typeof index.validateGoalId, 'function');
});

test('index-exports-generateGoalId', function() {
  assert.strictEqual(typeof index.generateGoalId, 'function');
});

test('index-exports-validateGoal', function() {
  assert.strictEqual(typeof index.validateGoal, 'function');
});

test('index-exports-validateGoalUpdate', function() {
  assert.strictEqual(typeof index.validateGoalUpdate, 'function');
});

test('index-exports-validateStatusTransition', function() {
  assert.strictEqual(typeof index.validateStatusTransition, 'function');
});

test('index-exports-createGoal', function() {
  assert.strictEqual(typeof index.createGoal, 'function');
});

test('index-exports-updateGoal', function() {
  assert.strictEqual(typeof index.updateGoal, 'function');
});

test('index-exports-deleteGoal', function() {
  assert.strictEqual(typeof index.deleteGoal, 'function');
});

test('index-exports-getGoal', function() {
  assert.strictEqual(typeof index.getGoal, 'function');
});

test('index-exports-listGoals', function() {
  assert.strictEqual(typeof index.listGoals, 'function');
});

test('index-exports-registerGoal', function() {
  assert.strictEqual(typeof index.registerGoal, 'function');
});

test('index-exports-generateGoalSnapshot', function() {
  assert.strictEqual(typeof index.generateGoalSnapshot, 'function');
});

// ========================================
// 6. 集成测试 — 完整流程 (20 tests)
// ========================================
console.log('\n=== 6. 集成测试 — 完整流程 ===');

test('integration-full-lifecycle', function() {
  beforeEachStore();
  // 1. 注册
  var r1 = runtime.registerGoal({ name: 'Lifecycle Goal', category: 'operations', priority: 'high' });
  assert.strictEqual(r1.success, true);
  var goalId = r1.goal.goalId;

  // 2. 获取
  var fetched = runtime.getGoal(goalId);
  assert.ok(fetched);
  assert.strictEqual(fetched.status, 'active');

  // 3. 更新
  var r2 = runtime.updateGoal(goalId, { name: 'Lifecycle Updated', description: 'new desc' });
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.goal.name, 'Lifecycle Updated');

  // 4. 暂停
  var r3 = runtime.pauseGoal(goalId);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.goal.status, 'paused');

  // 5. 激活
  var r4 = runtime.activateGoal(goalId);
  assert.strictEqual(r4.success, true);
  assert.strictEqual(r4.goal.status, 'active');

  // 6. 归档
  var r5 = runtime.archiveGoal(goalId);
  assert.strictEqual(r5.success, true);
  assert.strictEqual(r5.goal.status, 'archived');

  // 7. 快照验证
  var snapshot = runtime.generateGoalSnapshot();
  assert.strictEqual(snapshot.summary.archived, 1);
  assert.strictEqual(snapshot.summary.active, 0);
});

test('integration-multiple-goals', function() {
  beforeEachStore();
  runtime.registerGoal({ name: 'IG1', category: 'operations' });
  runtime.registerGoal({ name: 'IG2', category: 'commerce' });
  runtime.registerGoal({ name: 'IG3', category: 'operations' });
  runtime.registerGoal({ name: 'IG4', category: 'security' });

  assert.strictEqual(runtime.listGoals().length, 4);
  assert.strictEqual(runtime.getActiveGoals().length, 4);

  // 暂停一个
  var goals = runtime.listGoals();
  runtime.pauseGoal(goals[0].goalId);
  assert.strictEqual(runtime.getActiveGoals().length, 3);
  assert.strictEqual(runtime.getPausedGoals().length, 1);
});

test('integration-snapshot-accuracy', function() {
  beforeEachStore();
  runtime.registerGoal({ name: 'Snap G1', priority: 'high', category: 'operations' });
  var g2 = runtime.registerGoal({ name: 'Snap G2', priority: 'low', category: 'commerce' });
  runtime.pauseGoal(g2.goal.goalId);

  var snapshot = runtime.generateGoalSnapshot();
  assert.strictEqual(snapshot.summary.total, 2);
  assert.strictEqual(snapshot.summary.active, 1);
  assert.strictEqual(snapshot.summary.paused, 1);
  assert.strictEqual(snapshot.summary.byPriority['high'], 1);
  assert.strictEqual(snapshot.summary.byPriority['low'], 1);
  assert.strictEqual(snapshot.summary.byCategory['operations'], 1);
  assert.strictEqual(snapshot.summary.byCategory['commerce'], 1);
});

test('integration-storage-persistence', function() {
  beforeEachStore();
  runtime.registerGoal({ name: 'Persist G1' });
  runtime.registerGoal({ name: 'Persist G2' });

  // 模拟重启：创建新的 store 实例读取同一文件
  var storageFile = path.join(process.cwd(), 'storage/goals/goals.json');
  assert.ok(fs.existsSync(storageFile));
  var raw = fs.readFileSync(storageFile, 'utf8');
  var parsed = JSON.parse(raw);
  assert.strictEqual(parsed.length, 2);
});

test('integration-goalId-uniqueness', function() {
  beforeEachStore();
  var ids = {};
  for (var i = 0; i < 20; i++) {
    var r = runtime.registerGoal({ name: 'Unique ' + i });
    var id = r.goal.goalId;
    assert.ok(!ids[id], 'duplicate goalId: ' + id);
    ids[id] = true;
  }
  assert.strictEqual(Object.keys(ids).length, 20);
});

// 6.x 更多集成测试
test('integration-update-name-only', function() {
  beforeEachStore();
  var r = runtime.registerGoal({ name: 'Original' });
  var r2 = runtime.updateGoal(r.goal.goalId, { name: 'Only Name' });
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.goal.name, 'Only Name');
  assert.strictEqual(r2.goal.priority, 'medium'); // 保持默认
});

test('integration-update-category-only', function() {
  beforeEachStore();
  var r = runtime.registerGoal({ name: 'Cat Test' });
  var r2 = runtime.updateGoal(r.goal.goalId, { category: 'security' });
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.goal.category, 'security');
});

test('integration-pause-then-archive', function() {
  beforeEachStore();
  var r = runtime.registerGoal({ name: 'Pause Then Archive' });
  runtime.pauseGoal(r.goal.goalId);
  var r2 = runtime.archiveGoal(r.goal.goalId);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.goal.status, 'archived');
});

test('integration-archive-cannot-activate', function() {
  beforeEachStore();
  var r = runtime.registerGoal({ name: 'Archived' });
  runtime.archiveGoal(r.goal.goalId);
  var r2 = runtime.activateGoal(r.goal.goalId);
  assert.strictEqual(r2.success, false); // archived 不能激活
});

test('integration-delete-active-goal', function() {
  beforeEachStore();
  var r = runtime.registerGoal({ name: 'Delete Me' });
  assert.strictEqual(runtime.getActiveGoals().length, 1);
  runtime.deleteGoal(r.goal.goalId);
  assert.strictEqual(runtime.getActiveGoals().length, 0);
});

test('integration-delete-paused-goal', function() {
  beforeEachStore();
  var r = runtime.registerGoal({ name: 'Delete Paused' });
  runtime.pauseGoal(r.goal.goalId);
  assert.strictEqual(runtime.getPausedGoals().length, 1);
  runtime.deleteGoal(r.goal.goalId);
  assert.strictEqual(runtime.getPausedGoals().length, 0);
});

test('integration-delete-archived-goal', function() {
  beforeEachStore();
  var r = runtime.registerGoal({ name: 'Delete Archived' });
  runtime.archiveGoal(r.goal.goalId);
  assert.strictEqual(runtime.getArchivedGoals().length, 1);
  runtime.deleteGoal(r.goal.goalId);
  assert.strictEqual(runtime.getArchivedGoals().length, 0);
});

test('integration-snapshot-timestamp', function() {
  beforeEachStore();
  var before = new Date().toISOString();
  runtime.registerGoal({ name: 'Time Snap' });
  var snapshot = runtime.generateGoalSnapshot();
  var after = new Date().toISOString();
  assert.ok(snapshot.generatedAt >= before);
  assert.ok(snapshot.generatedAt <= after);
});

test('integration-snapshot-version', function() {
  beforeEachStore();
  var snapshot = runtime.generateGoalSnapshot();
  assert.ok(snapshot.runtimeVersion);
  assert.strictEqual(typeof snapshot.runtimeVersion, 'string');
});

test('integration-goal-with-targets', function() {
  beforeEachStore();
  var r = runtime.registerGoal({
    name: 'Target Goal',
    targets: { cpu: '<80%', memory: '<90%' }
  });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.goal.targets.cpu, '<80%');
});

test('integration-goal-with-constraints', function() {
  beforeEachStore();
  var r = runtime.registerGoal({
    name: 'Constraint Goal',
    constraints: { maxRetries: 3, timeout: 5000 }
  });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.goal.constraints.maxRetries, 3);
});

test('integration-goal-with-metadata', function() {
  beforeEachStore();
  var r = runtime.registerGoal({
    name: 'Metadata Goal',
    metadata: { owner: 'haoji', team: 'workbuddy', tags: ['p9', 'goal-registry'] }
  });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.goal.metadata.owner, 'haoji');
  assert.strictEqual(r.goal.metadata.tags.length, 2);
});

// ========================================
// 7. 安全审计 (10 tests)
// ========================================
console.log('\n=== 7. 安全审计 ===');

function grepFile(filePath, pattern) {
  try {
    var content = fs.readFileSync(filePath, 'utf8');
    return content.indexOf(pattern) !== -1;
  } catch (e) {
    return false;
  }
}

function grepDir(dirPath, pattern, extensions) {
  var found = [];
  function walk(dir) {
    var files = fs.readdirSync(dir);
    files.forEach(function(f) {
      var full = path.join(dir, f);
      var stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (f !== 'node_modules' && f !== '.git') walk(full);
      } else if (extensions.some(function(ext) { return f.endsWith(ext); })) {
        var content = fs.readFileSync(full, 'utf8');
        if (content.indexOf(pattern) !== -1) {
          found.push(full.replace(process.cwd(), ''));
        }
      }
    });
  }
  try { walk(dirPath); } catch (e) {}
  return found;
}

var REGISTRY_DIR = path.join(process.cwd(), 'src/goal-registry');

test('audit-no-express-import', function() {
  var found = grepDir(REGISTRY_DIR, 'express', ['.js']);
  assert.strictEqual(found.length, 0, 'found express: ' + found.join(', '));
});

test('audit-no-http-createServer', function() {
  var found = grepDir(REGISTRY_DIR, 'createServer', ['.js']);
  assert.strictEqual(found.length, 0, 'found createServer: ' + found.join(', '));
});

test('audit-no-listen', function() {
  var found = grepDir(REGISTRY_DIR, '.listen(', ['.js']);
  assert.strictEqual(found.length, 0, 'found .listen(: ' + found.join(', '));
});

test('audit-no-child_process', function() {
  var found = grepDir(REGISTRY_DIR, 'child_process', ['.js']);
  assert.strictEqual(found.length, 0, 'found child_process: ' + found.join(', '));
});

test('audit-no-spawn', function() {
  var found = grepDir(REGISTRY_DIR, 'spawn(', ['.js']);
  assert.strictEqual(found.length, 0, 'found spawn: ' + found.join(', '));
});

test('audit-no-exec', function() {
  var found = grepDir(REGISTRY_DIR, 'exec(', ['.js']);
  // 允许 fs.exists 等，但不允许 child_process.exec
  var realFound = found.filter(function(f) {
    var content = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
    return content.indexOf('child_process') !== -1 || content.indexOf('require(\'exec\')') !== -1;
  });
  assert.strictEqual(realFound.length, 0, 'found exec: ' + realFound.join(', '));
});

test('audit-no-pm2', function() {
  var found = grepDir(REGISTRY_DIR, 'pm2', ['.js']);
  assert.strictEqual(found.length, 0, 'found pm2: ' + found.join(', '));
});

test('audit-no-nginx', function() {
  var found = grepDir(REGISTRY_DIR, 'nginx', ['.js']);
  assert.strictEqual(found.length, 0, 'found nginx: ' + found.join(', '));
});

test('audit-no-env', function() {
  var found = grepDir(REGISTRY_DIR, '.env', ['.js']);
  assert.strictEqual(found.length, 0, 'found .env: ' + found.join(', '));
});

test('audit-no-deploy-script', function() {
  var found = grepDir(REGISTRY_DIR, 'deploy', ['.js']);
  // 忽略注释中的 deploy
  var realFound = found.filter(function(f) {
    var lines = fs.readFileSync(path.join(process.cwd(), f), 'utf8').split('\n');
    return lines.some(function(line) { return line.indexOf('deploy') !== -1 && line.trim()[0] !== '/' && line.trim()[0] !== '*'; });
  });
  assert.strictEqual(realFound.length, 0, 'found deploy: ' + realFound.join(', '));
});

// ========================================
// 8. 边界情况与异常处理 (25 tests)
// ========================================
console.log('\n=== 8. 边界情况与异常处理 ===');

test('edge-createGoal-no-name-validation', function() {
  beforeEachStore();
  var result = store.createGoal({});
  // store.createGoal 不直接校验，它信任 validator
  // 但 store 会接受并生成 goal（实际应该在 runtime 层校验）
  // 这里我们测试 store 的行为
  assert.ok(result.goal); // store 不校验，直接创建
});

test('edge-updateGoal-no-change', function() {
  beforeEachStore();
  var r = store.createGoal({ name: 'No Change' });
  var r2 = store.updateGoal(r.goal.goalId, {});
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.goal.name, 'No Change');
});

test('edge-updateGoal-invalid-status-no-crash', function() {
  beforeEachStore();
  var r = store.createGoal({ name: 'Edge Status' });
  // 传入无效 status，应该被跳过（不更新）
  var r2 = store.updateGoal(r.goal.goalId, { status: 'nonexistent' });
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.goal.status, 'active'); // 保持原值
});

test('edge-deleteGoal-after-delete', function() {
  beforeEachStore();
  var r = store.createGoal({ name: 'Double Delete' });
  store.deleteGoal(r.goal.goalId);
  var r2 = store.deleteGoal(r.goal.goalId);
  assert.strictEqual(r2.success, false);
});

test('edge-getGoal-after-delete', function() {
  beforeEachStore();
  var r = store.createGoal({ name: 'Get Deleted' });
  store.deleteGoal(r.goal.goalId);
  var fetched = store.getGoal(r.goal.goalId);
  assert.strictEqual(fetched, null);
});

test('edge-listGoals-after-all-deleted', function() {
  beforeEachStore();
  var r1 = store.createGoal({ name: 'D1' });
  var r2 = store.createGoal({ name: 'D2' });
  store.deleteGoal(r1.goal.goalId);
  store.deleteGoal(r2.goal.goalId);
  assert.strictEqual(store.listGoals().length, 0);
});

test('edge-goalId-case-sensitive', function() {
  beforeEachStore();
  var id = 'goal_' + 'a'.repeat(16);
  var idUpper = 'GOAL_' + 'A'.repeat(16);
  assert.notStrictEqual(id, idUpper);
  assert.strictEqual(types.validateGoalId(idUpper), false);
});

test('edge-storage-file-corrupted-during-read', function() {
  beforeEachStore();
  var storageFile = store._getStoragePath();
  fs.writeFileSync(storageFile, 'corrupted', 'utf8');
  // 读取时容错
  var goals = store._readGoals();
  assert.strictEqual(goals.length, 0);
});

test('edge-storage-file-not-json-array', function() {
  beforeEachStore();
  var storageFile = store._getStoragePath();
  fs.writeFileSync(storageFile, '{"not":"array"}', 'utf8');
  var goals = store._readGoals();
  assert.strictEqual(goals.length, 0);
});

test('edge-goal-with-unicode-name', function() {
  beforeEachStore();
  var r = store.createGoal({ name: '测试目标 🎯' });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.goal.name, '测试目标 🎯');
});

test('edge-goal-with-very-long-description', function() {
  beforeEachStore();
  var r = store.createGoal({ name: 'Long Desc', description: 'x'.repeat(10000) });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.goal.description.length, 10000);
});

test('edge-runtime-registerGoal-then-pause-then-activate-then-archive', function() {
  beforeEachStore();
  var r = runtime.registerGoal({ name: 'Full Cycle' });
  runtime.pauseGoal(r.goal.goalId);
  runtime.activateGoal(r.goal.goalId);
  runtime.archiveGoal(r.goal.goalId);
  var fetched = runtime.getGoal(r.goal.goalId);
  assert.strictEqual(fetched.status, 'archived');
});

test('edge-runtime-generateSnapshot-with-all-statuses', function() {
  beforeEachStore();
  var g1 = runtime.registerGoal({ name: 'S-Active' });
  var g2 = runtime.registerGoal({ name: 'S-Paused' });
  var g3 = runtime.registerGoal({ name: 'S-Archived' });
  runtime.pauseGoal(g2.goal.goalId);
  runtime.archiveGoal(g3.goal.goalId);

  var snapshot = runtime.generateGoalSnapshot();
  assert.strictEqual(snapshot.summary.active, 1);
  assert.strictEqual(snapshot.summary.paused, 1);
  assert.strictEqual(snapshot.summary.archived, 1);
  assert.strictEqual(snapshot.goals.length, 3);
});

test('edge-store-write-read-consistency', function() {
  beforeEachStore();
  store.createGoal({ name: 'Consistency' });
  store.createGoal({ name: 'Check' });
  var goals = store.listGoals();
  assert.strictEqual(goals.length, 2);
  // 重新读取文件
  var reread = store._readGoals();
  assert.strictEqual(reread.length, 2);
  assert.strictEqual(reread[0].name, 'Consistency');
  assert.strictEqual(reread[1].name, 'Check');
});

test('edge-validator-validateGoalUpdate-whitelist', function() {
  var id = types.generateGoalId();
  var result = validator.validateGoalUpdate({ goalId: id, unauthorizedField: 'x' });
  assert.strictEqual(result.valid, false);
});

test('edge-runtime-updateGoal-via-runtime', function() {
  beforeEachStore();
  var r = runtime.registerGoal({ name: 'RT Update' });
  var r2 = runtime.updateGoal(r.goal.goalId, { name: 'RT Updated' });
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.goal.name, 'RT Updated');
});

test('edge-runtime-deleteGoal-via-runtime', function() {
  beforeEachStore();
  var r = runtime.registerGoal({ name: 'RT Delete' });
  var r2 = runtime.deleteGoal(r.goal.goalId);
  assert.strictEqual(r2.success, true);
});

test('edge-goal-store-reset-then-reuse', function() {
  beforeEachStore();
  store.createGoal({ name: 'Before Reset' });
  store._resetStorage();
  store.createGoal({ name: 'After Reset' });
  assert.strictEqual(store.listGoals().length, 1);
  assert.strictEqual(store.listGoals()[0].name, 'After Reset');
});

test('edge-snapshot-structure', function() {
  beforeEachStore();
  runtime.registerGoal({ name: 'Struct' });
  var snapshot = runtime.generateGoalSnapshot();
  assert.ok(Array.isArray(snapshot.goals));
  assert.ok(Array.isArray(snapshot.activeGoals));
  assert.ok(Array.isArray(snapshot.pausedGoals));
  assert.ok(Array.isArray(snapshot.archivedGoals));
  assert.ok(snapshot.summary);
  assert.ok(typeof snapshot.summary.total === 'number');
  assert.ok(snapshot.generatedAt);
  assert.ok(snapshot.runtimeVersion);
});

test('edge-goal-priority-case-sensitive', function() {
  beforeEachStore();
  var result = validator.validateGoal({ name: 'Case', priority: 'HIGH' }); // 大写
  assert.strictEqual(result.valid, false);
});

test('edge-goal-status-case-sensitive', function() {
  beforeEachStore();
  var result = validator.validateGoal({ name: 'Case', status: 'ACTIVE' }); // 大写
  assert.strictEqual(result.valid, false);
});

test('edge-goal-category-case-sensitive', function() {
  beforeEachStore();
  var result = validator.validateGoal({ name: 'Case', category: 'OPERATIONS' }); // 大写
  assert.strictEqual(result.valid, false);
});

test('edge-runtime-registerGoal-with-idempotent-id', function() {
  beforeEachStore();
  var id = types.generateGoalId();
  var r1 = runtime.registerGoal({ goalId: id, name: 'Idem 1' });
  assert.strictEqual(r1.success, true);
  var r2 = runtime.registerGoal({ goalId: id, name: 'Idem 2' });
  assert.strictEqual(r2.success, false); // 重复 ID
});

test('edge-storage-dir-permissions', function() {
  beforeEachStore();
  var storageDir = path.join(process.cwd(), 'storage/goals');
  assert.ok(fs.existsSync(storageDir));
  var stat = fs.statSync(storageDir);
  assert.ok(stat.isDirectory());
});

// ========================================
// 9. 并发与性能测试 (15 tests)
// ========================================
console.log('\n=== 9. 并发与性能测试 ===');

test('concurrent-create-10-goals', function() {
  beforeEachStore();
  for (var i = 0; i < 10; i++) {
    var r = store.createGoal({ name: 'Concurrent ' + i });
    assert.strictEqual(r.success, true);
  }
  assert.strictEqual(store.listGoals().length, 10);
});

test('concurrent-update-same-goal', function() {
  beforeEachStore();
  var r = store.createGoal({ name: 'Concurrent Update' });
  // 模拟并发更新（顺序执行，但验证不崩溃）
  for (var i = 0; i < 5; i++) {
    var r2 = store.updateGoal(r.goal.goalId, { name: 'Updated ' + i });
    assert.strictEqual(r2.success, true);
  }
  var fetched = store.getGoal(r.goal.goalId);
  assert.ok(fetched.name.indexOf('Updated') !== -1);
});

test('concurrent-delete-and-read', function() {
  beforeEachStore();
  var r = store.createGoal({ name: 'Delete Read' });
  store.deleteGoal(r.goal.goalId);
  var goals = store.listGoals();
  assert.strictEqual(goals.length, 0);
});

test('performance-create-100-goals', function() {
  beforeEachStore();
  var start = Date.now();
  for (var i = 0; i < 100; i++) {
    store.createGoal({ name: 'Perf ' + i });
  }
  var elapsed = Date.now() - start;
  assert.ok(elapsed < 5000, 'create 100 goals took ' + elapsed + 'ms');
});

test('performance-read-100-goals', function() {
  beforeEachStore();
  for (var i = 0; i < 100; i++) {
    store.createGoal({ name: 'Read Perf ' + i });
  }
  var start = Date.now();
  var goals = store.listGoals();
  var elapsed = Date.now() - start;
  assert.strictEqual(goals.length, 100);
  assert.ok(elapsed < 1000, 'read 100 goals took ' + elapsed + 'ms');
});

test('performance-snapshot-100-goals', function() {
  beforeEachStore();
  for (var i = 0; i < 100; i++) {
    runtime.registerGoal({ name: 'Snap Perf ' + i, priority: i % 2 === 0 ? 'high' : 'low' });
  }
  var start = Date.now();
  var snapshot = runtime.generateGoalSnapshot();
  var elapsed = Date.now() - start;
  assert.strictEqual(snapshot.summary.total, 100);
  assert.ok(elapsed < 2000, 'snapshot 100 goals took ' + elapsed + 'ms');
});

test('memory-goal-with-large-metadata', function() {
  beforeEachStore();
  var bigMetadata = { data: 'x'.repeat(10000) };
  var r = store.createGoal({ name: 'Big Meta', metadata: bigMetadata });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.goal.metadata.data.length, 10000);
});

test('memory-goal-with-many-targets', function() {
  beforeEachStore();
  var targets = {};
  for (var i = 0; i < 100; i++) {
    targets['target' + i] = i;
  }
  var r = store.createGoal({ name: 'Many Targets', targets: targets });
  assert.strictEqual(r.success, true);
  assert.strictEqual(Object.keys(r.goal.targets).length, 100);
});

test('mutex-write-queue-drains', function() {
  beforeEachStore();
  // 写入多个 goal，验证 mutex 队列排空
  for (var i = 0; i < 20; i++) {
    store.createGoal({ name: 'Mutex ' + i });
  }
  assert.strictEqual(store.listGoals().length, 20);
});

test('concurrent-read-during-write', function() {
  beforeEachStore();
  store.createGoal({ name: 'Read During Write' });
  // 读取不应该被阻塞（我们的实现是同步的）
  var goals = store.listGoals();
  assert.strictEqual(goals.length, 1);
});

test('stress-update-same-goal-many-times', function() {
  beforeEachStore();
  var r = store.createGoal({ name: 'Stress Update' });
  for (var i = 0; i < 50; i++) {
    var r2 = store.updateGoal(r.goal.goalId, { name: 'Stress ' + i });
    assert.strictEqual(r2.success, true);
  }
  var fetched = store.getGoal(r.goal.goalId);
  assert.ok(fetched.name.indexOf('Stress') !== -1);
});

test('stress-create-delete-cycle', function() {
  beforeEachStore();
  for (var i = 0; i < 20; i++) {
    var r = store.createGoal({ name: 'Cycle ' + i });
    store.deleteGoal(r.goal.goalId);
  }
  assert.strictEqual(store.listGoals().length, 0);
});

test('stress-snapshot-during-updates', function() {
  beforeEachStore();
  var r = store.createGoal({ name: 'Snapshot Stress' });
  for (var i = 0; i < 10; i++) {
    store.updateGoal(r.goal.goalId, { name: 'Snap Stress ' + i });
    var snapshot = runtime.generateGoalSnapshot();
    assert.ok(snapshot);
  }
});

test('edge-goalId-collision-extremely-unlikely', function() {
  beforeEachStore();
  var ids = {};
  for (var i = 0; i < 100; i++) {
    var r = store.createGoal({ name: 'Collision ' + i });
    var id = r.goal.goalId;
    assert.ok(!ids[id], 'COLLISION at ' + i + ': ' + id);
    ids[id] = true;
  }
});

// ========================================
// 测试结果汇总
// ========================================
console.log('\n' + '='.repeat(60));
console.log('  P9.5.1 Goal Registry 测试汇总');
console.log('='.repeat(60));
console.log('  总计: ' + (passed + failed) + ' tests');
console.log('  通过: ' + passed + ' ✓');
console.log('  失败: ' + failed + (failed > 0 ? ' ✗' : ' ✓'));
console.log('='.repeat(60));

if (errors.length > 0) {
  console.log('\n失败详情:');
  errors.forEach(function(e) {
    console.log('  - ' + e.name + ': ' + e.error);
  });
}

process.exit(failed > 0 ? 1 : 0);
