'use strict';

/**
 * planner-agent.js - 目标规划编排器 (P6.5 Planner Agent)
 *
 * 编排层：目标解析 → 任务拆解 → 安全审查 → 格式化输出
 *
 * 安全约束:
 * - plan-only，不执行任何实际操作
 * - 不调用 agent-dispatcher.dispatch()
 * - 通过 checkForbiddenAction 过滤 merge/deploy 等敏感词
 * - 输出通过 sanitizeOutput 脱敏
 */

const goalParser = require('./goal-parser');
const taskPlanner = require('./task-planner');
const { checkForbiddenAction, sanitizeOutput, generateTaskId } = require('./commander-policy');
const { createTask, updateTask } = require('./task-store');
const { buildQueue, validateGoal, listGoals, GoalType, getAgentRole } = require('./agent-queue-builder');

// Agent 名称映射
var AGENT_LABELS = taskPlanner.AGENT_LABELS;

/**
 * 格式化输出
 * @param {string} goal
 * @param {object} planResult
 * @param {object} parsedGoal
 * @returns {string}
 */
function formatOutput(goal, planResult, parsedGoal) {
  var lines = [];
  lines.push('[Planner]');
  lines.push('目标：' + goal);
  lines.push('');

  lines.push('领域：' + planResult.domainLabel);
  lines.push('策略：' + planResult.categoryLabel);
  lines.push('');

  // P1 任务
  if (planResult.p1Tasks.length > 0) {
    lines.push('任务拆解：');
    lines.push('');
    lines.push('P1 (高优先):');
    for (var i = 0; i < planResult.p1Tasks.length; i++) {
      var t = planResult.p1Tasks[i];
      lines.push((i + 1) + '. ' + t.title + ' → ' + (AGENT_LABELS[t.agent] || t.agent));
      if (t.commands && t.commands.length > 0) {
        lines.push('   推荐: ' + t.commands.join(', '));
      }
    }
    lines.push('');
  }

  // P2 任务
  if (planResult.p2Tasks.length > 0) {
    lines.push('P2 (建议):');
    for (var j = 0; j < planResult.p2Tasks.length; j++) {
      var t2 = planResult.p2Tasks[j];
      lines.push((j + 1) + '. ' + t2.title + ' → ' + (AGENT_LABELS[t2.agent] || t2.agent));
      if (t2.commands && t2.commands.length > 0) {
        lines.push('   推荐: ' + t2.commands.join(', '));
      }
    }
    lines.push('');
  }

  // Agent 分工
  var agentCounts = planResult.agentCounts;
  var agentKeys = Object.keys(agentCounts).sort();
  if (agentKeys.length > 0) {
    lines.push('Agent 分工：');
    for (var k = 0; k < agentKeys.length; k++) {
      var a = agentKeys[k];
      lines.push('- ' + (AGENT_LABELS[a] || a) + '：' + agentCounts[a] + ' 项');
    }
    lines.push('');
  }

  // 推荐执行命令
  if (planResult.commands.length > 0) {
    lines.push('推荐执行顺序：');
    for (var c = 0; c < planResult.commands.length; c++) {
      lines.push(c + 1 + '. ' + planResult.commands[c]);
    }
    lines.push('');
  }

  // 模式说明
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('模式：plan-only (仅规划，不执行)');
  lines.push('使用 /任务 <agent> <内容> 手动执行具体任务');
  lines.push('Task ID: ' + parsedGoal.taskId);

  return lines.join('\n');
}

/**
 * 执行目标规划
 * @param {{ goal: string }} params
 * @returns {Promise<{ success: boolean, output?: string, error?: string }>}
 */
async function execute(params) {
  var goal = (params.goal || '').trim();

  // 1. 输入校验
  if (!goal) {
    return { success: false, error: '目标不能为空' };
  }

  if (goal.length > 500) {
    return { success: false, error: '目标描述过长（最大500字符）' };
  }

  // 2. 安全策略检查
  var forbidden = checkForbiddenAction(goal);
  if (!forbidden.allowed) {
    return { success: false, error: forbidden.reason };
  }

  // 3. 生成 task_id
  var taskId = generateTaskId();

  // 4. 解析目标
  var parsedGoal = goalParser.parse(goal);
  parsedGoal.taskId = taskId;

  // 5. 生成任务计划
  var planResult = taskPlanner.plan(parsedGoal);

  // 6. 格式化输出
  var output = formatOutput(goal, planResult, parsedGoal);

  // 7. 脱敏
  output = sanitizeOutput(output);

  // 8. 写入 task-store
  try {
    createTask({
      taskId: taskId,
      type: 'planner_goal',
      agent: 'planner',
      content: goal,
    });
  } catch (_) {
    // 写入失败不影响主流程
  }

  // 9. 返回结果
  return {
    success: true,
    output: output,
    taskId: taskId,
    parsedGoal: parsedGoal,
    planResult: planResult,
  };
}

// ============================================================
//  P6.6.3 Planner Queue — 推荐执行队列
// ============================================================

var PRIORITY_ICONS = {
  1: '\uD83D\uDD34',
  2: '\uD83D\uDFE0',
  3: '\uD83D\uDFE1',
  4: '\uD83D\uDFE2',
  5: '\uD83D\uDD35',
};

var AGENT_ICONS = {
  codex:     '\uD83D\uDCBB',
  workbuddy: '\uD83D\uDD27',
  deepseek:  '\uD83E\uDDE0',
  doubao:    '\u270D\uFE0F',
};

function formatQueueItem(item) {
  var pIcon = PRIORITY_ICONS[item.priority] || '\u26AA';
  var aIcon = AGENT_ICONS[item.agent] || '\uD83E\uDD16';
  return [
    pIcon + ' [P' + item.priority + '] 步骤 ' + item.seq + ': ' + aIcon + ' ' + item.agent,
    '   命令: ' + item.command,
    '   原因: ' + item.reason,
  ].join('\n');
}

function formatQueuePlan(planResult) {
  if (!planResult.success) {
    var goals = listGoals();
    return '规划失败:\n' + planResult.error + '\n\n' +
           '支持的目标:\n' + goals.map(function(g) { return '  \u2022 ' + g.label + ' \u2014 ' + g.description; }).join('\n');
  }

  var queue = planResult.queue;
  var summary = planResult.summary;
  var lines = [
    '\uD83C\uDFAF Planner 推荐执行队列',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    '目标: ' + summary.goalLabel,
    '模式: ' + summary.mode,
    '步骤数: ' + summary.totalSteps,
    '涉及 Agent: ' + summary.agentsInvolved.join(' \u2192 '),
    '优先级范围: ' + summary.priorityRange,
    '',
    '\uD83D\uDCCB 执行队列:',
    '',
  ];

  for (var i = 0; i < queue.length; i++) {
    lines.push(formatQueueItem(queue[i]));
  }

  lines.push('');
  lines.push('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
  lines.push('\u2139\uFE0F ' + summary.disclaimer);
  lines.push('');
  lines.push('\uD83D\uDCA1 提示:');
  lines.push('  \u2022 此队列为推荐执行顺序，按 priority 从小到大执行');
  lines.push('  \u2022 每个步骤需手动确认后才会执行');
  lines.push('  \u2022 使用 /任务 <agent> <内容> 手动创建单个任务');
  lines.push('  \u2022 步骤1 (数据分析) 是后续步骤的前提');

  return lines.join('\n');
}

/**
 * 生成执行计划 (Plan-only) — P6.6.3 新增
 *
 * @param {object} params
 * @param {string} params.goal      - 业务目标
 * @param {object} [params.context]  - 可选的业务上下文
 * @param {number} [params.maxItems] - 最大返回项数
 * @returns {Promise<object>} 规划结果
 */
async function generatePlan(params) {
  params = params || {};
  var goal = params.goal;
  var context = params.context;
  var maxItems = params.maxItems;

  // 1. 验证目标
  var goalCheck = validateGoal(goal);
  if (!goalCheck.valid) {
    return {
      success: false,
      error: goalCheck.reason,
      plan: formatQueuePlan({ success: false, error: goalCheck.reason }),
    };
  }

  // 2. 生成 task_id
  var taskId = generateTaskId();

  // 3. 创建任务记录
  var task = createTask({
    taskId: taskId,
    type: 'planner',
    agent: 'planner',
    content: '目标: ' + goal,
  });

  // 4. 更新为执行中
  try { updateTask(taskId, { status: 'RUNNING' }); } catch (_) {}

  // 5. 构建推荐队列 (不 dispatch!)
  var queueResult = buildQueue({
    goal: goalCheck.normalized,
    context: context,
    maxItems: maxItems,
  });

  // 6. 安全过滤
  var planText = formatQueuePlan(queueResult);
  var sanitizedPlan = sanitizeOutput(planText);

  // 7. 构建结果
  var result = {
    task_id:      taskId,
    goal:         queueResult.goal,
    mode:         'plan-only',
    queue:        queueResult.queue,
    summary:      queueResult.summary,
    plan:         sanitizedPlan,
    plan_length:  sanitizedPlan.length,
    timestamp:    new Date().toISOString(),
  };

  // 8. 更新任务记录
  var status = queueResult.success ? 'COMPLETED' : 'FAILED';
  try {
    updateTask(taskId, {
      status: status,
      result: JSON.stringify({
        goal:    result.goal,
        queue:   result.queue,
        summary: result.summary,
      }),
    });
  } catch (_) {}

  return {
    success:  queueResult.success,
    task_id:  taskId,
    result:   result,
  };
}

/**
 * 获取 Planner 状态 — P6.6.3 新增
 * @returns {object}
 */
function getPlannerStatus() {
  return {
    agent:    'planner',
    mode:     'plan-only',
    goals:    listGoals().map(function(g) { return g.label; }),
    features: [
      '目标 \u2192 推荐队列生成',
      '多 Agent 协同编排',
      '优先级智能排序',
      '上下文注入',
    ],
    constraints: [
      '不自动 dispatch',
      '不自动 confirm',
      '不自动执行',
      '不调用 agent-dispatcher',
    ],
  };
}

/**
 * 获取所有支持的 Agent 及其在此 Planner 中的角色 — P6.6.3 新增
 * @returns {object[]}
 */
function getAgentCapabilities() {
  var agents = ['codex', 'workbuddy', 'deepseek', 'doubao'];
  return agents.map(function(agent) {
    return {
      agent: agent,
      icon:  AGENT_ICONS[agent] || '\uD83E\uDD16',
      role:  getAgentRole(agent),
    };
  });
}

module.exports = {
  // P6.5 原有
  execute:       execute,
  formatOutput:  formatOutput,
  // P6.6.3 新增
  generatePlan:         generatePlan,
  getPlannerStatus:     getPlannerStatus,
  getAgentCapabilities: getAgentCapabilities,
  formatQueuePlan:      formatQueuePlan,
};
