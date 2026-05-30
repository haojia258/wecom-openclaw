'use strict';

/**
 * artifact-workspace.js — /产物 / /产物列表 / /产物查看 command handler
 */
var workspace = require('../skills/artifact-workspace/artifact-workspace.js');

var desc = '产物管理: 列表/查看AI生成内容';

function execute(ctx, args) {
  args = (args || '').trim();
  var parts = args.split(/\s+/);
  var sub = parts[0];
  var rest = parts.slice(1).join(' ');

  if (!args || sub === '摘要' || sub === 'summary') {
    return workspace.formatSummary();
  }

  if (sub === '列表' || sub === 'list' || sub === 'l') {
    return workspace.formatTaskList();
  }

  if (sub === '搜索' || sub === 'search') {
    var results = workspace.searchArtifacts(rest);
    if (results.length === 0) return 'No artifacts found for: ' + rest;
    var lines = ['# Search: ' + rest, ''];
    results.forEach(function (r) {
      lines.push('- ' + r.taskId + '/' + r.filename);
    });
    return lines.join('\n');
  }

  // View specific task artifacts
  if (args.match(/^task-[a-z0-9]+-[a-z0-9]+$/)) {
    return workspace.formatTaskArtifacts(args);
  }

  return [
    '# /产物',
    '',
    'Usage:',
    '  /产物                     summary',
    '  /产物 列表                task list',
    '  /产物 task-xxx            view artifacts',
  ].join('\n');
}

module.exports = { execute: execute, desc: desc };
