'use strict';

/**
 * progress-reporter.js - 企微进度回传模块
 *
 * Mock 模式下输出到 console + 日志
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '../../logs/tasks');
const REPORTER_LOG = path.resolve(__dirname, '../../logs/reporter.log');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function log(message) {
  ensureLogDir();
  const timestamp = new Date().toISOString();
  const line = '[' + timestamp + '] ' + message + '\n';
  fs.appendFileSync(REPORTER_LOG, line, 'utf-8');
  console.log('[ProgressReporter] ' + message);
}

function reportTaskCreated(task) {
  const msg = [
    '📝 新任务已创建',
    'Task ID: ' + task.task_id,
    'Agent: ' + task.agent,
    '内容: ' + task.content,
    '状态: ' + task.status,
    '创建时间: ' + task.created_at
  ].join('\n');

  log('TASK_CREATED | ' + task.task_id + ' | ' + task.agent);
  return msg;
}

function reportStatusChange(task, oldStatus) {
  const msg = [
    '🔄 任务状态变更',
    'Task ID: ' + task.task_id,
    '状态: ' + oldStatus + ' → ' + task.status,
    '更新时间: ' + task.updated_at
  ].join('\n');

  log('STATUS_CHANGE | ' + task.task_id + ' | ' + oldStatus + ' → ' + task.status);
  return msg;
}

function reportBlocker(task, reason) {
  const msg = [
    '🚫 阻断项通知',
    'Task ID: ' + task.task_id,
    'Agent: ' + task.agent,
    '原因: ' + reason,
    '时间: ' + new Date().toISOString()
  ].join('\n');

  log('BLOCKER | ' + task.task_id + ' | ' + reason);
  return msg;
}

function reportProgressSummary(stats) {
  const progressPct = stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;

  const msg = [
    '📊 进度报告',
    '进度: ' + progressPct + '% (' + stats.completed + '/' + stats.total + ')',
    '待处理: ' + stats.pending + ' | 进行中: ' + stats.in_progress,
    '已完成: ' + stats.completed + ' | 阻断项: ' + stats.blocked + ' | 失败: ' + stats.failed
  ].join('\n');

  log('PROGRESS_SUMMARY | ' + progressPct + '% | ' + stats.completed + '/' + stats.total);
  return msg;
}

function reportTaskCompleted(task) {
  const msg = [
    '✅ 任务已完成',
    'Task ID: ' + task.task_id,
    'Agent: ' + task.agent,
    '完成时间: ' + task.updated_at
  ].join('\n');

  log('TASK_COMPLETED | ' + task.task_id + ' | ' + task.agent);
  return msg;
}

function reportTaskFailed(task, error) {
  const msg = [
    '❌ 任务失败',
    'Task ID: ' + task.task_id,
    'Agent: ' + task.agent,
    '错误: ' + error,
    '时间: ' + new Date().toISOString()
  ].join('\n');

  log('TASK_FAILED | ' + task.task_id + ' | ' + error);
  return msg;
}

module.exports = {
  reportTaskCreated: reportTaskCreated,
  reportStatusChange: reportStatusChange,
  reportBlocker: reportBlocker,
  reportProgressSummary: reportProgressSummary,
  reportTaskCompleted: reportTaskCompleted,
  reportTaskFailed: reportTaskFailed
};
