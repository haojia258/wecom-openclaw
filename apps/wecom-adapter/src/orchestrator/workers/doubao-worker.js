'use strict';

/**
 * doubao-worker.js — Doubao Runtime Worker (P12.5)
 *
 * 调用豆包 Ark API (火山引擎) 执行 AI 任务。
 * 复用 provider-worker.js 统一 HTTP Client。
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

var DOUBAO_API_KEY = process.env.DOUBAO_API_KEY || '';
var DOUBAO_BASE_URL = process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
var DOUBAO_MODEL = process.env.DOUBAO_MODEL || 'doubao-pro';

// Parse hostname from base URL
var BASE_HOST = (function () {
  try {
    var u = new (require('url').URL)(DOUBAO_BASE_URL);
    return u.hostname;
  } catch (_) {
    return 'ark.cn-beijing.volces.com';
  }
})();

var BASE_PATH = (function () {
  try {
    var u = new (require('url').URL)(DOUBAO_BASE_URL);
    return u.pathname + '/chat/completions';
  } catch (_) {
    return '/api/v3/chat/completions';
  }
})();

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

// ─── Doubao API 调用 ───────────────────────────────────────

function callDoubao(task) {
  var prompt = task.userRequest || '';
  var systemPrompt = 'You are an AI assistant specialized in content generation, creative copywriting, video scripts, and marketing strategy for a Douyin e-commerce business (抖店) selling instant noodles (酸辣粉). Provide engaging, creative content.';

  return callChatCompletions({
    hostname: BASE_HOST,
    path: BASE_PATH,
    apiKey: DOUBAO_API_KEY,
    model: DOUBAO_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature: 0.8,
    maxTokens: 4096,
    timeout: 60000,
  });
}

// ─── 主入口 ────────────────────────────────────────────────

/**
 * 执行 Doubao Worker
 * @param {object} task - 任务对象
 * @returns {Promise<object>} artifact
 */
function executeDoubaoWorker(task) {
  return new Promise(function (resolve) {
    // 1. Feature Gate
    var featureGate = getFeatureGate();
    if (featureGate && typeof featureGate.check === 'function') {
      var gateResult = featureGate.check('doubao', task.taskId);
      if (gateResult && gateResult.blocked) {
        auditEvent('multi_agent_runtime_blocked', { reason: gateResult.reason, taskId: task.taskId });
        resolve({
          ok: false,
          taskId: task.taskId,
          workerId: 'doubao-runtime',
          provider: 'doubao',
          error: 'GATE_DISABLED: DOUBAO_RUNTIME_ENABLED is not true',
          safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
        });
        return;
      }
    }

    // 2. API Key check
    if (!DOUBAO_API_KEY || DOUBAO_API_KEY.trim() === '') {
      auditEvent('multi_agent_runtime_blocked', { reason: 'api_key_missing', taskId: task.taskId });
      resolve({
        ok: false,
        taskId: task.taskId,
        workerId: 'doubao-runtime',
        provider: 'doubao',
        error: 'api_key_missing: DOUBAO_API_KEY not set',
        safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
      });
      return;
    }

    // 3. Allowlist
    var allowlist = getAllowlist();
    if (allowlist && typeof allowlist.check === 'function') {
      var allowResult = allowlist.check('doubao', task.taskId);
      if (allowResult && allowResult.blocked) {
        resolve({
          ok: false, taskId: task.taskId, workerId: 'doubao-runtime', provider: 'doubao',
          error: 'Doubao Worker blocked by allowlist', safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
        });
        return;
      }
    }

    // 4. Rate Limit
    var rateLimit = getRateLimit();
    if (rateLimit && typeof rateLimit.check === 'function') {
      var rateResult = rateLimit.check('doubao');
      if (rateResult && !rateResult.allowed) {
        resolve({
          ok: false, taskId: task.taskId, workerId: 'doubao-runtime', provider: 'doubao',
          error: 'Doubao Worker rate limited', safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
        });
        return;
      }
    }

    // 5. Audit: start
    auditEvent('multi_agent_runtime_called', {
      taskId: task.taskId,
      model: DOUBAO_MODEL,
    });

    // 6. Call Doubao API
    var startTime = Date.now();
    callDoubao(task).then(function (result) {
      var latency = Date.now() - startTime;
      var outputText = result.text || '';

      auditEvent('multi_agent_runtime_completed', {
        taskId: task.taskId,
        model: result.model,
        latencyMs: latency,
        resultStatus: 'success',
      });

      if (rateLimit && typeof rateLimit.release === 'function') rateLimit.release();

      resolve({
        ok: true,
        taskId: task.taskId,
        workerId: 'doubao-runtime',
        provider: 'doubao',
        model: result.model || DOUBAO_MODEL,
        latencyMs: latency,
        outputText: outputText,
        usage: result.usage,
        safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
      });
    }).catch(function (err) {
      var latency = Date.now() - startTime;

      auditEvent('multi_agent_runtime_failed', {
        taskId: task.taskId,
        model: DOUBAO_MODEL,
        latencyMs: latency,
        errorMessage: err.message,
      });

      if (rateLimit && typeof rateLimit.release === 'function') rateLimit.release();

      resolve({
        ok: false,
        taskId: task.taskId,
        workerId: 'doubao-runtime',
        provider: 'doubao',
        model: DOUBAO_MODEL,
        latencyMs: latency,
        error: err.message,
        safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
      });
    });
  });
}

// ─── 审计 ──────────────────────────────────────────────────

function auditEvent(eventType, data) {
  var audit = getAudit();
  if (audit && typeof audit.record === 'function') {
    try {
      audit.record({
        type: eventType,
        provider: 'doubao',
        workerId: 'doubao-runtime',
        ts: new Date().toISOString(),
        ...data,
      });
    } catch (_) {}
  }
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  executeDoubaoWorker: executeDoubaoWorker,
  _callDoubao: callDoubao,
  _auditEvent: auditEvent,
  DOUBAO_MODEL: DOUBAO_MODEL,
  DOUBAO_BASE_URL: DOUBAO_BASE_URL,
};
