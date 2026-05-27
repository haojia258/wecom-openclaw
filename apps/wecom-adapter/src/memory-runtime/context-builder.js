'use strict';

/**
 * context-builder.js — Agent 上下文构建器 (P9.2)
 *
 * 自动读取历史记忆，为 Agent 构建智能上下文。
 *
 * 功能:
 *   - buildAgentContext()    自动聚合: 类似故障 + 类似恢复 + 历史 DAG + 历史策略
 *   - 返回结构化上下文，包含推荐方案
 */

var memoryReader = require('./memory-reader');
var incidentMemory = require('./incident-memory');
var strategyMemory = require('./strategy-memory');
var runtimeMemoryDb = require('./runtime-memory-db');

// ─── 主入口 ──────────────────────────────────────────────────

/**
 * buildAgentContext — 为 Agent 构建执行上下文
 *
 * 自动读取:
 *   - 类似 incident（按故障类型 + 执行器匹配）
 *   - 类似 recovery（按恢复类型匹配）
 *   - 历史策略（按策略类型匹配）
 *   - 历史执行（按执行器匹配）
 *
 * 返回包含 recommendations 的结构化上下文。
 *
 * @param {Object} params
 * @param {string} params.agent            - Agent 名称
 * @param {string} [params.executor]       - 执行器名称
 * @param {string} [params.incidentType]   - 当前故障类型（用于匹配类似故障）
 * @param {string} [params.command]        - 当前命令
 * @param {string} [params.correlationId]  - 关联 ID
 * @param {number} [params.contextSize]    - 每个类别最多返回条目数 (default 5)
 * @returns {{
 *   incidents: Array,
 *   recoveries: Array,
 *   strategies: Array,
 *   executions: Array,
 *   recommendations: Array,
 *   similarIncidents: Array,
 *   similarRecoveries: Array,
 *   timestamp: string
 * }}
 */
function buildAgentContext(params) {
  params = params || {};
  var agent = params.agent || 'unknown';
  var executor = params.executor || agent;
  var incidentType = params.incidentType || '';
  var contextSize = params.contextSize || 5;

  var context = {
    timestamp: new Date().toISOString(),
    incidents: [],
    recoveries: [],
    strategies: [],
    executions: [],
    recommendations: [],
    similarIncidents: [],
    similarRecoveries: []
  };

  // ─── 1. 查询类似故障 ───
  if (incidentType) {
    // JSONL 查询
    context.similarIncidents = memoryReader.queryRecentIncidents({
      incidentType: incidentType,
      limit: contextSize
    });

    // SQLite 查询（如果可用）
    if (runtimeMemoryDb.isAvailable()) {
      var dbIncidents = runtimeMemoryDb.queryIncidents({
        type: incidentType,
        limit: contextSize
      });
      // 合并去重
      var seenIds = new Set();
      context.similarIncidents.forEach(function(i) { seenIds.add(i.correlationId + '_' + i.timestamp); });
      dbIncidents.forEach(function(i) {
        var key = i.correlationId + '_' + i.timestamp;
        if (!seenIds.has(key)) {
          context.similarIncidents.push(i);
          seenIds.add(key);
        }
      });
    }
  }

  // ─── 2. 查询 Agent/Executor 的历史故障 ───
  context.incidents = memoryReader.queryRecentIncidents({
    executor: executor,
    limit: contextSize
  });

  // ─── 3. 查询恢复历史 ───
  context.recoveries = memoryReader.queryRecoveryHistory({
    executor: executor,
    limit: contextSize
  });

  // 如果有故障类型，查询类似恢复
  if (incidentType) {
    var recoveryType = incidentType.toLowerCase().indexOf('timeout') >= 0 ? 'TIMEOUT'
      : incidentType.toLowerCase().indexOf('error') >= 0 ? 'ERROR'
      : incidentType.toLowerCase().indexOf('infra') >= 0 ? 'INFRA'
      : 'UNKNOWN';

    context.similarRecoveries = memoryReader.queryRecoveryHistory({
      recoveryType: recoveryType,
      recovered: true,
      limit: contextSize
    });
  }

  // ─── 4. 查询策略历史 ───
  context.strategies = memoryReader.queryStrategyHistory({
    agent: agent,
    limit: contextSize
  });

  // ─── 5. 查询执行历史 ───
  context.executions = memoryReader.queryExecutionHistory({
    executor: executor,
    limit: contextSize
  });

  // ─── 6. 生成推荐方案 ───

  // 如果有成功的类似恢复，推荐
  if (context.similarRecoveries.length > 0) {
    context.recommendations.push({
      type: 'recovery',
      priority: 'high',
      message: '发现 ' + context.similarRecoveries.length + ' 个类似恢复方案',
      details: context.similarRecoveries.map(function(r) {
        return {
          correlationId: r.correlationId,
          recoveryType: r.recoveryType,
          description: r.description,
          recovered: r.recovered,
          timestamp: r.timestamp
        };
      })
    });
  }

  // 如果有类似故障模式，推荐检查
  if (context.similarIncidents.length > 0) {
    var resolvedIncidents = context.similarIncidents.filter(function(i) { return i.status === 'resolved'; });
    if (resolvedIncidents.length > 0) {
      context.recommendations.push({
        type: 'incident_resolution',
        priority: 'high',
        message: '发现 ' + resolvedIncidents.length + ' 个已解决的类似故障',
        details: resolvedIncidents.map(function(i) {
          return {
            correlationId: i.correlationId,
            incidentType: i.incidentType,
            status: i.status,
            timestamp: i.timestamp
          };
        })
      });
    }
  }

  // 策略推荐
  if (context.strategies.length > 0) {
    context.recommendations.push({
      type: 'strategy',
      priority: 'medium',
      message: '可用历史策略 ' + context.strategies.length + ' 条',
      strategies: context.strategies.map(function(s) {
        return {
          strategyType: s.strategyType,
          strategyName: s.strategyName,
          timestamp: s.timestamp
        };
      })
    });
  }

  // 如果无数据，给出提示
  if (context.incidents.length === 0 && context.recoveries.length === 0 &&
      context.strategies.length === 0 && context.executions.length === 0) {
    context.recommendations.push({
      type: 'no_data',
      priority: 'info',
      message: '无历史记忆数据，这是首次执行。建议正常执行并记录结果。'
    });
  }

  return context;
}

/**
 * buildRetryContext — 为重试/恢复构建上下文
 *
 * 专门针对 retry/recovery 场景，提供更聚焦的上下文。
 *
 * @param {Object} params
 * @param {string} params.correlationId   - 当前执行关联 ID
 * @param {string} params.incidentType    - 故障类型
 * @param {string} params.executor        - 执行器
 * @param {number} params.retryCount      - 已重试次数
 * @returns {Object}
 */
function buildRetryContext(params) {
  var baseContext = buildAgentContext({
    agent: params.agent || 'unknown',
    executor: params.executor,
    incidentType: params.incidentType,
    correlationId: params.correlationId,
    contextSize: 5
  });

  // 添加重试特有信息
  baseContext.retrySpecific = {
    correlationId: params.correlationId,
    currentRetryCount: params.retryCount || 0,
    incidentType: params.incidentType
  };

  // 为 retry 场景添加针对性推荐
  if (params.retryCount >= 2) {
    baseContext.recommendations.push({
      type: 'retry_escalation',
      priority: 'high',
      message: '已重试 ' + params.retryCount + ' 次，考虑人工介入或切换恢复策略'
    });
  }

  return baseContext;
}

/**
 * buildExecutionPlanContext — 为执行计划构建上下文
 *
 * 在执行前提供历史参考，帮助 Agent 避免重复错误。
 *
 * @param {Object} params
 * @param {string} params.command      - 待执行的命令
 * @param {string} params.executor     - 执行器
 * @param {string} params.agent        - Agent
 * @returns {Object}
 */
function buildExecutionPlanContext(params) {
  var context = buildAgentContext({
    agent: params.agent || 'unknown',
    executor: params.executor,
    contextSize: 5
  });

  // 查找执行该命令的失败历史
  var failedExecutions = memoryReader.queryExecutionHistory({
    executor: params.executor,
    success: false,
    limit: 10
  });

  if (failedExecutions.length > 0) {
    context.warnings = failedExecutions.map(function(e) {
      var errMsg = '';
      if (e.metadata && e.metadata.error) errMsg = e.metadata.error;
      return {
        timestamp: e.timestamp,
        error: errMsg,
        correlationId: e.correlationId
      };
    });

    context.recommendations.push({
      type: 'execution_warning',
      priority: 'high',
      message: '该执行器有 ' + failedExecutions.length + ' 次历史失败记录，请确认当前环境已修复'
    });
  }

  return context;
}

module.exports = {
  buildAgentContext: buildAgentContext,
  buildRetryContext: buildRetryContext,
  buildExecutionPlanContext: buildExecutionPlanContext
};
