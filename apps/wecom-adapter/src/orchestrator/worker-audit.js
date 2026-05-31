'use strict';

/**
 * worker-audit.js — Worker 调用审计
 *
 * 记录每次 OpenAI Worker 调用的关键信息。
 *
 * 记录:
 *   - worker (codex)
 *   - model (gpt-4o)
 *   - latency (ms)
 *   - tokenEstimate (基于输出长度的粗略估算)
 *   - resultStatus (success / error / rejected)
 *
 * 禁止记录:
 *   - prompt 全文
 *   - API key
 *   - token (精确值)
 *
 * 存储: storage/orchestrator/worker-audit-YYYYMMDD.jsonl
 *
 * Phase2-B: Worker Safety Layer
 */

const fs = require('fs');
const path = require('path');

var STORAGE_DIR = null;

/**
 * 获取存储目录
 */
function getStorageDir() {
  if (STORAGE_DIR) return STORAGE_DIR;
  STORAGE_DIR = path.join(__dirname, '..', '..', '..', 'storage', 'orchestrator');
  return STORAGE_DIR;
}

/**
 * 设置存储目录（用于测试）
 */
function setStorageDir(dir) {
  STORAGE_DIR = dir;
}

/**
 * 获取今天的审计日志文件路径
 */
function getAuditFilePath() {
  var now = new Date();
  var yyyy = now.getFullYear();
  var mm = String(now.getMonth() + 1).padStart(2, '0');
  var dd = String(now.getDate()).padStart(2, '0');
  var dir = getStorageDir();
  return path.join(dir, 'worker-audit-' + yyyy + mm + dd + '.jsonl');
}

/**
 * 估算 token 数量（基于输出文本长度的粗略估算）
 * 英语: ~4 字符/token, 中文: ~1.5 字符/token
 * 保守估计取 ~3 字符/token
 *
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3);
}

/**
 * 记录一次 Worker 调用
 *
 * @param {object} entry
 * @param {string} entry.worker        - worker 名称 (codex)
 * @param {string} entry.model         - 模型 (gpt-4o)
 * @param {string} entry.taskId        - 任务 ID
 * @param {number} entry.latency       - 调用耗时 (ms)
 * @param {string} entry.resultStatus  - success | error | rejected
 * @param {string} [entry.rejectReason] - 拒绝原因 (仅 rejected 时)
 * @param {string} [entry.outputText]  - 输出文本 (仅用于估算 token, 不存储原文)
 * @param {string} [entry.errorMessage] - 错误消息 (已 sanitized)
 * @param {number} [entry.promptHash]  - prompt hash (安全标识)
 */
function record(entry) {
  var worker = entry.worker || 'unknown';
  var model = entry.model || 'unknown';
  var taskId = entry.taskId || 'unknown';
  var latency = typeof entry.latency === 'number' ? entry.latency : -1;
  var resultStatus = entry.resultStatus || 'unknown';
  var outputText = entry.outputText || '';

  // 估算 token (不存储原文)
  var tokenEstimate = estimateTokens(outputText);

  var record = {
    ts: new Date().toISOString(),
    worker: worker,
    model: model,
    taskId: taskId,
    latency: latency,
    tokenEstimate: tokenEstimate,
    resultStatus: resultStatus,
  };

  // 只在特定情况下附加额外信息
  if (resultStatus === 'rejected' && entry.rejectReason) {
    record.rejectReason = entry.rejectReason;
  }
  if (resultStatus === 'error' && entry.errorMessage) {
    record.errorMessage = entry.errorMessage;
  }
  if (entry.promptHash) {
    record.promptHash = entry.promptHash;
  }

  // 写入文件
  try {
    var dir = getStorageDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    var filePath = getAuditFilePath();
    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
  } catch (e) {
    // 审计写入失败不应影响主流程
    console.error('[worker-audit] 写入失败:', e.message);
  }
}

/**
 * 读取今天的审计日志
 * @returns {object[]}
 */
function readToday() {
  try {
    var filePath = getAuditFilePath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    var content = fs.readFileSync(filePath, 'utf-8').trim();
    if (!content) return [];
    return content.split('\n').map(function (line) {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

/**
 * 获取统计摘要
 * @returns {{ total: number, success: number, error: number, rejected: number, avgLatency: number }}
 */
function getStats() {
  var records = readToday();
  var stats = { total: 0, success: 0, error: 0, rejected: 0, avgLatency: 0 };
  var latencySum = 0;
  var latencyCount = 0;

  records.forEach(function (r) {
    stats.total++;
    if (r.resultStatus === 'success') stats.success++;
    if (r.resultStatus === 'error') stats.error++;
    if (r.resultStatus === 'rejected') stats.rejected++;
    if (typeof r.latency === 'number' && r.latency >= 0) {
      latencySum += r.latency;
      latencyCount++;
    }
  });

  if (latencyCount > 0) {
    stats.avgLatency = Math.round(latencySum / latencyCount);
  }
  return stats;
}

/**
 * 重置（仅用于测试）
 */
function reset() {
  // 清除当日内存缓存（无持久缓存）
  STORAGE_DIR = null;
}

module.exports = {
  record: record,
  readToday: readToday,
  getStats: getStats,
  estimateTokens: estimateTokens,
  setStorageDir: setStorageDir,
  getStorageDir: getStorageDir,
  reset: reset,
};
