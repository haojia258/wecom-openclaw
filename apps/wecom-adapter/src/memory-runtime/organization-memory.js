'use strict';

/**
 * organization-memory.js — Organization Memory 统一聚合 (P9.2)
 *
 * 统一聚合所有记忆类型，提供一站式查询和分析。
 *
 * 聚合维度:
 *   - incidents      故障记忆
 *   - recoveries     恢复记忆
 *   - strategies     策略记忆
 *   - executions     执行记忆
 */

var memoryReader = require('./memory-reader');
var incidentMemory = require('./incident-memory');
var strategyMemory = require('./strategy-memory');

// ─── 聚合查询 ────────────────────────────────────────────────

/**
 * getOrganizationSnapshot — 获取组织记忆快照
 *
 * 返回所有记忆类型的当前状态概览。
 *
 * @returns {{
 *   timestamp: string,
 *   summary: { incidents: Object, recoveries: Object, strategies: Object },
 *   recentIncidents: Array,
 *   recentRecoveries: Array,
 *   recentStrategies: Array,
 *   recentExecutions: Array
 * }}
 */
function getOrganizationSnapshot() {
  var timestamp = new Date().toISOString();

  return {
    timestamp: timestamp,
    summary: {
      incidents: memoryReader.getIncidentStats(),
      recoveries: memoryReader.getRecoveryStats(),
      strategies: memoryReader.getStrategyStats()
    },
    recentIncidents: memoryReader.queryRecentIncidents({ limit: 10 }),
    recentRecoveries: memoryReader.queryRecoveryHistory({ limit: 10 }),
    recentStrategies: memoryReader.queryStrategyHistory({ limit: 10 }),
    recentExecutions: memoryReader.queryExecutionHistory({ limit: 10 })
  };
}

/**
 * getCorrelationTimeline — 获取关联时间线
 *
 * 给定 correlationId，返回所有相关事件的完整时间线。
 *
 * @param {string} correlationId
 * @returns {{
 *   correlationId: string,
 *   incidents: Array,
 *   recoveries: Array,
 *   strategies: Array,
 *   executions: Array,
 *   timeline: Array
 * }}
 */
function getCorrelationTimeline(correlationId) {
  var result = memoryReader.queryByCorrelationId(correlationId);

  // 构建统一时间线
  var timeline = [];

  for (var i = 0; i < result.incidents.length; i++) {
    timeline.push({ type: 'incident', timestamp: result.incidents[i].timestamp, data: result.incidents[i] });
  }
  for (var j = 0; j < result.recoveries.length; j++) {
    timeline.push({ type: 'recovery', timestamp: result.recoveries[j].timestamp, data: result.recoveries[j] });
  }
  for (var k = 0; k < result.strategies.length; k++) {
    timeline.push({ type: 'strategy', timestamp: result.strategies[k].timestamp, data: result.strategies[k] });
  }
  for (var l = 0; l < result.executions.length; l++) {
    timeline.push({ type: 'execution', timestamp: result.executions[l].timestamp, data: result.executions[l] });
  }

  // 按时间排序
  timeline.sort(function(a, b) {
    if (a.timestamp < b.timestamp) return -1;
    if (a.timestamp > b.timestamp) return 1;
    return 0;
  });

  return {
    correlationId: correlationId,
    incidents: result.incidents,
    recoveries: result.recoveries,
    strategies: result.strategies,
    executions: result.executions,
    timeline: timeline
  };
}

// ─── 智能分析 ────────────────────────────────────────────────

/**
 * getHealthReport — 组织健康报告
 *
 * 综合分析所有记忆，生成健康评估。
 *
 * @returns {{
 *   timestamp: string,
 *   overallStatus: string,
 *   metrics: Object,
 *   alerts: Array,
 *   recommendations: Array
 * }}
 */
function getHealthReport() {
  var snapshot = getOrganizationSnapshot();
  var overallStatus = 'healthy';
  var alerts = [];
  var recommendations = [];

  // 故障分析
  var openIncidents = incidentMemory.getOpenIncidents();
  if (openIncidents.length > 0) {
    overallStatus = openIncidents.length > 5 ? 'critical' : 'warning';
    alerts.push({
      level: openIncidents.length > 5 ? 'critical' : 'warning',
      message: openIncidents.length + ' 个未解决的故障',
      details: openIncidents.map(function(i) {
        return { type: i.incidentType, executor: i.executor, timestamp: i.timestamp };
      })
    });
    recommendations.push('建议优先处理未解决的故障，防止问题累积');
  }

  // 恢复率分析
  var recoveryStats = snapshot.summary.recoveries;
  if (recoveryStats.total > 0 && parseFloat(recoveryStats.recoveryRate) < 50) {
    alerts.push({
      level: 'warning',
      message: '恢复率偏低: ' + recoveryStats.recoveryRate
    });
    recommendations.push('恢复率低于 50%，建议优化恢复策略');
  }

  // 重复故障分析
  var recurring = incidentMemory.getRecurringIncidents(3);
  if (recurring.length > 0) {
    alerts.push({
      level: 'warning',
      message: '检测到 ' + recurring.length + ' 种重复故障模式',
      patterns: recurring
    });
    recommendations.push('发现重复故障模式，建议建立自动化修复流程');
  }

  // 故障趋势
  var trend = incidentMemory.getIncidentTrend(24);
  var recentHoursWithIncidents = trend.filter(function(t) { return t.count > 0; }).length;
  if (recentHoursWithIncidents > 12) {
    alerts.push({
      level: 'warning',
      message: '过去 24 小时内 ' + recentHoursWithIncidents + ' 个小时发生故障',
      trend: trend
    });
  }

  // 策略覆盖
  if (snapshot.summary.strategies.total === 0) {
    recommendations.push('无策略记录，建议开始记录运行时优化策略');
  }

  return {
    timestamp: new Date().toISOString(),
    overallStatus: overallStatus,
    metrics: {
      totalIncidents: snapshot.summary.incidents.total,
      openIncidents: openIncidents.length,
      totalRecoveries: recoveryStats.total,
      recoveryRate: recoveryStats.recoveryRate,
      totalStrategies: snapshot.summary.strategies.total,
      recurringPatterns: recurring.length
    },
    alerts: alerts,
    recommendations: recommendations
  };
}

/**
 * findSimilarIncidents — 查找相似故障
 *
 * 基于故障类型和执行器查找相似历史故障，辅助故障排查。
 *
 * @param {string} incidentType
 * @param {string} executor
 * @param {number} [limit=5]
 * @returns {Array<{ correlationId: string, timestamp: string, recoveryResult: string, error: string }>}
 */
function findSimilarIncidents(incidentType, executor, limit) {
  limit = limit || 5;
  var results = incidentMemory.getIncidentsByType(incidentType, limit);

  // 如果指定了 executor，优先显示同 executor 的
  if (executor) {
    var sameExecutor = results.filter(function(r) { return r.executor === executor; });
    var otherExecutor = results.filter(function(r) { return r.executor !== executor; });
    return sameExecutor.concat(otherExecutor).slice(0, limit);
  }

  return results;
}

/**
 * findSimilarRecoveries — 查找相似恢复方案
 *
 * @param {string} recoveryType
 * @param {number} [limit=5]
 * @returns {Array<Object>}
 */
function findSimilarRecoveries(recoveryType, limit) {
  limit = limit || 5;
  return memoryReader.queryRecoveryHistory({ recoveryType: recoveryType, limit: limit });
}

// ─── 导出 ────────────────────────────────────────────────────

module.exports = {
  // 快照
  getOrganizationSnapshot: getOrganizationSnapshot,

  // 时间线
  getCorrelationTimeline: getCorrelationTimeline,

  // 健康分析
  getHealthReport: getHealthReport,

  // 相似查询
  findSimilarIncidents: findSimilarIncidents,
  findSimilarRecoveries: findSimilarRecoveries
};
