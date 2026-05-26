'use strict';

/**
 * test-commander-runtime.cjs - Commander Runtime 专项测试 (P7.3)
 *
 * 测试范围:
 *   A. execute() — 核心编排
 *   B. formatOutput() — 输出格式化
 *   C. Runtime RBAC 检查集成
 *   D. Shadow 模式标记
 *   E. 边界场景
 *   F. commander-command 命令处理器
 *   G. DAG 顺序验证
 */

// ─── 测试环境隔离 ───
process.env.TASK_DB_PATH = process.env.TASK_DB_PATH ||
  require('path').resolve(__dirname, '../logs/tasks-test/test-tasks.db');
process.env.TASK_LOG_DIR = process.env.TASK_LOG_DIR ||
  require('path').resolve(__dirname, '../logs/tasks-test');

var fs = require('fs');
var path = require('path');

// ─── 引入被测模块 ───
var commanderRuntime = require('../src/orchestrator/v2/commander-runtime');
var { checkAgentAction } = require('../src/runtime/ai-runtime-rbac');
var { validateGoal, listGoals, GoalType, GOAL_LABELS } = require('../src/orchestrator/v2/agent-queue-builder');

// ─── 测试统计 ───
var passed = 0;
var failed = 0;
var total = 0;

function assert(condition, label) {
  total++;
  if (condition) {
    passed++;
    console.log('  \u2713 ' + label);
  } else {
    failed++;
    console.log('  \u2717 FAIL: ' + label);
  }
}

function assertEqual(actual, expected, label) {
  total++;
  if (actual === expected) {
    passed++;
    console.log('  \u2713 ' + label + ' (expected: ' + JSON.stringify(expected) + ')');
  } else {
    failed++;
    console.log('  \u2717 FAIL: ' + label);
    console.log('    expected: ' + JSON.stringify(expected));
    console.log('    actual:   ' + JSON.stringify(actual));
  }
}

function assertContains(str, substring, label) {
  total++;
  if (str && str.indexOf(substring) !== -1) {
    passed++;
    console.log('  \u2713 ' + label);
  } else {
    failed++;
    console.log('  \u2717 FAIL: ' + label + ' (expected to contain "' + substring + '")');
  }
}

// ============================================================
//  TEST GROUP A: execute() 核心编排 — 正常场景
// ============================================================

console.log('\n=== GROUP A: execute() 核心编排 — 正常场景 ===\n');

(async function testGroupA() {

  // A1: 提升GMV
  var r1 = await commanderRuntime.execute({ goal: '提升GMV' });
  assert(r1.success, 'A1.1: 提升GMV — success=true');
  assert(r1.taskId && r1.taskId.startsWith('task_'), 'A1.2: taskId 生成');
  assertEqual(r1.goalLabel, '提升GMV', 'A1.3: goalLabel=提升GMV');
  assert(r1.output.length > 100, 'A1.4: output 非空');
  assertContains(r1.output, '[Commander Runtime]', 'A1.5: 包含标题');
  assertContains(r1.output, 'Recommended DAG', 'A1.6: 包含 DAG 部分');
  assertContains(r1.output, 'Runtime RBAC', 'A1.7: 包含 RBAC 部分');
  assertContains(r1.output, 'Shadow Mode', 'A1.8: 包含 Shadow Mode');
  assertContains(r1.output, 'plan-only', 'A1.9: 包含 plan-only');
  assertContains(r1.output, 'human-in-the-loop', 'A1.10: 包含 human-in-the-loop');
  assert(r1.queue.length > 0, 'A1.11: queue 非空');
  assertEqual(r1.rbacResults.length, r1.queue.length, 'A1.12: RBAC 结果数=队列数');

  // A2: 提高ROI
  var r2 = await commanderRuntime.execute({ goal: '提高ROI' });
  assert(r2.success, 'A2.1: 提高ROI — success=true');
  assertEqual(r2.goalLabel, '提高ROI', 'A2.2: goalLabel=提高ROI');
  assertContains(r2.output, '提高ROI', 'A2.3: 输出含目标名');

  // A3: 降低退款率
  var r3 = await commanderRuntime.execute({ goal: '降低退款率' });
  assert(r3.success, 'A3.1: 降低退款率 — success=true');
  assertEqual(r3.goalLabel, '降低退款率', 'A3.2: goalLabel=降低退款率');

  // A4: 优化企业微信稳定性
  var r4 = await commanderRuntime.execute({ goal: '优化企业微信稳定性' });
  assert(r4.success, 'A4.1: 优化企业微信稳定性 — success=true');
  assertEqual(r4.goalLabel, '优化企业微信稳定性', 'A4.2: goalLabel=优化企业微信稳定性');

})();

// ============================================================
//  TEST GROUP B: execute() — 错误场景
// ============================================================

console.log('\n=== GROUP B: execute() — 错误场景 ===\n');

(async function testGroupB() {

  // B1: 空目标
  var r1 = await commanderRuntime.execute({ goal: '' });
  assert(!r1.success, 'B1.1: 空目标 — success=false');
  assertContains(r1.output, '目标不能为空', 'B1.2: 输出含错误信息');

  // B2: nil 目标
  var r2 = await commanderRuntime.execute({});
  assert(!r2.success, 'B2.1: nil 目标 — success=false');

  // B3: 未知目标
  var r3 = await commanderRuntime.execute({ goal: '未知目标ABC123' });
  assert(!r3.success, 'B3.1: 未知目标 — success=false');
  assertContains(r3.output, '不支持', 'B3.2: 输出含不支持提示');

  // B4: 空/null 参数
  var r4 = await commanderRuntime.execute(null);
  assert(!r4.success, 'B4.1: null params — success=false');

})();

// ============================================================
//  TEST GROUP C: formatOutput() — 输出格式
// ============================================================

console.log('\n=== GROUP C: formatOutput() — 输出格式 ===\n');

function testGroupC() {

  // 构造模拟数据
  var mockData = {
    goal: '提升GMV',
    goalLabel: '提升GMV',
    normalizedGoal: 'boost_gmv',
    taskId: 'task_test_001',
    queue: [
      { seq: 1, agent: 'codex',     command: 'analyze_gmv_data',         priority: 1, reason: '分析数据' },
      { seq: 2, agent: 'deepseek',  command: 'gmv_optimization_strategy', priority: 2, reason: '策略生成' },
      { seq: 3, agent: 'workbuddy', command: 'generate_plan',             priority: 3, reason: '工程计划' },
      { seq: 4, agent: 'doubao',    command: 'gmv_content_marketing',     priority: 4, reason: '内容产出' },
    ],
    rbacResults: [
      { seq: 1, agent: 'codex',     command: 'analyze_gmv_data',         priority: 1, reason: '分析数据', allowed: true },
      { seq: 2, agent: 'deepseek',  command: 'gmv_optimization_strategy', priority: 2, reason: '策略生成', allowed: true },
      { seq: 3, agent: 'workbuddy', command: 'generate_plan',             priority: 3, reason: '工程计划', allowed: true },
      { seq: 4, agent: 'doubao',    command: 'gmv_content_marketing',     priority: 4, reason: '内容产出', allowed: true },
    ],
    allowedAgents: [
      { seq: 1, agent: 'codex',     command: 'analyze_gmv_data',         priority: 1, reason: '分析数据' },
      { seq: 2, agent: 'deepseek',  command: 'gmv_optimization_strategy', priority: 2, reason: '策略生成' },
      { seq: 3, agent: 'workbuddy', command: 'generate_plan',             priority: 3, reason: '工程计划' },
      { seq: 4, agent: 'doubao',    command: 'gmv_content_marketing',     priority: 4, reason: '内容产出' },
    ],
    deniedAgents: [],
    plannerResult: { success: true },
    shadowMode: true,
    policySummary: ['plan-only', 'human-in-the-loop'],
  };

  var output = commanderRuntime.formatOutput(mockData);

  assertContains(output, '[Commander Runtime]', 'C1: 标题');
  assertContains(output, '提升GMV', 'C2: 目标名');
  assertContains(output, 'Recommended DAG', 'C3: DAG 标题');
  assertContains(output, 'codex', 'C4: 含 codex');
  assertContains(output, 'deepseek', 'C5: 含 deepseek');
  assertContains(output, 'workbuddy', 'C6: 含 workbuddy');
  assertContains(output, 'doubao', 'C7: 含 doubao');
  assertContains(output, 'Runtime RBAC', 'C8: RBAC 标题');
  assertContains(output, 'Shadow Mode', 'C9: Shadow Mode');
  assertContains(output, 'ENABLED', 'C10: Shadow ENABLED');
  assertContains(output, 'Runtime Policy', 'C11: Policy');
  assertContains(output, 'plan-only', 'C12: plan-only');
  assertContains(output, 'human-in-the-loop', 'C13: human-in-the-loop');
  assertContains(output, '风险提示', 'C14: 风险提示');
  assertContains(output, 'Shadow 建议', 'C15: Shadow 建议');
  assertContains(output, 'DAG 执行序列', 'C16: DAG 序列');

  // 验证 deny 场景输出
  var mockDeniedData = {
    goal: '降低退款率',
    goalLabel: '降低退款率',
    normalizedGoal: 'reduce_refund',
    taskId: 'task_test_002',
    queue: [
      { seq: 1, agent: 'codex',     command: 'deploy-production',       priority: 1, reason: 'should be denied' },
      { seq: 2, agent: 'workbuddy', command: 'readonly-audit',          priority: 2, reason: 'should be allowed' },
    ],
    rbacResults: [
      { seq: 1, agent: 'codex',     command: 'deploy-production',       priority: 1, reason: 'should be denied',  allowed: false, denyReason: 'explicit-deny', denyMessage: '被明确禁止' },
      { seq: 2, agent: 'workbuddy', command: 'readonly-audit',          priority: 2, reason: 'should be allowed', allowed: true },
    ],
    allowedAgents: [
      { seq: 2, agent: 'workbuddy', command: 'readonly-audit',          priority: 2, reason: 'should be allowed' },
    ],
    deniedAgents: [
      { seq: 1, agent: 'codex',     command: 'deploy-production',       priority: 1, reason: 'should be denied', denyReason: 'explicit-deny', denyMessage: '被明确禁止' },
    ],
    plannerResult: { success: true },
    shadowMode: true,
    policySummary: ['plan-only', 'human-in-the-loop'],
  };

  var deniedOutput = commanderRuntime.formatOutput(mockDeniedData);
  assertContains(deniedOutput, '被拒绝步骤', 'C17: 拒绝步骤部分');
  assertContains(deniedOutput, 'explicit-deny', 'C18: 拒绝原因可见');
  assertContains(deniedOutput, '可执行步骤', 'C19: 可执行步骤部分');

}

testGroupC();

// ============================================================
//  TEST GROUP D: Runtime RBAC 检查集成
// ============================================================

console.log('\n=== GROUP D: Runtime RBAC 检查集成 ===\n');

function testGroupD() {
  // D1: codex 的允许操作
  var r1 = checkAgentAction('codex', 'draft-pr');
  assert(r1.allowed === true, 'D1.1: codex draft-pr — ALLOW');

  // D2: codex 的拒绝操作
  var r2 = checkAgentAction('codex', 'deploy-production');
  assert(r2.allowed === false, 'D2.1: codex deploy-production — DENY');
  assert(r2.denyReason === 'explicit-deny', 'D2.2: denyReason=explicit-deny');
  assert(r2.reason && r2.reason.length > 0, 'D2.3: reason 非空');

  // D3: workbuddy 的允许操作
  var r3 = checkAgentAction('workbuddy', 'readonly-audit');
  assert(r3.allowed === true, 'D3.1: workbuddy readonly-audit — ALLOW');

  // D4: workbuddy 的拒绝操作
  var r4 = checkAgentAction('workbuddy', 'rm');
  assert(r4.allowed === false, 'D4.1: workbuddy rm — DENY');

  // D5: deepseek 的允许操作
  var r5 = checkAgentAction('deepseek', 'readonly-review');
  assert(r5.allowed === true, 'D5.1: deepseek readonly-review — ALLOW');

  // D6: deepseek 的拒绝操作
  var r6 = checkAgentAction('deepseek', 'write-code');
  assert(r6.allowed === false, 'D6.1: deepseek write-code — DENY');

  // D7: doubao 的允许操作
  var r7 = checkAgentAction('doubao', 'content-generate');
  assert(r7.allowed === true, 'D7.1: doubao content-generate — ALLOW');

  // D8: doubao 的拒绝操作
  var r8 = checkAgentAction('doubao', 'deploy');
  assert(r8.allowed === false, 'D8.1: doubao deploy — DENY');

  // D9: 未知 agent
  var r9 = checkAgentAction('unknown-agent', 'any-action');
  assert(r9.allowed === false, 'D9.1: unknown-agent — DENY');
  assert(r9.denyReason === 'unknown-agent', 'D9.2: denyReason=unknown-agent');

  // D10: 未知操作 (not in allow list)
  var r10 = checkAgentAction('codex', 'unknown-command');
  assert(r10.allowed === false, 'D10.1: unknown command — DENY');
  assert(r10.denyReason === 'not-in-allow-list', 'D10.2: denyReason=not-in-allow-list');
}

testGroupD();

// ============================================================
//  TEST GROUP E: Shadow 模式标记
// ============================================================

console.log('\n=== GROUP E: Shadow 模式标记 ===\n');

function testGroupE() {
  // E1: 验证 output 始终包含 plan-only
  // (已在 execute 中验证)

  // E2: getPolicySummary
  var policy = commanderRuntime.getPolicySummary();
  assert(Array.isArray(policy), 'E2.1: getPolicySummary 返回数组');
  assert(policy.length >= 3, 'E2.2: 策略条数 >= 3');

  var policyText = policy.join(' ');
  assertContains(policyText, 'plan-only', 'E2.3: 包含 plan-only');
  assertContains(policyText, 'human-in-the-loop', 'E2.4: 包含 human-in-the-loop');
  assertContains(policyText, 'RBAC', 'E2.5: 包含 RBAC');
}

testGroupE();

// ============================================================
//  TEST GROUP F: DAG 顺序验证
// ============================================================

console.log('\n=== GROUP F: DAG 顺序验证 ===\n');

(async function testGroupF() {

  var r = await commanderRuntime.execute({ goal: '提升GMV' });
  assert(r.success, 'F1: 提升GMV 成功');

  // F2: queue 按 priority 升序
  for (var i = 1; i < r.queue.length; i++) {
    var pq = r.queue[i].priority;
    var pprev = r.queue[i - 1].priority;
    assert(pq >= pprev, 'F2: priority 升序 — seq ' + (i + 1) + ' (P' + pq + ' >= P' + pprev + ')');
  }

  // F3: DAG 序列在 output 中出现
  assertContains(r.output, 'DAG 执行序列', 'F3: 输出含 DAG 序列');
  assertContains(r.output, '1. ', 'F4: 第一步可见');
  assertContains(r.output, 'codex', 'F5: codex 在 DAG 中');

  // F4: agent 去重计数
  var agentSet = {};
  for (var j = 0; j < r.queue.length; j++) {
    agentSet[r.queue[j].agent] = true;
  }
  var uniqueAgents = Object.keys(agentSet).length;
  assert(uniqueAgents >= 1, 'F6: 至少有 1 个唯一 agent');
  assert(uniqueAgents <= 4, 'F7: 至多 4 个唯一 agent');
  assert(r.queue.length >= uniqueAgents, 'F8: queue 长度 >= 唯一 agent 数');

})();

// ============================================================
//  TEST GROUP G: commander-command 命令处理器
// ============================================================

console.log('\n=== GROUP G: commander-command 命令处理器 ===\n');

(async function testGroupG() {

  var commanderCommand = require('../src/commands/commander-command');

  // G1: desc 存在
  assert(typeof commanderCommand.desc === 'string' && commanderCommand.desc.length > 0, 'G1: desc 存在');

  // G2: execute 函数存在
  assert(typeof commanderCommand.execute === 'function', 'G2: execute 函数存在');

  var ctx = { user: 'testuser', corpId: 'test-corp' };

  // G3: 空参数 → 帮助
  var r1 = await commanderCommand.execute(ctx, '');
  assert(r1 && r1.length > 0, 'G3.1: 空参数返回帮助');
  assertContains(r1, 'Commander Runtime', 'G3.2: 帮助含 Commander Runtime');

  // G4: /总控 列表
  var r2 = await commanderCommand.execute(ctx, '列表');
  assertContains(r2, '提升GMV', 'G4.1: 列表含提升GMV');
  assertContains(r2, '提高ROI', 'G4.2: 列表含提高ROI');

  // G5: /总控 状态
  var r3 = await commanderCommand.execute(ctx, '状态');
  assertContains(r3, 'Commander Runtime 状态', 'G5.1: 状态含标题');
  assertContains(r3, 'plan-only', 'G5.2: 状态含 plan-only');

  // G6: /总控 能力
  var r4 = await commanderCommand.execute(ctx, '能力');
  assertContains(r4, 'Agent 能力矩阵', 'G6.1: 能力含矩阵');
  assertContains(r4, 'ALLOW', 'G6.2: 能力含 ALLOW');
  assertContains(r4, 'DENY', 'G6.3: 能力含 DENY');

  // G7: /总控 list (英文别名)
  var r5 = await commanderCommand.execute(ctx, 'list');
  assertContains(r5, '提升GMV', 'G7: list 别名有效');

  // G8: /总控 提升GMV
  var r6 = await commanderCommand.execute(ctx, '提升GMV');
  assertContains(r6, '[Commander Runtime]', 'G8.1: 提升GMV 含标题');
  assertContains(r6, '提升GMV', 'G8.2: 提升GMV 含目标');

  // G9: /总控 提高ROI
  var r7 = await commanderCommand.execute(ctx, '提高ROI');
  assertContains(r7, '[Commander Runtime]', 'G9.1: 提高ROI 含标题');
  assertContains(r7, '提高ROI', 'G9.2: 提高ROI 含目标');

  // G10: /总控 降低退款率
  var r8 = await commanderCommand.execute(ctx, '降低退款率');
  assertContains(r8, '[Commander Runtime]', 'G10.1: 降低退款率 含标题');

  // G11: /总控 优化企业微信稳定性
  var r9 = await commanderCommand.execute(ctx, '优化企业微信稳定性');
  assertContains(r9, '[Commander Runtime]', 'G11.1: 优化企业微信稳定性 含标题');

  // G12: /总控 提升GMV到5万 (带金额后缀)
  var r10 = await commanderCommand.execute(ctx, '提升GMV到5万');
  assertContains(r10, '[Commander Runtime]', 'G12.1: 带金额后缀 — 含标题');
  assertContains(r10, '提升GMV', 'G12.2: 带金额后缀 — 目标正确');

})();

// ============================================================
//  TEST GROUP H: 边缘场景
// ============================================================

console.log('\n=== GROUP H: 边缘场景 ===\n');

function testGroupH() {

  // H1: formatError
  var errOutput = commanderRuntime.formatError('测试错误', '提升GMV');
  assertContains(errOutput, '[Commander Runtime]', 'H1.1: formatError 含标题');
  assertContains(errOutput, 'ERROR', 'H1.2: formatError 含 ERROR');
  assertContains(errOutput, '测试错误', 'H1.3: formatError 含错误消息');
  assertContains(errOutput, '提升GMV', 'H1.4: formatError 含输入');
  assertContains(errOutput, '支持的目标', 'H1.5: formatError 含目标列表');

  // H2: getCommanderStatus
  var status = commanderRuntime.getCommanderStatus();
  assertEqual(status.agent, 'commander', 'H2.1: status.agent=commander');
  assert(status.mode.indexOf('plan-only') !== -1, 'H2.2: status.mode 含 plan-only');
  assert(Array.isArray(status.features), 'H2.3: features 是数组');
  assert(status.features.length >= 5, 'H2.4: features >= 5');
  assert(Array.isArray(status.constraints), 'H2.5: constraints 是数组');
  assert(status.constraints.length >= 4, 'H2.6: constraints >= 4');
  assert(Array.isArray(status.agents), 'H2.7: agents 是数组');
  assertEqual(status.agents.length, 4, 'H2.8: agents=4');

  // H3: getAgentCapabilityMatrix
  var matrix = commanderRuntime.getAgentCapabilityMatrix();
  assert(Array.isArray(matrix), 'H3.1: matrix 是数组');
  assertEqual(matrix.length, 4, 'H3.2: matrix.length=4');

  var agentNames = matrix.map(function(m) { return m.agent; });
  assert(agentNames.indexOf('codex') !== -1, 'H3.3: matrix 含 codex');
  assert(agentNames.indexOf('workbuddy') !== -1, 'H3.4: matrix 含 workbuddy');
  assert(agentNames.indexOf('deepseek') !== -1, 'H3.5: matrix 含 deepseek');
  assert(agentNames.indexOf('doubao') !== -1, 'H3.6: matrix 含 doubao');

  // 验证每个 agent 都有 role 和 rbacTests
  for (var i = 0; i < matrix.length; i++) {
    var m = matrix[i];
    assert(typeof m.role === 'string' && m.role.length > 0, 'H3.7.' + i + ': agent ' + m.agent + ' 有 role');
    assert(typeof m.rbacTests === 'object' && Object.keys(m.rbacTests).length > 0, 'H3.8.' + i + ': agent ' + m.agent + ' 有 rbacTests');
  }

  // H4: 验证 goalLabel 映射
  assertEqual(GOAL_LABELS[GoalType.BOOST_GMV], '提升GMV', 'H4.1: BOOST_GMV label');
  assertEqual(GOAL_LABELS[GoalType.IMPROVE_ROI], '提高ROI', 'H4.2: IMPROVE_ROI label');
  assertEqual(GOAL_LABELS[GoalType.REDUCE_REFUND], '降低退款率', 'H4.3: REDUCE_REFUND label');
  assertEqual(GOAL_LABELS[GoalType.OPTIMIZE_WECOM], '优化企业微信稳定性', 'H4.4: OPTIMIZE_WECOM label');

  // H5: validateGoal 各类型
  var v1 = validateGoal('提升GMV');
  assert(v1.valid, 'H5.1: 提升GMV — valid');
  var v2 = validateGoal('提高ROI');
  assert(v2.valid, 'H5.2: 提高ROI — valid');
  var v3 = validateGoal('降低退款率');
  assert(v3.valid, 'H5.3: 降低退款率 — valid');
  var v4 = validateGoal('优化企业微信稳定性');
  assert(v4.valid, 'H5.4: 优化企业微信稳定性 — valid');

  // H6: listGoals
  var goals = listGoals();
  assertEqual(goals.length, 4, 'H6.1: listGoals.length=4');

  // H7: commander-runtime 模块结构
  assert(typeof commanderRuntime.execute === 'function', 'H7.1: execute 是函数');
  assert(typeof commanderRuntime.formatOutput === 'function', 'H7.2: formatOutput 是函数');
  assert(typeof commanderRuntime.formatError === 'function', 'H7.3: formatError 是函数');
  assert(typeof commanderRuntime.getCommanderStatus === 'function', 'H7.4: getCommanderStatus 是函数');
  assert(typeof commanderRuntime.getAgentCapabilityMatrix === 'function', 'H7.5: getAgentCapabilityMatrix 是函数');
  assert(typeof commanderRuntime.getPolicySummary === 'function', 'H7.6: getPolicySummary 是函数');

}

testGroupH();

// ============================================================
//  TEST GROUP I: 验证 [Commander Runtime] 输出完整性
// ============================================================

console.log('\n=== GROUP I: 验证 [Commander Runtime] 输出完整性 ===\n');

(async function testGroupI() {

  var r = await commanderRuntime.execute({ goal: '提升GMV' });
  assert(r.success, 'I1: 执行成功');

  // 必需段落
  var requiredSections = [
    '[Commander Runtime]',
    '目标:',
    'Planner:',
    'Recommended DAG:',
    'Runtime RBAC:',
    'DAG 执行序列',
    'Shadow Mode:',
    'Runtime Policy:',
    '风险提示:',
    'Shadow 建议:',
  ];

  for (var i = 0; i < requiredSections.length; i++) {
    assertContains(r.output, requiredSections[i], 'I2.' + (i + 1) + ': 含 ' + requiredSections[i]);
  }

  // 验证每步都有 RBAC 结果
  for (var j = 0; j < r.rbacResults.length; j++) {
    var rr = r.rbacResults[j];
    assert(rr.hasOwnProperty('allowed'), 'I3.' + (j + 1) + ': step ' + rr.seq + ' 有 allowed 字段');
    assert(typeof rr.seq === 'number', 'I3.' + (j + 1) + '.seq: seq 是 number');
    assert(typeof rr.agent === 'string', 'I3.' + (j + 1) + '.agent: agent 是 string');
    assert(typeof rr.command === 'string', 'I3.' + (j + 1) + '.command: command 是 string');
    assert(typeof rr.priority === 'number', 'I3.' + (j + 1) + '.priority: priority 是 number');
  }

  // 验证 shadowMode
  assert(r.shadowMode === true, 'I4: shadowMode=true');

})();

// ============================================================
//  汇总输出
// ============================================================

setTimeout(function() {
  console.log('\n========================================');
  console.log('  Commander Runtime 测试结果');
  console.log('========================================');
  console.log('  通过: ' + passed);
  console.log('  失败: ' + failed);
  console.log('  总计: ' + total);
  console.log('========================================\n');

  if (failed > 0) {
    console.log('\u2717 ' + failed + ' 个测试失败');
    process.exit(1);
  } else {
    console.log('\u2713 所有测试通过');
    process.exit(0);
  }
}, 3000);
