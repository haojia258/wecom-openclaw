'use strict';

/**
 * test-deepseek-agent.cjs - P6.3 DeepSeek Review Agent 测试套件
 *
 * 16 测试组, ~92 断言
 * 运行: node tests/test-deepseek-agent.cjs
 */

var deepseekAgent = require('../src/agents/deepseek-agent');
var githubPR = require('../src/agents/github-pr-reader');
var taskStore = require('../src/orchestrator/v2/task-store');
var policy = require('../src/orchestrator/v2/commander-policy');
var dispatcher = require('../src/orchestrator/v2/agent-dispatcher');
var fs = require('fs');
var path = require('path');

var passed = 0;
var failed = 0;
var failures = [];

function assert(condition, message) {
  if (condition) { passed++; }
  else { failed++; failures.push('FAIL: ' + message); }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) { passed++; }
  else { failed++; failures.push('FAIL: ' + message + ' — 期望: "' + expected + '", 实际: "' + String(actual) + '"'); }
}

var LOG_DIR = path.resolve(__dirname, '../logs/tasks');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}
var logFiles = fs.readdirSync(LOG_DIR).filter(function(f) { return f.endsWith('.jsonl'); });
for (var i = 0; i < logFiles.length; i++) {
  fs.unlinkSync(path.join(LOG_DIR, logFiles[i]));
}

// TEST 1
console.log('\n=== TEST 1: 模块导出验证 ===');
assert(typeof deepseekAgent.execute === 'function', 'execute 应该是函数');
assert(typeof deepseekAgent.isReviewRequest === 'function', 'isReviewRequest 应该是函数');
assert(typeof deepseekAgent.stripConfirmKeyword === 'function', 'stripConfirmKeyword 应该是函数');
assert(typeof deepseekAgent.generateReviewPlan === 'function', 'generateReviewPlan 应该是函数');
assert(typeof deepseekAgent.mockPlanOnly === 'function', 'mockPlanOnly 应该是函数');
assert(typeof deepseekAgent.REVIEW_KEYWORD === 'string', 'REVIEW_KEYWORD 应该是 string');
assertEqual(deepseekAgent.REVIEW_KEYWORD, 'confirm:review', 'REVIEW_KEYWORD 值为 confirm:review');

// TEST 2
console.log('\n=== TEST 2: isReviewRequest 检测 ===');
assert(deepseekAgent.isReviewRequest('confirm:review PR#43'), 'confirm:review 前缀');
assert(deepseekAgent.isReviewRequest('confirm:review'), '纯 confirm:review');
assert(deepseekAgent.isReviewRequest('review confirm:review PR'), 'confirm:review 中间');
assert(deepseekAgent.isReviewRequest('CONFIRM:REVIEW uppercase'), '全大写');
assert(deepseekAgent.isReviewRequest('confirm:Review mixed'), '混合大小写');
assert(deepseekAgent.isReviewRequest('  confirm:review  '), '带前后空格');
assert(!deepseekAgent.isReviewRequest('review PR#43'), '无 confirm:review');
assert(!deepseekAgent.isReviewRequest(''), '空字符串');
assert(!deepseekAgent.isReviewRequest(null), 'null 值');

// TEST 3
console.log('\n=== TEST 3: stripConfirmKeyword ===');
assertEqual(deepseekAgent.stripConfirmKeyword('confirm:review review PR#43'), 'review PR#43', '前缀移除');
assertEqual(deepseekAgent.stripConfirmKeyword('review confirm:review PR'), 'review PR', '中间移除');
assertEqual(deepseekAgent.stripConfirmKeyword('confirm:review'), '', '仅关键词 → 空字符串');
assertEqual(deepseekAgent.stripConfirmKeyword('review PR#43'), 'review PR#43', '无关键词不变');
assertEqual(deepseekAgent.stripConfirmKeyword(''), '', '空字符串');

// TEST 4
console.log('\n=== TEST 4: extractPRNumber ===');
assertEqual(deepseekAgent.extractPRNumber('review PR#43'), 43, 'PR#43 格式');
assertEqual(deepseekAgent.extractPRNumber('review PR #43'), 43, 'PR #43 格式');
assertEqual(deepseekAgent.extractPRNumber('review #43'), 43, '#43 格式');
assertEqual(deepseekAgent.extractPRNumber('review PR#abc'), null, '非数字 PR');
assertEqual(deepseekAgent.extractPRNumber('review no number'), null, '无数字');
assertEqual(deepseekAgent.extractPRNumber(''), null, '空字符串');
assertEqual(deepseekAgent.extractPRNumber(null), null, 'null');

// TEST 5
console.log('\n=== TEST 5: generateReviewPlan 内容验证 ===');
var plan = deepseekAgent.generateReviewPlan('review PR#43');
assert(plan.indexOf('DeepSeek Review Plan') !== -1, '包含 DeepSeek Review Plan 标题');
assert(plan.indexOf('#43') !== -1, '包含 PR 编号');
assert(plan.indexOf('Read-only') !== -1, '包含只读约束');
assert(plan.indexOf('confirm:review') !== -1, '包含 confirm:review 提示');
assert(plan.indexOf('Security Constraints') !== -1, '包含安全约束区域');

// TEST 6
console.log('\n=== TEST 6: mockPlanOnly 结构验证 ===');
var response = deepseekAgent.mockPlanOnly('review PR#43');
assert(typeof response === 'object' && response !== null, '返回对象');
assert(typeof response.plan === 'string', 'plan 是 string');
assert(typeof response.estimatedTime === 'string', 'estimatedTime 是 string');
assert(response.plan.indexOf('[DeepSeek]') !== -1, 'plan 包含 [DeepSeek] 标记');

// Tests 7-16 are async (require await for execute/dispatch)
(async function() {

// TEST 7
console.log('\n=== TEST 7: execute Plan-Only 模式 ===');
var taskId7 = policy.generateTaskId();
taskStore.createTask({ taskId: taskId7, type: 'agent_task', agent: 'deepseek', content: 'review PR#43' });
var result7 = await deepseekAgent.execute({ content: 'review PR#43', taskId: taskId7, command: '/task' });
assert(result7.success === true, 'plan-only 执行成功');
assertEqual(result7.result.mode, 'plan-only', 'mode 为 plan-only');
assert(result7.result.plan.indexOf('DeepSeek') !== -1, 'plan 包含 DeepSeek');
assertEqual(result7.task_id, taskId7, 'task_id 正确');
assert(result7.result.estimatedTime === '~1 分钟', '预估时间 ~1 分钟');

// TEST 8
console.log('\n=== TEST 8: github-pr-reader 模块导出 ===');
assert(typeof githubPR.getPRInfo === 'function', 'getPRInfo 是函数');
assert(typeof githubPR.getPRDiff === 'function', 'getPRDiff 是函数');
assert(typeof githubPR.getPRFiles === 'function', 'getPRFiles 是函数');
assert(typeof githubPR.getPROverview === 'function', 'getPROverview 是函数');
assert(typeof githubPR.REPO_OWNER === 'string', 'REPO_OWNER 是 string');
assert(typeof githubPR.REPO_NAME === 'string', 'REPO_NAME 是 string');

// TEST 9
console.log('\n=== TEST 9: localRuleReview - 无 PR 信息 ===');
var result9 = deepseekAgent.localRuleReview(null, []);
assert(result9.source === 'local-rules', 'source 为 local-rules');
assert(Array.isArray(result9.findings), 'findings 是数组');
assert(result9.findings.length > 0, '无 PR 信息时有警告');

// TEST 10
console.log('\n=== TEST 10: localRuleReview - .env 检测 ===');
var files10 = [{ filename: '.env', patch: 'API_KEY=xxx', status: 'modified' }];
var result10 = deepseekAgent.localRuleReview({ changed_files: 1 }, files10);
assert(result10.findings.some(function(f) { return f.indexOf('[严重]') !== -1; }), '.env 变更被检测为严重');

// TEST 11
console.log('\n=== TEST 11: localRuleReview - sudo 检测 ===');
var files11 = [{ filename: 'test.js', patch: 'sudo rm -rf', status: 'modified' }];
var result11 = deepseekAgent.localRuleReview({ changed_files: 1 }, files11);
assert(result11.findings.some(function(f) { return f.indexOf('sudo') !== -1; }), 'sudo 命令被检测');

// TEST 12
console.log('\n=== TEST 12: localRuleReview - deploy 检测 ===');
var files12 = [{ filename: 'deploy.js', patch: 'deploy to production', status: 'added' }];
var result12 = deepseekAgent.localRuleReview({ changed_files: 1 }, files12);
assert(result12.findings.some(function(f) { return f.indexOf('deploy') !== -1; }), 'deploy 关键词被检测');

// TEST 13
console.log('\n=== TEST 13: Dispatcher 集成 - Plan-Only ===');
var result13 = await dispatcher.dispatch({ agent: 'deepseek', content: 'review PR#43', command: '/task' });
assert(result13.success === true, 'dispatch 成功');
// Plan-only mode returns a plan from mock response (not deepseek-agent when no confirm:review)
assert(result13.result !== null, '返回 result');

// TEST 14
console.log('\n=== TEST 14: 安全策略 - DeepSeek 内容校验 ===');
var r1 = policy.securityCheck({ agent: 'deepseek', content: 'read_file review code', command: '/task' });
assert(r1.passed !== undefined, '安全策略返回 passed 字段');

// TEST 15
console.log('\n=== TEST 15: API Key 脱敏（DeepSeek 输出）===');
var s1 = policy.sanitizeOutput('token: sk-abc123def456ghi789jkl012mno345pqr678stu');
assert(s1.indexOf('sk-abc123def') === -1, 'sk- 密钥被脱敏');
assert(s1.indexOf('[REDACTED]') !== -1, '包含 [REDACTED] 标记');

// TEST 16
console.log('\n=== TEST 16: 其他 Agent 不受影响 ===');
var r16a = await dispatcher.dispatch({ agent: 'codex', content: 'analyze code', command: '/task' });
assert(r16a.success === true, 'codex dispatch 正常');
var r16b = await dispatcher.dispatch({ agent: 'workbuddy', content: 'read_file check server', command: '/task' });
assert(r16b.success === true, 'workbuddy dispatch 正常');
var r16c = await dispatcher.dispatch({ agent: 'doubao', content: 'create content', command: '/task' });
assert(r16c.success === true, 'doubao dispatch 正常');

// Results
console.log('\n' + '='.repeat(60));
console.log('测试完成: ' + (passed + failed) + ' 个断言');
console.log('通过: ' + passed);
console.log('失败: ' + failed);

if (failures.length > 0) {
  console.log('\n失败详情:');
  for (var fi = 0; fi < failures.length; fi++) {
    console.log('  ' + failures[fi]);
  }
  process.exit(1);
} else {
  console.log('\n所有测试通过!');
  process.exit(0);
}
})();
