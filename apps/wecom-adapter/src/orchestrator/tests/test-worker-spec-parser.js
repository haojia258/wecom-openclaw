/**
 * test-worker-spec-parser.js
 * WorkerSpec Parser 测试
 *
 * 验证：
 *   1. 正常 WorkerSpec 可解析（文本输入）
 *   2. 正常 WorkerSpec 可解析（JSON 输入）
 *   3. 空白输入返回错误
 *   4. 未知字段产生 warning
 *   5. missing workerId 自动生成
 *   6. 布尔值解析正确
 *   7. 列表值解析正确
 *   8. field alias 映射正确
 */

const { parseWorkerSpec, formatWorkerSpec } = require('../worker-spec-parser');

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

console.log('\nWorkerSpec Parser 测试');
console.log('='.repeat(50));

// ============================
// 测试 1: 正常文本解析
// ============================
test('正常 WorkerSpec 文本输入可解析', () => {
  const input = '名称:ops-monitor 类型:executor 提供商:openai 模型:gpt-4o';
  const result = parseWorkerSpec(input);
  assert(result.errors.length === 0, `Unexpected errors: ${result.errors.join(', ')}`);
  assert(result.missingFields.length === 0, `Unexpected missing: ${result.missingFields.join(', ')}`);
  assert(result.spec !== null, 'spec should not be null');
  assert(result.spec.workerId === 'ops-monitor', `workerId should be 'ops-monitor', got '${result.spec.workerId}'`);
  assert(result.spec.role === 'executor', `role should be 'executor', got '${result.spec.role}'`);
  assert(result.spec.provider === 'openai', `provider should be 'openai', got '${result.spec.provider}'`);
  assert(result.spec.model === 'gpt-4o', `model should be 'gpt-4o', got '${result.spec.model}'`);
});

// ============================
// 测试 2: JSON 输入解析
// ============================
test('正常 WorkerSpec JSON 输入可解析', () => {
  const input = {
    workerId: 'risk-scanner',
    role: 'reviewer',
    provider: 'deepseek',
    model: 'deepseek-chat',
    reviewOnly: true,
    requiresHumanApproval: true,
    blockedActions: ['auto-merge', 'auto-deploy'],
    allowedIntents: ['risk_scoring', 'anomaly_detection'],
  };
  const result = parseWorkerSpec(input);
  assert(result.errors.length === 0);
  assert(result.spec.workerId === 'risk-scanner');
  assert(result.spec.role === 'reviewer');
  assert(result.spec.provider === 'deepseek');
  assert(result.spec.model === 'deepseek-chat');
  assert(result.spec.reviewOnly === true);
  assert(result.spec.requiresHumanApproval === true);
  assert(Array.isArray(result.spec.blockedActions));
  assert(result.spec.blockedActions.length === 2);
});

// ============================
// 测试 3: 空白输入
// ============================
test('空白输入产生 warning', () => {
  const result = parseWorkerSpec('');
  assert(result.spec === null, 'spec should be null for empty input');
  assert(result.missingFields.length > 0, 'should have missing fields');
});

// ============================
// 测试 4: 未知字段 warning
// ============================
test('未知字段产生 warning', () => {
  const input = {
    workerId: 'test-worker',
    role: 'executor',
    provider: 'openai',
    unknownField: 'some-value',
    anotherUnknown: 123,
  };
  const result = parseWorkerSpec(input);
  const hasUnknownWarning = result.warnings.some(w => w.includes('未知字段'));
  assert(hasUnknownWarning, 'should have unknown field warning');
});

// ============================
// 测试 5: missing workerId 自动生成
// ============================
test('缺失 workerId 自动生成', () => {
  const input = '类型:planner 提供商:claude';
  const result = parseWorkerSpec(input);
  assert(result.spec !== null, 'spec should not be null');
  assert(typeof result.spec.workerId === 'string', 'workerId should be string');
  assert(result.spec.workerId.length > 0, 'workerId should not be empty');
  assert(result.spec.workerId.startsWith('planner-'), `workerId should start with 'planner-', got '${result.spec.workerId}'`);
  const hasAutoGenWarning = result.warnings.some(w => w.includes('自动生成'));
  assert(hasAutoGenWarning, 'should warn about auto-generated workerId');
});

// ============================
// 测试 6: 布尔值解析
// ============================
test('布尔值字符串正确解析', () => {
  const input = {
    workerId: 'bool-test',
    role: 'executor',
    provider: 'openai',
    reviewOnly: 'true',
    requiresHumanApproval: 'yes',
  };
  const result = parseWorkerSpec(input);
  assert(result.spec.reviewOnly === true, `reviewOnly should be true, got ${result.spec.reviewOnly}`);
  assert(result.spec.requiresHumanApproval === true, `requiresHumanApproval should be true`);
});

test('布尔值 false 字符串解析', () => {
  const input = {
    workerId: 'bool-test-2',
    role: 'planner',
    provider: 'openai',
    reviewOnly: 'false',
    requiresHumanApproval: 'no',
  };
  const result = parseWorkerSpec(input);
  assert(result.spec.reviewOnly === false, `reviewOnly should be false, got ${result.spec.reviewOnly}`);
  assert(result.spec.requiresHumanApproval === false, `requiresHumanApproval should be false`);
});

// ============================
// 测试 7: 列表值解析
// ============================
test('逗号分隔列表正确解析', () => {
  const input = '名称:list-test 类型:executor 提供商:openai blockedActions:deploy,merge,nginx';
  const result = parseWorkerSpec(input);
  assert(result.spec !== null, 'spec should not be null');
  assert(Array.isArray(result.spec.blockedActions), 'blockedActions should be array');
  assert(result.spec.blockedActions.length === 3, `expected 3 blockedActions, got ${result.spec.blockedActions.length}`);
  assert(result.spec.blockedActions.includes('deploy'));
  assert(result.spec.blockedActions.includes('merge'));
  assert(result.spec.blockedActions.includes('nginx'));
});

// ============================
// 测试 8: 中文别名映射
// ============================
test('中文字段别名正确映射', () => {
  const input = '名称:中测 类型:审查员 提供商:deepseek 仅审查:true';
  const result = parseWorkerSpec(input);
  assert(result.spec !== null);
  assert(result.spec.workerId === '中测', `workerId should be '中测', got '${result.spec.workerId}'`);
  assert(result.spec.provider === 'deepseek');
  assert(result.spec.reviewOnly === true);
});

// ============================
// 测试 9: 缺失必需字段
// ============================
test('缺失 role 返回错误', () => {
  const result = parseWorkerSpec('名称:test 提供商:openai');
  assert(result.spec === null, 'spec should be null when role missing');
  assert(result.missingFields.length > 0, 'should report missing fields');
  assert(result.missingFields.some(f => f.includes('role')), 'should mention role');
});

test('缺失 provider 返回错误', () => {
  const result = parseWorkerSpec('名称:test 类型:executor');
  assert(result.spec === null, 'spec should be null when provider missing');
  assert(result.missingFields.length > 0);
  assert(result.missingFields.some(f => f.includes('provider')), 'should mention provider');
});

// ============================
// 测试 10: 默认值
// ============================
test('未指定 reviewOnly 默认为 true', () => {
  const input = '名称:default-test 类型:planner 提供商:openai';
  const result = parseWorkerSpec(input);
  assert(result.spec.reviewOnly === true, 'reviewOnly should default to true');
  assert(result.spec.requiresHumanApproval === true, 'requiresHumanApproval should default to true');
});

// ============================
// 测试 11: formatWorkerSpec
// ============================
test('formatWorkerSpec 返回字符串', () => {
  const spec = { workerId: 'test', role: 'executor', provider: 'openai' };
  const formatted = formatWorkerSpec(spec);
  assert(typeof formatted === 'string', 'should return string');
  assert(formatted.includes('test'), 'should include workerId');
  assert(formatted.includes('executor'), 'should include role');
});

test('formatWorkerSpec null 安全', () => {
  const formatted = formatWorkerSpec(null);
  assert(formatted === '无 WorkerSpec', `should return placeholder, got '${formatted}'`);
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
