/**
 * test-execution-policy.js
 * 测试 execution-policy.js
 *
 * 验证：
 *   1. 所有禁止项正确拦截
 *   2. 允许项正确通过
 *   3. assertAllowed 正确抛异常
 *   4. listForbiddenActions 正确返回
 *
 * 用法：node test-execution-policy.js
 */

var assert = require('assert');

// 加载被测模块
var policy;
try {
  policy = require('../execution-policy');
} catch (e) {
  console.error('❌ 无法加载 execution-policy.js：', e.message);
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
console.log('─── Execution Policy 测试 ───────────────────────');
console.log('');

// ===== Test 1: 禁止自动 apply patch =====
console.log('🔒 禁止项验证');
test('拒绝 auto_apply_patch', function () {
  var result = policy.validateExecution('auto_apply_patch');
  assert.strictEqual(result.allowed, false);
  assert.ok(result.reason.indexOf('HARD_CONSTRAINT') !== -1);
});

test('拒绝 apply_patch_auto（兼容）', function () {
  var result = policy.validateExecution('apply_patch_auto');
  assert.strictEqual(result.allowed, false);
});

// ===== Test 2: 禁止自动 merge main =====
test('拒绝 auto_merge_main', function () {
  var result = policy.validateExecution('auto_merge_main');
  assert.strictEqual(result.allowed, false);
});

test('拒绝 merge_main_auto（兼容）', function () {
  var result = policy.validateExecution('merge_main_auto');
  assert.strictEqual(result.allowed, false);
});

// ===== Test 3: 禁止自动 force push =====
test('拒绝 auto_force_push', function () {
  var result = policy.validateExecution('auto_force_push');
  assert.strictEqual(result.allowed, false);
});

// ===== Test 4: 禁止修改 nginx =====
test('拒绝 modify_nginx', function () {
  var result = policy.validateExecution('modify_nginx');
  assert.strictEqual(result.allowed, false);
});

test('拒绝 update_nginx_config（兼容）', function () {
  var result = policy.validateExecution('update_nginx_config');
  assert.strictEqual(result.allowed, false);
});

// ===== Test 5: 禁止修改 .env =====
test('拒绝 modify_env', function () {
  var result = policy.validateExecution('modify_env');
  assert.strictEqual(result.allowed, false);
});

// ===== Test 6: 禁止修改企业微信主链路 =====
test('拒绝 modify_wecom_main_pipeline', function () {
  var result = policy.validateExecution('modify_wecom_main_pipeline');
  assert.strictEqual(result.allowed, false);
});

// ===== Test 7: 禁止自动部署生产 =====
test('拒绝 auto_deploy_production', function () {
  var result = policy.validateExecution('auto_deploy_production');
  assert.strictEqual(result.allowed, false);
});

// ===== Test 8: 禁止删除保护分支 =====
test('拒绝删除 main 分支', function () {
  var result = policy.validateExecution('delete_branch', { branch: 'main' });
  assert.strictEqual(result.allowed, false);
});

test('拒绝删除 develop 分支', function () {
  var result = policy.validateExecution('delete_branch', { branch: 'develop' });
  assert.strictEqual(result.allowed, false);
});

test('允许删除 feature 分支', function () {
  var result = policy.validateExecution('delete_branch', { branch: 'feature/test' });
  assert.strictEqual(result.allowed, true);
});

// ===== Test 9: 禁止自动批准高风险任务 =====
test('拒绝自动批准风险分>=40 的任务', function () {
  var result = policy.validateExecution('auto_approve', { riskScore: 50 });
  assert.strictEqual(result.allowed, false);
});

test('允许自动批准低风险任务', function () {
  var result = policy.validateExecution('auto_approve', { riskScore: 20 });
  assert.strictEqual(result.allowed, true);
});

test('风险分为对象时正确解析（P3 防护）', function () {
  var result = policy.validateExecution('auto_approve', { riskScore: { score: 60 } });
  assert.strictEqual(result.allowed, false); // score=60 >= 40
});

// ===== Test 10: 允许非禁止动作 =====
console.log('');
console.log('✅ 允许项验证');
test('允许安全动作（safe_action）', function () {
  var result = policy.validateExecution('safe_action');
  assert.strictEqual(result.allowed, true);
});

test('允许 deploy_dev（非生产）', function () {
  var result = policy.validateExecution('deploy_dev');
  assert.strictEqual(result.allowed, true);
});

// ===== Test 11: isForbidden =====
console.log('');
console.log('🔍 isForbidden 验证');
test('isForbidden 识别禁止动作', function () {
  assert.strictEqual(policy.isForbidden('auto_apply_patch'), true);
  assert.strictEqual(policy.isForbidden('safe_action'), false);
});

// ===== Test 12: listForbiddenActions =====
console.log('');
console.log('📋 listForbiddenActions 验证');
test('列出所有禁止项（数组）', function () {
  var list = policy.listForbiddenActions();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 8);
});

test('禁止项列表包含 auto_apply_patch', function () {
  var list = policy.listForbiddenActions();
  assert.ok(list.indexOf('auto_apply_patch') !== -1);
});

// ===== Test 13: assertAllowed =====
console.log('');
console.log('🔐 assertAllowed 验证');
test('assertAllowed 对允许动作不抛异常', function () {
  // 不应抛异常
  policy.assertAllowed('safe_action');
});

test('assertAllowed 对禁止动作抛异常', function () {
  try {
    policy.assertAllowed('auto_apply_patch');
    assert.fail('应抛出异常');
  } catch (e) {
    assert.ok(e.message.indexOf('HARD_CONSTRAINT') !== -1 || e.code === 'EXECUTION_POLICY_VIOLATION');
  }
});

// ===== 汇总 =====
console.log('');
console.log('──────────────────────────────────────────────');
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
