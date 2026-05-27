'use strict';

/**
 * strategy-memory.js — 策略记忆模块 (P9.2)
 *
 * 专门负责策略的记录、查询和优化建议。
 * 基于 memory-writer + memory-reader 构建。
 *
 * 策略类型:
 *   - gmv                    GMV 策略
 *   - roi                    ROI 策略
 *   - recovery               恢复策略
 *   - runtime_optimization   运行时优化策略
 */

var memoryWriter = require('./memory-writer');
var memoryReader = require('./memory-reader');

// ─── 写入 API ────────────────────────────────────────────────

/**
 * recordStrategy — 记录一条策略
 *
 * @param {Object} params
 * @param {string} params.correlationId    - 关联 ID（必填）
 * @param {string} params.strategyType     - 策略类型: gmv/roi/recovery/runtime_optimization
 * @param {string} params.strategyName     - 策略名称
 * @param {Object} params.strategyConfig   - 策略配置
 * @param {string} [params.description]    - 策略描述
 * @param {string} [params.agent]          - 执行 Agent
 * @param {Object} [params.metadata]       - 额外元数据
 * @returns {boolean}
 */
function recordStrategy(params) {
  var timestamp = new Date().toISOString();
  return memoryWriter.appendStrategy({
    correlationId: params.correlationId,
    timestamp: timestamp,
    strategyType: params.strategyType || 'general',
    strategyName: params.strategyName || 'unnamed',
    strategyConfig: params.strategyConfig || {},
    description: params.description || '',
    agent: params.agent || 'unknown',
    summary: params.strategyType + ': ' + (params.strategyName || ''),
    metadata: params.metadata || {}
  });
}

/**
 * recordGmvStrategy — 记录 GMV 策略
 *
 * @param {Object} params
 * @param {string} params.correlationId
 * @param {string} params.strategyName
 * @param {Object} params.config         - { targetGmv, channels, budget, ... }
 * @param {string} [params.description]
 * @param {string} [params.agent]
 * @returns {boolean}
 */
function recordGmvStrategy(params) {
  return recordStrategy({
    correlationId: params.correlationId,
    strategyType: 'gmv',
    strategyName: params.strategyName,
    strategyConfig: params.config || {},
    description: params.description || '',
    agent: params.agent || 'unknown'
  });
}

/**
 * recordRoiStrategy — 记录 ROI 策略
 *
 * @param {Object} params
 * @param {string} params.correlationId
 * @param {string} params.strategyName
 * @param {Object} params.config         - { targetRoi, channels, budget, ... }
 * @param {string} [params.description]
 * @param {string} [params.agent]
 * @returns {boolean}
 */
function recordRoiStrategy(params) {
  return recordStrategy({
    correlationId: params.correlationId,
    strategyType: 'roi',
    strategyName: params.strategyName,
    strategyConfig: params.config || {},
    description: params.description || '',
    agent: params.agent || 'unknown'
  });
}

/**
 * recordRecoveryStrategy — 记录恢复策略
 *
 * @param {Object} params
 * @param {string} params.correlationId
 * @param {string} params.strategyName
 * @param {Object} params.config         - { failureType, steps, rollbackPlan, ... }
 * @param {string} [params.description]
 * @param {string} [params.agent]
 * @returns {boolean}
 */
function recordRecoveryStrategy(params) {
  return recordStrategy({
    correlationId: params.correlationId,
    strategyType: 'recovery',
    strategyName: params.strategyName,
    strategyConfig: params.config || {},
    description: params.description || '',
    agent: params.agent || 'unknown'
  });
}

/**
 * recordRuntimeOptimizationStrategy — 记录运行时优化策略
 *
 * @param {Object} params
 * @param {string} params.correlationId
 * @param {string} params.strategyName
 * @param {Object} params.config         - { target, optimization, expectedImprovement, ... }
 * @param {string} [params.description]
 * @param {string} [params.agent]
 * @returns {boolean}
 */
function recordRuntimeOptimizationStrategy(params) {
  return recordStrategy({
    correlationId: params.correlationId,
    strategyType: 'runtime_optimization',
    strategyName: params.strategyName,
    strategyConfig: params.config || {},
    description: params.description || '',
    agent: params.agent || 'unknown'
  });
}

// ─── 查询 API ────────────────────────────────────────────────

/**
 * getStrategiesByType — 按类型查询策略
 *
 * @param {string} strategyType - gmv/roi/recovery/runtime_optimization
 * @param {number} [limit=20]
 * @returns {Array<Object>}
 */
function getStrategiesByType(strategyType, limit) {
  return memoryReader.queryStrategyHistory({ strategyType: strategyType, limit: limit || 20 });
}

/**
 * getLatestStrategy — 获取某类型最新策略
 *
 * @param {string} strategyType
 * @returns {Object|null}
 */
function getLatestStrategy(strategyType) {
  var results = memoryReader.queryStrategyHistory({ strategyType: strategyType, limit: 1 });
  return results.length > 0 ? results[0] : null;
}

/**
 * getStrategyChain — 获取关联策略链
 *
 * @param {string} correlationId
 * @returns {Array<Object>}
 */
function getStrategyChain(correlationId) {
  return memoryReader.queryStrategyByCorrelationId(correlationId);
}

/**
 * getAllStrategies — 获取所有策略（按时间降序）
 *
 * @param {number} [limit=50]
 * @returns {Array<Object>}
 */
function getAllStrategies(limit) {
  return memoryReader.queryStrategyHistory({ limit: limit || 50 });
}

// ─── 分析 API ────────────────────────────────────────────────

/**
 * getStrategyDistribution — 策略类型分布
 *
 * @returns {{ total: number, byType: Object }}
 */
function getStrategyDistribution() {
  return memoryReader.getStrategyStats();
}

/**
 * compareStrategies — 比较同类型策略（按时间排序）
 *
 * @param {string} strategyType
 * @param {number} [limit=10]
 * @returns {Array<Object>}
 */
function compareStrategies(strategyType, limit) {
  var strategies = memoryReader.queryStrategyHistory({ strategyType: strategyType, limit: limit || 10 });
  // 已经是 time-desc
  return strategies.map(function(s, idx) {
    return {
      index: idx + 1,
      correlationId: s.correlationId,
      strategyName: s.strategyName,
      timestamp: s.timestamp,
      config: s.strategyConfig,
      description: s.description
    };
  });
}

/**
 * suggestOptimization — 基于历史策略提供优化建议
 *
 * 分析同类型策略的演变趋势，生成建议。
 *
 * @param {string} strategyType
 * @returns {{ suggestions: Array<string>, recentConfigs: Array }}
 */
function suggestOptimization(strategyType) {
  var history = memoryReader.queryStrategyHistory({ strategyType: strategyType, limit: 20 });

  if (history.length < 2) {
    return {
      suggestions: ['数据不足，需要更多策略记录才能提供优化建议'],
      recentConfigs: history
    };
  }

  var suggestions = [];
  var recentConfigs = history.slice(0, 5).map(function(s) {
    return { name: s.strategyName, timestamp: s.timestamp, config: s.strategyConfig };
  });

  // 检测配置变化趋势
  var configKeys = new Set();
  for (var i = 0; i < history.length; i++) {
    var cfg = history[i].strategyConfig || {};
    Object.keys(cfg).forEach(function(k) { configKeys.add(k); });
  }

  var keysArr = Array.from(configKeys);
  for (var j = 0; j < keysArr.length; j++) {
    var key = keysArr[j];
    var values = history.map(function(h) { return (h.strategyConfig || {})[key]; }).filter(function(v) { return v !== undefined; });
    if (values.length >= 3) {
      var firstV = values[values.length - 1];
      var lastV = values[0];
      if (firstV !== lastV) {
        suggestions.push('参数 [' + key + '] 从 ' + JSON.stringify(firstV) + ' 调整为 ' + JSON.stringify(lastV));
      }
    }
  }

  if (suggestions.length === 0) {
    suggestions.push('策略配置稳定，暂无显著变化趋势');
  }

  suggestions.push('共 ' + history.length + ' 条 ' + strategyType + ' 策略记录可用');

  return { suggestions: suggestions, recentConfigs: recentConfigs };
}

module.exports = {
  // 写入
  recordStrategy: recordStrategy,
  recordGmvStrategy: recordGmvStrategy,
  recordRoiStrategy: recordRoiStrategy,
  recordRecoveryStrategy: recordRecoveryStrategy,
  recordRuntimeOptimizationStrategy: recordRuntimeOptimizationStrategy,

  // 查询
  getStrategiesByType: getStrategiesByType,
  getLatestStrategy: getLatestStrategy,
  getStrategyChain: getStrategyChain,
  getAllStrategies: getAllStrategies,

  // 分析
  getStrategyDistribution: getStrategyDistribution,
  compareStrategies: compareStrategies,
  suggestOptimization: suggestOptimization
};
