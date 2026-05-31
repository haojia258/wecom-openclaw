'use strict';

/**
 * execution-feedback-log.js — 执行反馈审计链 (P9.1)
 *
 * 记录 Execution Feedback Loop 的完整审计链：
 *   - classify（分类结果）
 *   - retry（重试记录）
 *   - recovery（恢复记录）
 *   - final result（最终结果）
 *
 * 日志路径: logs/runtime/execution-feedback.log
 *
 * 日志格式: JSONL
 */

var fs = require('fs');
var path = require('path');

// ─── 日志路径 ────────────────────────────────────────────────

function getFeedbackLogPath() {
  if (process.env.EXECUTION_FEEDBACK_LOG_PATH) {
    return process.env.EXECUTION_FEEDBACK_LOG_PATH;
  }
  return path.resolve(__dirname, '..', '..', 'logs', 'runtime', 'execution-feedback.log');
}

function ensureLogDir(filePath) {
  var dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─── Phase 枚举 ──────────────────────────────────────────────

var FeedbackPhase = {
  CLASSIFY:   'CLASSIFY',
  RETRY:      'RETRY',
  RECOVERY:   'RECOVERY',
  FINAL:      'FINAL'
};

// ─── 写入 API ────────────────────────────────────────────────

/**
 * 写入一条反馈日志
 */
function writeFeedbackEntry(entry) {
  try {
    var logPath = getFeedbackLogPath();
    ensureLogDir(logPath);

    var record = {
      correlationId: entry.correlationId || 'unknown',
      phase: entry.phase || FeedbackPhase.FINAL,
      timestamp: new Date().toISOString()
    };

    // 合并所有字段
    var keys = Object.keys(entry);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k !== 'correlationId' && k !== 'phase' && k !== 'timestamp') {
        record[k] = entry[k];
      }
    }

    fs.appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf-8');
    return true;
  } catch (err) {
    console.error('[feedback-log] 写入反馈日志失败:', err.message);
    return false;
  }
}

/**
 * 记录 classify 阶段
 */
function logClassify(params) {
  return writeFeedbackEntry({
    correlationId: params.correlationId,
    phase: FeedbackPhase.CLASSIFY,
    executor: params.executor,
    protocol: params.protocol,
    classificationType: params.classificationType,
    retryable: params.retryable,
    reason: params.reason,
    error: (params.error || '').substring(0, 300)
  });
}

/**
 * 记录 retry 阶段
 */
function logRetry(params) {
  return writeFeedbackEntry({
    correlationId: params.correlationId,
    phase: FeedbackPhase.RETRY,
    executor: params.executor,
    attempt: params.attempt,
    maxRetry: params.maxRetry,
    delayMs: params.delayMs,
    failureType: params.failureType,
    success: params.success
  });
}

/**
 * 记录 recovery 阶段
 */
function logRecovery(params) {
  return writeFeedbackEntry({
    correlationId: params.correlationId,
    phase: FeedbackPhase.RECOVERY,
    executor: params.executor,
    recoveryPlanId: params.recoveryPlanId,
    totalSteps: params.totalSteps,
    stagingSafe: params.stagingSafe,
    description: params.description
  });
}

/**
 * 记录最终结果
 */
function logFinal(params) {
  return writeFeedbackEntry({
    correlationId: params.correlationId,
    phase: FeedbackPhase.FINAL,
    executor: params.executor,
    finalResult: params.finalResult,
    totalRetries: params.totalRetries || 0,
    recoveryAttempted: params.recoveryAttempted || false,
    recovered: params.recovered || false,
    output: (params.output || '').substring(0, 200),
    error: (params.error || '').substring(0, 200)
  });
}

// ─── 读取 API ────────────────────────────────────────────────

/**
 * 按 correlationId 查询完整反馈链
 */
function queryFeedbackChain(correlationId) {
  try {
    var logPath = getFeedbackLogPath();
    if (!fs.existsSync(logPath)) return [];

    var content = fs.readFileSync(logPath, 'utf-8');
    var lines = content.trim().split('\n').filter(function(l) { return l.trim(); });
    var chain = [];

    for (var i = 0; i < lines.length; i++) {
      try {
        var entry = JSON.parse(lines[i]);
        if (entry.correlationId === correlationId) {
          chain.push(entry);
        }
      } catch (_) {}
    }

    return chain;
  } catch (err) {
    console.error('[feedback-log] 查询反馈链失败:', err.message);
    return [];
  }
}

/**
 * 读取最近的 N 条反馈日志
 */
function readRecentFeedback(limit) {
  limit = limit || 50;
  try {
    var logPath = getFeedbackLogPath();
    if (!fs.existsSync(logPath)) return [];

    var content = fs.readFileSync(logPath, 'utf-8');
    var lines = content.trim().split('\n').filter(function(l) { return l.trim(); });
    var entries = [];

    var startIdx = Math.max(0, lines.length - limit);
    for (var i = startIdx; i < lines.length; i++) {
      try {
        entries.push(JSON.parse(lines[i]));
      } catch (_) {}
    }
    return entries;
  } catch (err) {
    console.error('[feedback-log] 读取反馈日志失败:', err.message);
    return [];
  }
}

/**
 * 清除反馈日志（测试用）
 */
function clearFeedbackLog() {
  try {
    var logPath = getFeedbackLogPath();
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
    return true;
  } catch (err) {
    console.error('[feedback-log] 清除日志失败:', err.message);
    return false;
  }
}

/**
 * 获取日志信息
 */
function getFeedbackLogInfo() {
  var logPath = getFeedbackLogPath();
  var exists = fs.existsSync(logPath);
  var size = exists ? fs.statSync(logPath).size : 0;
  return { exists: exists, size: size, path: logPath };
}

// ─── 导出 ────────────────────────────────────────────────────

module.exports = {
  FeedbackPhase: FeedbackPhase,
  writeFeedbackEntry: writeFeedbackEntry,
  logClassify: logClassify,
  logRetry: logRetry,
  logRecovery: logRecovery,
  logFinal: logFinal,
  queryFeedbackChain: queryFeedbackChain,
  readRecentFeedback: readRecentFeedback,
  clearFeedbackLog: clearFeedbackLog,
  getFeedbackLogInfo: getFeedbackLogInfo,
  getFeedbackLogPath: getFeedbackLogPath
};
