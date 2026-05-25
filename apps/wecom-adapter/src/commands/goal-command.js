'use strict';

/**
 * goal-command.js - /目标 命令处理器
 *
 * 格式: /目标 <goal>
 * 示例:
 *   /目标 提升GMV
 *   /目标 降低退款率
 *   /目标 提高ROI
 *   /目标 优化企业微信稳定性
 *
 * P6.5 Planner Agent v1
 */

var plannerAgent = require('../orchestrator/v2/planner-agent');

var desc = '目标型任务拆解 /目标 <目标描述>';

async function execute(ctx, args) {
  var goal = (args || '').trim();

  if (!goal) {
    return [
      '错误: 目标不能为空',
      '',
      '格式: /目标 <目标描述>',
      '',
      '示例:',
      '/目标 提升GMV',
      '/目标 降低退款率',
      '/目标 提高ROI',
      '/目标 优化企业微信稳定性',
    ].join('\n');
  }

  var result = await plannerAgent.execute({ goal: goal });

  if (!result.success) {
    return '规划失败:\n' + (result.error || '未知错误');
  }

  return result.output;
}

module.exports = { execute: execute, desc: desc };
