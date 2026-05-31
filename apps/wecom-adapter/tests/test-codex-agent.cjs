'use strict';

/**
 * test-codex-agent.cjs - Codex PR Agent 测试套件
 *
 * 测试范围:
 * - codex-agent 模块导出
 * - isCreatePRRequest 检测
 * - stripConfirmKeyword 剥离
 * - generateBranchSlug 分支命名
 * - generatePlanContent 计划文件生成
 * - generatePRBody PR 描述生成
 * - mockPlanOnly plan-only 模式
 * - agent-dispatcher codex 委托 (plan-only)
 * - agent-dispatcher codex 委托 (create-pr)
 * - 安全策略: merge/deploy 禁止
 */

const {
  execute, isCreatePRRequest, stripConfirmKeyword,
  generateBranchSlug, generatePlanContent, generatePRBody, mockPlanOnly
} = require('../src/agents/codex-agent');

const { createTask, updateTask, getTask } = require('../src/orchestrator/v2/task-store');
const { generateTaskId, securityCheck, sanitizeOutput } = require('../src/orchestrator/v2/commander-policy');
const { dispatch, getAgentStatus } = require('../src/orchestrator/v2/agent-dispatcher');

const fs = require('fs');
const path = require('path');

(async function main() {

var passed = 0;
var failed = 0;
var failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push('FAIL: ' + message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    failures.push('FAIL: ' + message + ' - 期望: "' + expected + '", 实际: "' + actual + '"');
  }
}

// 清理日志目录
var LOG_DIR = path.resolve(__dirname, '../logs/tasks');
var todayStr = new Date().toISOString().split('T')[0];
var logFile = path.join(LOG_DIR, todayStr + '.jsonl');

if (fs.existsSync(LOG_DIR)) {
  var files = fs.readdirSync(LOG_DIR);
  for (var i = 0; i < files.length; i++) {
    fs.unlinkSync(path.join(LOG_DIR, files[i]));
  }
}
fs.mkdirSync(LOG_DIR, { recursive: true });

console.log('====================================');
console.log('  Codex PR Agent - 测试套件');
console.log('====================================\n');

// ========== 测试1: 模块导出 ==========
console.log('[TEST 1] 模块导出');

assert(typeof execute === 'function', 'execute 是函数');
assert(typeof isCreatePRRequest === 'function', 'isCreatePRRequest 是函数');
assert(typeof stripConfirmKeyword === 'function', 'stripConfirmKeyword 是函数');
assert(typeof generateBranchSlug === 'function', 'generateBranchSlug 是函数');
assert(typeof generatePlanContent === 'function', 'generatePlanContent 是函数');
assert(typeof generatePRBody === 'function', 'generatePRBody 是函数');
assert(typeof mockPlanOnly === 'function', 'mockPlanOnly 是函数');

// ========== 测试2: isCreatePRRequest ==========
console.log('\n[TEST 2] isCreatePRRequest 检测');

assert(isCreatePRRequest('confirm:create-pr 修复灰度问题'), '检测 confirm:create-pr');
assert(isCreatePRRequest('confirm:create-pr'), '纯关键词检测');
assert(isCreatePRRequest('修复 confirm:create-pr 问题'), '中间位置检测');
assert(isCreatePRRequest('CONFIRM:CREATE-PR 大写检测'), '大小写不敏感');
assert(!isCreatePRRequest('修复灰度问题'), '不含关键词返回 false');
assert(!isCreatePRRequest(''), '空字符串返回 false');
assert(!isCreatePRRequest(null), 'null 返回 false');

// ========== 测试3: stripConfirmKeyword ==========
console.log('\n[TEST 3] stripConfirmKeyword 剥离');

assertEqual(stripConfirmKeyword('confirm:create-pr 修复灰度问题'), '修复灰度问题', '剥离前缀');
assertEqual(stripConfirmKeyword('修复 confirm:create-pr 问题'), '修复 问题', '剥离中间');
assertEqual(stripConfirmKeyword('confirm:create-pr'), '', '仅关键词');
assertEqual(stripConfirmKeyword('修复灰度问题'), '修复灰度问题', '无关键词原样返回');
assertEqual(stripConfirmKeyword('CONFIRM:CREATE-PR 大写 测试'), '大写 测试', '大小写剥离');

// ========== 测试4: generateBranchSlug ==========
console.log('\n[TEST 4] generateBranchSlug 分支命名');

assert(generateBranchSlug('修复灰度问题').length > 0, '中文内容生成 slug');
assertEqual(generateBranchSlug('fix gray scale bug'), 'fix-gray-scale-bug', '英文 slug');
assertEqual(generateBranchSlug('修复!!!灰度@@问题'), '修复-灰度-问题', '特殊字符清理');
assert(generateBranchSlug('很长的中文内容超过40个字符限制测试').length <= 40, '长度限制');

// ========== 测试5: generatePlanContent ==========
console.log('\n[TEST 5] generatePlanContent 计划文件');

var plan = generatePlanContent('修复灰度问题');
assert(plan.indexOf('Codex Plan') !== -1, '包含标题');
assert(plan.indexOf('修复灰度问题') !== -1, '包含任务内容');
assert(plan.indexOf('禁止自动 merge') !== -1, '包含安全约束 merge');
assert(plan.indexOf('禁止自动 deploy') !== -1, '包含安全约束 deploy');

// ========== 测试6: generatePRBody ==========
console.log('\n[TEST 6] generatePRBody PR 描述');

var body = generatePRBody('修复灰度问题', 'codex/fix-gray-123', 'task_001');
assert(body.indexOf('修复灰度问题') !== -1, '包含任务内容');
assert(body.indexOf('codex/fix-gray-123') !== -1, '包含分支名');
assert(body.indexOf('task_001') !== -1, '包含 task_id');
assert(body.indexOf('禁止自动 merge') !== -1, '包含安全清单');

// ========== 测试7: mockPlanOnly ==========
console.log('\n[TEST 7] mockPlanOnly plan-only 模式');

var mock = mockPlanOnly('测试任务');
assert(mock.plan.indexOf('[Codex]') !== -1, '包含 Agent 标识');
assert(mock.plan.indexOf('plan-only') !== -1, '包含 plan-only 提示');
assertEqual(mock.estimatedTime, '~5 分钟', '预计耗时正确');

// ========== 测试8: agent-dispatcher codex plan-only ==========
console.log('\n[TEST 8] agent-dispatcher codex plan-only 委托');

var r1 = await dispatch({ agent: 'codex', content: '分析代码质量', command: '/任务' });
assert(r1.success, 'codex plan-only dispatch 成功');
assert(r1.result.plan.indexOf('[Codex]') !== -1, '返回 Codex 计划');
assertEqual(r1.result.mode, 'plan-only', '模式为 plan-only');

var r2 = await dispatch({ agent: 'codex', content: '修复 bug', command: '/任务' });
assert(r2.success, 'codex 不带 confirm 仍为 plan-only');
assertEqual(r2.result.mode, 'plan-only', '模式仍为 plan-only');

// ========== 测试9: codex-agent confirm:create-pr (无 GITHUB_TOKEN) ==========
console.log('\n[TEST 9] codex-agent confirm:create-pr (无 TOKEN)');

var taskId = generateTaskId();
createTask({
  taskId: taskId,
  type: 'agent_task',
  agent: 'codex',
  content: 'confirm:create-pr 修复灰度问题'
});

var r3 = await execute({ content: 'confirm:create-pr 修复灰度问题', taskId: taskId, command: '/任务' });
assert(!r3.success, '无 GITHUB_TOKEN 时 PR 创建失败');
assert(r3.error.indexOf('GITHUB_TOKEN') !== -1,
  '错误信息包含 GITHUB_TOKEN');

var task = getTask(taskId);
assert(task !== null, '任务记录存在');
assert(task.status === 'failed', '任务状态为 failed');

// ========== 测试10: 安全策略 (merge/deploy 禁止) ==========
console.log('\n[TEST 10] 安全策略');

var s1 = securityCheck({ agent: 'codex', content: 'confirm:create-pr git merge main', command: '/任务' });
assert(!s1.passed, '含 merge 的任务被安全检查拒绝');

var s2 = securityCheck({ agent: 'codex', content: 'confirm:create-pr deploy to production', command: '/任务' });
assert(!s2.passed, '含 deploy 的任务被安全检查拒绝');

var s3 = securityCheck({ agent: 'codex', content: 'confirm:create-pr 分析代码', command: '/任务' });
assert(s3.passed, '正常 PR 任务安全检查通过');

// ========== 测试11: 其他 Agent 不受影响 ==========
console.log('\n[TEST 11] 其他 Agent 不受影响');

var r4 = await dispatch({ agent: 'deepseek', content: '深度分析', command: '/任务' });
assert(r4.success, 'deepseek 调度正常');
assertEqual(r4.result.mode, 'plan-only', 'deepseek 仍是 plan-only');

var r5 = await dispatch({ agent: 'workbuddy', content: 'read_file 分析代码', command: '/任务' });
assert(r5.success, 'workbuddy 调度正常');

var r6 = await dispatch({ agent: 'doubao', content: '创作内容', command: '/任务' });
assert(r6.success, 'doubao 调度正常');

// ========== 测试12: getAgentStatus codex ==========
console.log('\n[TEST 12] getAgentStatus codex');

var status = getAgentStatus('codex');
assert(status.available, 'codex 可用');
assertEqual(status.mode, 'plan-only', 'codex 默认 plan-only');

// ========== 测试13: API Key 不泄露 ==========
console.log('\n[TEST 13] API Key 不泄露');

var raw = 'sk-abc123def456ghi789jkl012mno345pqr678stu901vwx';
var cleaned = sanitizeOutput(raw);
assert(cleaned.indexOf('sk-abc123') === -1, 'API Key 被过滤');
assert(cleaned.indexOf('REDACTED') !== -1, '替换为 REDACTED');

var planWithKey = mockPlanOnly('sk-abc123def456ghi789jkl');
var safePlan = sanitizeOutput(planWithKey.plan);
assert(safePlan.indexOf('sk-abc123') === -1, 'plan 中 API Key 被过滤');

// ========== 测试结果 ==========
console.log('\n====================================');
console.log('  测试结果');
console.log('====================================');
console.log('  通过: ' + passed);
console.log('  失败: ' + failed);
console.log('  总计: ' + (passed + failed));
console.log('====================================');

if (failures.length > 0) {
  console.log('\n失败详情:');
  failures.forEach(function(f) { console.log('  ' + f); });
  process.exit(1);
} else {
  console.log('\nV 所有测试通过');
  process.exit(0);
}

})();
