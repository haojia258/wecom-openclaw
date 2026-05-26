'use strict';

/**
 * external-task-api.js - 外部任务 API (P8.0)
 *
 * 为 ChatGPT Bridge 提供任务生命周期管理：
 *   1. 创建任务 → SQLite task-store
 *   2. 写入 JSONL 审计日志
 *   3. 映射 ChatGPT user → WeCom 用户上下文
 *   4. 构建 RBAC 上下文
 *
 * 约束:
 *   - 不绕过现有权限系统
 *   - 所有任务必须带 source='chatgpt' 标记
 *   - task_id 格式: bridge_<timestamp>_<random>
 */

var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var taskStore = require('../orchestrator/v2/task-store');

// ─── 日志辅助 ────────────────────────────────────────────

function getLogDir() {
  return process.env.TASK_LOG_DIR || path.resolve(__dirname, '../../logs/tasks');
}

function ensureLogDir() {
  var dir = getLogDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getAuditLogPath() {
  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1).padStart(2, '0');
  var dd = String(today.getDate()).padStart(2, '0');
  return path.join(getLogDir(), 'bridge-' + yyyy + '-' + mm + '-' + dd + '.jsonl');
}

/**
 * 写入 Bridge 审计日志
 *
 * @param {object} entry
 */
function appendBridgeAudit(entry) {
  try {
    ensureLogDir();
    var filePath = getAuditLogPath();
    var line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(filePath, line, 'utf-8');
  } catch (e) {
    console.error('[BRIDGE-AUDIT] 写入审计日志失败: ' + e.message);
  }
}

// ─── task_id 生成 ────────────────────────────────────────

/**
 * 生成 ChatGPT Bridge 任务 ID
 * 格式: bridge_<timestamp>_<random8>
 *
 * @returns {string}
 */
function generateBridgeTaskId() {
  var ts = Date.now();
  var rand = crypto.randomBytes(4).toString('hex');
  return 'bridge_' + ts + '_' + rand;
}

// ─── 用户上下文映射 ──────────────────────────────────────

/**
 * 将 ChatGPT 用户映射为 WeCom 用户上下文
 *
 * @param {string} chatgptUser  - ChatGPT 侧用户标识
 * @param {string} wecomUserId  - 对应的企微用户 ID
 * @returns {object} 企微上下文 { fromUser, toUser, agentId }
 */
function mapUserContext(chatgptUser, wecomUserId) {
  return {
    fromUser: wecomUserId || chatgptUser,
    toUser: wecomUserId || chatgptUser,
    agentId: '1000006',
    source: 'chatgpt',
    chatgptUser: chatgptUser
  };
}

// ─── 任务创建 ────────────────────────────────────────────

/**
 * 在 SQLite task-store 中创建 ChatGPT Bridge 任务
 *
 * @param {object} params
 * @param {string} params.taskId        - 任务 ID
 * @param {string} params.user          - ChatGPT 用户
 * @param {string} params.command       - 原始命令
 * @param {string} params.mode          - plan-only / live
 * @param {string} params.source        - 来源 (chatgpt)
 * @param {object} [params.context]     - 额外上下文
 * @returns {object} 创建的 task 对象
 */
function createBridgeTask(params) {
  var taskId = params.taskId || generateBridgeTaskId();
  var user = params.user || 'unknown';
  var command = params.command || '';
  var mode = params.mode || 'plan-only';

  // 构建 content 描述
  var content = JSON.stringify({
    source: params.source || 'chatgpt',
    user: user,
    command: command,
    mode: mode,
    context: params.context || {}
  });

  try {
    var task = taskStore.createTask({
      taskId: taskId,
      type: 'bridge',
      agent: 'chatgpt-bridge',
      content: content,
      priority: mode === 'live' ? 'high' : 'normal'
    });

    // 写入审计日志
    appendBridgeAudit({
      event: 'task_created',
      taskId: taskId,
      user: user,
      command: command,
      mode: mode,
      status: 'CREATED',
      timestamp: new Date().toISOString()
    });

    return task;
  } catch (e) {
    // 写入失败审计日志
    appendBridgeAudit({
      event: 'task_create_failed',
      taskId: taskId,
      user: user,
      command: command,
      mode: mode,
      error: e.message,
      timestamp: new Date().toISOString()
    });
    throw e;
  }
}

/**
 * 更新任务状态
 *
 * @param {string} taskId  - 任务 ID
 * @param {object} updates - 更新字段
 */
function updateBridgeTask(taskId, updates) {
  try {
    if (taskStore.updateTask) {
      taskStore.updateTask(taskId, updates);
    }

    // 写入审计日志
    appendBridgeAudit({
      event: 'task_updated',
      taskId: taskId,
      updates: updates,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error('[BRIDGE] updateBridgeTask failed:', e.message);
  }
}

/**
 * 获取任务详情
 *
 * @param {string} taskId
 * @returns {object|null}
 */
function getBridgeTask(taskId) {
  try {
    return taskStore.getTask(taskId);
  } catch (e) {
    return null;
  }
}

// ─── RBAC 上下文构建 ─────────────────────────────────────

/**
 * 构建完整的 RBAC 检查上下文
 *
 * @param {string} userId      - 企微用户 ID
 * @param {string} command     - 原始命令
 * @returns {object} { userId, command, wecomContext }
 */
function buildRBACContext(userId, command) {
  return {
    userId: userId,
    command: command,
    timestamp: new Date().toISOString(),
    source: 'chatgpt-bridge'
  };
}

module.exports = {
  generateBridgeTaskId,
  mapUserContext,
  createBridgeTask,
  updateBridgeTask,
  getBridgeTask,
  buildRBACContext,
  appendBridgeAudit
};
