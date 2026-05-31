'use strict';

/**
 * failure-memory.js — 故障记忆存储 (P9.1)
 *
 * JSONL 格式持久化故障记录，支持故障趋势分析和模式识别。
 *
 * 日志路径: logs/runtime/failure-memory.jsonl
 *
 * 记录字段:
 *   - correlationId  关联 ID
 *   - executor       执行器名称
 *   - failureType    故障类型 (ResultType)
 *   - retryCount     重试次数
 *   - recoveryPlan   恢复计划 ID
 *   - error          错误消息摘要
 *   - protocol       执行协议
 *   - timestamp      ISO 8601 时间戳
 *   - resolved       是否已解决
 */

var fs = require('fs');
var path = require('path');

// ─── 日志路径 ────────────────────────────────────────────────

/**
 * 获取故障记忆日志路径
 * 支持 FAILURE_MEMORY_LOG_PATH env var 覆盖（用于测试隔离）
 *
 * @returns {string}
 */
function getFailureMemoryPath() {
  if (process.env.FAILURE_MEMORY_LOG_PATH) {
    return process.env.FAILURE_MEMORY_LOG_PATH;
  }
  return path.resolve(__dirname, '..', '..', 'logs', 'runtime', 'failure-memory.jsonl');
}

/**
 * 确保日志目录存在
 */
function ensureLogDir(filePath) {
  var dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─── 写入 API ────────────────────────────────────────────────

/**
 * 记录一条故障记忆
 *
 * @param {Object} entry
 * @param {string} entry.correlationId  - 关联 ID
 * @param {string} entry.executor       - 执行器名称
 * @param {string} entry.failureType    - 故障类型 (ResultType)
 * @param {number} entry.retryCount     - 重试次数
 * @param {string} [entry.recoveryPlan] - 恢复计划 ID (correlationId)
 * @param {string} [entry.error]        - 错误消息
 * @param {string} [entry.protocol]     - 执行协议
 * @param {boolean} [entry.resolved]    - 是否已解决
 * @param {Object} [entry.metadata]     - 额外元数据
 * @returns {boolean} 是否写入成功
 */
function recordFailure(entry) {
  try {
    var logPath = getFailureMemoryPath();
    ensureLogDir(logPath);

    var record = {
      correlationId: entry.correlationId || ('corr_' + Date.now()),
      executor: entry.executor || 'unknown',
      failureType: entry.failureType || 'UNKNOWN',
      retryCount: typeof entry.retryCount === 'number' ? entry.retryCount : 0,
      recoveryPlan: entry.recoveryPlan || null,
      error: (entry.error || '').substring(0, 500),
      protocol: entry.protocol || 'generic',
      resolved: entry.resolved === true,
      timestamp: new Date().toISOString(),
      metadata: entry.metadata || {}
    };

    fs.appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf-8');
    return true;
  } catch (err) {
    console.error('[failure-memory] 写入故障记忆失败:', err.message);
    return false;
  }
}

/**
 * 记录执行失败（含重试信息）
 *
 * @param {Object} params
 * @param {string} params.correlationId
 * @param {string} params.executor
 * @param {string} params.failureType
 * @param {number} params.attempt       - 当前重试次数
 * @param {string} params.error
 * @param {string} params.protocol
 * @returns {boolean}
 */
function recordRetryAttempt(params) {
  return recordFailure({
    correlationId: params.correlationId,
    executor: params.executor,
    failureType: params.failureType,
    retryCount: params.attempt,
    error: params.error,
    protocol: params.protocol,
    resolved: false,
    metadata: { phase: 'retry' }
  });
}

/**
 * 记录重试完成
 *
 * @param {Object} params
 * @param {string} params.correlationId
 * @param {string} params.executor
 * @param {string} params.failureType
 * @param {number} params.totalRetries  - 总重试次数
 * @param {boolean} params.resolved     - 是否最终解决
 * @returns {boolean}
 */
function recordRetryComplete(params) {
  return recordFailure({
    correlationId: params.correlationId,
    executor: params.executor,
    failureType: params.failureType,
    retryCount: params.totalRetries,
    error: params.resolved ? 'retry succeeded' : 'retry exhausted',
    protocol: params.protocol || 'generic',
    resolved: params.resolved,
    metadata: { phase: 'retry_complete' }
  });
}

/**
 * 记录恢复计划执行
 *
 * @param {Object} params
 * @param {string} params.correlationId
 * @param {string} params.executor
 * @param {string} params.failureType
 * @param {string} params.recoveryPlan  - 恢复计划 ID
 * @returns {boolean}
 */
function recordRecoveryStart(params) {
  return recordFailure({
    correlationId: params.correlationId,
    executor: params.executor,
    failureType: params.failureType,
    retryCount: params.totalRetries || 0,
    recoveryPlan: params.recoveryPlan,
    error: 'recovery plan started',
    protocol: params.protocol || 'generic',
    resolved: false,
    metadata: { phase: 'recovery_start' }
  });
}

/**
 * 记录恢复完成
 *
 * @param {Object} params
 * @param {string} params.correlationId
 * @param {string} params.executor
 * @param {boolean} params.recovered     - 是否恢复成功
 * @returns {boolean}
 */
function recordRecoveryComplete(params) {
  return recordFailure({
    correlationId: params.correlationId,
    executor: params.executor,
    failureType: params.failureType || 'UNKNOWN',
    retryCount: params.totalRetries || 0,
    error: params.recovered ? 'recovery succeeded' : 'recovery failed',
    protocol: params.protocol || 'generic',
    resolved: params.recovered,
    metadata: { phase: 'recovery_complete' }
  });
}

// ─── 读取 API ────────────────────────────────────────────────

/**
 * 读取最近的 N 条故障记忆
 *
 * @param {number} [limit=50]
 * @returns {Array<Object>}
 */
function readRecentFailures(limit) {
  limit = limit || 50;
  try {
    var logPath = getFailureMemoryPath();
    if (!fs.existsSync(logPath)) {
      return [];
    }

    var content = fs.readFileSync(logPath, 'utf-8');
    var lines = content.trim().split('\n').filter(function(l) { return l.trim(); });
    var entries = [];

    var startIdx = Math.max(0, lines.length - limit);
    for (var i = startIdx; i < lines.length; i++) {
      try {
        entries.push(JSON.parse(lines[i]));
      } catch (_) {
        // 跳过损坏行
      }
    }
    return entries;
  } catch (err) {
    console.error('[failure-memory] 读取故障记忆失败:', err.message);
    return [];
  }
}

/**
 * 按 correlationId 查询故障记忆
 *
 * @param {string} correlationId
 * @returns {Array<Object>}
 */
function queryByCorrelationId(correlationId) {
  var all = readRecentFailures(1000);
  return all.filter(function(entry) {
    return entry.correlationId === correlationId;
  });
}

/**
 * 按执行器查询故障记忆
 *
 * @param {string} executor
 * @param {number} [limit=50]
 * @returns {Array<Object>}
 */
function queryByExecutor(executor, limit) {
  var all = readRecentFailures(limit || 100);
  return all.filter(function(entry) {
    return entry.executor === executor;
  });
}

/**
 * 统计故障类型分布
 *
 * @returns {Object} { failureType: count, ... }
 */
function getFailureStats() {
  var all = readRecentFailures(200);
  var stats = {};

  for (var i = 0; i < all.length; i++) {
    var entry = all[i];
    var type = entry.failureType || 'UNKNOWN';
    stats[type] = (stats[type] || 0) + 1;
  }

  return stats;
}

// ─── 维护 API ────────────────────────────────────────────────

/**
 * 清除故障记忆日志（测试用）
 *
 * @returns {boolean}
 */
function clearFailureMemory() {
  try {
    var logPath = getFailureMemoryPath();
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
    return true;
  } catch (err) {
    console.error('[failure-memory] 清除故障记忆失败:', err.message);
    return false;
  }
}

/**
 * 获取日志文件信息
 *
 * @returns {{ exists: boolean, size: number, path: string }}
 */
function getFailureMemoryInfo() {
  var logPath = getFailureMemoryPath();
  var exists = fs.existsSync(logPath);
  var size = exists ? fs.statSync(logPath).size : 0;
  return { exists: exists, size: size, path: logPath };
}

// ─── 导出 ────────────────────────────────────────────────────

module.exports = {
  // 写入
  recordFailure: recordFailure,
  recordRetryAttempt: recordRetryAttempt,
  recordRetryComplete: recordRetryComplete,
  recordRecoveryStart: recordRecoveryStart,
  recordRecoveryComplete: recordRecoveryComplete,

  // 读取
  readRecentFailures: readRecentFailures,
  queryByCorrelationId: queryByCorrelationId,
  queryByExecutor: queryByExecutor,
  getFailureStats: getFailureStats,

  // 维护
  clearFailureMemory: clearFailureMemory,
  getFailureMemoryInfo: getFailureMemoryInfo,
  getFailureMemoryPath: getFailureMemoryPath
};
