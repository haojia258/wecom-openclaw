'use strict';

/**
 * task-progress.js - /进度 命令处理器
 */
const { getStats } = require('../orchestrator/v2/task-store');

const desc = '查看任务进度 /进度';

function execute(ctx, args) {
  const stats = getStats();

  if (stats.total === 0) {
    return '暂无任务记录。使用 /任务 <agent> <内容> 创建任务。';
  }

  const progressPct = stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;

  const progressBar = '█'.repeat(Math.floor(progressPct / 10)) +
    '░'.repeat(10 - Math.floor(progressPct / 10));

  var lines = [
    '📊 任务进度',
    '[' + progressBar + '] ' + progressPct + '%',
    '',
    '总计:    ' + stats.total,
    '⏳ 待处理: ' + stats.pending,
    '📋 规划中: ' + (stats.PLANNING || 0),
    '🔄 进行中: ' + (stats.RUNNING || stats.in_progress),
    '🔍 审查中: ' + (stats.REVIEWING || 0),
    '✅ 已完成: ' + stats.completed,
    '🚫 阻断项: ' + stats.blocked,
    '❌ 失败:   ' + stats.failed
  ];

  lines.push('');
  lines.push('使用 /任务列表 查看详情');
  lines.push('使用 /阻断项 查看阻断任务');

  return lines.join('\n');
}

module.exports = { execute: execute, desc: desc };
