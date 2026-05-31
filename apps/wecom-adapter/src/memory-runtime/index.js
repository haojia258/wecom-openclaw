'use strict';

/**
 * memory-runtime/index.js — Shared Memory Runtime 入口 (P9.2)
 *
 * 统一导出所有记忆模块。
 *
 * 模块:
 *   - memory-writer       JSONL 写入层
 *   - memory-reader       JSONL 读取层
 *   - incident-memory     故障记忆
 *   - strategy-memory     策略记忆
 *   - organization-memory 组织聚合记忆
 *   - runtime-memory-db   SQLite 存储
 *   - context-builder     Agent 上下文构建
 *   - memory-governance   安全治理
 */

var memoryWriter = require('./memory-writer');
var memoryReader = require('./memory-reader');
var incidentMemory = require('./incident-memory');
var strategyMemory = require('./strategy-memory');
var organizationMemory = require('./organization-memory');
var runtimeMemoryDb = require('./runtime-memory-db');
var contextBuilder = require('./context-builder');
var memoryGovernance = require('./memory-governance');

/**
 * 初始化 Memory Runtime
 *
 * 初始化 SQLite 数据库（如果可用）。
 *
 * @returns {{ jsonlAvailable: boolean, sqliteAvailable: boolean }}
 */
function initialize() {
  var sqliteAvailable = runtimeMemoryDb.initialize();
  return {
    jsonlAvailable: true,
    sqliteAvailable: sqliteAvailable
  };
}

/**
 * 关闭所有资源
 */
function shutdown() {
  runtimeMemoryDb.close();
}

module.exports = {
  // 生命周期
  initialize: initialize,
  shutdown: shutdown,

  // JSONL 写入/读取
  writer: memoryWriter,
  reader: memoryReader,

  // 专项记忆
  incidentMemory: incidentMemory,
  strategyMemory: strategyMemory,
  organizationMemory: organizationMemory,

  // SQLite
  db: runtimeMemoryDb,

  // 上下文
  contextBuilder: contextBuilder,

  // 治理
  governance: memoryGovernance,

  // 直接暴露常用函数
  appendIncident: memoryWriter.appendIncident,
  appendRecovery: memoryWriter.appendRecovery,
  appendExecution: memoryWriter.appendExecution,
  appendStrategy: memoryWriter.appendStrategy,
  appendMemory: memoryWriter.appendMemory,

  queryRecentIncidents: memoryReader.queryRecentIncidents,
  queryRecoveryHistory: memoryReader.queryRecoveryHistory,
  queryStrategyHistory: memoryReader.queryStrategyHistory,
  queryExecutionHistory: memoryReader.queryExecutionHistory,
  queryByCorrelationId: memoryReader.queryByCorrelationId,

  buildAgentContext: contextBuilder.buildAgentContext,
  buildRetryContext: contextBuilder.buildRetryContext,

  sanitizeMemory: memoryGovernance.sanitizeMemory,
  validateMemory: memoryGovernance.validateMemory,
  safeAppend: memoryGovernance.safeAppend,

  recordIncident: incidentMemory.recordIncident,
  recordStrategy: strategyMemory.recordStrategy
};
