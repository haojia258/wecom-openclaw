/**
 * test-rollback-planner.js
 * rollback-planner 回滚规划测试
 *
 * 测试覆盖：
 * - 回滚命令不包含 reset main/develop
 * - 回滚命令不包含 force push
 * - 回滚方案输出完整
 * - validateRollbackPlan 检测禁止操作
 */

const { generateRollbackPlan, validateRollbackPlan, formatRollbackForWecom } = require('../rollback-planner');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `期望 "${expected}"，实际 "${actual}"`);
  }
}

// ============ 正常回滚方案生成测试 ============

test('generateRollbackPlan 输出包含 auditId', () => {
  const plan = generateRollbackPlan({
    auditId: 'orch-test-abc123',
    branch: 'feature/deepseek-ads-20260522',
    patchFile: 'deepseek-ads-v2.patch',
    hasRemote: false,
  });
  assertEqual(plan.auditId, 'orch-test-abc123');
});

test('generateRollbackPlan 输出 rollbackBranch', () => {
  const plan = generateRollbackPlan({
    auditId: 'orch-test-1',
    branch: 'feature/workbuddy-daily-20260522',
    hasRemote: false,
  });
  assert(plan.rollbackBranch.startsWith('rollback/'), '回滚分支应以 rollback/ 开头');
  assert(plan.rollbackBranch.includes('workbuddy'), '回滚分支应包含原分支信息');
});

test('generateRollbackPlan 输出 deleteFeatureBranchCommand', () => {
  const plan = generateRollbackPlan({
    auditId: 'orch-test-2',
    branch: 'feature/test-branch',
    hasRemote: false,
  });
  assert(plan.deleteFeatureBranchCommand.includes('git branch -D'), '应包含 git branch -D 命令');
  assert(plan.deleteFeatureBranchCommand.includes('feature/test-branch'), '应包含原分支名');
});

test('generateRollbackPlan 输出 steps', () => {
  const plan = generateRollbackPlan({
    auditId: 'orch-test-3',
    branch: 'feature/codex-review-20260522',
    hasRemote: false,
  });
  assert(Array.isArray(plan.steps), 'steps 应为数组');
  assert(plan.steps.length > 0, 'steps 不应为空');
  // 应包含 checkout develop
  assert(plan.steps.some(s => s.includes('checkout develop')), '应包含 checkout develop');
});

// ============ 禁止操作检测测试 ============

test('回滚命令不包含 reset main', () => {
  const plan = generateRollbackPlan({
    auditId: 'orch-test-4',
    branch: 'feature/test-safe',
    hasRemote: false,
  });

  const allCommands = [
    plan.revertCommandTemplate,
    plan.deleteFeatureBranchCommand,
    ...plan.steps,
  ].join('\n');

  assert(!allCommands.includes('reset main'), '不应包含 reset main');
  assert(!allCommands.includes('reset --hard main'), '不应包含 reset --hard main');
});

test('回滚命令不包含 reset develop', () => {
  const plan = generateRollbackPlan({
    auditId: 'orch-test-5',
    branch: 'feature/test-safe',
    hasRemote: false,
  });

  const allCommands = [
    plan.revertCommandTemplate,
    plan.deleteFeatureBranchCommand,
    ...plan.steps,
  ].join('\n');

  assert(!allCommands.includes('reset develop'), '不应包含 reset develop');
});

test('回滚命令不包含 force push', () => {
  const plan = generateRollbackPlan({
    auditId: 'orch-test-6',
    branch: 'feature/test-safe',
    hasRemote: false,
  });

  const allCommands = [
    plan.revertCommandTemplate,
    plan.deleteFeatureBranchCommand,
    ...plan.steps,
  ].join('\n');

  assert(!allCommands.includes('--force'), '不应包含 --force');
  assert(!allCommands.includes('-f main'), '不应包含 -f main');
  assert(!allCommands.includes('-f develop'), '不应包含 -f develop');
});

test('回滚命令不包含 rm -rf /', () => {
  const plan = generateRollbackPlan({
    auditId: 'orch-test-safe',
    branch: 'feature/test',
    hasRemote: false,
  });

  const allCommands = [
    plan.revertCommandTemplate,
    ...plan.steps,
  ].join('\n');

  assert(!allCommands.includes('rm -rf /'), '不应包含 rm -rf /');
});

// ============ validateRollbackPlan 测试 ============

test('validateRollbackPlan 正常方案判定为 safe', () => {
  const plan = generateRollbackPlan({
    auditId: 'orch-test-7',
    branch: 'feature/test',
    hasRemote: false,
  });
  const result = validateRollbackPlan(plan);
  assert(result.safe === true, '正常方案应为 safe');
  assert(result.violations.length === 0, '正常方案应无违规');
});

test('validateRollbackPlan 检测 reset main 违规', () => {
  const badPlan = {
    auditId: 'bad-1',
    rollbackBranch: 'rollback/test',
    revertCommandTemplate: 'git reset --hard main',
    deleteFeatureBranchCommand: 'git branch -D feature/bad',
    warning: '',
    steps: ['git reset --hard main'],
  };
  const result = validateRollbackPlan(badPlan);
  assert(result.safe === false, '包含 reset main 应为 unsafe');
  assert(result.violations.length > 0, '应有违规记录');
  assert(result.violations.some(v => v.includes('reset main')), '违规应包含 reset main');
});

test('validateRollbackPlan 检测 force push main 违规', () => {
  const badPlan = {
    auditId: 'bad-2',
    rollbackBranch: 'rollback/test',
    revertCommandTemplate: 'git push --force origin main',
    deleteFeatureBranchCommand: 'git branch -D feature/bad',
    warning: '',
    steps: [],
  };
  const result = validateRollbackPlan(badPlan);
  assert(result.safe === false, '包含 force push main 应为 unsafe');
});

// ============ formatRollbackForWecom 测试 ============

test('formatRollbackForWecom 输出包含警告信息', () => {
  const plan = generateRollbackPlan({
    auditId: 'orch-test-fmt',
    branch: 'feature/deepseek-ads-20260522',
    hasRemote: false,
  });
  const formatted = formatRollbackForWecom(plan);
  assert(formatted.includes('警告'), '应包含警告');
  assert(formatted.includes('orch-test-fmt'), '应包含 auditId');
  assert(formatted.includes('git branch -D'), '应包含删除分支命令');
});

test('formatRollbackForWecom 输出包含禁止操作提示', () => {
  const plan = generateRollbackPlan({
    auditId: 'orch-test-8',
    branch: 'feature/test',
    hasRemote: false,
  });
  const formatted = formatRollbackForWecom(plan);
  assert(formatted.includes('reset --hard main') || formatted.includes('禁止'), '应提示禁止操作');
  assert(formatted.includes('人工确认'), '应提示需人工确认');
});

// ============ warning 字段测试 ============

test('warning 包含禁止操作提示', () => {
  const plan = generateRollbackPlan({
    auditId: 'orch-test-warn',
    branch: 'feature/test',
    hasRemote: false,
  });
  assert(plan.warning.includes('reset --hard main'), '警告应提及 reset main 禁止');
  assert(plan.warning.includes('reset --hard develop'), '警告应提及 reset develop 禁止');
  assert(plan.warning.includes('force'), '警告应提及 force push 禁止');
});

// ============ 结果输出 ============

console.log('\n===== rollback-planner 测试结果 =====');
console.log(`✅ PASS: ${passed}`);
console.log(`❌ FAIL: ${failed}`);

// 展示一个完整输出样例
console.log('\n===== 回滚方案样例 =====');
const sample = generateRollbackPlan({
  auditId: 'orch-sample-001',
  branch: 'feature/deepseek-ads-analysis-20260522',
  patchFile: 'deepseek-ads-analysis-v2.patch',
  hasRemote: false,
});
console.log(formatRollbackForWecom(sample));

process.exit(failed > 0 ? 1 : 0);
