'use strict';

/**
 * execution-audit-log.js - 执行审计日志 (P8.1)
 *
 * 记录所有受控执行操作的完整审计追踪。
 *
 * 日志格式: JSONL (每行一条 JSON 记录)
 * 日志路径: logs/execution-audit.log
 *
 * 记录字段:
 *   - task_id:        关联任务 ID
 *   - user:           发起用户
 *   - agent:          执行 Agent
 *   - command:        执行的命令
 *   - category:       命令分类
 *   - mode:           dry-run / live
 *   - human_confirm:  是否经过人工确认
 *   - timestamp:      ISO 8601 时间戳
 *   - result:         success / blocked / error
 *   - blocked_reason: 阻断原因（如果被拒绝）
 *   - duration_ms:    执行耗时（毫秒）
 *   - output_preview: 输出预览（前 200 字符）
 */

const fs = require('fs');
const path = require('path');

/**
 * 获取审计日志路径
 * 支持 EXECUTION_AUDIT_LOG_PATH env var 覆盖（用于测试隔离）
 *
 * @returns {string}
 */
function getAuditLogPath() {
  if (process.env.EXECUTION_AUDIT_LOG_PATH) {
    return process.env.EXECUTION_AUDIT_LOG_PATH;
  }
  return path.resolve(__dirname, '..', '..', 'logs', 'execution-audit.log');
}

/**
 * 确保日志目录存在
 *
 * @param {string} filePath - 日志文件完整路径
 */
function ensureLogDir(filePath) {
  var dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 写入一条审计日志
 *
 * @param {Object} entry
 * @param {string} entry.task_id        - 关联任务 ID
 * @param {string} entry.user           - 发起用户
 * @param {string} entry.agent          - 执行 Agent
 * @param {string} entry.command        - 执行的命令
 * @param {string} entry.category       - 命令分类
 * @param {string} entry.mode           - dry-run / live
 * @param {boolean} entry.human_confirm - 是否经过人工确认
 * @param {string} entry.result         - success / blocked / error
 * @param {string} [entry.blocked_reason] - 阻断原因
 * @param {number} [entry.duration_ms]  - 执行耗时
 * @param {string} [entry.output_preview] - 输出预览
 * @returns {boolean} 是否写入成功
 */
function writeAuditEntry(entry) {
  try {
    var logPath = getAuditLogPath();
    ensureLogDir(logPath);

    var record = {
      task_id: entry.task_id || 'unknown',
      user: entry.user || 'unknown',
      agent: entry.agent || 'unknown',
      command: entry.command || '',
      category: entry.category || 'unknown',
      mode: entry.mode || 'dry-run',
      human_confirm: !!entry.human_confirm,
      timestamp: new Date().toISOString(),
      result: entry.result || 'unknown',
      blocked_reason: entry.blocked_reason || null,
      duration_ms: typeof entry.duration_ms === 'number' ? entry.duration_ms : null,
      output_preview: entry.output_preview || null
    };

    fs.appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf-8');
    return true;
  } catch (err) {
    console.error('[execution-audit] 写入审计日志失败:', err.message);
    return false;
  }
}

/**
 * 写入一条阻断日志（便捷方法）
 *
 * @param {Object} params
 * @param {string} params.task_id
 * @param {string} params.user
 * @param {string} params.agent
 * @param {string} params.command
 * @param {string} params.category
 * @param {string} params.blocked_reason
 * @returns {boolean}
 */
function writeBlockedEntry(params) {
  return writeAuditEntry({
    task_id: params.task_id,
    user: params.user,
    agent: params.agent,
    command: params.command,
    category: params.category,
    mode: params.mode || 'dry-run',
    human_confirm: !!params.human_confirm,
    result: 'blocked',
    blocked_reason: params.blocked_reason
  });
}

/**
 * 写入一条成功日志（便捷方法）
 *
 * @param {Object} params
 * @param {string} params.task_id
 * @param {string} params.user
 * @param {string} params.agent
 * @param {string} params.command
 * @param {string} params.category
 * @param {string} params.mode
 * @param {boolean} params.human_confirm
 * @param {number} params.duration_ms
 * @param {string} [params.output_preview]
 * @returns {boolean}
 */
function writeSuccessEntry(params) {
  return writeAuditEntry({
    task_id: params.task_id,
    user: params.user,
    agent: params.agent,
    command: params.command,
    category: params.category,
    mode: params.mode,
    human_confirm: !!params.human_confirm,
    result: 'success',
    duration_ms: params.duration_ms,
    output_preview: params.output_preview
  });
}

/**
 * 写入一条错误日志（便捷方法）
 *
 * @param {Object} params
 * @param {string} params.task_id
 * @param {string} params.user
 * @param {string} params.agent
 * @param {string} params.command
 * @param {string} params.category
 * @param {string} params.mode
 * @param {boolean} params.human_confirm
 * @param {string} params.blocked_reason
 * @param {string} [params.output_preview]
 * @returns {boolean}
 */
function writeErrorEntry(params) {
  return writeAuditEntry({
    task_id: params.task_id,
    user: params.user,
    agent: params.agent,
    command: params.command,
    category: params.category,
    mode: params.mode,
    human_confirm: !!params.human_confirm,
    result: 'error',
    blocked_reason: params.blocked_reason,
    output_preview: params.output_preview
  });
}

/**
 * 读取最近的 N 条审计日志
 *
 * @param {number} [limit=50] - 读取条数
 * @returns {Array<Object>} 审计日志记录数组
 */
function readRecentEntries(limit) {
  limit = limit || 50;
  try {
    var logPath = getAuditLogPath();
    if (!fs.existsSync(logPath)) {
      return [];
    }

    var content = fs.readFileSync(logPath, 'utf-8');
    var lines = content.trim().split('\n').filter(function(l) { return l.trim(); });
    var entries = [];

    // 取最近 N 条
    var startIdx = Math.max(0, lines.length - limit);
    for (var i = startIdx; i < lines.length; i++) {
      try {
        entries.push(JSON.parse(lines[i]));
      } catch (_) {
        // 跳过损坏的行
      }
    }
    return entries;
  } catch (err) {
    console.error('[execution-audit] 读取审计日志失败:', err.message);
    return [];
  }
}

/**
 * 清除审计日志（用于测试清理）
 *
 * @returns {boolean}
 */
function clearAuditLog() {
  try {
    var logPath = getAuditLogPath();
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
    return true;
  } catch (err) {
    console.error('[execution-audit] 清除审计日志失败:', err.message);
    return false;
  }
}

/**
 * 检查审计日志文件是否存在并返回文件大小
 *
 * @returns {{ exists: boolean, size: number, path: string }}
 */
function getLogInfo() {
  var logPath = getAuditLogPath();
  var exists = fs.existsSync(logPath);
  var size = exists ? fs.statSync(logPath).size : 0;
  return { exists: exists, size: size, path: logPath };
}

module.exports = {
  writeAuditEntry,
  writeBlockedEntry,
  writeSuccessEntry,
  writeErrorEntry,
  readRecentEntries,
  clearAuditLog,
  getAuditLogPath,
  getLogInfo
};
