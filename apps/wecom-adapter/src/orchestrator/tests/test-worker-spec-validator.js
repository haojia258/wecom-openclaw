/**
 * test-worker-spec-validator.js
 * WorkerSpec Validator 测试
 *
 * 验证：
 *   1. 正常 spec 通过校验
 *   2. blockedActions 缺失时失败
 *   3. reviewOnly 必须为 true
 *   4. requiresHumanApproval 必须为 true
 *   5. provider 必须合法
 *   6. role 必须合法
 *   7. 非法 provider 被拒绝
 *   8. 非法 role 被拒绝
 *   9. 缺少 model 产生 warning
 *   10. assertValidWorkerSpec 抛出异常
 */

const { validateWorkerSpec, assertValidWorkerSpec, isValidProvider, isValidRole } = require('../worker-spec-validator');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

console.log('\nWorkerSpec Validator 测试');
console.log('='.repeat(50));

// ============================
// 测试 1: 正常 spec 通过
// ============================
test('正常 WorkerSpec 通过校验', () => {
  const spec = {
    workerId: 'ops-monitor',
    role: 'executor',
    provider: 'openai',
    model: 'gpt-4o',
    reviewOnly: true,
    requiresHumanApproval: true,
    blockedActions: ['auto-merge', 'auto-deploy'],
    allowedIntents: ['code_generation', 'patch_creation'],
  };
  const result = validateWorkerSpec(spec);
  assert(result.valid === true, `Should be valid, got errors: ${result.errors.join(', ')}`);
  assert(result.errors.length === 0, 'Should have no errors');
});

// ============================
// 测试 2: blockedActions 必须存在
// ============================
test('blockedActions 缺失时校验失败', () => {
  const spec = {
    workerId: 'no-blocked',
    role: 'executor',
    provider: 'openai',
    reviewOnly: true,
    requiresHumanApproval: true,
  };
  // blockedActions is not present at all
  const result = validateWorkerSpec(spec);
  assert(result.valid === false, 'Should be invalid when blockedActions is missing');
  assert(result.errors.some(e => e.includes('blockedActions')), `Should mention blockedActions: ${result.errors.join('; ')}`);
});

test('blockedActions 可以为空数组', () => {
  const spec = {
    workerId: 'empty-blocked',
    role: 'planner',
    provider: 'claude',
    model: 'claude-sonnet',
    reviewOnly: true,
    requiresHumanApproval: true,
    blockedActions: [],
  };
  const result = validateWorkerSpec(spec);
  assert(result.valid === true, `Empty blockedActions should be valid: ${result.errors.join(', ')}`);
});

test('blockedActions 非数组时校验失败', () => {
  const spec = {
    workerId: 'bad-blocked',
    role: 'executor',
    provider: 'openai',
    reviewOnly: true,
    requiresHumanApproval: true,
    blockedActions: 'deploy',
  };
  const result = validateWorkerSpec(spec);
  assert(result.valid === false, 'Should be invalid when blockedActions is not array');
  assert(result.errors.some(e => e.includes('必须为数组')), 'Should mention array requirement');
});

// ============================
// 测试 3: reviewOnly 必须为 true
// ============================
test('reviewOnly=false 时校验失败', () => {
  const spec = {
    workerId: 'no-review',
    role: 'executor',
    provider: 'openai',
    reviewOnly: false,
    requiresHumanApproval: true,
    blockedActions: [],
  };
  const result = validateWorkerSpec(spec);
  assert(result.valid === false, 'Should be invalid when reviewOnly is false');
  assert(result.errors.some(e => e.includes('reviewOnly')), 'Should mention reviewOnly');
  assert(result.block === 'SECURITY_BLOCK', `Block should be SECURITY_BLOCK, got ${result.block}`);
});

test('reviewOnly 缺失时校验失败', () => {
  const spec = {
    workerId: 'missing-review',
    role: 'planner',
    provider: 'openai',
    requiresHumanApproval: true,
    blockedActions: [],
  };
  const result = validateWorkerSpec(spec);
  assert(result.valid === false, 'Should be invalid when reviewOnly is missing');
  assert(result.errors.some(e => e.includes('reviewOnly')), 'Should mention reviewOnly');
});

// ============================
// 测试 4: requiresHumanApproval 必须为 true
// ============================
test('requiresHumanApproval=false 时校验失败', () => {
  const spec = {
    workerId: 'no-approval',
    role: 'executor',
    provider: 'openai',
    reviewOnly: true,
    requiresHumanApproval: false,
    blockedActions: [],
  };
  const result = validateWorkerSpec(spec);
  assert(result.valid === false, 'Should be invalid when requiresHumanApproval is false');
  assert(result.errors.some(e => e.includes('requiresHumanApproval')), 'Should mention requiresHumanApproval');
  assert(result.block === 'SECURITY_BLOCK', 'Should be SECURITY_BLOCK');
});

// ============================
// 测试 5: provider 必须合法
// ============================
test('provider 合法值全部通过', () => {
  const validProviders = ['openai', 'deepseek', 'doubao', 'claude', 'workbuddy'];
  for (const p of validProviders) {
    assert(isValidProvider(p) === true, `${p} should be valid provider`);
  }
});

test('非法 provider 被拒绝', () => {
  assert(isValidProvider('unknown-ai') === false, 'unknown-ai should be invalid');
  assert(isValidProvider('') === false, 'empty should be invalid');
  assert(isValidProvider(null) === false, 'null should be invalid');

  const spec = {
    workerId: 'bad-provider',
    role: 'executor',
    provider: 'fake-ai',
    reviewOnly: true,
    requiresHumanApproval: true,
    blockedActions: [],
  };
  const result = validateWorkerSpec(spec);
  assert(result.valid === false, 'Should be invalid for bad provider');
  assert(result.errors.some(e => e.includes('provider') && e.includes('不合法')), 'Should mention invalid provider');
});

// ============================
// 测试 6: role 必须合法
// ============================
test('role 合法值全部通过', () => {
  const validRoles = ['executor', 'planner', 'reviewer', 'risk_analyzer', 'reporter'];
  for (const r of validRoles) {
    assert(isValidRole(r) === true, `${r} should be valid role`);
  }
});

test('非法 role 被拒绝', () => {
  assert(isValidRole('admin') === false, 'admin should be invalid');
  assert(isValidRole('') === false, 'empty should be invalid');

  const spec = {
    workerId: 'bad-role',
    role: 'super-admin',
    provider: 'openai',
    reviewOnly: true,
    requiresHumanApproval: true,
    blockedActions: [],
  };
  const result = validateWorkerSpec(spec);
  assert(result.valid === false, 'Should be invalid for bad role');
  assert(result.errors.some(e => e.includes('role') && e.includes('不合法')), 'Should mention invalid role');
});

// ============================
// 测试 7: 危险操作 warning
// ============================
test('blockedActions 包含系统危险操作时产生 warning', () => {
  const spec = {
    workerId: 'danger-worker',
    role: 'executor',
    provider: 'openai',
    model: 'gpt-4o',
    reviewOnly: true,
    requiresHumanApproval: true,
    blockedActions: ['auto-merge', 'deploy'],
  };
  const result = validateWorkerSpec(spec);
  // auto-merge is a dangerous action
  const hasDangerWarning = result.warnings.some(w => w.includes('危险操作') || w.includes('auto-merge'));
  assert(hasDangerWarning, `Should warn about dangerous actions. Warnings: ${result.warnings.join('; ')}`);
});

// ============================
// 测试 8: 缺少 model warning
// ============================
test('缺少 model 产生 warning', () => {
  const spec = {
    workerId: 'no-model',
    role: 'executor',
    provider: 'openai',
    reviewOnly: true,
    requiresHumanApproval: true,
    blockedActions: [],
  };
  const result = validateWorkerSpec(spec);
  assert(result.valid === true, 'Should still be valid without model');
  assert(result.warnings.some(w => w.includes('model')), 'Should warn about missing model');
});

// ============================
// 测试 9: assertValidWorkerSpec 抛出异常
// ============================
test('assertValidWorkerSpec 对非法 spec 抛出异常', () => {
  let threw = false;
  try {
    assertValidWorkerSpec({ workerId: 'bad', role: 'invalid', provider: 'fake' });
  } catch (e) {
    threw = true;
    assert(e.details !== undefined, 'should include details');
    assert(e.details.valid === false, 'details.valid should be false');
  }
  assert(threw, 'Should have thrown');
});

test('assertValidWorkerSpec 对合法 spec 不抛出异常', () => {
  let threw = false;
  try {
    assertValidWorkerSpec({
      workerId: 'good',
      role: 'executor',
      provider: 'openai',
      model: 'gpt-4o',
      reviewOnly: true,
      requiresHumanApproval: true,
      blockedActions: ['auto-deploy'],
    });
  } catch (e) {
    threw = true;
  }
  assert(!threw, 'Should not have thrown');
});

// ============================
// 测试 10: null/undefined 输入
// ============================
test('null 输入返回错误', () => {
  const result = validateWorkerSpec(null);
  assert(result.valid === false, 'Should be invalid');
  assert(result.block === 'INVALID_INPUT', 'Should be INVALID_INPUT');
});

test('undefined 输入返回错误', () => {
  const result = validateWorkerSpec(undefined);
  assert(result.valid === false);
  assert(result.block === 'INVALID_INPUT');
});

// ============================
// 测试 11: allowedIntents 中无效意图产生 warning
// ============================
test('allowedIntents 包含无效意图时产生 warning', () => {
  const spec = {
    workerId: 'bad-intent',
    role: 'executor',
    provider: 'openai',
    model: 'gpt-4o',
    reviewOnly: true,
    requiresHumanApproval: true,
    blockedActions: [],
    allowedIntents: ['hack_system', 'code_generation'],
  };
  const result = validateWorkerSpec(spec);
  assert(result.valid === true, 'Should still be valid');
  const hasIntentWarning = result.warnings.some(w => w.includes('未识别的意图'));
  assert(hasIntentWarning, `Should warn about invalid intents: ${result.warnings.join('; ')}`);
});

// ============================
// 结果汇总
// ============================
console.log('');
console.log(`✅ PASS: ${passed}`);
console.log(`❌ FAIL: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
