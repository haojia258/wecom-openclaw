'use strict';

/**
 * task-maintenance.js — P15.0 僵尸任务清理
 *
 * 自动识别卡住的 AI 任务并标记为 cancelled。
 * REVIEW_ONLY — 不删除任务和 artifact。
 */

var fs = require('fs');
var path = require('path');

var ARTIFACT_ROOT = path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'artifacts');
var REPORT_PATH = path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'reports', 'task-maintenance-latest.md');

// ─── 僵尸检测规则 ──────────────────────────────────────────

var ZOMBIE_RULES = [
  { name: 'dispatched_over_30m',  status: 'dispatched',      maxAgeMs: 30 * 60 * 1000,   action: 'stale' },
  { name: 'queued_over_2h',       status: 'queued',          maxAgeMs: 2 * 60 * 60 * 1000, action: 'stale' },
  { name: 'planned_over_2h',      status: 'planned',         maxAgeMs: 2 * 60 * 60 * 1000, action: 'stale' },
  { name: 'review_pending_24h',   status: 'review_pending',  maxAgeMs: 24 * 60 * 60 * 1000, action: 'stale' },
  { name: 'dispatch_failed',      status: 'dispatch_failed', maxAgeMs: 15 * 60 * 1000,  action: 'cancelled' },
];

// ─── 扫描 ──────────────────────────────────────────────────

function scan() {
  var taskQueue = _getQueue();
  var now = Date.now();
  var zombies = [];
  var healthy = 0;

  var allTasks = taskQueue.getAll ? taskQueue.getAll() : [];
  if (!Array.isArray(allTasks) || allTasks.length === 0) {
    // Fallback: scan artifacts directory
    allTasks = _scanArtifacts();
  }

  allTasks.forEach(function (task) {
    var created = task.createdAt ? new Date(task.createdAt).getTime() : now;
    var updated = task.updatedAt ? new Date(task.updatedAt).getTime() : created;
    var age = now - updated;

    ZOMBIE_RULES.forEach(function (rule) {
      if (task.status === rule.status && age > rule.maxAgeMs) {
        zombies.push({
          taskId: task.taskId || task,
          status: task.status,
          age: Math.round(age / 60000) + 'm',
          rule: rule.name,
          action: rule.action,
        });
      }
    });
  });

  healthy = allTasks.length - zombies.length;

  return {
    scannedAt: new Date().toISOString(),
    total: allTasks.length,
    healthy: healthy,
    zombies: zombies,
    zombieCount: zombies.length,
  };
}

function _getQueue() {
  try { return require('./task-queue'); } catch (_) { return null; }
}

function _scanArtifacts() {
  var tasks = [];
  try {
    if (fs.existsSync(ARTIFACT_ROOT)) {
      fs.readdirSync(ARTIFACT_ROOT).filter(function(d) { return d.startsWith('task-'); }).forEach(function(taskId) {
        var stat = fs.statSync(path.join(ARTIFACT_ROOT, taskId));
        tasks.push({ taskId: taskId, status: 'dispatched', updatedAt: stat.mtime.toISOString() });
      });
    }
  } catch (_) {}
  return tasks;
}

// ─── 清理 ──────────────────────────────────────────────────

function clean() {
  var result = scan();
  var cancelled = [];

  if (result.zombies.length === 0) {
    return {
      result: result,
      cancelled: [],
      summary: '无僵尸任务',
      reportPath: null,
    };
  }

  var runtimeCore = null;
  try { runtimeCore = require('./runtime-core'); } catch (_) {}

  result.zombies.forEach(function (z) {
    if (z.action === 'cancelled' && runtimeCore) {
      try {
        runtimeCore.cancelTask(z.taskId);
        cancelled.push({ taskId: z.taskId, status: 'cancelled', rule: z.rule });
      } catch (_) {
        // Skip if cancel not allowed
      }
    }
  });

  // Generate report
  var report = generateReport(result, cancelled);
  try { fs.writeFileSync(REPORT_PATH, report, 'utf-8'); } catch (_) {}

  return {
    result: result,
    cancelled: cancelled,
    summary: cancelled.length + ' 个僵尸任务已取消, ' + (result.zombies.length - cancelled.length) + ' 个标记',
    reportPath: REPORT_PATH,
  };
}

// ─── 报告 ──────────────────────────────────────────────────

function generateReport(result, cancelled) {
  var lines = [];
  lines.push('# 任务维护报告');
  lines.push('');
  lines.push('扫描时间: ' + result.scannedAt.split('T')[0] + ' ' + result.scannedAt.split('T')[1].split('.')[0]);
  lines.push('总数: ' + result.total + ' | 健康: ' + result.healthy + ' | 僵尸: ' + result.zombieCount);
  lines.push('');

  if (result.zombies.length > 0) {
    lines.push('## 僵尸任务 (' + result.zombies.length + ')');
    lines.push('');
    lines.push('| Task ID | 状态 | 时长 | 操作 |');
    lines.push('|---------|------|------|------|');
    result.zombies.forEach(function (z) {
      var op = cancelled.some(function (c) { return c.taskId === z.taskId; }) ? 'cancelled' : 'stale';
      lines.push('| ' + z.taskId + ' | ' + z.status + ' | ' + z.age + ' | ' + op + ' |');
    });
  }

  if (cancelled.length > 0) {
    lines.push('');
    lines.push('## 已取消 (' + cancelled.length + ')');
    lines.push('');
    cancelled.forEach(function (c) { lines.push('- `' + c.taskId + '` — ' + c.rule); });
  }

  lines.push('');
  lines.push('⚠️ 未删除任何 artifact');

  return lines.join('\n');
}

// ─── 定时器 ────────────────────────────────────────────────

var _interval = null;

function startScheduler(intervalMs) {
  if (_interval) return false;
  _interval = setInterval(function () {
    clean();
  }, intervalMs || 3600000); // 默认每小时
  return true;
}

function stopScheduler() {
  if (_interval) { clearInterval(_interval); _interval = null; return true; }
  return false;
}

module.exports = {
  scan: scan,
  clean: clean,
  generateReport: generateReport,
  startScheduler: startScheduler,
  stopScheduler: stopScheduler,
  ZOMBIE_RULES: ZOMBIE_RULES,
};
