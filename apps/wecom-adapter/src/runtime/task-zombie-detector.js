'use strict';

/**
 * task-zombie-detector.js — P15.1 Task Zombie Detector
 *
 * Identifies stale/trapped tasks by status age thresholds.
 * REVIEW_ONLY=true
 */

var fs = require('fs');
var path = require('path');

var TASKS_PATH = path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'tasks.jsonl');

var ZOMBIE_RULES = [
  { status: 'queued', maxAgeMs: 2 * 3600000, label: '排队超过2小时' },
  { status: 'planned', maxAgeMs: 2 * 3600000, label: '规划超过2小时' },
  { status: 'dispatched', maxAgeMs: 30 * 60000, label: '已派发超过30分钟无产物' },
  { status: 'review_pending', maxAgeMs: 24 * 3600000, label: '等待审查超过24小时' }
];

function loadAllTasks() {
  if (!fs.existsSync(TASKS_PATH)) return [];
  var content = fs.readFileSync(TASKS_PATH, 'utf-8');
  return content.split('\n').filter(Boolean).map(function (line) {
    try { return JSON.parse(line); } catch (e) { return null; }
  }).filter(Boolean);
}

function detectZombies() {
  var tasks = loadAllTasks();
  var zombies = [];
  var now = Date.now();

  tasks.forEach(function (task) {
    var rule = ZOMBIE_RULES.find(function (r) { return r.status === task.status; });
    if (!rule) return;

    var age = now - new Date(task.createdAt).getTime();
    if (age > rule.maxAgeMs) {
      zombies.push({
        taskId: task.taskId,
        status: task.status,
        assignee: task.assignee || 'unknown',
        age: formatAge(age),
        ageMs: age,
        createdAt: task.createdAt,
        reason: rule.label,
        userRequest: (task.userRequest || '').substring(0, 80)
      });
    }
  });

  return zombies;
}

function formatAge(ms) {
  var mins = Math.floor(ms / 60000);
  if (mins < 60) return mins + '分钟';
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + '小时 ' + (mins % 60) + '分钟';
  return Math.floor(hours / 24) + '天 ' + (hours % 24) + '小时';
}

function formatZombies() {
  var zombies = detectZombies();

  if (zombies.length === 0) {
    return '# Zombie Tasks\n\n✅ No zombie tasks detected.\n\nREVIEW_ONLY: true';
  }

  var lines = ['# Zombie Tasks', '', '⚠️  ' + zombies.length + ' zombie task(s) detected', '', 'REVIEW_ONLY=true', ''];
  lines.push('| # | Task ID | Status | Age | Assignee | Reason |');
  lines.push('|---|---------|--------|-----|----------|--------|');

  zombies.forEach(function (z, i) {
    lines.push('| ' + (i + 1) + ' | ' + z.taskId + ' | ' + z.status + ' | ' + z.age + ' | ' + (z.assignee || '-') + ' | ' + z.reason + ' |');
  });

  lines.push('');
  lines.push('## Actions');
  lines.push('');
  zombies.forEach(function (z) {
    lines.push('- `/ai任务 取消 ' + z.taskId + '` — 取消并保留 artifact');
    lines.push('- `/ai任务 关闭 ' + z.taskId + '` — 关闭任务');
  });

  lines.push('');
  lines.push('REVIEW_ONLY: true');
  return lines.join('\n');
}

module.exports = {
  detectZombies: detectZombies,
  formatZombies: formatZombies,
  ZOMBIE_RULES: ZOMBIE_RULES
};
