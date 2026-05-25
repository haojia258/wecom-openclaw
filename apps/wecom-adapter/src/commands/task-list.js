'use strict';

/**
 * task-list.js - /任务列表 命令处理器
 */
const { listTasks } = require('../orchestrator/v2/task-store');

const desc = '查看所有任务列表 /任务列表';

function formatTaskLine(task) {
  const statusIcons = {
    // P6.6.2: 统一大写状态 + 旧小写兼容
    PENDING: '⏳',
    PLANNING: '📋',
    RUNNING: '🔄',
    REVIEWING: '🔍',
    COMPLETED: '✅',
    FAILED: '❌',
    BLOCKED: '🚫',
    // 旧小写兼容
    pending: '⏳',
    in_progress: '🔄',
    completed: '✅',
    blocked: '🚫',
    failed: '❌'
  };
  const icon = statusIcons[task.status] || '❓';
  return icon + ' [' + task.task_id + '] ' + task.agent + ' | ' + task.status + ' | ' + new Date(task.updated_at).toLocaleTimeString('zh-CN');
}

function execute(ctx, args) {
  const tasks = listTasks();

  if (tasks.length === 0) {
    return '暂无任务记录。使用 /任务 <agent> <内容> 创建任务。';
  }

  const lines = [
    '📋 任务列表 (' + tasks.length + ' 项)',
    '───────────────────────────'
  ].concat(tasks.map(formatTaskLine));

  return lines.join('\n');
}

module.exports = { execute: execute, desc: desc };
