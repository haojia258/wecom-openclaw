'use strict';

/**
 * test-agent-task.js - Agent Task 集成测试 (v2 port)
 *
 * 测试覆盖:
 * - command-center resolve 解析
 * - task-store 读写一致性
 * - commander-policy 安全检查
 * - agent-dispatcher 分发逻辑
 * - 命令执行集成
 * - task_id 唯一性
 * - 现有命令不受影响
 */

const { resolve, getCommandList, REGISTRY } = require('../src/lib/command-center');
const { routeCommand } = require('../src/router');
const { execute: agentTaskExecute } = require('../src/commands/agent-task');
const { execute: taskProgressExecute } = require('../src/commands/task-progress');
const { execute: taskListExecute } = require('../src/commands/task-list');
const { execute: taskBlockersExecute } = require('../src/commands/task-blockers');
const { validateAgent, dispatch, getSupportedAgents } = require('../src/orchestrator/v2/agent-dispatcher');
const { createTask, updateTask, getTask, listTasks, getBlockers, getStats } = require('../src/orchestrator/v2/task-store');
const { generateTaskId, sanitizeOutput, securityCheck, validateWorkbuddyCommand, checkForbiddenAction, isPlanOnly } = require('../src/orchestrator/v2/commander-policy');
const { reportTaskCreated, reportStatusChange, reportBlocker, reportProgressSummary, reportTaskCompleted, reportTaskFailed } = require('../src/wecom/progress-reporter');

// 测试统计
let passed = 0;
let failed = 0;
const failures = [];

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

// ========== 日志目录清理 ==========
const fs = require('fs');
const path = require('path');
const LOG_DIR = path.resolve(__dirname, '../logs/tasks');
const todayStr = new Date().toISOString().split('T')[0];
const logFile = path.join(LOG_DIR, todayStr + '.jsonl');

if (fs.existsSync(LOG_DIR)) {
  const files = fs.readdirSync(LOG_DIR);
  for (let i = 0; i < files.length; i++) {
    fs.unlinkSync(path.join(LOG_DIR, files[i]));
  }
}
fs.mkdirSync(LOG_DIR, { recursive: true });

console.log('====================================');
console.log('  OpenClaw OS v2 - 测试套件 (port)');
console.log('====================================\n');

// ========== 测试1: command-center.js - 命令解析 ==========
console.log('[TEST 1] command-center.js - 命令解析 (兼容 REGISTRY)');

{
  const r1 = resolve('/任务 codex 分析这段代码');
  assert(r1 !== null, '识别 /任务 codex 指令');
  assert(r1.handler !== null, '/任务 handler 存在');
  assertEqual(r1.args, 'codex 分析这段代码', 'args 解析正确');

  const r2 = resolve('/任务 workbuddy 生成报告');
  assert(r2 !== null, '识别 /任务 workbuddy 指令');

  const r3 = resolve('/任务 deepseek 深度分析');
  assert(r3 !== null, '识别 /任务 deepseek 指令');

  const r4 = resolve('/任务 doubao 创作内容');
  assert(r4 !== null, '识别 /任务 doubao 指令');

  const r5 = resolve('/进度');
  assert(r5 !== null, '识别 /进度 指令');

  const r6 = resolve('/任务列表');
  assert(r6 !== null, '识别 /任务列表 指令');

  const r7 = resolve('/阻断项');
  assert(r7 !== null, '识别 /阻断项 指令');

  const r8 = resolve('/任务 CODEX 大写测试');
  assert(r8 !== null, 'Agent 大小写不敏感');

  // 验证旧命令仍可用
  const r9 = resolve('/帮助');
  assert(r9 !== null, '旧命令 /帮助 仍然可用');

  const r10 = resolve('/状态');
  assert(r10 !== null, '旧命令 /状态 仍然可用');

  const r11 = resolve('/今日GMV');
  assert(r11 !== null, '旧命令 /今日GMV 仍然可用');
}

// ========== 测试2: commander-policy.js - 安全策略 ==========
console.log('\n[TEST 2] commander-policy.js - 安全策略');

{
  const id1 = generateTaskId();
  const id2 = generateTaskId();
  assert(id1 !== id2, 'task_id 具有唯一性');
  assert(id1.indexOf('task_') === 0, 'task_id 格式正确');

  const raw = 'My key is sk-abc123def456ghi789jkl012mno345pqr678stu';
  const sanitized = sanitizeOutput(raw);
  assert(sanitized.indexOf('REDACTED') !== -1, 'API Key 被过滤');
  assert(sanitized.indexOf('sk-abc') === -1, 'API Key 不泄露');

  assert(isPlanOnly(), '默认 plan-only');

  const mergeCheck = checkForbiddenAction('git merge');
  assert(!mergeCheck.allowed, '禁止 merge');
  assert(mergeCheck.reason.indexOf('禁止自动 merge') !== -1, 'merge 拒绝原因正确');

  const deployCheck = checkForbiddenAction('pm2 restart deploy');
  assert(!deployCheck.allowed, '禁止 deploy');
  assert(deployCheck.reason.indexOf('禁止自动 deploy') !== -1, 'deploy 拒绝原因正确');

  const okCheck = checkForbiddenAction('analyze code');
  assert(okCheck.allowed, '普通操作允许');

  const wbPass = validateWorkbuddyCommand('read_file');
  assert(wbPass.allowed, '白名单命令通过');

  const wbFail = validateWorkbuddyCommand('delete_all');
  assert(!wbFail.allowed, '非白名单命令拒绝');
  assert(wbFail.reason.indexOf('未匹配白名单关键词') !== -1, '白名单拒绝原因正确');

  const s1 = securityCheck({ agent: 'codex', content: 'analyze code', command: '/任务' });
  assert(s1.passed, 'codex 安全检查通过');

  const s2 = securityCheck({ agent: 'workbuddy', content: 'delete_all', command: 'delete_all' });
  assert(!s2.passed, '非白名单 workbuddy 命令被拒绝');
}

// ========== 测试3: task-store.js - 持久化 ==========
console.log('\n[TEST 3] task-store.js - 任务持久化');

{
  const emptyStats = getStats();
  assertEqual(emptyStats.total, 0, '初始任务数为 0');

  const t1 = createTask({
    taskId: 'task_test_001',
    type: 'agent_task',
    agent: 'codex',
    content: '测试任务1'
  });
  assertEqual(t1.task_id, 'task_test_001', '任务 ID 正确');
  assertEqual(t1.status, 'pending', '初始状态为 pending');
  assertEqual(t1.agent, 'codex', 'Agent 正确');

  createTask({
    taskId: 'task_test_002',
    type: 'agent_task',
    agent: 'deepseek',
    content: '测试任务2'
  });

  const all = listTasks();
  assertEqual(all.length, 2, '任务列表有 2 项');

  const codexTasks = listTasks({ agent: 'codex' });
  assertEqual(codexTasks.length, 1, 'codex 任务有 1 项');

  const updated = updateTask('task_test_001', { status: 'in_progress' });
  assert(updated !== null, '任务更新成功');
  assertEqual(updated.status, 'in_progress', '状态已更新');

  const got = getTask('task_test_001');
  assertEqual(got.status, 'in_progress', 'getTask 获取正确状态');

  updateTask('task_test_002', { status: 'blocked' });
  const blockers = getBlockers();
  assertEqual(blockers.length, 1, '阻断项有 1 个');
  assertEqual(blockers[0].task_id, 'task_test_002', '阻断项 ID 正确');

  const stats = getStats();
  assertEqual(stats.total, 2, '总计 2 个任务');
  assertEqual(stats.in_progress, 1, '进行中 1 个');
  assertEqual(stats.blocked, 1, '阻断 1 个');

  assert(fs.existsSync(logFile), 'JSONL 日志文件已创建');
}

// ========== 测试4: agent-dispatcher.js - 调度 ==========
console.log('\n[TEST 4] agent-dispatcher.js - Agent 调度');

{
  const v1 = validateAgent('codex');
  assert(v1.valid, 'codex 验证通过');
  const v2 = validateAgent('unknown');
  assert(!v2.valid, '未知 Agent 验证失败');

  const agents = getSupportedAgents();
  assert(agents.indexOf('codex') !== -1, '支持 codex');
  assert(agents.indexOf('workbuddy') !== -1, '支持 workbuddy');
  assert(agents.indexOf('deepseek') !== -1, '支持 deepseek');
  assert(agents.indexOf('doubao') !== -1, '支持 doubao');
  assertEqual(agents.length, 4, '共支持 4 个 Agent');

  const r1 = await dispatch({ agent: 'codex', content: '测试 Codex 调度', command: '/任务' });
  assert(r1.success, 'codex 调度成功');
  assert(r1.task_id !== null, '返回 task_id');
  assert(r1.result.plan.indexOf('Codex') !== -1, '计划包含 Agent 名称');
  assertEqual(r1.result.mode, 'plan-only', '默认为 plan-only');

  const r2 = await dispatch({ agent: 'workbuddy', content: 'read_file 分析', command: '/任务' });
  assert(r2.success, 'workbuddy 调度成功');

  const r3 = await dispatch({ agent: 'deepseek', content: '测试 DeepSeek', command: '/任务' });
  assert(r3.success, 'deepseek 调度成功');

  const r4 = await dispatch({ agent: 'doubao', content: '测试 Doubao', command: '/任务' });
  assert(r4.success, 'doubao 调度成功');

  const r5 = await dispatch({ agent: 'invalid', content: '非法', command: '/任务' });
  assert(!r5.success, '非法 Agent 调度失败');

  const r6 = await dispatch({ agent: 'codex', content: 'git merge main', command: '/任务' });
  assert(!r6.success, '禁止 merge 的任务被拒绝');
}

// ========== 测试5: commands/agent-task.js - 命令执行 ==========
console.log('\n[TEST 5] commands/agent-task.js - 命令执行');

{
  const r1 = await agentTaskExecute({}, 'codex 帮我分析代码');
  assert(r1.indexOf('任务已创建') !== -1, '返回创建成功信息');
  assert(r1.indexOf('Task ID') !== -1, '包含 Task ID');

  const r2 = await agentTaskExecute({}, '');
  assert(r2.indexOf('错误') !== -1, '空内容返回错误');
  assert(r2.indexOf('任务内容不能为空') !== -1, '提示内容为空');

  const r3 = await agentTaskExecute({}, 'unknown test');
  assert(r3.indexOf('错误') !== -1, '未知 Agent 返回错误');
}

// ========== 测试6: commands/task-status.js - 状态查询 ==========
console.log('\n[TEST 6] commands/task-status 子命令 - 状态查询');

{
  const r1 = taskProgressExecute({}, '');
  assert(r1.indexOf('任务进度') !== -1, '/进度 返回进度信息');

  const r2 = taskListExecute({}, '');
  assert(r2.indexOf('任务列表') !== -1, '/任务列表 返回任务列表');

  const r3 = taskBlockersExecute({}, '');
  assert(r3.indexOf('阻断项') !== -1, '/阻断项 返回阻断项信息');
}

// ========== 测试7: progress-reporter.js ==========
console.log('\n[TEST 7] progress-reporter.js - 进度回传');

{
  const task = {
    task_id: 'task_reporter_test',
    agent: 'codex',
    content: 'reporter test',
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const r1 = reportTaskCreated(task);
  assert(r1.indexOf('新任务已创建') !== -1, '任务创建上报');
  assert(r1.indexOf('task_reporter_test') !== -1, '包含 task_id');

  const r2 = reportStatusChange(Object.assign({}, task, { status: 'in_progress' }), 'pending');
  assert(r2.indexOf('任务状态变更') !== -1, '状态变更上报');
  assert(r2.indexOf('pending → in_progress') !== -1, '状态变更详情');

  const r3 = reportBlocker(task, '依赖未满足');
  assert(r3.indexOf('阻断项通知') !== -1, '阻断通知上报');

  const r4 = reportProgressSummary({ total: 5, pending: 1, in_progress: 2, completed: 1, blocked: 1, failed: 0 });
  assert(r4.indexOf('进度报告') !== -1, '进度汇总上报');
  assert(r4.indexOf('20%') !== -1, '进度百分比正确');

  const r5 = reportTaskCompleted(task);
  assert(r5.indexOf('任务已完成') !== -1, '任务完成上报');

  const r6 = reportTaskFailed(task, 'timeout');
  assert(r6.indexOf('任务失败') !== -1, '任务失败上报');
  assert(r6.indexOf('timeout') !== -1, '错误信息包含');
}

// ========== 测试8: 命令注册 ==========
console.log('\n[TEST 8] 命令注册 - REGISTRY 兼容');

{
  const cmds = Object.keys(REGISTRY);
  assert(cmds.indexOf('/任务') !== -1, '注册了 /任务');
  assert(cmds.indexOf('/进度') !== -1, '注册了 /进度');
  assert(cmds.indexOf('/任务列表') !== -1, '注册了 /任务列表');
  assert(cmds.indexOf('/阻断项') !== -1, '注册了 /阻断项');

  // 旧命令完好
  assert(cmds.indexOf('/帮助') !== -1, '旧命令 /帮助 仍在 REGISTRY');
  assert(cmds.indexOf('/状态') !== -1, '旧命令 /状态 仍在 REGISTRY');
  assert(cmds.indexOf('/今日GMV') !== -1, '旧命令 /今日GMV 仍在 REGISTRY');
}

// ========== 测试9: task_id 唯一性 ==========
console.log('\n[TEST 9] task_id 唯一性');

{
  const ids = {};
  for (let i = 0; i < 100; i++) {
    const id = generateTaskId();
    assert(!ids[id], 'task_id 唯一性验证 - ' + id);
    ids[id] = true;
  }
}

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
  console.log('\n✓ 所有测试通过');
  process.exit(0);
}
