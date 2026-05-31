'use strict';

/**
 * deepseek-worker.js — DeepSeek Runtime Worker
 *
 * 调用 DeepSeek Chat API (api.deepseek.com) 执行 AI 任务。
 * 复用安全层: feature-gate / allowlist / rate-limit / audit。
 *
 * 安全约束:
 *   - REVIEW_ONLY__NO_AUTO_APPLY
 *   - 产物仅写入 artifact 目录
 *   - 不修改 .env/nginx/Vault/密钥
 *   - 不执行 deploy/merge/下单/改价/报名
 */

var path = require('path');
var fs = require('fs');
var { callChatCompletions } = require('./provider-worker');

// ─── 配置 ──────────────────────────────────────────────────

var DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
var DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com';
var DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
var DEEPSEEK_HOST = 'api.deepseek.com';

// ─── 安全层延迟加载 ────────────────────────────────────────

var _featureGate = null;
var _allowlist = null;
var _rateLimit = null;
var _audit = null;

function getFeatureGate() {
  if (!_featureGate) {
    try { _featureGate = require('../worker-feature-gate'); } catch (_) { _featureGate = {}; }
  }
  return _featureGate;
}

function getAllowlist() {
  if (!_allowlist) {
    try { _allowlist = require('../worker-allowlist'); } catch (_) { _allowlist = {}; }
  }
  return _allowlist;
}

function getRateLimit() {
  if (!_rateLimit) {
    try { _rateLimit = require('../worker-rate-limit'); } catch (_) { _rateLimit = {}; }
  }
  return _rateLimit;
}

function getAudit() {
  if (!_audit) {
    try { _audit = require('../worker-audit'); } catch (_) { _audit = {}; }
  }
  return _audit;
}

// ─── DeepSeek API 调用 ─────────────────────────────────────

function callDeepSeek(task) {
  var prompt = task.userRequest || '';
  var systemPrompt = 'You are an AI assistant specialized in data analysis, trend prediction, risk analysis, and strategic planning for a Douyin e-commerce business (抖店). Provide thorough, structured analysis.';

  return callChatCompletions({
    hostname: DEEPSEEK_HOST,
    apiKey: DEEPSEEK_API_KEY,
    model: DEEPSEEK_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    maxTokens: 4096,
    timeout: 60000,
  });
}

// ─── 主入口 ────────────────────────────────────────────────

/**
 * 执行 DeepSeek Worker
 * @param {object} task - 任务对象
 * @returns {Promise<object>} artifact
 */
function executeDeepSeekWorker(task) {
  return new Promise(function (resolve, reject) {
    // 1. Feature Gate
    var featureGate = getFeatureGate();
    if (featureGate && typeof featureGate.check === 'function') {
      var gateResult = featureGate.check('deepseek', task.taskId);
      if (gateResult && gateResult.blocked) {
        resolve({
          taskId: task.taskId,
          assignee: 'deepseek',
          error: 'DeepSeek Worker blocked by feature gate: ' + (gateResult.reason || 'disabled'),
        });
        return;
      }
    }

    // 2. Allowlist
    var allowlist = getAllowlist();
    if (allowlist && typeof allowlist.check === 'function') {
      var allowResult = allowlist.check('deepseek', task.taskId);
      if (allowResult && allowResult.blocked) {
        resolve({
          taskId: task.taskId,
          assignee: 'deepseek',
          error: 'DeepSeek Worker blocked by allowlist',
        });
        return;
      }
    }

    // 3. Rate Limit
    var rateLimit = getRateLimit();
    if (rateLimit && typeof rateLimit.check === 'function') {
      var rateResult = rateLimit.check('deepseek');
      if (rateResult && !rateResult.allowed) {
        resolve({
          taskId: task.taskId,
          assignee: 'deepseek',
          error: 'DeepSeek Worker rate limited',
        });
        return;
      }
    }

    // 4. Audit: start
    var audit = getAudit();
    if (audit && typeof audit.record === 'function') {
      audit.record({
        worker: 'deepseek',
        taskId: task.taskId,
        event: 'multi_agent_runtime_called',
        model: DEEPSEEK_MODEL,
        ts: new Date().toISOString(),
      });
    }

    // 5. Call DeepSeek API
    var startTime = Date.now();
    callDeepSeek(task).then(function (result) {
      var latency = Date.now() - startTime;
      var outputText = result.text || '';

      // 6. Audit: success
      if (audit && typeof audit.record === 'function') {
        audit.record({
          worker: 'deepseek',
          taskId: task.taskId,
          event: 'multi_agent_runtime_completed',
          model: result.model,
          latency: latency,
          tokenEstimate: result.usage ? result.usage.total_tokens : outputText.length,
          resultStatus: 'success',
          ts: new Date().toISOString(),
        });
      }

      if (rateLimit && typeof rateLimit.release === 'function') rateLimit.release();

      resolve({
        taskId: task.taskId,
        assignee: 'deepseek',
        model: result.model,
        outputText: outputText,
        usage: result.usage,
        latency: latency,
        safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY — DeepSeek Runtime artifact',
      });
    }).catch(function (err) {
      var latency = Date.now() - startTime;

      // Audit: failure
      if (audit && typeof audit.record === 'function') {
        audit.record({
          worker: 'deepseek',
          taskId: task.taskId,
          event: 'multi_agent_runtime_failed',
          model: DEEPSEEK_MODEL,
          latency: latency,
          errorMessage: err.message,
          resultStatus: 'error',
          ts: new Date().toISOString(),
        });
      }

      if (rateLimit && typeof rateLimit.release === 'function') rateLimit.release();

      resolve({
        taskId: task.taskId,
        assignee: 'deepseek',
        model: DEEPSEEK_MODEL,
        error: err.message,
        safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
      });
    });
  });
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  executeDeepSeekWorker: executeDeepSeekWorker,
  _callDeepSeek: callDeepSeek,
  DEEPSEEK_MODEL: DEEPSEEK_MODEL,
  DEEPSEEK_HOST: DEEPSEEK_HOST,
};
