'use strict';

/**
 * memory-reader.js — Shared Memory Runtime Reader (P9.2)
 *
 * JSONL 读取层，提供按类型/关联ID/时间范围查询能力。
 *
 * 默认 limit=20, sort desc (最近优先)。
 */

var fs = require('fs');
var path = require('path');

// ─── 路径配置 ────────────────────────────────────────────────

var LOG_DIR = process.env.MEMORY_RUNTIME_LOG_DIR
  || path.resolve(__dirname, '..', '..', 'logs', 'memory-runtime');

var LOG_PATHS = {
  memory:    path.join(LOG_DIR, 'memory.jsonl'),
  incidents: path.join(LOG_DIR, 'incidents.jsonl'),
  recoveries: path.join(LOG_DIR, 'recoveries.jsonl'),
  strategies: path.join(LOG_DIR, 'strategies.jsonl')
};

function getLogPath(type) {
  var envKey = 'MEMORY_RUNTIME_' + type.toUpperCase() + '_PATH';
  if (process.env[envKey]) {
    return process.env[envKey];
  }
  return LOG_PATHS[type] || LOG_PATHS.memory;
}

// ─── 内部工具 ────────────────────────────────────────────────

/**
 * 读取并解析 JSONL 文件
 *
 * @param {string} type
 * @returns {Array<Object>}
 */
function _readAll(type) {
  try {
    var logPath = getLogPath(type);
    if (!fs.existsSync(logPath)) {
      return [];
    }
    var content = fs.readFileSync(logPath, 'utf-8');
    var lines = content.trim().split('\n').filter(function(l) { return l.trim(); });
    var entries = [];
    for (var i = 0; i < lines.length; i++) {
      try {
        entries.push(JSON.parse(lines[i]));
      } catch (_) {
        // 跳过损坏行
      }
    }
    return entries;
  } catch (err) {
    console.error('[memory-reader] 读取 ' + type + ' 失败:', err.message);
    return [];
  }
}

/**
 * 筛选 + 排序 + 截断
 *
 * @param {Array<Object>} entries
 * @param {Function} [filterFn]
 * @param {number} [limit=20]
 * @returns {Array<Object>}
 */
function _filterSortLimit(entries, filterFn, limit) {
  limit = limit || 20;
  var filtered = filterFn ? entries.filter(filterFn) : entries;
  // sort desc by timestamp
  filtered.sort(function(a, b) {
    var ta = a.timestamp || '';
    var tb = b.timestamp || '';
    if (ta > tb) return -1;
    if (ta < tb) return 1;
    return 0;
  });
  return filtered.slice(0, limit);
}

// ─── Incident Read API ─────────────────────────────────────

/**
 * queryRecentIncidents — 查询最近故障
 *
 * @param {Object} [options]
 * @param {number} [options.limit=20]       - 返回条目数
 * @param {string} [options.incidentType]   - 按故障类型过滤
 * @param {string} [options.executor]       - 按执行器过滤
 * @param {string} [options.status]         - 按状态过滤: open/resolved
 * @param {string} [options.since]          - ISO 8601 起始时间
 * @returns {Array<Object>}
 */
function queryRecentIncidents(options) {
  options = options || {};
  var limit = options.limit || 20;
  var all = _readAll('incidents');

  return _filterSortLimit(all, function(entry) {
    if (options.incidentType && entry.incidentType !== options.incidentType) return false;
    if (options.executor && entry.executor !== options.executor) return false;
    if (options.status && entry.status !== options.status) return false;
    if (options.since && entry.timestamp < options.since) return false;
    return true;
  }, limit);
}

/**
 * queryIncidentByCorrelationId — 按关联 ID 查询故障
 *
 * @param {string} correlationId
 * @returns {Array<Object>}
 */
function queryIncidentByCorrelationId(correlationId) {
  var all = _readAll('incidents');
  return _filterSortLimit(all, function(entry) {
    return entry.correlationId === correlationId;
  }, 1000);
}

// ─── Recovery Read API ─────────────────────────────────────

/**
 * queryRecoveryHistory — 查询恢复历史
 *
 * @param {Object} [options]
 * @param {number} [options.limit=20]
 * @param {string} [options.recoveryType]  - 按恢复类型过滤
 * @param {string} [options.executor]      - 按执行器过滤
 * @param {boolean} [options.recovered]    - 按恢复结果过滤
 * @param {string} [options.since]         - ISO 8601 起始时间
 * @returns {Array<Object>}
 */
function queryRecoveryHistory(options) {
  options = options || {};
  var limit = options.limit || 20;
  var all = _readAll('recoveries');

  return _filterSortLimit(all, function(entry) {
    if (options.recoveryType && entry.recoveryType !== options.recoveryType) return false;
    if (options.executor && entry.executor !== options.executor) return false;
    if (typeof options.recovered === 'boolean' && entry.recovered !== options.recovered) return false;
    if (options.since && entry.timestamp < options.since) return false;
    return true;
  }, limit);
}

/**
 * queryRecoveryByCorrelationId — 按关联 ID 查询恢复
 *
 * @param {string} correlationId
 * @returns {Array<Object>}
 */
function queryRecoveryByCorrelationId(correlationId) {
  var all = _readAll('recoveries');
  return _filterSortLimit(all, function(entry) {
    return entry.correlationId === correlationId;
  }, 1000);
}

// ─── Strategy Read API ─────────────────────────────────────

/**
 * queryStrategyHistory — 查询策略历史
 *
 * @param {Object} [options]
 * @param {number} [options.limit=20]
 * @param {string} [options.strategyType]  - 按策略类型过滤: gmv/roi/recovery/runtime_optimization
 * @param {string} [options.strategyName]  - 按策略名称过滤
 * @param {string} [options.agent]         - 按 Agent 过滤
 * @param {string} [options.since]         - ISO 8601 起始时间
 * @returns {Array<Object>}
 */
function queryStrategyHistory(options) {
  options = options || {};
  var limit = options.limit || 20;
  var all = _readAll('strategies');

  return _filterSortLimit(all, function(entry) {
    if (options.strategyType && entry.strategyType !== options.strategyType) return false;
    if (options.strategyName && entry.strategyName !== options.strategyName) return false;
    if (options.agent && entry.agent !== options.agent) return false;
    if (options.since && entry.timestamp < options.since) return false;
    return true;
  }, limit);
}

/**
 * queryStrategyByCorrelationId — 按关联 ID 查询策略
 *
 * @param {string} correlationId
 * @returns {Array<Object>}
 */
function queryStrategyByCorrelationId(correlationId) {
  var all = _readAll('strategies');
  return _filterSortLimit(all, function(entry) {
    return entry.correlationId === correlationId;
  }, 1000);
}

// ─── Execution Read API ─────────────────────────────────────

/**
 * queryExecutionHistory — 查询执行历史
 *
 * @param {Object} [options]
 * @param {number} [options.limit=20]
 * @param {string} [options.executor]      - 按执行器过滤
 * @param {boolean} [options.success]      - 按成功/失败过滤
 * @param {string} [options.agent]         - 按 Agent 过滤
 * @param {string} [options.since]         - ISO 8601 起始时间
 * @returns {Array<Object>}
 */
function queryExecutionHistory(options) {
  options = options || {};
  var limit = options.limit || 20;
  var all = _readAll('memory');

  return _filterSortLimit(all, function(entry) {
    if (entry.type !== 'execution') return false;
    if (options.executor && entry.metadata && entry.metadata.executor !== options.executor) return false;
    if (typeof options.success === 'boolean' && entry.metadata && entry.metadata.success !== options.success) return false;
    if (options.agent && entry.agent !== options.agent) return false;
    if (options.since && entry.timestamp < options.since) return false;
    return true;
  }, limit);
}

/**
 * queryByCorrelationId — 跨类型通用查询
 *
 * @param {string} correlationId
 * @returns {{ incidents: Array, recoveries: Array, strategies: Array, executions: Array }}
 */
function queryByCorrelationId(correlationId) {
  return {
    incidents: queryIncidentByCorrelationId(correlationId),
    recoveries: queryRecoveryByCorrelationId(correlationId),
    strategies: queryStrategyByCorrelationId(correlationId),
    executions: _filterSortLimit(_readAll('memory'), function(entry) {
      return entry.correlationId === correlationId;
    }, 1000)
  };
}

// ─── 统计 API ────────────────────────────────────────────────

/**
 * getIncidentStats — 故障统计
 *
 * @returns {Object} { total, byType: {}, byExecutor: {}, byStatus: {} }
 */
function getIncidentStats() {
  var all = _readAll('incidents');
  var stats = { total: all.length, byType: {}, byExecutor: {}, byStatus: {} };

  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    stats.byType[e.incidentType] = (stats.byType[e.incidentType] || 0) + 1;
    stats.byExecutor[e.executor] = (stats.byExecutor[e.executor] || 0) + 1;
    stats.byStatus[e.status] = (stats.byStatus[e.status] || 0) + 1;
  }

  return stats;
}

/**
 * getRecoveryStats — 恢复统计
 *
 * @returns {Object} { total, recovered, failed, recoveryRate }
 */
function getRecoveryStats() {
  var all = _readAll('recoveries');
  var recovered = 0;
  var failed = 0;

  for (var i = 0; i < all.length; i++) {
    if (all[i].recovered) recovered++;
    else failed++;
  }

  return {
    total: all.length,
    recovered: recovered,
    failed: failed,
    recoveryRate: all.length > 0 ? (recovered / all.length * 100).toFixed(1) + '%' : 'N/A'
  };
}

/**
 * getStrategyStats — 策略统计
 *
 * @returns {Object} { total, byType: {} }
 */
function getStrategyStats() {
  var all = _readAll('strategies');
  var stats = { total: all.length, byType: {} };

  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    stats.byType[e.strategyType] = (stats.byType[e.strategyType] || 0) + 1;
  }

  return stats;
}

// ─── 维护 API ────────────────────────────────────────────────

/**
 * 获取所有日志文件信息
 *
 * @returns {Object}
 */
function getAllLogInfo() {
  var info = {};
  var types = Object.keys(LOG_PATHS);
  for (var i = 0; i < types.length; i++) {
    var logPath = getLogPath(types[i]);
    var exists = fs.existsSync(logPath);
    info[types[i]] = {
      exists: exists,
      size: exists ? fs.statSync(logPath).size : 0,
      path: logPath
    };
  }
  return info;
}

module.exports = {
  // 故障查询
  queryRecentIncidents: queryRecentIncidents,
  queryIncidentByCorrelationId: queryIncidentByCorrelationId,

  // 恢复查询
  queryRecoveryHistory: queryRecoveryHistory,
  queryRecoveryByCorrelationId: queryRecoveryByCorrelationId,

  // 策略查询
  queryStrategyHistory: queryStrategyHistory,
  queryStrategyByCorrelationId: queryStrategyByCorrelationId,

  // 执行查询
  queryExecutionHistory: queryExecutionHistory,

  // 通用查询
  queryByCorrelationId: queryByCorrelationId,

  // 统计
  getIncidentStats: getIncidentStats,
  getRecoveryStats: getRecoveryStats,
  getStrategyStats: getStrategyStats,

  // 维护
  getAllLogInfo: getAllLogInfo,
  getLogPath: getLogPath
};
