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
const { createTask } = require('./task-store');

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

module.exports = {
  execute: execute,
  // 导出供测试
  formatOutput: formatOutput,
};
