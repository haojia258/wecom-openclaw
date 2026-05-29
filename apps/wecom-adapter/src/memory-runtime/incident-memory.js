'use strict';

/**
 * incident-memory.js — 故障记忆模块 (P9.2)
 *
 * 专门负责故障（incident）的记录、查询、分析和模式识别。
 * 基于 memory-writer + memory-reader 构建。
 *
 * 记录内容:
 *   - incidentType     故障类型（TIMEOUT/EXECUTOR_ERROR/INFRA_ERROR/...）
 *   - retryCount       重试次数
 *   - recoveryResult   恢复结果
 *   - executor         执行器名称
 *   - command          执行的命令
 */

var memoryWriter = require('./memory-writer');
var memoryReader = require('./memory-reader');

// ─── 写入 API ────────────────────────────────────────────────

/**
 * recordIncident — 记录一次故障
 *
 * @param {Object} params
 * @param {string} params.correlationId    - 关联 ID（必填）
 * @param {string} params.incidentType     - 故障类型
 * @param {number} params.retryCount       - 重试次数
 * @param {string} params.recoveryResult   - 恢复结果: pending/success/failed
 * @param {string} params.executor         - 执行器
 * @param {string} params.command          - 命令
 * @param {string} [params.error]          - 错误信息
 * @param {string} [params.protocol]       - 协议
 * @param {string} [params.agent]          - Agent
 * @param {Object} [params.metadata]       - 额外元数据
 * @returns {boolean}
 */
function recordIncident(params) {
  var timestamp = new Date().toISOString();
  return memoryWriter.appendIncident({
    correlationId: params.correlationId,
    timestamp: timestamp,
    incidentType: params.incidentType || 'UNKNOWN',
    retryCount: typeof params.retryCount === 'number' ? params.retryCount : 0,
    recoveryResult: params.recoveryResult || 'pending',
    executor: params.executor || 'unknown',
    command: params.command || '',
    error: params.error || '',
    protocol: params.protocol || 'generic',
    agent: params.agent || 'unknown',
    status: params.incidentType === 'SUCCESS' ? 'resolved' : 'open',
    summary: params.incidentType + ': ' + (params.error || params.command || '').substring(0, 100),
    metadata: params.metadata || {}
  });
}

/**
 * resolveIncident — 标记故障为已解决
 *
 * @param {string} correlationId
 * @param {string} resolution - 解决方式描述
 * @returns {boolean}
 */
function resolveIncident(correlationId, resolution) {
  var timestamp = new Date().toISOString();
  return memoryWriter.appendIncident({
    correlationId: correlationId,
    timestamp: timestamp,
    incidentType: 'RESOLVED',
    retryCount: 0,
    recoveryResult: 'success',
    executor: 'system',
    command: '',
    status: 'resolved',
    summary: 'Incident resolved: ' + (resolution || 'manual resolution'),
    metadata: { resolution: resolution, resolvedAt: timestamp }
  });
}

// ─── 查询 API ────────────────────────────────────────────────

/**
 * getOpenIncidents — 获取未解决的故障
 *
 * @param {number} [limit=20]
 * @returns {Array<Object>}
 */
function getOpenIncidents(limit) {
  return memoryReader.queryRecentIncidents({ status: 'open', limit: limit || 20 });
}

/**
 * getIncidentsByType — 按故障类型查询
 *
 * @param {string} incidentType
 * @param {number} [limit=20]
 * @returns {Array<Object>}
 */
function getIncidentsByType(incidentType, limit) {
  return memoryReader.queryRecentIncidents({ incidentType: incidentType, limit: limit || 20 });
}

/**
 * getIncidentsByExecutor — 按执行器查询故障
 *
 * @param {string} executor
 * @param {number} [limit=20]
 * @returns {Array<Object>}
 */
function getIncidentsByExecutor(executor, limit) {
  return memoryReader.queryRecentIncidents({ executor: executor, limit: limit || 20 });
}

/**
 * getIncidentChain — 获取关联故障链
 *
 * @param {string} correlationId
 * @returns {Array<Object>}
 */
function getIncidentChain(correlationId) {
  return memoryReader.queryIncidentByCorrelationId(correlationId);
}

// ─── 分析 API ────────────────────────────────────────────────

/**
 * getIncidentTrend — 故障趋势分析
 *
 * 按小时统计最近 N 条故障
 *
 * @param {number} [hours=24]
 * @returns {Array<{ hour: string, count: number, types: Object }>}
 */
function getIncidentTrend(hours) {
  hours = hours || 24;
  var since = new Date(Date.now() - hours * 3600000).toISOString();
  var incidents = memoryReader.queryRecentIncidents({ since: since, limit: 10000 });

  var buckets = {};
  for (var i = 0; i < incidents.length; i++) {
    var h = incidents[i].timestamp.substring(0, 13); // YYYY-MM-DDTHH
    if (!buckets[h]) {
      buckets[h] = { hour: h, count: 0, types: {} };
    }
    buckets[h].count++;
    var t = incidents[i].incidentType || 'UNKNOWN';
    buckets[h].types[t] = (buckets[h].types[t] || 0) + 1;
  }

  return Object.keys(buckets).sort().map(function(k) { return buckets[k]; });
}

/**
 * getTopFailurePatterns — 获取 Top N 故障模式
 *
 * @param {number} [topN=5]
 * @returns {Array<{ type: string, count: number, pct: string, lastSeen: string, examples: Array }>}
 */
function getTopFailurePatterns(topN) {
  topN = topN || 5;
  var stats = memoryReader.getIncidentStats();
  var types = Object.keys(stats.byType);

  var patterns = types.map(function(t) {
    var examples = memoryReader.queryRecentIncidents({ incidentType: t, limit: 3 });
    return {
      type: t,
      count: stats.byType[t],
      pct: (stats.byType[t] / Math.max(stats.total, 1) * 100).toFixed(1) + '%',
      lastSeen: examples.length > 0 ? examples[0].timestamp : 'N/A',
      examples: examples.map(function(e) {
        return { correlationId: e.correlationId, error: e.error, timestamp: e.timestamp };
      })
    };
  });

  patterns.sort(function(a, b) { return b.count - a.count; });
  return patterns.slice(0, topN);
}

/**
 * getRecurringIncidents — 检测重复故障模式
 *
 * 同一 (incidentType, executor) 组合出现 >= minOccurrences 次视为重复。
 *
 * @param {number} [minOccurrences=3]
 * @returns {Array<{ pattern: string, count: number, incidentType: string, executor: string }>}
 */
function getRecurringIncidents(minOccurrences) {
  minOccurrences = minOccurrences || 3;
  var all = memoryReader.queryRecentIncidents({ limit: 1000 });

  var patterns = {};
  for (var i = 0; i < all.length; i++) {
    var key = (all[i].incidentType || 'UNKNOWN') + '|' + (all[i].executor || 'unknown');
    if (!patterns[key]) {
      patterns[key] = { pattern: key, count: 0, incidentType: all[i].incidentType, executor: all[i].executor };
    }
    patterns[key].count++;
  }

  return Object.keys(patterns)
    .map(function(k) { return patterns[k]; })
    .filter(function(p) { return p.count >= minOccurrences; })
    .sort(function(a, b) { return b.count - a.count; });
}

module.exports = {
  // 写入
  recordIncident: recordIncident,
  resolveIncident: resolveIncident,

  // 查询
  getOpenIncidents: getOpenIncidents,
  getIncidentsByType: getIncidentsByType,
  getIncidentsByExecutor: getIncidentsByExecutor,
  getIncidentChain: getIncidentChain,

  // 分析
  getIncidentTrend: getIncidentTrend,
  getTopFailurePatterns: getTopFailurePatterns,
  getRecurringIncidents: getRecurringIncidents
};
