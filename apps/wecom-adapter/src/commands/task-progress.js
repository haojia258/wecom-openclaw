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

  return [
    '📊 任务进度',
    '[' + progressBar + '] ' + progressPct + '%',
    '',
    '总计:    ' + stats.total,
    '⏳ 待处理: ' + stats.pending,
    '🔄 进行中: ' + stats.in_progress,
    '✅ 已完成: ' + stats.completed,
    '🚫 阻断项: ' + stats.blocked,
    '❌ 失败:   ' + stats.failed,
    '',
    '使用 /任务列表 查看详情',
    '使用 /阻断项 查看阻断任务'
  ].join('\n');
}

module.exports = { execute: execute, desc: desc };
