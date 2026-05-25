'use strict';

/**
 * progress-reporter.js - 企微进度回传模块
 *
 * 本地模式下输出到 console + reporter.log
 * 生产模式 (WECOM 已配置) 下额外推送到企业微信群
 *
 * P6.4: 接入 wecom-sender，实现企业微信消息推送
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '../../logs/tasks');
const REPORTER_LOG = path.resolve(__dirname, '../../logs/reporter.log');

// ─── 延迟加载 wecom-sender（仅生产环境需要）───

let _wecomSender = null;
let _senderLoaded = false;

function getWecomSender() {
  if (_senderLoaded) return _wecomSender;
  _senderLoaded = true;
  try {
    _wecomSender = require('../scheduler/wecom-sender');
  } catch (e) {
    _wecomSender = null;
    logInternal('WECOM_SENDER_LOAD_FAILED', e.message);
  }
  return _wecomSender;
}

/**
 * 供测试注入 mock sender
 */
function setWecomSender(sender) {
  _wecomSender = sender;
  _senderLoaded = true;
}

// ─── 内部日志 ──────────────────────────────────────────────

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

function logInternal(tag, detail) {
  const msg = tag + (detail ? ' | ' + detail : '');
  log(msg);
}

// ─── WECOM 推送（优雅降级）────────────────────────────────

/**
 * 尝试推送消息到企业微信群
 * - WECOM 未配置：仅写 log，不抛异常
 * - 推送失败：写 log 记录错误，不抛异常
 *
 * @param {string} message - 消息内容
 */
function tryPushToWecom(message) {
  const sender = getWecomSender();
  if (!sender) {
    logInternal('PUSH_SKIPPED', 'wecom-sender 未加载');
    return;
  }

  try {
    const config = require('../lib/config');
    const wecom = config.WECOM;

    if (!wecom.CORP_ID || !wecom.SECRET) {
      logInternal('PUSH_SKIPPED', 'WECOM_CORP_ID 或 WECOM_SECRET 未配置');
      return;
    }

    const users = wecom.PUSH_USERS;
    if (!users || users.length === 0) {
      logInternal('PUSH_SKIPPED', 'PUSH_USERS 未配置');
      return;
    }

    // fire-and-forget: 异步推送，不阻塞主流程
    sender.sendToConfiguredUsers(message)
      .then(function (result) {
        if (result.success) {
          logInternal('PUSH_OK', 'sent=' + result.sent + '/' + result.total);
        } else {
          logInternal('PUSH_FAIL', JSON.stringify(result.errors || []));
        }
      })
      .catch(function (err) {
        logInternal('PUSH_ERROR', err.message);
      });
  } catch (e) {
    logInternal('PUSH_ERROR', e.message);
  }
}

// ─── 进度回报函数 ──────────────────────────────────────────

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
  tryPushToWecom(msg);
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
  tryPushToWecom(msg);
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
  tryPushToWecom(msg);
  return msg;
}

function reportProgressSummary(stats) {
  const progressPct = stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;

  // P6.6.2: 使用统一状态显示
  var planningDisplay = (stats.PLANNING && stats.PLANNING > 0) ? ' | 📋 规划中: ' + stats.PLANNING : '';
  var reviewingDisplay = (stats.REVIEWING && stats.REVIEWING > 0) ? ' | 🔍 审查中: ' + stats.REVIEWING : '';

  const msg = [
    '📊 进度报告',
    '进度: ' + progressPct + '% (' + stats.completed + '/' + stats.total + ')',
    '待处理: ' + stats.pending + ' | 进行中: ' + stats.RUNNING + planningDisplay + reviewingDisplay,
    '已完成: ' + stats.completed + ' | 阻断项: ' + stats.blocked + ' | 失败: ' + stats.failed
  ].join('\n');

  log('PROGRESS_SUMMARY | ' + progressPct + '% | ' + stats.completed + '/' + stats.total);
  tryPushToWecom(msg);
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
  tryPushToWecom(msg);
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
  tryPushToWecom(msg);
  return msg;
}

module.exports = {
  reportTaskCreated: reportTaskCreated,
  reportStatusChange: reportStatusChange,
  reportBlocker: reportBlocker,
  reportProgressSummary: reportProgressSummary,
  reportTaskCompleted: reportTaskCompleted,
  reportTaskFailed: reportTaskFailed,
  // 测试用
  tryPushToWecom: tryPushToWecom,
  setWecomSender: setWecomSender,
  _resetForTest: function () {
    _wecomSender = null;
    _senderLoaded = false;
  },
};
