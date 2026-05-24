/**
 * test-today-ops-orchestrator.js
 * /今日运营 Worker Orchestration — 测试套件
 *
 * 覆盖：
 *   1. /今日运营 mock 模式可生成报告
 *   2. 4 个 Worker 全部被加载（通过 orchestrateWorkers）
 *   3. risk-review-worker 不加载 Prompt
 *   4. 3 个 LLM Prompt 都通过 validateWorkerPrompt
 *   5. 输出包含 REVIEW_ONLY__NO_AUTO_APPLY
 *   6. 不调用真实 AI API
 *   7. orchestrateWorkers 返回正确的 dispatch plan
 *   8. 各段落函数输出非空
 *   9. 数据缺失时优雅降级
 *  10. unknown worker 场景
 */

'use strict';

var orchestrator = require('../today-ops-orchestrator');
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

function assertContains(haystack, needle, msg) {
  if (haystack.indexOf(needle) !== -1) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL: ' + msg + ' — "' + needle + '" not found in output');
  }
}

// ============================================================
// Test 1: Mock 模式 /今日运营 可生成完整报告
// ============================================================

console.log('\n=== Test 1: Mock 模式生成完整报告 ===');

var report = orchestrator.execute({ mock: true });

assert(typeof report === 'string', 'execute({mock:true}) 返回 string');
assert(report.length > 500, '报告长度 > 500（实际: ' + report.length + '）');

// 必须包含的关键段落
assertContains(report, 'GMV 概览', '包含 GMV 概览');
assertContains(report, 'ROI 概览', '包含 ROI 概览');
assertContains(report, '风险概览', '包含 风险概览');
assertContains(report, '活动机会', '包含 活动机会');
assertContains(report, '视频建议', '包含 视频建议');
assertContains(report, '今日建议', '包含 今日建议');
assertContains(report, 'REVIEW_ONLY__NO_AUTO_APPLY', '包含 REVIEW_ONLY__NO_AUTO_APPLY');
assertContains(report, 'reviewOnly', '包含 reviewOnly');
assertContains(report, 'requiresHumanApproval', '包含 requiresHumanApproval');

// 调度方案
assertContains(report, '调度方案', '包含 调度方案');
assertContains(report, 'planner-summary', '包含 planner-summary');
assertContains(report, 'roi-analysis', '包含 roi-analysis');
assertContains(report, 'video-content', '包含 video-content');
assertContains(report, 'risk-review', '包含 risk-review');
assertContains(report, 'N/A（本地规则）', 'risk-review 显示为本地规则');

// ============================================================
// Test 2: orchestrateWorkers — 4 个 Worker 全部加载
// ============================================================

console.log('\n=== Test 2: orchestrateWorkers — 4 个 Worker 全部加载 ===');

var orchestration = orchestrator.orchestrateWorkers();

assertEqual(orchestration.workersCount, 4, 'workersCount = 4');
assertEqual(orchestration.workersLoaded.length, 4, 'workersLoaded.length = 4');
assert(orchestration.workersLoaded.indexOf('planner-summary-worker') !== -1, 'planner-summary-worker 已加载');
assert(orchestration.workersLoaded.indexOf('roi-analysis-worker') !== -1, 'roi-analysis-worker 已加载');
assert(orchestration.workersLoaded.indexOf('video-content-worker') !== -1, 'video-content-worker 已加载');
assert(orchestration.workersLoaded.indexOf('risk-review-worker') !== -1, 'risk-review-worker 已加载');

// dispatch plan 完整
assertEqual(orchestration.dispatchPlan.length, 4, 'dispatchPlan.length = 4');
assertEqual(orchestration.errors.length, 0, '无编排错误');

// 所有 Worker reviewOnly + requiresHumanApproval = true
orchestration.dispatchPlan.forEach(function (entry) {
  assertEqual(entry.reviewOnly, true, entry.workerId + ' reviewOnly = true');
  assertEqual(entry.requiresHumanApproval, true, entry.workerId + ' requiresHumanApproval = true');
  assertEqual(entry.status, 'scheduled', entry.workerId + ' status = scheduled');
});

assertEqual(orchestration.reviewOnly, true, '整体 reviewOnly = true');
assertEqual(orchestration.requiresHumanApproval, true, '整体 requiresHumanApproval = true');

// ============================================================
// Test 3: risk-review-worker 不加载 Prompt
// ============================================================

console.log('\n=== Test 3: risk-review-worker 不加载 Prompt ===');

var riskLoad = orchestration.promptLoadResults['risk-review-worker'];
assert(riskLoad !== undefined, 'risk-review-worker 在 promptLoadResults 中');
assertEqual(riskLoad.loaded, false, 'risk-review prompt 未加载');
assertEqual(riskLoad.expected, false, 'risk-review prompt 预期不加载');

// 通过 loader 直接验证
var riskPrompt = loader.loadWorkerPrompt('risk-review-worker');
assertEqual(riskPrompt, null, 'loader.loadWorkerPrompt(risk-review) = null');

// ============================================================
// Test 4: 3 个 LLM Prompt 通过 validateWorkerPrompt
// ============================================================

console.log('\n=== Test 4: 3 个 LLM Prompt 通过 validateWorkerPrompt ===');

var llmWorkerIds = [
  'planner-summary-worker',
  'roi-analysis-worker',
  'video-content-worker',
];

llmWorkerIds.forEach(function (id) {
  var validation = orchestration.promptValidations[id];
  assert(validation !== undefined, id + ' 在 promptValidations 中');

  // 通过 loader 验证
  var directValidation = loader.validateWorkerPrompt(id);
  assert(directValidation.valid, 'validateWorkerPrompt(' + id + ').valid = true');
  assert(directValidation.promptExists, 'validateWorkerPrompt(' + id + ').promptExists = true');
  assertEqual(directValidation.errors.length, 0,
    id + ' 无验证错误 (当前: ' + JSON.stringify(directValidation.errors) + ')');

  // Prompt 内容可加载
  var promptContent = loader.loadWorkerPrompt(id);
  assert(promptContent !== null, 'loadWorkerPrompt(' + id + ') 不为 null');
  assert(promptContent.length > 100, id + ' Prompt 长度 > 100');

  // 安全标记
  assertContains(promptContent, 'REVIEW_ONLY__NO_AUTO_APPLY',
    id + ' Prompt 包含 REVIEW_ONLY__NO_AUTO_APPLY');
  assertContains(promptContent, 'requiresHumanApproval',
    id + ' Prompt 包含 requiresHumanApproval');
});

// risk-review 验证也通过（特殊路径）
var riskValidation = orchestration.promptValidations['risk-review-worker'];
assertEqual(riskValidation.valid, true, 'risk-review validateWorkerPrompt: valid = true');
assertEqual(riskValidation.promptExists, false, 'risk-review promptExists = false（预期）');
assertEqual(riskValidation.errors.length, 0, 'risk-review 无验证错误');

// ============================================================
// Test 5: 输出包含 REVIEW_ONLY__NO_AUTO_APPLY
// ============================================================

console.log('\n=== Test 5: 输出包含 REVIEW_ONLY__NO_AUTO_APPLY ===');

// mock 报告
assertContains(report, 'REVIEW_ONLY__NO_AUTO_APPLY', 'mock 报告含 REVIEW_ONLY__NO_AUTO_APPLY');

// orchestrator 常量
assertEqual(
  orchestrator.SAFETY_NOTE.indexOf('REVIEW_ONLY__NO_AUTO_APPLY') !== -1,
  true,
  'SAFETY_NOTE 包含 REVIEW_ONLY__NO_AUTO_APPLY'
);

// ============================================================
// Test 6: 不调用真实 AI API
// ============================================================

console.log('\n=== Test 6: 不调用真实 AI API ===');

// 搜索源码：不应包含 http/axios/fetch/apiKey 等实际 API 调用
var fs = require('fs');
var sourceCode = fs.readFileSync(
  require('path').resolve(__dirname, '../today-ops-orchestrator.js'),
  'utf8'
);

// 应包含的文件操作（只读）
assertContains(sourceCode, 'fs.readFileSync', '源码使用 fs.readFileSync（只读）');
assertContains(sourceCode, 'fs.existsSync', '源码使用 fs.existsSync（只读）');

// 不应包含的 API 调用
var forbiddenPatterns = [
  'openai',
  'apiKey',
  'API_KEY',
  'Authorization',
  'fetch(',
  'axios',
  'https.request',
  'http.request',
];

forbiddenPatterns.forEach(function (pattern) {
  var found = sourceCode.indexOf(pattern) !== -1;
  assert(!found, '不应包含 "' + pattern + '"（AI API 调用关键字）');
});

// ============================================================
// Test 7: 各段落函数输出非空
// ============================================================

console.log('\n=== Test 7: 各段落函数输出非空 ===');

var mockData = {
  orders: { settlementGMV: 1234, payOrders: 12, payOrders7d: 45, exposureCount: 3280, experienceScore: 70 },
  metrics: { settlementGMV: 1234, payOrders: 12, experienceScore: 70 },
  risk: { riskLevel: 'low', risks: [] },
  profit: {
    skus: [
      { name: '6-pack', sellingPrice: 33, cost: 15, shipping: 6, grossProfit: 12, margin: 36.4 },
    ],
    analysis: { recommended: '6-pack', reason: '毛利率最高' },
  },
  activity: {
    activities: [{ name: '大促活动', signupStatus: 'available', deadline: '06/18' }],
    summary: { availableActivities: 1, totalActivities: 1 },
  },
  advice: {
    suggestedActions: ['保持运营节奏', '关注大促报名'],
    tomorrowFocus: ['确认补货'],
  },
  ads: { spend: 850, roi: 19.42, gmv: 16495, impressions: 81835, clicks: 3316, orders: 190, ctr: 0.0405, cvr: 0.0574 },
};

var gmvSection = orchestrator.buildGMVSection(mockData);
assert(gmvSection.length >= 50, 'buildGMVSection 输出非空 (len=' + gmvSection.length + ')');
assertContains(gmvSection, '¥1,234', 'GMV 段落含金额');

var roiSection = orchestrator.buildROISection(mockData);
assert(roiSection.length >= 50, 'buildROISection 输出非空 (len=' + roiSection.length + ')');
assertContains(roiSection, 'SKU 利润分析', 'ROI 段落含 SKU 分析');

var riskSection = orchestrator.buildRiskSection(mockData);
assert(riskSection.length >= 50, 'buildRiskSection 输出非空 (len=' + riskSection.length + ')');
assertContains(riskSection, '🟢', 'Risk 段落含风险等级图标');

var activitySection = orchestrator.buildActivitySection(mockData);
assert(activitySection.length >= 50, 'buildActivitySection 输出非空 (len=' + activitySection.length + ')');
assertContains(activitySection, '大促活动', 'Activity 段落含活动名称');

var videoSection = orchestrator.buildVideoSection(mockData);
assert(videoSection.length >= 50, 'buildVideoSection 输出非空 (len=' + videoSection.length + ')');
assertContains(videoSection, '内容策略', 'Video 段落含内容策略');

var adviceSection = orchestrator.buildAdviceSection(mockData, orchestration);
assert(adviceSection.length >= 50, 'buildAdviceSection 输出非空 (len=' + adviceSection.length + ')');
assertContains(adviceSection, '今日建议', 'Advice 段落含今日建议');

// ============================================================
// Test 8: 数据缺失时优雅降级
// ============================================================

console.log('\n=== Test 8: 数据缺失时优雅降级 ===');

var emptyData = { orders: null, metrics: null, risk: null, profit: null, activity: null, advice: null, ads: null };

var gmvEmpty = orchestrator.buildGMVSection(emptyData);
assert(gmvEmpty.length > 20, '空数据 GMV 段落非空');
assertContains(gmvEmpty, '数据暂缺', '空数据 GMV 显示数据暂缺');

var roiEmpty = orchestrator.buildROISection(emptyData);
assert(roiEmpty.length > 20, '空数据 ROI 段落非空');

var riskEmpty = orchestrator.buildRiskSection(emptyData);
assert(riskEmpty.length > 20, '空数据 Risk 段落非空');

var actEmpty = orchestrator.buildActivitySection(emptyData);
assert(actEmpty.length > 20, '空数据 Activity 段落非空');

var videoEmpty = orchestrator.buildVideoSection(emptyData);
assert(videoEmpty.length > 20, '空数据 Video 段落非空');

// 全局 execute 空数据
var emptyReport = orchestrator.execute({ dataDir: '/nonexistent/path/ops' });
assert(typeof emptyReport === 'string', '空数据 execute 返回 string');
assertContains(emptyReport, '暂无运营数据', '空数据报告提示数据缺失');

// ============================================================
// Test 9: loadOpsData 读取实际数据文件
// ============================================================

console.log('\n=== Test 9: loadOpsData 读取实际数据 ===');

// 尝试读取本地 logs/doudian 目录（如果存在）
var path = require('path');
var localDataDir = path.resolve(__dirname, '../../../../logs/doudian');

if (fs.existsSync(localDataDir)) {
  var opsResult = orchestrator.loadOpsData(localDataDir);
  assert(typeof opsResult === 'object', 'loadOpsData 返回对象');
  assert(opsResult.hasData !== undefined, 'loadOpsData 包含 hasData');
  assert(Array.isArray(opsResult.missing), 'missing 是数组');

  console.log('  本地数据目录存在，hasData=' + opsResult.hasData + ', missing=' + opsResult.missing.length + ' 文件');

  // 用本地数据生成真实报告
  var localReport = orchestrator.execute({ dataDir: localDataDir });
  assert(typeof localReport === 'string', '本地数据 execute 返回 string');
  assertContains(localReport, '今日运营报告', '本地数据报告含标题');
  assertContains(localReport, 'REVIEW_ONLY__NO_AUTO_APPLY', '本地数据报告含安全标记');
} else {
  console.log('  本地数据目录不存在（预期：生产环境），跳过');
  // 用不存在路径测试优雅降级
  var missingResult = orchestrator.loadOpsData('/nonexistent/xyz');
  assertEqual(missingResult.hasData, false, '不存在路径 hasData = false');
  assert(missingResult.missing.length > 0, '不存在路径有 missing');
}

// ============================================================
// Test 10: Worker 注册表回归（Loader 链完整）
// ============================================================

console.log('\n=== Test 10: Worker 注册表回归 ===');

var allWorkers = loader.listAvailableWorkers();
assertEqual(allWorkers.length, 4, 'Registry 仍为 4 个 Worker');

var allValid = true;
allWorkers.forEach(function (w) {
  if (!loader.validateWorker(w.workerId)) allValid = false;
});
assert(allValid, '所有 Worker 通过 loader.validateWorker');

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
