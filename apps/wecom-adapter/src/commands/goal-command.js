'use strict';

/**
 * goal-command.js - /目标 命令处理器 (P6.5 + P6.6.3)
 *
 * 格式:
 *   /目标 <目标描述>              → P6.5 原有: 通用目标规划
 *   /目标 <目标类型>              → P6.6.3: 生成完整推荐队列
 *   /目标 列表                    → 列出所有支持的目标
 *   /目标 预览 <目标类型>         → 预览队列 (不创建任务)
 *   /目标 状态                    → Planner 状态
 *
 * 目标类型 (P6.6.3):
 *   提升GMV | 提高ROI | 降低退款率 | 优化企业微信稳定性
 *
 * 约束:
 *   - 不自动 dispatch
 *   - 不自动 confirm
 *   - 不自动执行
 */

var plannerAgent = require('../orchestrator/v2/planner-agent');
var taskPlanner = require('../orchestrator/v2/task-planner');
var { validateGoal, listGoals } = require('../orchestrator/v2/agent-queue-builder');

var desc = '目标型任务拆解 /目标 <目标描述>  |  /目标 列表|预览|状态';

// ─── P6.6.3 子命令处理 ───────────────────────────────────────

/**
 * 处理 /目标 列表
 */
async function handleList() {
  var goals = listGoals();
  var lines = [
    '\uD83C\uDFAF 支持的目标类型',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    '',
  ];

  for (var i = 0; i < goals.length; i++) {
    lines.push((i + 1) + '. ' + goals[i].label);
    lines.push('   ' + goals[i].description);
  }

  lines.push('');
  lines.push('用法: /目标 <目标名称>');
  lines.push('示例: /目标 提升GMV');
  lines.push('');
  lines.push('其他命令:');
  lines.push('  /目标 预览 <目标>  \u2014 预览队列 (不创建任务)');
  lines.push('  /目标 状态         \u2014 Planner 状态');
  return lines.join('\n');
}

/**
 * 处理 /目标 预览 <goal>
 */
async function handlePreview(goal) {
  if (!goal) {
    return '用法: /目标 预览 <目标名称>\n示例: /目标 预览 提升GMV';
  }

  var preview = taskPlanner.previewPlan({ goal: goal });

  if (!preview.success) {
    return '预览失败: ' + preview.error + '\n\n使用 /目标 列表 查看支持的目标。';
  }

  var lines = [
    '\uD83D\uDD0D Planner 队列预览',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    '目标: ' + preview.summary.goalLabel,
    '步骤数: ' + preview.summary.totalSteps,
    '涉及 Agent: ' + preview.summary.agentsInvolved.join(' \u2192 '),
    '',
    '\uD83D\uDCCB 推荐队列:',
    '',
  ];

  for (var i = 0; i < preview.queue.length; i++) {
    var item = preview.queue[i];
    lines.push('  ' + item.seq + '. [P' + item.priority + '] ' + item.agent + ' \u2014 ' + item.command);
    lines.push('     ' + item.reason);
  }

  lines.push('');
  lines.push('\u2139\uFE0F  ' + preview.note);
  lines.push('');
  lines.push('使用 /目标 ' + goal + ' 创建正式规划。');
  return lines.join('\n');
}

/**
 * 处理 /目标 状态
 */
async function handleStatus() {
  var status = plannerAgent.getPlannerStatus();
  var capabilities = plannerAgent.getAgentCapabilities();

  var lines = [
    '\uD83D\uDCCA Planner 状态',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    'Agent:     ' + status.agent,
    '模式:      ' + status.mode,
    '可用目标:  ' + (status.goals || []).join(', '),
    '',
    '功能:',
  ];

  for (var i = 0; i < status.features.length; i++) {
    lines.push('  \u2713 ' + status.features[i]);
  }

  lines.push('');
  lines.push('约束:');

  for (var j = 0; j < status.constraints.length; j++) {
    lines.push('  \u26D4 ' + status.constraints[j]);
  }

  lines.push('');
  lines.push('Agent 能力:');

  for (var k = 0; k < capabilities.length; k++) {
    var c = capabilities[k];
    lines.push('  ' + (c.icon || '') + ' ' + c.agent + ': ' + c.role);
  }

  return lines.join('\n');
}

/**
 * 处理 /目标 <goal> (P6.6.3 完整规划)
 */
async function handleGoalQueue(goal) {
  if (!goal) {
    return '用法: /目标 <目标名称>\n\n' +
           '使用 /目标 列表 查看所有支持的目标。\n' +
           '示例: /目标 提升GMV';
  }

  // 检查是否是已知的子命令
  if (goal === '列表' || goal === 'list') {
    return handleList();
  }
  if (goal === '状态' || goal === 'status') {
    return handleStatus();
  }

  // 生成完整规划
  var plan = await taskPlanner.planTasks({ goal: goal });

  if (!plan.success) {
    // 尝试作为预览
    var goalCheck = validateGoal(goal);
    if (!goalCheck.valid) {
      return '规划失败: ' + plan.error + '\n\n使用 /目标 列表 查看支持的目标。';
    }
    return '规划失败: ' + plan.error;
  }

  // 格式化结果
  var lines = [
    '\u2705 Planner 任务规划已完成',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    'Task ID:   ' + plan.task_id,
    '目标:      ' + plan.summary.goalLabel,
    '模式:      ' + plan.mode,
    '规划任务数: ' + plan.metadata.total_tasks,
    '优先级范围: ' + plan.metadata.priority_range,
    '',
    '\uD83D\uDCCB 任务草稿 (需手动确认执行):',
    '',
  ];

  for (var i = 0; i < plan.tasks.length; i++) {
    var t = plan.tasks[i];
    lines.push(
      '  [P' + t.priority + '] ' + t.seq + '. ' + t.agent + '\n' +
      '  命令: ' + t.command + '\n' +
      '  原因: ' + t.reason + '\n' +
      '  \u26A0 ' + t.action_note + '\n'
    );
  }

  lines.push('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
  lines.push('\u2139\uFE0F  此规划不会自动执行任何命令。');
  lines.push('请手动对每个步骤使用 /任务 <agent> <内容> 创建任务。');
  lines.push('');
  lines.push('提示: 步骤1 (P1) 是后续步骤的前提，建议优先执行。');
  return lines.join('\n');
}

// ─── 统一入口 ───────────────────────────────────────────────

/**
 * 处理 /目标 命令
 * P6.6.3: 支持子命令 (列表/预览/状态) + 4 种标准目标类型
 * P6.5 回退: 不匹配标准目标类型时，使用原有 plannerAgent.execute()
 *
 * @param {object} ctx   - 上下文
 * @param {string} args  - 用户输入参数
 * @returns {Promise<string>}
 */
async function execute(ctx, args) {
  var input = (args || '').trim();

  // 无参数 → 帮助
  if (!input) {
    return [
      '错误: 目标不能为空',
      '',
      '格式: /目标 <目标描述>',
      '',
      'P6.6.3 标准目标:',
      '/目标 提升GMV',
      '/目标 提高ROI',
      '/目标 降低退款率',
      '/目标 优化企业微信稳定性',
      '',
      '子命令:',
      '/目标 列表    \u2014 查看所有支持的目标',
      '/目标 预览 <目标> \u2014 预览队列',
      '/目标 状态    \u2014 Planner 状态',
    ].join('\n');
  }

  // 子命令路由
  if (input === '列表' || input === 'list') {
    return handleList();
  }

  if (input === '状态' || input === 'status') {
    return handleStatus();
  }

  // /目标 预览 <goal>
  var previewMatch = input.match(/^(预览|preview)\s+(.+)$/);
  if (previewMatch) {
    return handlePreview(previewMatch[2].trim());
  }

  // P6.6.3 标准目标类型 → 使用新队列 Planner
  var goalCheck = validateGoal(input);
  if (goalCheck.valid) {
    return handleGoalQueue(input);
  }

  // P6.5 回退: 非标准目标 → 使用原有 goal-parser + task-planner
  var result = await plannerAgent.execute({ goal: input });

  if (!result.success) {
    return '规划失败:\n' + (result.error || '未知错误') + '\n\n提示: 使用 /目标 列表 查看 P6.6.3 支持的标准目标。';
  }

  return result.output;
}

module.exports = { execute: execute, desc: desc };
