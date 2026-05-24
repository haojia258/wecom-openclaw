/**
 * test-worker-registry.js
 * Fixed Worker Runtime Registry — 测试套件
 *
 * 覆盖：
 *   1. 固定 4 个 Worker
 *   2. risk-review-worker llmEnabled=false
 *   3. promptFile 正确
 *   4. promptVersion=v1
 *   5. blockedActions 完整
 *   6. 中文 blockedActions 生效
 *   7. 不存在 registerDynamicWorker
 *   8. unknown worker 返回 null/throw
 */

'use strict';

var registry = require('../workers/worker-registry');

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

// ============================================================
// 测试 1：固定 4 个 Worker
// ============================================================

console.log('\n=== Test 1: 固定 4 个 Worker ===');

var workers = registry.listWorkers();
assertEqual(workers.length, 4, '应有 4 个 Worker');

var ids = workers.map(function (w) { return w.workerId; }).sort();
var expectedIds = [
  'planner-summary-worker',
  'risk-review-worker',
  'roi-analysis-worker',
  'video-content-worker',
].sort();
assertDeepEqual(ids, expectedIds, 'workerId 列表正确');

var roles = workers.map(function (w) { return w.role; }).sort();
var expectedRoles = [
  'planner_summary',
  'risk_review',
  'roi_analysis',
  'video_content',
].sort();
assertDeepEqual(roles, expectedRoles, 'role 列表正确');

// 验证每个 Worker 都有固定 workerId 且与 key 一致
workers.forEach(function (w) {
  var def = registry.getWorker(w.workerId);
  assert(def !== null, 'getWorker(' + w.workerId + ') 不为 null');
  assert(def.workerId === w.workerId, 'workerId 一致: ' + w.workerId);
});

// ============================================================
// 测试 2：risk-review-worker llmEnabled=false
// ============================================================

console.log('\n=== Test 2: risk-review-worker llmEnabled=false ===');

var riskWorker = registry.getWorker('risk-review-worker');
assert(riskWorker !== null, 'risk-review-worker 存在');
assertEqual(riskWorker.llmEnabled, false, 'llmEnabled 应为 false');
assertEqual(riskWorker.provider, 'local-rule', 'provider 应为 local-rule');
assertEqual(riskWorker.promptFile, null, 'promptFile 应为 null（无 prompt）');
assertEqual(riskWorker.model, 'rules-engine', 'model 应为 rules-engine');

// 验证其他 3 个 Worker 的 llmEnabled=true
var llmWorkers = registry.listWorkers({ llmEnabled: true });
assertEqual(llmWorkers.length, 3, '应有 3 个 LLM Worker');

var llmIds = llmWorkers.map(function (w) { return w.workerId; });
assert(llmIds.indexOf('risk-review-worker') === -1, 'risk-review-worker 不在 llmEnabled 列表中');

// ============================================================
// 测试 3：promptFile 正确
// ============================================================

console.log('\n=== Test 3: promptFile 正确 ===');

var planner = registry.getWorker('planner-summary-worker');
assert(planner.promptFile !== null, 'planner-summary 有 promptFile');
assert(planner.promptFile.indexOf('planner-summary.prompt.md') !== -1, 'planner-summary prompt 文件名正确');

var roi = registry.getWorker('roi-analysis-worker');
assert(roi.promptFile !== null, 'roi-analysis 有 promptFile');
assert(roi.promptFile.indexOf('roi-analysis.prompt.md') !== -1, 'roi-analysis prompt 文件名正确');

var video = registry.getWorker('video-content-worker');
assert(video.promptFile !== null, 'video-content 有 promptFile');
assert(video.promptFile.indexOf('video-content.prompt.md') !== -1, 'video-content prompt 文件名正确');

// risk-review-worker 无 promptFile
assertEqual(riskWorker.promptFile, null, 'risk-review-worker promptFile 为 null');

// getPromptPath API
assertEqual(registry.getPromptPath('planner-summary-worker'), planner.promptFile, 'getPromptPath planner-summary');
assertEqual(registry.getPromptPath('risk-review-worker'), null, 'getPromptPath risk-review 返回 null');
assertEqual(registry.getPromptPath('nonexistent'), null, 'getPromptPath unknown 返回 null');

// ============================================================
// 测试 4：promptVersion=v1
// ============================================================

console.log('\n=== Test 4: promptVersion=v1 ===');

workers.forEach(function (w) {
  assertEqual(w.promptVersion, 'v1', w.workerId + ' promptVersion 应为 v1');
});

// 即便 risk-review-worker 无 promptFile，promptVersion 仍应为 v1
assertEqual(riskWorker.promptVersion, 'v1', 'risk-review-worker promptVersion 也为 v1');

// ============================================================
// 测试 5：blockedActions 完整
// ============================================================

console.log('\n=== Test 5: blockedActions 完整 ===');

var requiredEnglish = [
  'patch', 'apply', 'deploy', 'rollback', 'merge',
  'nginx', 'env', '.env',
];

var requiredChinese = [
  '部署', '上线', '发布到生产', '生产环境', '回滚',
  '补丁', '应用补丁', '修改环境变量', 'nginx配置',
  '企业微信主链路', '加密解密',
];

var totalRequired = requiredEnglish.length + requiredChinese.length;

workers.forEach(function (w) {
  assertEqual(w.blockedActions.length, totalRequired,
    w.workerId + ' blockedActions 应为 ' + totalRequired + ' 项，当前 ' + w.blockedActions.length + ' 项');

  requiredEnglish.forEach(function (action) {
    assert(w.blockedActions.indexOf(action) !== -1,
      w.workerId + ' 应包含英文 blockedAction: ' + action);
  });

  requiredChinese.forEach(function (action) {
    assert(w.blockedActions.indexOf(action) !== -1,
      w.workerId + ' 应包含中文 blockedAction: ' + action);
  });
});

// ============================================================
// 测试 6：中文 blockedActions 生效
// ============================================================

console.log('\n=== Test 6: 中文 blockedActions 生效 ===');

var chineseTests = [
  { text: '执行部署', expected: true, action: '部署' },
  { text: '准备上线到生产环境', expected: true, action: '生产环境' },
  { text: '发布到生产服务器', expected: true, action: '发布到生产' },
  { text: '需要回滚版本', expected: true, action: '回滚' },
  { text: '应用补丁到主链路', expected: true, action: '应用补丁' },
  { text: '修改环境变量配置', expected: true, action: '修改环境变量' },
  { text: '调整nginx配置', expected: true, action: 'nginx配置' },
  { text: '影响企业微信主链路', expected: true, action: '企业微信主链路' },
  { text: '执行加密解密操作', expected: true, action: '加密解密' },
  { text: '生成运营日报', expected: false, action: null },
  { text: '分析ROI数据趋势', expected: false, action: null },
  { text: '编写短视频脚本', expected: false, action: null },
];

chineseTests.forEach(function (tc) {
  var result = registry.isActionBlocked('planner-summary-worker', tc.text);
  assertEqual(result.blocked, tc.expected,
    'isActionBlocked("' + tc.text + '") blocked 应为 ' + tc.expected);
  if (tc.expected) {
    assertEqual(result.matchedAction, tc.action,
      'matchedAction 应为 "' + tc.action + '"');
  }
});

// 验证 risk-review-worker 对同一文本也生效
var riskResult = registry.isActionBlocked('risk-review-worker', '执行部署到生产环境');
assert(riskResult.blocked, 'risk-review-worker 也应 blocking 中文操作');
assertEqual(riskResult.matchedAction, '生产环境', 'risk-review 匹配到 生产环境');

// ============================================================
// 测试 7：不存在 registerDynamicWorker
// ============================================================

console.log('\n=== Test 7: 不存在 registerDynamicWorker ===');

assert(typeof registry.registerDynamicWorker === 'undefined',
  '不应存在 registerDynamicWorker 函数');
assert(typeof registry.addWorker === 'undefined',
  '不应存在 addWorker 函数');
assert(typeof registry.createWorker === 'undefined',
  '不应存在 createWorker 函数');

// 确认 WORKER_REGISTRY 被冻结
try {
  registry.WORKER_REGISTRY['dynamic-worker'] = { workerId: 'dynamic-worker' };
  assert(registry.WORKER_REGISTRY['dynamic-worker'] === undefined,
    'WORKER_REGISTRY 应不可写（frozen）');
} catch (e) {
  // frozen 对象应抛出 TypeError（strict mode）
  passed++;
  console.log('  OK: WORKER_REGISTRY 修改抛出 TypeError（预期行为）');
}

// 确认 REGISTERED_IDS 被冻结
assert(registry.REGISTERED_IDS.length === 4, 'REGISTERED_IDS 应为 4 项');

// ============================================================
// 测试 8：unknown worker 返回 null
// ============================================================

console.log('\n=== Test 8: unknown worker 返回 null ===');

assertEqual(registry.getWorker(null), null, 'getWorker(null) → null');
assertEqual(registry.getWorker(undefined), null, 'getWorker(undefined) → null');
assertEqual(registry.getWorker(''), null, 'getWorker("") → null');
assertEqual(registry.getWorker('nonexistent-worker'), null, 'getWorker(unknown) → null');
assertEqual(registry.getWorker('DYNAMIC-WORKER'), null, 'getWorker(DYNAMIC) → null');

// validateWorker
assertEqual(registry.validateWorker(null), false, 'validateWorker(null) → false');
assertEqual(registry.validateWorker(''), false, 'validateWorker("") → false');
assertEqual(registry.validateWorker('unknown'), false, 'validateWorker(unknown) → false');
assertEqual(registry.validateWorker('planner-summary-worker'), true, 'validateWorker(planner) → true');

// getWorkerByRole
assertEqual(registry.getWorkerByRole(null), null, 'getWorkerByRole(null) → null');
assertEqual(registry.getWorkerByRole(''), null, 'getWorkerByRole("") → null');
assertEqual(registry.getWorkerByRole('unknown_role'), null, 'getWorkerByRole(unknown) → null');
assert(registry.getWorkerByRole('planner_summary') !== null, 'getWorkerByRole(planner_summary) 有效');
assert(registry.getWorkerByRole('risk_review') !== null, 'getWorkerByRole(risk_review) 有效');

// isActionBlocked unknown worker
var unknownBlocked = registry.isActionBlocked('unknown-worker', '部署');
assert(unknownBlocked.blocked, 'isActionBlocked unknown worker → blocked=true');
assert(unknownBlocked.reason.indexOf('UNKNOWN_WORKER') !== -1, 'reason 包含 UNKNOWN_WORKER');

// getPromptPath unknown
assertEqual(registry.getPromptPath('unknown'), null, 'getPromptPath(unknown) → null');

// ============================================================
// 额外验证：reviewOnly / requiresHumanApproval
// ============================================================

console.log('\n=== 额外：reviewOnly / requiresHumanApproval ===');

workers.forEach(function (w) {
  assertEqual(w.reviewOnly, true, w.workerId + ' reviewOnly=true');
  assertEqual(w.requiresHumanApproval, true, w.workerId + ' requiresHumanApproval=true');
});

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
