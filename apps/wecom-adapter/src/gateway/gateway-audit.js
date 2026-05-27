'use strict';

/**
 * gateway-audit.js - Gateway 审计日志 (P8.0.3)
 *
 * 写入 Gateway 层审计日志（独立于 execution-audit-log.js）。
 * 支持 correlation ID 串联全链路，不保存真实 token（脱敏）。
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

// ─── 配置 ─────────────────────────────────────────────────

var AUDIT_LOG_PATH = process.env.GATEWAY_AUDIT_LOG_PATH || 'logs/gateway-audit.log';

// ─── UUID 生成 ───────────────────────────────────────────

/**
 * 生成 UUID v4
 * @returns {string}
 */
function uuidv4() {
  var bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  var hex = bytes.toString('hex');
  return [
    hex.substr(0, 8),
    hex.substr(8, 4),
    hex.substr(12, 4),
    hex.substr(16, 4),
    hex.substr(20, 12)
  ].join('-');
}

// ─── Correlation ID ──────────────────────────────────────

/**
 * 生成 correlation ID 用于全链路追踪
 * @returns {string}
 */
function generateCorrelationId() {
  return 'gw_' + uuidv4();
}

// ─── Token 脱敏 ──────────────────────────────────────────

/**
 * 从 token 中提取脱敏前缀（用于审计日志）
 * 只保留前 4 个字符 + "..."，不记录完整 token
 *
 * @param {string} token
 * @returns {string}
 */
function sanitizeToken(token) {
  if (!token || typeof token !== 'string' || token.length < 4) {
    return 'unknown';
  }
  return token.substring(0, 4) + '...';
}

// ─── 日志写入 ────────────────────────────────────────────

/**
 * 写入 Gateway 审计条目
 *
 * @param {object} entry
 * @param {string} entry.requestId      - 请求 ID
 * @param {string} entry.correlationId  - 关联 ID
 * @param {string} entry.sourceIP       - 来源 IP
 * @param {string} entry.user           - 用户标识
 * @param {string} entry.command        - 命令
 * @param {string} entry.mode           - 模式
 * @param {string} entry.tokenPrefix    - token 脱敏前缀
 * @param {string} entry.result         - allowed / blocked / error
 * @param {string} [entry.blockedReason] - 阻断原因
 * @param {number} [entry.durationMs]   - 处理耗时 ms
 * @param {string} [entry.taskId]       - 任务 ID
 */
function writeGatewayAuditEntry(entry) {
  var line = JSON.stringify({
    requestId: entry.requestId || uuidv4(),
    correlationId: entry.correlationId || '',
    timestamp: new Date().toISOString(),
    sourceIP: entry.sourceIP || 'unknown',
    user: entry.user || 'unknown',
    command: entry.command || '',
    mode: entry.mode || 'plan-only',
    tokenPrefix: sanitizeToken(entry.tokenPrefix),
    result: entry.result || 'unknown',
    blockedReason: entry.blockedReason || null,
    durationMs: typeof entry.durationMs === 'number' ? entry.durationMs : null,
    taskId: entry.taskId || null
  }) + '\n';

  try {
    var dir = path.dirname(AUDIT_LOG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(AUDIT_LOG_PATH, line, 'utf-8');
  } catch (e) {
    console.error('[GATEWAY-AUDIT] 写入审计日志失败: ' + e.message);
  }
}

/**
 * 写入被阻断请求的审计条目
 *
 * @param {object} params
 * @param {string} params.requestId
 * @param {string} params.correlationId
 * @param {string} params.sourceIP
 * @param {string} params.user
 * @param {string} params.command
 * @param {string} params.mode
 * @param {string} params.tokenPrefix
 * @param {string} params.blockedReason
 */
function writeBlockedEntry(params) {
  writeGatewayAuditEntry({
    requestId: params.requestId,
    correlationId: params.correlationId,
    sourceIP: params.sourceIP,
    user: params.user,
    command: params.command,
    mode: params.mode,
    tokenPrefix: params.tokenPrefix,
    result: 'blocked',
    blockedReason: params.blockedReason
  });
}

/**
 * 写入成功请求的审计条目
 *
 * @param {object} params
 * @param {string} params.requestId
 * @param {string} params.correlationId
 * @param {string} params.sourceIP
 * @param {string} params.user
 * @param {string} params.command
 * @param {string} params.mode
 * @param {string} params.tokenPrefix
 * @param {number} params.durationMs
 * @param {string} [params.taskId]
 */
function writeSuccessEntry(params) {
  writeGatewayAuditEntry({
    requestId: params.requestId,
    correlationId: params.correlationId,
    sourceIP: params.sourceIP,
    user: params.user,
    command: params.command,
    mode: params.mode,
    tokenPrefix: params.tokenPrefix,
    result: 'allowed',
    durationMs: params.durationMs,
    taskId: params.taskId
  });
}

/**
 * 读取最近 N 条审计日志
 *
 * @param {number} [count=10]
 * @returns {Array<object>}
 */
function readRecentEntries(count) {
  count = count || 10;
  var entries = [];
  try {
    if (fs.existsSync(AUDIT_LOG_PATH)) {
      var lines = fs.readFileSync(AUDIT_LOG_PATH, 'utf-8').trim().split('\n').filter(Boolean);
      var start = Math.max(0, lines.length - count);
      for (var i = start; i < lines.length; i++) {
        try {
          entries.push(JSON.parse(lines[i]));
        } catch (_) {
          // 跳过无效行
        }
      }
    }
  } catch (e) {
    console.error('[GATEWAY-AUDIT] 读取审计日志失败: ' + e.message);
  }
  return entries;
}

/**
 * 获取审计日志路径
 * @returns {string}
 */
function getAuditLogPath() {
  return AUDIT_LOG_PATH;
}

module.exports = {
  uuidv4,
  generateCorrelationId,
  sanitizeToken,
  writeGatewayAuditEntry,
  writeBlockedEntry,
  writeSuccessEntry,
  readRecentEntries,
  getAuditLogPath
};
