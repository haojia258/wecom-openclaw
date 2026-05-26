'use strict';

/**
 * commander-runtime.js - 统一总控层 (P7.3 Commander Runtime v1)
 *
 * 职责:
 *   1. Goal 解析 — 识别业务目标类型
 *   2. Planner 调用 — 生成执行计划
 *   3. Queue 构建 — 构建推荐 Agent 队列 (DAG)
 *   4. Agent 推荐 — 为每个步骤推荐 Agent
 *   5. Runtime RBAC 检查 — 验证每个 Agent 的操作权限
 *   6. Shadow 模式标记 — plan-only 环境标记
 *   7. 汇总输出 — 结构化格式化输出
 *
 * 约束:
 *   - 不调用 agent-dispatcher.execute()
 *   - 不自动 confirm
 *   - 不自动执行任何命令
 *   - 所有 Agent recommendation 经过 Runtime RBAC
 *   - Runtime RBAC deny 显示原因
 *
 * 基于分支: feature/commander-runtime-v1 → develop
 */

var { validateGoal, buildQueue, listGoals, GoalType, GOAL_LABELS, getAgentRole } = require('./agent-queue-builder');
var { generateTaskId, isPlanOnly, sanitizeOutput } = require('./commander-policy');
var { getPlannerStatus } = require('./planner-agent');
var { checkAgentAction, buildDenyMessage } = require('../../runtime/ai-runtime-rbac');

// ============================================================
//  常量
// ============================================================

var AGENT_ICONS = {
  codex:     '\u{1F4BB}',  // 💻
  workbuddy: '\u{1F527}',  // 🔧
  deepseek:  '\u{1F9E0}',  // 🧠
  doubao:    '\u270D\uFE0F',  // ✍️
};

var PRIORITY_ICONS = {
  1: '\u{1F534}',  // 🔴
  2: '\u{1F7E0}',  // 🟠
  3: '\u{1F7E1}',  // 🟡
  4: '\u{1F7E2}',  // 🟢
  5: '\u{1F535}',  // 🔵
};

// ============================================================
//  核心 API: execute(params)
// ============================================================

/**
 * 执行 Commander Runtime 总控
 *
 * @param {object} params
 * @param {string} params.goal      - 业务目标 (文本)
 * @param {object} [params.context] - 可选业务上下文
 * @returns {Promise<object>} 结构化总控结果
 */
async function execute(params) {
  params = params || {};
  var goal = (params.goal || '').trim();
  var context = params.context || {};

  // ─── 1. 输入校验 ───
  if (!goal) {
    return {
      success: false,
      error: '目标不能为空',
      output: formatError('目标不能为空'),
    };
  }

  if (goal.length > 500) {
    return {
      success: false,
      error: '目标描述过长（最大500字符）',
      output: formatError('目标描述过长（最大500字符）'),
    };
  }

  // ─── 2. Goal 解析 ───
  var goalCheck = validateGoal(goal);
  if (!goalCheck.valid) {
    return {
      success: false,
      error: goalCheck.reason,
      output: formatError(goalCheck.reason, goal),
    };
  }

  var normalizedGoal = goalCheck.normalized;
  var goalLabel = GOAL_LABELS[normalizedGoal] || goal;

  // ─── 3. Planner 调用 ───
  var taskId = generateTaskId();

  // 使用 generatePlan 生成计划（内部已含 validate + queue + task-store）
  var plannerAgent = require('./planner-agent');
  var plannerResult;

  try {
    plannerResult = await plannerAgent.generatePlan({ goal: goal, context: context });
  } catch (e) {
    plannerResult = { success: false, error: 'Planner 执行异常: ' + (e.message || e) };
  }

  // ─── 4. Queue 构建（从 planner 结果中提取，或直接用 buildQueue） ───
  var queueResult;
  if (plannerResult.success && plannerResult.result && plannerResult.result.queue) {
    queueResult = {
      success: true,
      goal: plannerResult.result.goal,
      queue: plannerResult.result.queue,
      summary: plannerResult.result.summary,
    };
  } else {
    // 回退：直接调用 buildQueue
    queueResult = buildQueue({
      goal: normalizedGoal,
      context: context,
    });
  }

  if (!queueResult.success) {
    return {
      success: false,
      error: queueResult.error,
      output: formatError(queueResult.error, goal),
    };
  }

  var queue = queueResult.queue;

  // ─── 5. Agent 推荐 + Runtime RBAC 检查 ───
  var rbacResults = [];
  var deniedAgents = [];
  var allowedAgents = [];

  for (var i = 0; i < queue.length; i++) {
    var item = queue[i];
    var agent = item.agent;
    var command = item.command;

    // Runtime RBAC 检查
    var rbacCheck = checkAgentAction(agent, command);

    var rbacEntry = {
      seq:       item.seq,
      agent:     agent,
      command:   command,
      priority:  item.priority,
      reason:    item.reason,
      allowed:   rbacCheck.allowed,
    };

    if (!rbacCheck.allowed) {
      rbacEntry.denyReason = rbacCheck.denyReason;
      rbacEntry.denyMessage = rbacCheck.reason;
      deniedAgents.push(rbacEntry);
    } else {
      allowedAgents.push(rbacEntry);
    }

    rbacResults.push(rbacEntry);
  }

  // ─── 6. Shadow 模式标记 ───
  var shadowMode = isPlanOnly();
  var policySummary = getPolicySummary();

  // ─── 7. 汇总输出 ───
  var output = formatOutput({
    goal:          goal,
    goalLabel:     goalLabel,
    normalizedGoal: normalizedGoal,
    taskId:        taskId,
    queue:         queue,
    rbacResults:   rbacResults,
    allowedAgents: allowedAgents,
    deniedAgents:  deniedAgents,
    plannerResult: plannerResult,
    shadowMode:    shadowMode,
    policySummary: policySummary,
  });

  return {
    success:        true,
    taskId:         taskId,
    goal:           goal,
    normalizedGoal: normalizedGoal,
    goalLabel:      goalLabel,
    queue:          queue,
    rbacResults:    rbacResults,
    allowedAgents:  allowedAgents,
    deniedAgents:   deniedAgents,
    shadowMode:     shadowMode,
    output:         output,
  };
}

// ============================================================
//  输出格式化
// ============================================================

/**
 * 格式化总控输出
 */
function formatOutput(data) {
  var lines = [];

  lines.push('[Commander Runtime]');
  lines.push('');

  // ─── 目标 ───
  lines.push('目标:');
  lines.push('  ' + data.goalLabel);
  if (data.goalLabel !== data.goal) {
    lines.push('  (原始输入: ' + data.goal + ')');
  }
  lines.push('');

  // ─── Planner ───
  lines.push('Planner:');
  if (data.plannerResult && data.plannerResult.success) {
    lines.push('  状态: RUNNING');
    lines.push('  Task ID: ' + data.taskId);
    lines.push('  模式: plan-only');
  } else {
    lines.push('  状态: FAILED');
    lines.push('  原因: ' + (data.plannerResult ? data.plannerResult.error : '未知'));
  }
  lines.push('');

  // ─── Recommended DAG ───
  lines.push('Recommended DAG:');
  var orderedAgents = [];
  for (var i = 0; i < data.queue.length; i++) {
    var item = data.queue[i];
    var icon = AGENT_ICONS[item.agent] || '\u{1F916}';
    orderedAgents.push((i + 1) + '. ' + icon + ' ' + item.agent);
  }
  lines.push(orderedAgents.join('\n'));
  lines.push('');

  // ─── Runtime RBAC 检查结果 ───
  lines.push('Runtime RBAC:');
  for (var j = 0; j < data.rbacResults.length; j++) {
    var r = data.rbacResults[j];
    var statusIcon = r.allowed ? '\u2705' : '\u274C';  // ✅ or ❌
    var pIcon = PRIORITY_ICONS[r.priority] || '\u26AA';

    lines.push('  ' + statusIcon + ' ' + pIcon + ' 步骤 ' + r.seq + ': ' + r.agent + ' → ' + r.command);

    if (!r.allowed) {
      lines.push('     拒绝原因: [' + r.denyReason + '] ' + (r.denyMessage || '未知'));
    }
  }
  lines.push('');

  // ─── 允许执行的 Agent ───
  if (data.allowedAgents.length > 0) {
    lines.push('可执行步骤 (' + data.allowedAgents.length + '/' + data.rbacResults.length + '):');
    for (var k = 0; k < data.allowedAgents.length; k++) {
      var a = data.allowedAgents[k];
      lines.push('  \u2705 步骤 ' + a.seq + ': ' + a.agent + ' \u2192 ' + a.command);
    }
    lines.push('');
  }

  // ─── 被拒绝的 Agent ───
  if (data.deniedAgents.length > 0) {
    lines.push('被拒绝步骤 (' + data.deniedAgents.length + '/' + data.rbacResults.length + '):');
    for (var d = 0; d < data.deniedAgents.length; d++) {
      var denied = data.deniedAgents[d];
      lines.push('  \u274C 步骤 ' + denied.seq + ': ' + denied.agent + ' \u2192 ' + denied.command);
      lines.push('     原因: ' + denied.denyMessage);
    }
    lines.push('');
  }

  // ─── DAG 序列 ───
  lines.push('DAG 执行序列 (' + data.queue.length + ' 步骤):');
  for (var s = 0; s < data.queue.length; s++) {
    var qi = data.queue[s];
    var pi = PRIORITY_ICONS[qi.priority] || '\u26AA';
    var ai = AGENT_ICONS[qi.agent] || '\u{1F916}';
    var ri = data.rbacResults[s];
    var si = ri.allowed ? '\u2705' : '\u274C';

    lines.push('  ' + si + ' ' + pi + ' [P' + qi.priority + '] ' + ai + ' ' + qi.agent);
    lines.push('     命令: ' + qi.command);
    lines.push('     原因: ' + qi.reason);

    // 如果有上下文，显示
    if (qi.context && Object.keys(qi.context).length > 0) {
      lines.push('     上下文: ' + JSON.stringify(qi.context));
    }
  }
  lines.push('');

  // ─── Shadow Mode ───
  lines.push('Shadow Mode:');
  if (data.shadowMode) {
    lines.push('  ENABLED');
  } else {
    lines.push('  DISABLED');
  }
  lines.push('');

  // ─── Runtime Policy ───
  lines.push('Runtime Policy:');
  for (var p = 0; p < data.policySummary.length; p++) {
    lines.push('  \u2022 ' + data.policySummary[p]);
  }
  lines.push('');

  // ─── 风险提示 ───
  lines.push('风险提示:');
  lines.push('  \u26A0 此输出仅为推荐执行计划，不会自动执行任何命令');
  lines.push('  \u26A0 被 RBAC 拒绝的步骤需管理员或 operator 手动确认');
  lines.push('  \u26A0 DAG 顺序基于优先级 (P1→P5)，前序步骤是后续的前提');
  if (data.deniedAgents.length > 0) {
    lines.push('  \u26A0 ' + data.deniedAgents.length + ' 个步骤被 Runtime RBAC 拒绝，请检查权限配置');
  }
  lines.push('');

  // ─── Shadow 建议 ───
  lines.push('Shadow 建议:');
  lines.push('  \u2022 当前运行在 plan-only 模式，所有操作为只读规划');
  lines.push('  \u2022 生产部署前请在 Shadow 环境完整验证');
  lines.push('  \u2022 使用 /任务 <agent> <内容> 手动执行确认后的步骤');

  return lines.join('\n');
}

/**
 * 格式化错误输出
 */
function formatError(error, goal) {
  var lines = [
    '[Commander Runtime]',
    '',
    '状态: ERROR',
    '原因: ' + error,
  ];

  if (goal) {
    lines.push('输入: ' + goal);
  }

  lines.push('');
  lines.push('支持的目标:');
  var goals = listGoals();
  for (var i = 0; i < goals.length; i++) {
    lines.push('  \u2022 ' + goals[i].label + ' — ' + goals[i].description);
  }
  lines.push('');
  lines.push('用法: /总控 <目标名称>');
  lines.push('支持子命令:');
  lines.push('  /总控 列表  — 查看所有支持的目标');
  lines.push('  /总控 状态  — Commander Runtime 状态');
  lines.push('  /总控 能力  — Agent 能力矩阵');

  return lines.join('\n');
}

// ============================================================
//  状态查询 API
// ============================================================

/**
 * 获取 Commander Runtime 状态
 * @returns {object}
 */
function getCommanderStatus() {
  var plannerStatus = getPlannerStatus();
  var goals = listGoals();

  return {
    agent:       'commander',
    mode:        'plan-only (P7.3 Commander Runtime v1)',
    version:     'v1',
    goals:       goals.map(function(g) { return g.label; }),
    features: [
      'Goal 解析 — 识别业务目标类型',
      'Planner 调用 — 生成执行计划',
      'Queue 构建 — 推荐 Agent DAG 队列',
      'Agent 推荐 — 为每步推荐最优 Agent',
      'Runtime RBAC — 权限检查 (双层)',
      'Shadow 模式 — plan-only 环境标记',
      '汇总输出 — 结构化执行报告',
    ],
    constraints: [
      '不调用 agent-dispatcher.execute()',
      '不自动 confirm',
      '不自动执行任何命令',
      '所有 Agent recommendation 经过 Runtime RBAC',
      'Deny 必须显示原因',
    ],
    agents:       ['codex', 'workbuddy', 'deepseek', 'doubao'],
    planner:      plannerStatus,
  };
}

/**
 * 获取 Agent 能力矩阵 (含 Runtime RBAC)
 */
function getAgentCapabilityMatrix() {
  var agents = ['codex', 'workbuddy', 'deepseek', 'doubao'];

  return agents.map(function(agent) {
    var icon = AGENT_ICONS[agent] || '\u{1F916}';
    var role = getAgentRole(agent);

    // 测试常见命令的 RBAC 状态
    var testCommands = ['read_file', 'generate_plan', 'draft-pr', 'deploy-production'];
    var rbacTests = {};
    for (var i = 0; i < testCommands.length; i++) {
      var cmd = testCommands[i];
      var check = checkAgentAction(agent, cmd);
      rbacTests[cmd] = check.allowed ? 'ALLOW' : ('DENY: ' + (check.denyReason || 'unknown'));
    }

    return {
      agent:      agent,
      icon:       icon,
      role:       role,
      rbacTests:  rbacTests,
    };
  });
}

/**
 * 获取安全策略摘要
 */
function getPolicySummary() {
  return [
    'plan-only — 所有操作仅返回计划，不执行',
    'human-in-the-loop — 每个步骤需人工确认',
    'RBAC 双层检查 — WeCom RBAC + Runtime RBAC',
    '禁止自动 merge / deploy / restart',
    '禁止输出 API Key',
    '所有操作写入 logs/tasks/*.jsonl',
  ];
}

// ============================================================
//  导出
// ============================================================

module.exports = {
  execute,
  formatOutput,
  formatError,
  getCommanderStatus,
  getAgentCapabilityMatrix,
  getPolicySummary,
};
