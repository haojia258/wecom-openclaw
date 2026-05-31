'use strict';

/**
 * memory-writer.js — Shared Memory Runtime Writer (P9.2)
 *
 * JSONL append-only 写入层。
 * 所有写入必须携带 correlationId + timestamp。
 *
 * 日志路径:
 *   logs/memory-runtime/memory.jsonl       — 通用记忆
 *   logs/memory-runtime/incidents.jsonl    — 故障记忆
 *   logs/memory-runtime/recoveries.jsonl   — 恢复记忆
 *   logs/memory-runtime/strategies.jsonl   — 策略记忆
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

/**
 * 获取日志路径（支持 env var 覆盖，用于测试隔离）
 *
 * @param {string} type - 'memory' | 'incidents' | 'recoveries' | 'strategies'
 * @returns {string}
 */
function getLogPath(type) {
  var envKey = 'MEMORY_RUNTIME_' + type.toUpperCase() + '_PATH';
  if (process.env[envKey]) {
    return process.env[envKey];
  }
  return LOG_PATHS[type] || LOG_PATHS.memory;
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

// ─── 核心写入 ────────────────────────────────────────────────

/**
 * 通用追加写入
 *
 * @param {string} type     - 'memory' | 'incidents' | 'recoveries' | 'strategies'
 * @param {Object} record   - 记录数据
 * @returns {boolean}
 */
function _append(type, record) {
  try {
    var logPath = getLogPath(type);
    ensureLogDir(logPath);

    // 确保 correlationId 和 timestamp 存在
    if (!record.correlationId) {
      record.correlationId = 'auto_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    }
    if (!record.timestamp) {
      record.timestamp = new Date().toISOString();
    }

    fs.appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf-8');
    return true;
  } catch (err) {
    console.error('[memory-writer] 写入 ' + type + ' 失败:', err.message);
    return false;
  }
}

// ─── 公共写入 API ────────────────────────────────────────────

/**
 * appendMemory — 写入通用记忆
 *
 * @param {Object} params
 * @param {string} params.correlationId  - 关联 ID（必填）
 * @param {string} params.timestamp      - ISO 8601 时间戳（必填）
 * @param {string} params.agent          - 执行 Agent
 * @param {string} params.type           - 记忆类型: execution/incident/recovery/strategy
 * @param {string} [params.status]       - 状态
 * @param {string} [params.summary]      - 摘要
 * @param {Object} [params.metadata]     - 额外元数据
 * @returns {boolean}
 */
function appendMemory(params) {
  if (!params.correlationId || !params.timestamp) {
    throw new Error('[memory-writer] appendMemory: correlationId and timestamp are mandatory');
  }
  return _append('memory', {
    correlationId: params.correlationId,
    timestamp: params.timestamp,
    agent: params.agent || 'unknown',
    type: params.type || 'execution',
    status: params.status || 'unknown',
    summary: (params.summary || '').substring(0, 1000),
    metadata: params.metadata || {}
  });
}

/**
 * appendIncident — 写入故障记忆
 *
 * @param {Object} params
 * @param {string} params.correlationId    - 关联 ID（必填）
 * @param {string} params.timestamp        - ISO 8601 时间戳（必填）
 * @param {string} params.incidentType     - 故障类型
 * @param {number} params.retryCount       - 重试次数
 * @param {string} params.recoveryResult   - 恢复结果
 * @param {string} params.executor         - 执行器
 * @param {string} params.command          - 执行的命令
 * @param {string} [params.error]          - 错误信息
 * @param {string} [params.protocol]       - 协议
 * @param {Object} [params.metadata]       - 额外元数据
 * @returns {boolean}
 */
function appendIncident(params) {
  if (!params.correlationId || !params.timestamp) {
    throw new Error('[memory-writer] appendIncident: correlationId and timestamp are mandatory');
  }
  return _append('incidents', {
    correlationId: params.correlationId,
    timestamp: params.timestamp,
    incidentType: params.incidentType || 'UNKNOWN',
    retryCount: typeof params.retryCount === 'number' ? params.retryCount : 0,
    recoveryResult: params.recoveryResult || 'pending',
    executor: params.executor || 'unknown',
    command: (params.command || '').substring(0, 500),
    error: (params.error || '').substring(0, 500),
    protocol: params.protocol || 'generic',
    agent: params.agent || 'unknown',
    status: params.status || 'open',
    summary: params.summary || '',
    metadata: params.metadata || {}
  });
}

/**
 * appendRecovery — 写入恢复记忆
 *
 * @param {Object} params
 * @param {string} params.correlationId    - 关联 ID（必填）
 * @param {string} params.timestamp        - ISO 8601 时间戳（必填）
 * @param {string} params.recoveryType     - 恢复类型
 * @param {boolean} params.recovered       - 是否恢复成功
 * @param {string} params.executor         - 执行器
 * @param {string} [params.recoveryPlanId] - 恢复计划 ID
 * @param {number} [params.totalSteps]     - 恢复步骤数
 * @param {string} [params.description]    - 恢复描述
 * @param {Object} [params.metadata]       - 额外元数据
 * @returns {boolean}
 */
function appendRecovery(params) {
  if (!params.correlationId || !params.timestamp) {
    throw new Error('[memory-writer] appendRecovery: correlationId and timestamp are mandatory');
  }
  return _append('recoveries', {
    correlationId: params.correlationId,
    timestamp: params.timestamp,
    recoveryType: params.recoveryType || 'UNKNOWN',
    recovered: params.recovered === true,
    executor: params.executor || 'unknown',
    recoveryPlanId: params.recoveryPlanId || null,
    totalSteps: typeof params.totalSteps === 'number' ? params.totalSteps : 0,
    description: (params.description || '').substring(0, 1000),
    agent: params.agent || 'unknown',
    status: params.recovered ? 'resolved' : 'failed',
    summary: params.summary || '',
    metadata: params.metadata || {}
  });
}

/**
 * appendStrategy — 写入策略记忆
 *
 * @param {Object} params
 * @param {string} params.correlationId    - 关联 ID（必填）
 * @param {string} params.timestamp        - ISO 8601 时间戳（必填）
 * @param {string} params.strategyType     - 策略类型: gmv/roi/recovery/runtime_optimization
 * @param {string} params.strategyName     - 策略名称
 * @param {Object} params.strategyConfig   - 策略配置
 * @param {string} [params.description]    - 策略描述
 * @param {string} [params.agent]          - 执行 Agent
 * @param {Object} [params.metadata]       - 额外元数据
 * @returns {boolean}
 */
function appendStrategy(params) {
  if (!params.correlationId || !params.timestamp) {
    throw new Error('[memory-writer] appendStrategy: correlationId and timestamp are mandatory');
  }
  return _append('strategies', {
    correlationId: params.correlationId,
    timestamp: params.timestamp,
    strategyType: params.strategyType || 'general',
    strategyName: params.strategyName || 'unnamed',
    strategyConfig: params.strategyConfig || {},
    description: (params.description || '').substring(0, 1000),
    agent: params.agent || 'unknown',
    summary: params.summary || '',
    metadata: params.metadata || {}
  });
}

/**
 * appendExecution — 写入执行记录
 *
 * @param {Object} params
 * @param {string} params.correlationId  - 关联 ID（必填）
 * @param {string} params.timestamp      - ISO 8601 时间戳（必填）
 * @param {string} params.executor       - 执行器
 * @param {string} params.command        - 命令
 * @param {boolean} params.success       - 是否成功
 * @param {number} params.durationMs     - 耗时
 * @param {string} [params.output]       - 输出
 * @param {string} [params.error]        - 错误
 * @param {Object} [params.metadata]     - 额外元数据
 * @returns {boolean}
 */
function appendExecution(params) {
  if (!params.correlationId || !params.timestamp) {
    throw new Error('[memory-writer] appendExecution: correlationId and timestamp are mandatory');
  }
  return _append('memory', {
    correlationId: params.correlationId,
    timestamp: params.timestamp,
    type: 'execution',
    agent: params.agent || 'unknown',
    status: params.success ? 'success' : 'failed',
    summary: (params.command || '').substring(0, 200),
    metadata: {
      executor: params.executor || 'unknown',
      command: (params.command || '').substring(0, 500),
      success: params.success === true,
      durationMs: typeof params.durationMs === 'number' ? params.durationMs : 0,
      output: (params.output || '').substring(0, 500),
      error: (params.error || '').substring(0, 500),
      ...(params.metadata || {})
    }
  });
}

// ─── 维护 API ────────────────────────────────────────────────

/**
 * 清除指定类型的日志（测试用）
 *
 * @param {string} type - 'memory' | 'incidents' | 'recoveries' | 'strategies' | 'all'
 * @returns {boolean}
 */
function clearLogs(type) {
  try {
    var types = type === 'all'
      ? Object.keys(LOG_PATHS)
      : [type];

    for (var i = 0; i < types.length; i++) {
      var logPath = getLogPath(types[i]);
      if (fs.existsSync(logPath)) {
        fs.unlinkSync(logPath);
      }
    }
    return true;
  } catch (err) {
    console.error('[memory-writer] 清除日志失败:', err.message);
    return false;
  }
}

/**
 * 获取日志文件信息
 *
 * @param {string} type
 * @returns {{ exists: boolean, size: number, path: string }}
 */
function getLogInfo(type) {
  var logPath = getLogPath(type);
  var exists = fs.existsSync(logPath);
  var size = exists ? fs.statSync(logPath).size : 0;
  return { exists: exists, size: size, path: logPath };
}

module.exports = {
  // 写入 API
  appendMemory: appendMemory,
  appendIncident: appendIncident,
  appendRecovery: appendRecovery,
  appendStrategy: appendStrategy,
  appendExecution: appendExecution,

  // 维护
  clearLogs: clearLogs,
  getLogInfo: getLogInfo,
  getLogPath: getLogPath
};
