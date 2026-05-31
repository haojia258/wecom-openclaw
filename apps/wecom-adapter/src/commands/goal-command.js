'use strict';

/**
 * goal-command.js — P14.2 Goal Manager Commands
 *
 * /目标     — 目标进度总览
 * /目标设置 — 更新目标值
 * /目标状态 — 详细进度 + 目标驱动决策
 */

var gm = require('../skills/goal-manager/goal-manager');

// ─── /目标 ─────────────────────────────────────────────────

function handleGoals(args) {
  var parts = (args || '').trim().split(/\s+/);
  var sub = parts[0] || '';
  var rest = parts.slice(1).join(' ');

  if (sub === '设置' || sub === 'set') return handleGoalSet(rest);
  if (sub === '状态' || sub === 'status') return handleGoalStatus();
  return handleGoalOverview();
}

function handleGoalOverview() {
  var progress = gm.getProgress();
  var goals = progress.goals;
  var summary = progress.summary;

  var lines = [
    '🎯 **经营目标总览**',
    '',
    '达标: ' + summary.onTrack + ' | 风险: ' + summary.atRisk + ' | 落后: ' + summary.behind +
      ' | 超额: ' + summary.exceeded + ' | 平均完成率: ' + summary.avgCompletion + '%',
    '',
    '| 目标 | 当前/目标 | 完成率 | 状态 |',
    '|------|----------|--------|------|',
  ];

  goals.forEach(function (g) {
    var bar = progressBar(g.completion);
    var statusLabel = statusEmoji(g.status) + ' ' + statusText(g.status);
    lines.push('| ' + g.name + ' | ' + formatValue(g.current, g.target, g.unit) + ' | ' + bar + ' ' + (g.completion * 100).toFixed(0) + '% | ' + statusLabel + ' |');
  });

  lines.push('');
  lines.push('💡 `/目标设置 gmv 100000` 更新GMV目标');
  lines.push('💡 `/目标状态` 详细进度 + 决策建议');

  return lines.join('\n');
}

// ─── /目标设置 ─────────────────────────────────────────────

function handleGoalSet(args) {
  var parts = (args || '').trim().split(/\s+/);
  if (parts.length < 2) {
    return '❌ 用法: `/目标设置 <目标类型> <新值>`\n\n' +
      '可用类型: gmv, profit, roi, refund, video, mission, growth\n' +
      '示例: `/目标设置 gmv 100000`';
  }

  var type = parts[0].toLowerCase();
  var value = parseFloat(parts[1]);
  if (isNaN(value)) return '❌ 无效数值: ' + parts[1];

  var goalId = 'goal-' + type;
  var goal = gm.setGoal(goalId, { target: value });
  if (!goal) return '❌ 目标类型不存在: ' + type;

  return [
    '✅ **目标已更新**',
    '',
    '目标: ' + goal.name,
    '新目标值: ' + goal.target + goal.unit,
    '当前值: ' + goal.current + goal.unit,
    '',
    '💡 `/目标` 查看总览',
  ].join('\n');
}

// ─── /目标状态 ─────────────────────────────────────────────

function handleGoalStatus() {
  var progress = gm.getProgress();
  var decisions = gm.getGoalDrivenDecisions();

  var lines = [
    '📊 **目标详细进度**',
    '',
  ];

  progress.goals.forEach(function (g, idx) {
    var statusIcon = statusEmoji(g.status);
    lines.push('### ' + (idx + 1) + '. ' + statusIcon + ' ' + g.name + ' (' + g.priority + ')');
    lines.push('- 目标: ' + g.target + g.unit);
    lines.push('- 当前: ' + g.current + g.unit + ' (' + (g.completion * 100).toFixed(1) + '%)');
    lines.push('- 差距: ' + (g.target - g.current) + g.unit);
    lines.push('');
  });

  // 目标驱动决策
  if (decisions.drivers.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## 🧭 目标驱动决策 (' + decisions.drivers.length + ' 项)');
    lines.push('');

    decisions.drivers.forEach(function (d, idx) {
      var pEmoji = d.priority === 'high' ? '🔴' : '🟡';
      lines.push((idx + 1) + '. ' + pEmoji + ' **' + d.goalName + '**: ' + d.action);
      lines.push('   > ' + d.reason);
      lines.push('   > 💡 ' + d.suggestion);
      lines.push('');
    });
  }

  lines.push('💡 `/目标设置` 更新目标 | `/决策` 查看统一决策');

  return lines.join('\n');
}

// ─── 工具函数 ──────────────────────────────────────────────

function progressBar(rate) {
  var filled = Math.round(rate * 5);
  var empty = 5 - filled;
  var bar = '';
  for (var i = 0; i < filled; i++) bar += '█';
  for (var j = 0; j < empty; j++) bar += '░';
  return bar;
}

function formatValue(current, target, unit) {
  if (current >= 1000) return current.toLocaleString() + '/' + target.toLocaleString() + unit;
  return current + '/' + target + unit;
}

function statusEmoji(status) {
  var map = { exceeded: '🌟', on_track: '🟢', at_risk: '🟡', behind: '🔴' };
  return map[status] || '⚪';
}

function statusText(status) {
  var map = { exceeded: '超额', on_track: '达标', at_risk: '风险', behind: '落后' };
  return map[status] || status;
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = { handleGoals: handleGoals, handleGoalSet: handleGoalSet, handleGoalStatus: handleGoalStatus };

if (require.main === module) {
  var args = process.argv.slice(2);
  console.log(handleGoals(args.join(' ')));
}
