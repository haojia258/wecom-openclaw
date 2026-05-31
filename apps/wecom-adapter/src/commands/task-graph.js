'use strict';

/**
 * task-graph.js — /任务图 / /任务依赖 command handler
 */
var graph = require('../skills/task-graph/task-graph.js');

var desc = '任务图: 依赖关系/树形结构';

function execute(ctx, args) {
  args = (args || '').trim();

  if (!args || args === '树' || args === 'tree') {
    return graph.formatDependencyTree();
  }

  if (args === '列表' || args === 'list') {
    var tasks = graph.listTasks();
    if (tasks.length === 0) return 'No tasks in graph.';
    var lines = ['# Task Graph List', ''];
    tasks.forEach(function (t) {
      lines.push('- ' + t.name + ' (' + t.id + ') [' + t.status + '] depends=' +
        (t.dependsOn||[]).join(',') + ' children=' + (t.children||[]).join(','));
    });
    return lines.join('\n');
  }

  // dependency query for specific task
  return graph.formatDependencies(args);
}

module.exports = { execute: execute, desc: desc };
