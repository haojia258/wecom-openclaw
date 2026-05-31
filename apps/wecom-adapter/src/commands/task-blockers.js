'use strict';

/**
 * task-blockers.js - /阻断项 命令处理器
 */
const { getBlockers } = require('../orchestrator/v2/task-store');

const desc = '查看阻断任务 /阻断项';

function formatTaskLine(task) {
  const icon = '🚫';
  return icon + ' [' + task.task_id + '] ' + task.agent + ' | ' + task.status + ' | ' + new Date(task.updated_at).toLocaleTimeString('zh-CN');
}

function execute(ctx, args) {
  const blockers = getBlockers();

  if (blockers.length === 0) {
    return '✅ 当前无阻断项。所有任务正常运行中。';
  }

  const lines = [
    '🚫 阻断项 (' + blockers.length + ' 项)',
    '───────────────────────────'
  ].concat(blockers.map(formatTaskLine));

  lines.push('');
  lines.push('阻断项无法自动推进，需人工介入处理。');

  return lines.join('\n');
}

module.exports = { execute: execute, desc: desc };
