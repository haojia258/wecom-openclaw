'use strict';

/**
 * task-progress.js — P15.1 Task Progress Dashboard
 *
 * Computes progress based on task status and events timeline.
 * REVIEW_ONLY=true
 */

var fs = require('fs');
var path = require('path');

var TASKS_PATH = path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'tasks.jsonl');

var STATUS_PROGRESS = {
  'queued': 5,
  'planned': 20,
  'dispatched': 35,
  'artifact_received': 55,
  'review_pending': 65,
  'reviewing': 75,
  'approved': 90,
  'rejected': 100,
  'closed': 100,
  'cancelled': 100
};

var STEP_LABELS = {
  'queued': '排队等待',
  'planned': '已规划',
  'dispatched': '已派发',
  'artifact_received': '已接收产物',
  'review_pending': '等待审查',
  'reviewing': '审查中',
  'approved': '已批准',
  'rejected': '已拒绝',
  'closed': '已关闭',
  'cancelled': '已取消'
};

function loadTask(taskId) {
  if (!fs.existsSync(TASKS_PATH)) return null;
  var lines = fs.readFileSync(TASKS_PATH, 'utf-8').split('\n').filter(Boolean);
  for (var i = 0; i < lines.length; i++) {
    try {
      var t = JSON.parse(lines[i]);
      if (t.taskId === taskId) return t;
    } catch (e) {}
  }
  return null;
}

function computeProgress(task) {
  var status = task.status || 'queued';
  var base = STATUS_PROGRESS[status] || 0;

  // Adjust for terminal states
  if (status === 'closed' || status === 'cancelled') return 100;
  if (status === 'approved') return 95;
  if (status === 'rejected') return 100;

  // Fine-tuning: add progress for artifact count
  if (status === 'dispatched') {
    var elapsed = Date.now() - new Date(task.createdAt).getTime();
    if (elapsed > 600000) base = 40; // 10+ minutes
  }

  return base;
}

function getCurrentStep(task) {
  return STEP_LABELS[task.status] || task.status;
}

function getElapsed(task) {
  var created = new Date(task.createdAt).getTime();
  var diff = Date.now() - created;
  var mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + 'm';
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ' + (mins % 60) + 'm';
  return Math.floor(hours / 24) + 'd ' + (hours % 24) + 'h';
}

function getLastUpdate(task) {
  if (!task.events || task.events.length === 0) return task.createdAt;
  return task.events[task.events.length - 1].ts;
}

function getProgress(taskId) {
  var task = loadTask(taskId);
  if (!task) return null;

  var artifactDir = path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'artifacts', taskId);
  var artifactCount = 0;
  try { artifactCount = fs.readdirSync(artifactDir).length; } catch (e) {}

  return {
    taskId: task.taskId,
    status: task.status,
    assignee: task.assignee || 'unknown',
    startedAt: task.createdAt,
    elapsed: getElapsed(task),
    currentStep: getCurrentStep(task),
    progressPercent: computeProgress(task),
    artifactCount: artifactCount,
    lastUpdate: getLastUpdate(task)
  };
}

function formatProgress(progress) {
  var bar = '';
  var p = progress.progressPercent;
  var filled = Math.floor(p / 10);
  for (var i = 0; i < 10; i++) bar += i < filled ? '█' : '░';

  return [
    '# Task Progress: ' + progress.taskId,
    '',
    '`' + bar + '` ' + p + '%',
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| Status | ' + progress.status + ' |',
    '| Assignee | ' + (progress.assignee || '-') + ' |',
    '| Started | ' + (progress.startedAt || '-') + ' |',
    '| Elapsed | ' + (progress.elapsed || '-') + ' |',
    '| Step | ' + (progress.currentStep || '-') + ' |',
    '| Artifacts | ' + progress.artifactCount + ' |',
    '| Last Update | ' + (progress.lastUpdate || '-') + ' |',
    '',
    'REVIEW_ONLY: true'
  ].join('\n');
}

module.exports = {
  getProgress: getProgress,
  formatProgress: formatProgress,
  loadTask: loadTask,
  computeProgress: computeProgress
};
