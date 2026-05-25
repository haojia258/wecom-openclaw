'use strict';

/**
 * task-store.js - 任务持久化层 (v2)
 *
 * JSONL 格式存储到 logs/tasks/YYYY-MM-DD.jsonl
 */

const fs = require('fs');
const path = require('path');

// 日志目录: apps/wecom-adapter/logs/tasks/
const LOG_DIR = path.resolve(__dirname, '../../../logs/tasks');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogFilePath() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return path.join(LOG_DIR, yyyy + '-' + mm + '-' + dd + '.jsonl');
}

function appendJSONL(record) {
  ensureLogDir();
  const filePath = getLogFilePath();
  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(filePath, line, 'utf-8');
}

function readTodayLogs() {
  ensureLogDir();
  const filePath = getLogFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .trim()
    .split('\n')
    .filter(function(line) { return line.trim(); })
    .map(function(line) {
      try { return JSON.parse(line); }
      catch (_) { return null; }
    })
    .filter(Boolean);
}

function createTask(params) {
  const taskId = params.taskId;
  const type = params.type || 'general';
  const agent = params.agent || 'unknown';
  const content = params.content || '';

  const task = {
    task_id: taskId,
    type: type,
    agent: agent,
    content: content,
    status: 'pending',
    result: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  appendJSONL(task);
  return task;
}

function updateTask(taskId, updates) {
  updates = updates || {};
  const tasks = readTodayLogs();
  const idx = tasks.findIndex(function(t) { return t.task_id === taskId; });

  if (idx === -1) {
    return null;
  }

  const updated = Object.assign({}, tasks[idx], updates, {
    updated_at: new Date().toISOString()
  });

  const filePath = getLogFilePath();
  fs.writeFileSync(filePath, '', 'utf-8');
  for (let i = 0; i < tasks.length; i++) {
    const record = (tasks[i].task_id === taskId) ? updated : tasks[i];
    appendJSONL(record);
  }

  return updated;
}

function getTask(taskId) {
  const tasks = readTodayLogs();
  return tasks.find(function(t) { return t.task_id === taskId; }) || null;
}

function listTasks(filter) {
  filter = filter || {};
  let tasks = readTodayLogs();

  if (filter.status) {
    tasks = tasks.filter(function(t) { return t.status === filter.status; });
  }

  if (filter.agent) {
    tasks = tasks.filter(function(t) { return t.agent === filter.agent; });
  }

  return tasks;
}

function getBlockers() {
  return listTasks({ status: 'blocked' });
}

function getStats() {
  const tasks = readTodayLogs();
  const total = tasks.length;
  const byStatus = {};

  for (let i = 0; i < tasks.length; i++) {
    const s = tasks[i].status;
    byStatus[s] = (byStatus[s] || 0) + 1;
  }

  return {
    total: total,
    pending: byStatus['pending'] || 0,
    in_progress: byStatus['in_progress'] || 0,
    completed: byStatus['completed'] || 0,
    blocked: byStatus['blocked'] || 0,
    failed: byStatus['failed'] || 0
  };
}

module.exports = {
  createTask: createTask,
  updateTask: updateTask,
  getTask: getTask,
  listTasks: listTasks,
  getBlockers: getBlockers,
  getStats: getStats
};
