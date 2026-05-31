'use strict';

var ep = require('../skills/execution-planner/execution-planner');

function handleExecutionPlan() {
  var plan = ep.generateTaskPlan();

  var lines = [
    '📋 **执行计划 — ' + plan.generatedAt.split('T')[0] + '**',
    '',
    'Plan ID: `' + plan.planId + '` | 总任务: **' + plan.summary.total + '** 项',
    '',
  ];

  plan.phases.forEach(function (phase) {
    if (phase.tasks.length === 0) return;
    var pEmoji = phase.priority === 'urgent' ? '🔴' : '🟡';
    lines.push('## ' + pEmoji + ' Phase ' + phase.phase + ': ' + phase.label + ' (' + phase.tasks.length + ' 项)');
    lines.push('');
    lines.push('| # | 任务 | 负责人 | 截止 | 依据 |');
    lines.push('|---|------|--------|------|------|');

    phase.tasks.forEach(function (t, idx) {
      lines.push('| ' + (idx + 1) + ' | ' + t.action + ' | ' + t.owner + ' | ' + t.deadline + ' | ' + (t.reason.length > 40 ? t.reason.substring(0, 38) + '...' : t.reason) + ' |');
    });
    lines.push('');
  });

  lines.push('⚠️ REVIEW_ONLY — 任务需人工审批后派发');
  lines.push('💡 `/决策` 查看决策 | `/目标` 查看目标进度');

  return lines.join('\n');
}

module.exports = { handleExecutionPlan: handleExecutionPlan };
