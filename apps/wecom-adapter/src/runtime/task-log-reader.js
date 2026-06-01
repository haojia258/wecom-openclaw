'use strict';

/**
 * task-log-reader.js — P15.1 Task Log Reader
 *
 * Reads event timeline from tasks.jsonl and audit logs.
 * REVIEW_ONLY=true
 */

var fs = require('fs');
var path = require('path');

var TASKS_PATH = path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'tasks.jsonl');
var AUDIT_PATH = path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'audit');
var STORAGE_DIR = path.join(__dirname, '..', '..', 'storage', 'orchestrator');

var EVENT_LABELS = {
  'status_change': '状态变更',
  'task_created': '任务创建',
  'planned': '已规划',
  'dispatched': '已派发',
  'worker_started': 'Worker 启动',
  'artifact_uploaded': '产物上传',
  'review_started': '审查开始',
  'approved': '已批准',
  'rejected': '已拒绝',
  'closed': '已关闭',
  'cancelled': '已取消'
};

function getTaskLog(taskId, limit) {
  limit = limit || 100;
  var lines = [];

  // 1. Task events from tasks.jsonl
  if (fs.existsSync(TASKS_PATH)) {
    var content = fs.readFileSync(TASKS_PATH, 'utf-8');
    var entries = content.split('\n').filter(Boolean);
    for (var i = 0; i < entries.length; i++) {
      try {
        var t = JSON.parse(entries[i]);
        if (t.taskId === taskId) {
          lines.push({
            time: t.createdAt,
            event: 'task_created',
            detail: 'Task created: ' + (t.userRequest || '').substring(0, 60)
          });

          if (t.events) {
            t.events.forEach(function (e) {
              lines.push({
                time: e.ts || e.time || '',
                event: e.type || 'status_change',
                detail: (e.to ? '→ ' + e.to : '') + (e.from ? ' (from ' + e.from + ')' : '')
              });
            });
          }
          break;
        }
      } catch (e) {}
    }
  }

  // 2. Audit logs
  try {
    var auditFile = path.join(AUDIT_PATH, 'multi-agent-runtime.jsonl');
    if (fs.existsSync(auditFile)) {
      var auditContent = fs.readFileSync(auditFile, 'utf-8');
      auditContent.split('\n').filter(Boolean).forEach(function (line) {
        try {
          var a = JSON.parse(line);
          if (a.taskId === taskId || (a.detail && a.detail.taskId === taskId)) {
            lines.push({
              time: a.timestamp || a.time || '',
              event: a.action || 'audit',
              detail: a.detail ? JSON.stringify(a.detail).substring(0, 80) : ''
            });
          }
        } catch (e) {}
      });
    }
  } catch (e) {}

  // 3. Today's audit if exists
  try {
    var today = new Date().toISOString().substring(0, 10);
    var dailyAudit = path.join(STORAGE_DIR, 'audit-' + today + '.jsonl');
    if (fs.existsSync(dailyAudit)) {
      var daLines = fs.readFileSync(dailyAudit, 'utf-8').split('\n').filter(Boolean);
      daLines.forEach(function (line) {
        try {
          var a = JSON.parse(line);
          if (a.taskId === taskId || (a.detail && a.detail.taskId === taskId)) {
            lines.push({
              time: a.timestamp || '',
              event: a.action || 'audit',
              detail: JSON.stringify(a.detail || a).substring(0, 80)
            });
          }
        } catch (e) {}
      });
    }
  } catch (e) {}

  lines.sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); });

  if (lines.length > limit) lines = lines.slice(0, limit);

  return lines;
}

function formatLog(taskId, limit) {
  var logs = getTaskLog(taskId, limit);

  if (logs.length === 0) {
    return '# Task Log: ' + taskId + '\n\nNo log entries found.\n\nREVIEW_ONLY: true';
  }

  var lines = ['# Task Log: ' + taskId, '', 'REVIEW_ONLY=true', ''];
  lines.push('| # | Time | Event | Detail |');
  lines.push('|---|------|-------|--------|');

  logs.forEach(function (l, i) {
    var time = (l.time || '').substring(0, 19).replace('T', ' ');
    var event = (EVENT_LABELS[l.event] || l.event);
    var detail = (l.detail || '').substring(0, 60);
    lines.push('| ' + (i + 1) + ' | ' + time + ' | ' + event + ' | ' + detail + ' |');
  });

  lines.push('');
  lines.push('Total entries: ' + logs.length + ' (max ' + limit + ')');
  lines.push('');
  lines.push('REVIEW_ONLY: true');

  return lines.join('\n');
}

module.exports = {
  getTaskLog: getTaskLog,
  formatLog: formatLog
};
