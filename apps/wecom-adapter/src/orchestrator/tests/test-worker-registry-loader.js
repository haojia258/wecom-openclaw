/**
 * test-worker-registry-loader.js
 * Worker Registry Loader — 接入层测试套件
 *
 * 覆盖：
 *   1. listAvailableWorkers() 返回 4 个 Worker
 *   2. loadWorker() 4 个 Worker 均可加载
 *   3. loadWorkerPrompt() 3 个 LLM Worker 返回非空 Prompt
 *   4. loadWorkerPrompt() risk-review-worker 返回 null
 *   5. validateWorkerPrompt() 3 个 LLM Worker 验证通过
 *   6. validateWorkerPrompt() risk-review-worker 验证通过（无 Prompt）
 *   7. validateWorkerPrompt() 未知 Worker 返回 invalid
 *   8. validateWorkerPrompt() 检测 REVIEW_ONLY__NO_AUTO_APPLY
 *   9. validateWorkerPrompt() 检测 requiresHumanApproval
 *  10. getWorkerRuntimeDescriptor() 返回正确描述符
 *  11. promptVersion 与 Registry 一致（v1）
 *  12. 所有 Worker reviewOnly=true
 *  13. 所有 Worker requiresHumanApproval=true
 */

'use strict';

var loader = require('../workers/worker-registry-loader');

// ============================================================
// 测试辅助
// ============================================================

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL: ' + msg);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL: ' + msg + ' — expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual));
  }
}

function assertDeepEqual(actual, expected, msg) {
  var a = JSON.stringify(actual);
  var b = JSON.stringify(expected);
  if (a === b) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL: ' + msg + ' — expected: ' + b + ', got: ' + a);
  }
}

var EXPECTED_WORKER_IDS = [
  'planner-summary-worker',
  'roi-analysis-worker',
  'video-content-worker',
  'risk-review-worker',
];

var LLM_WORKER_IDS = [
  'planner-summary-worker',
  'roi-analysis-worker',
  'video-content-worker',
];

// ============================================================
// 测试 1：listAvailableWorkers()
// ============================================================

console.log('\n=== Test 1: listAvailableWorkers() ===');

var allWorkers = loader.listAvailableWorkers();
assertEqual(allWorkers.length, 4, 'listAvailableWorkers() 返回 4 个 Worker');

var ids = allWorkers.map(function (w) { return w.workerId; }).sort();
var expectedIds = EXPECTED_WORKER_IDS.slice().sort();
assertDeepEqual(ids, expectedIds, 'Worker ID 列表正确');

// llmEnabled 过滤
var llmWorkers = loader.listAvailableWorkers({ llmEnabled: true });
assertEqual(llmWorkers.length, 3, 'llmEnabled=true 返回 3 个 Worker');

var nonLlmWorkers = loader.listAvailableWorkers({ llmEnabled: false });
assertEqual(nonLlmWorkers.length, 1, 'llmEnabled=false 返回 1 个 Worker');
assertEqual(nonLlmWorkers[0].workerId, 'risk-review-worker', 'llmEnabled=false 为 risk-review-worker');

// role 过滤
var byRole = loader.listAvailableWorkers({ role: 'planner_summary' });
assertEqual(byRole.length, 1, 'role=planner_summary 返回 1 个 Worker');
assertEqual(byRole[0].workerId, 'planner-summary-worker', 'role 过滤正确');

// ============================================================
// 测试 2：loadWorker() — 4 个 Worker 均可加载
// ============================================================

console.log('\n=== Test 2: loadWorker() — 4 个 Worker 均可加载 ===');

EXPECTED_WORKER_IDS.forEach(function (id) {
  var w = loader.loadWorker(id);
  assert(w !== null, 'loadWorker(' + id + ') 不为 null');
  assertEqual(w.workerId, id, 'loadWorker(' + id + ').workerId 匹配');
  assert(typeof w.role === 'string', 'loadWorker(' + id + ').role 为 string');
  assert(typeof w.provider === 'string', 'loadWorker(' + id + ').provider 为 string');
});

// 未知 Worker
assertEqual(loader.loadWorker(null), null, 'loadWorker(null) → null');
assertEqual(loader.loadWorker(''), null, 'loadWorker("") → null');
assertEqual(loader.loadWorker('unknown-worker'), null, 'loadWorker(unknown) → null');

// ============================================================
// 测试 3：loadWorkerPrompt() — 3 个 LLM Worker 返回非空
// ============================================================

console.log('\n=== Test 3: loadWorkerPrompt() — LLM Worker Prompt 可加载 ===');

LLM_WORKER_IDS.forEach(function (id) {
  var promptContent = loader.loadWorkerPrompt(id);
  assert(promptContent !== null, 'loadWorkerPrompt(' + id + ') 不为 null');
  assert(typeof promptContent === 'string', 'loadWorkerPrompt(' + id + ') 为 string');
  assert(promptContent.length > 100, 'loadWorkerPrompt(' + id + ') 内容长度 > 100');
  assert(promptContent.indexOf('REVIEW_ONLY') !== -1,
    'loadWorkerPrompt(' + id + ') 包含 REVIEW_ONLY 标记');
});

// ============================================================
// 测试 4：loadWorkerPrompt() — risk-review-worker 返回 null
// ============================================================

console.log('\n=== Test 4: loadWorkerPrompt() — risk-review 无 Prompt ===');

var riskPrompt = loader.loadWorkerPrompt('risk-review-worker');
assertEqual(riskPrompt, null, 'loadWorkerPrompt(risk-review-worker) → null（预期）');

// 未知 Worker
assertEqual(loader.loadWorkerPrompt('unknown'), null, 'loadWorkerPrompt(unknown) → null');

// ============================================================
// 测试 5：validateWorkerPrompt() — 3 个 LLM Worker 通过
// ============================================================

console.log('\n=== Test 5: validateWorkerPrompt() — LLM Worker 验证通过 ===');

LLM_WORKER_IDS.forEach(function (id) {
  var result = loader.validateWorkerPrompt(id);
  assert(result.valid, 'validateWorkerPrompt(' + id + ').valid = true');
  assert(result.promptExists, 'validateWorkerPrompt(' + id + ').promptExists = true');
  assertEqual(result.workerId, id, 'validateWorkerPrompt(' + id + ').workerId 匹配');
  assertEqual(result.errors.length, 0,
    'validateWorkerPrompt(' + id + ') 无 error (当前: ' + JSON.stringify(result.errors) + ')');
  assertEqual(result.promptVersion, 'v1',
    'validateWorkerPrompt(' + id + ').promptVersion = v1');
});

// ============================================================
// 测试 6：validateWorkerPrompt() — risk-review-worker 通过
// ============================================================

console.log('\n=== Test 6: validateWorkerPrompt() — risk-review 通过（无 Prompt）===');

var riskResult = loader.validateWorkerPrompt('risk-review-worker');
assert(riskResult.valid, 'validateWorkerPrompt(risk-review-worker).valid = true');
assertEqual(riskResult.promptExists, false, 'risk-review promptExists = false（预期）');
assertEqual(riskResult.workerId, 'risk-review-worker', 'workerId 正确');
assertEqual(riskResult.promptVersion, 'v1', 'promptVersion = v1');
assertEqual(riskResult.errors.length, 0,
  'risk-review 无 error (当前: ' + JSON.stringify(riskResult.errors) + ')');

// ============================================================
// 测试 7：validateWorkerPrompt() — 未知 Worker invalid
// ============================================================

console.log('\n=== Test 7: validateWorkerPrompt() — 未知 Worker invalid ===');

var unknownResult = loader.validateWorkerPrompt('nonexistent-worker');
assertEqual(unknownResult.valid, false, 'validateWorkerPrompt(unknown).valid = false');
assert(unknownResult.errors.length > 0, 'validateWorkerPrompt(unknown) 有 error');
assert(unknownResult.errors[0].indexOf('未在 Registry') !== -1, 'error 消息包含"未在 Registry"');

var nullResult = loader.validateWorkerPrompt(null);
assertEqual(nullResult.valid, false, 'validateWorkerPrompt(null).valid = false');

// ============================================================
// 测试 8：validateWorkerPrompt() — REVIEW_ONLY__NO_AUTO_APPLY
// ============================================================

console.log('\n=== Test 8: validateWorkerPrompt() — REVIEW_ONLY__NO_AUTO_APPLY ===');

LLM_WORKER_IDS.forEach(function (id) {
  var result = loader.validateWorkerPrompt(id);
  assert(result.markers['REVIEW_ONLY__NO_AUTO_APPLY'] === true,
    id + ' REVIEW_ONLY__NO_AUTO_APPLY 标记存在');
});

// 同时验证 Prompt 原始内容中确实包含该字符串
LLM_WORKER_IDS.forEach(function (id) {
  var content = loader.loadWorkerPrompt(id);
  assert(content.indexOf('REVIEW_ONLY__NO_AUTO_APPLY') !== -1,
    id + ' Prompt 原始内容包含 REVIEW_ONLY__NO_AUTO_APPLY');
});

// ============================================================
// 测试 9：validateWorkerPrompt() — requiresHumanApproval
// ============================================================

console.log('\n=== Test 9: validateWorkerPrompt() — requiresHumanApproval ===');

LLM_WORKER_IDS.forEach(function (id) {
  var result = loader.validateWorkerPrompt(id);
  assert(result.markers['requiresHumanApproval'] === true,
    id + ' requiresHumanApproval 标记存在');
});

// 验证 Prompt 原始内容中包含 requiresHumanApproval
LLM_WORKER_IDS.forEach(function (id) {
  var content = loader.loadWorkerPrompt(id);
  assert(content.indexOf('requiresHumanApproval') !== -1,
    id + ' Prompt 原始内容包含 requiresHumanApproval');
});

// ============================================================
// 测试 10：getWorkerRuntimeDescriptor()
// ============================================================

console.log('\n=== Test 10: getWorkerRuntimeDescriptor() ===');

LLM_WORKER_IDS.forEach(function (id) {
  var desc = loader.getWorkerRuntimeDescriptor(id);
  assert(desc !== null, 'getWorkerRuntimeDescriptor(' + id + ') 不为 null');
  assertEqual(desc.workerId, id, 'descriptor.workerId 正确');
  assert(typeof desc.role === 'string', 'descriptor.role 为 string');
  assert(typeof desc.provider === 'string', 'descriptor.provider 为 string');
  assertEqual(desc.llmEnabled, true, 'descriptor.llmEnabled = true');
  assertEqual(desc.reviewOnly, true, 'descriptor.reviewOnly = true');
  assertEqual(desc.requiresHumanApproval, true, 'descriptor.requiresHumanApproval = true');
  assert(Array.isArray(desc.allowedIntents), 'allowedIntents 是数组');
  assert(Array.isArray(desc.blockedActions), 'blockedActions 是数组');
  assert(desc.promptAvailable, id + ' promptAvailable = true');
  assert(typeof desc.promptPath === 'string', 'promptPath 为 string');
});

// risk-review-worker descriptor
var riskDesc = loader.getWorkerRuntimeDescriptor('risk-review-worker');
assert(riskDesc !== null, 'getWorkerRuntimeDescriptor(risk-review-worker) 不为 null');
assertEqual(riskDesc.workerId, 'risk-review-worker', 'risk-review descriptor.workerId');
assertEqual(riskDesc.llmEnabled, false, 'risk-review llmEnabled = false');
assertEqual(riskDesc.provider, 'local-rule', 'risk-review provider = local-rule');
assertEqual(riskDesc.promptAvailable, false, 'risk-review promptAvailable = false');
assertEqual(riskDesc.promptPath, null, 'risk-review promptPath = null');

// 未知 Worker
assertEqual(loader.getWorkerRuntimeDescriptor(null), null, 'getWorkerRuntimeDescriptor(null) → null');
assertEqual(loader.getWorkerRuntimeDescriptor('unknown'), null, 'getWorkerRuntimeDescriptor(unknown) → null');

// ============================================================
// 测试 11：promptVersion 一致性
// ============================================================

console.log('\n=== Test 11: promptVersion 一致性 ===');

EXPECTED_WORKER_IDS.forEach(function (id) {
  var w = loader.loadWorker(id);
  assertEqual(w.promptVersion, 'v1', id + ' promptVersion = v1');
});

// ============================================================
// 测试 12：所有 Worker reviewOnly=true
// ============================================================

console.log('\n=== Test 12: 所有 Worker reviewOnly=true ===');

EXPECTED_WORKER_IDS.forEach(function (id) {
  var w = loader.loadWorker(id);
  assertEqual(w.reviewOnly, true, id + ' reviewOnly = true');
});

// ============================================================
// 测试 13：所有 Worker requiresHumanApproval=true
// ============================================================

console.log('\n=== Test 13: 所有 Worker requiresHumanApproval=true ===');

EXPECTED_WORKER_IDS.forEach(function (id) {
  var w = loader.loadWorker(id);
  assertEqual(w.requiresHumanApproval, true, id + ' requiresHumanApproval = true');
});

// ============================================================
// 测试 14：Re-export 的 registry API 正常工作
// ============================================================

console.log('\n=== Test 14: Re-export registry API ===');

assert(loader.getWorker('planner-summary-worker') !== null, 'loader.getWorker 可用');
assert(loader.getWorkerByRole('planner_summary') !== null, 'loader.getWorkerByRole 可用');
assertEqual(loader.validateWorker('planner-summary-worker'), true, 'loader.validateWorker = true');
assertEqual(loader.validateWorker('unknown'), false, 'loader.validateWorker(unknown) = false');
assert(typeof loader.getPromptPath === 'function', 'loader.getPromptPath 是函数');
assert(typeof loader.isActionBlocked === 'function', 'loader.isActionBlocked 是函数');

// isActionBlocked 通过 loader 也能工作
var blockResult = loader.isActionBlocked('planner-summary-worker', '执行部署');
assert(blockResult.blocked, 'loader.isActionBlocked 中文 blockedAction 生效');

// ============================================================
// 结果汇总
// ============================================================

console.log('\n========================================');
console.log('  测试结果: ' + passed + ' passed, ' + failed + ' failed');
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed.\n');
  process.exit(0);
}
