'use strict';

/**
 * openai-worker.js — Phase2-A OpenAI/Codex 真实 Worker
 *
 * 使用 Node.js 内置 https 模块调用 OpenAI API (gpt-4o)
 * 不改变 Runtime Core，不自动 apply，不自动 merge
 *
 * 环境变量:
 *   OPENAI_API_KEY          — OpenAI API Key (从 .env / Vault 读取)
 *   OPENAI_WORKER_ENABLED   — 灰度开关 (默认 false, Phase2-B)
 *   OPENAI_PROXY_HOST       — HTTP 代理主机 (Phase2-D: 日本中转)
 *   OPENAI_PROXY_PORT       — HTTP 代理端口 (默认 18080)
 *   OPENAI_PROXY_USER       — 代理认证用户名
 *   OPENAI_PROXY_PASS       — 代理认证密码
 *
 * 安全层 (Phase2-B):
 *   - worker-feature-gate: 灰度开关
 *   - worker-allowlist:    白名单任务限制
 *   - worker-rate-limit:   调用限流
 *   - worker-audit:        调用审计
 *
 * 安全约束:
 *   - 禁止打印/日志 API Key
 *   - 禁止将 key 写入 audit/artifact
 *   - 禁止将 prompt 原文写入日志 (只写 hash)
 */

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const tls = require('tls');
const net = require('net');
const path = require('path');
const fs = require('fs');

// 从 Vault 读取 OPENAI_API_KEY（非直接读取 .env）
// 延迟加载 vault-client（首次 require 时初始化）
let _vault = null;
function getVault() {
  if (!_vault) {
    try { _vault = require('../../lib/vault-client'); } catch (e) { _vault = null; }
  }
  return _vault;
}

// 延迟加载 dotenv (如果可用，仅用于非敏感配置)
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });
} catch (e) {
  // dotenv 未安装，依赖外部已加载的环境变量
}

// Phase2-B 安全层模块 (延迟加载，测试友好)
var _featureGate = null;
var _allowlist = null;
var _rateLimit = null;
var _workerAudit = null;

function getFeatureGate() {
  if (!_featureGate) {
    try { _featureGate = require('../worker-feature-gate'); } catch (e) { _featureGate = null; }
  }
  return _featureGate;
}

function getAllowlist() {
  if (!_allowlist) {
    try { _allowlist = require('../worker-allowlist'); } catch (e) { _allowlist = null; }
  }
  return _allowlist;
}

function getRateLimit() {
  if (!_rateLimit) {
    try { _rateLimit = require('../worker-rate-limit'); } catch (e) { _rateLimit = null; }
  }
  return _rateLimit;
}

function getWorkerAudit() {
  if (!_workerAudit) {
    try { _workerAudit = require('../worker-audit'); } catch (e) { _workerAudit = null; }
  }
  return _workerAudit;
}

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 4096;
const API_TIMEOUT_MS = 60 * 1000; // 60 秒超时
const API_VERSION = 'v1';
const API_HOST = 'api.openai.com';

/**
 * 计算字符串 hash (用于安全日志记录)
 * @param {string} text
 * @returns {string} sha256 hex 前 12 位
 */
function hashText(text) {
  if (!text) return 'none';
  return crypto.createHash('sha256').update(text).digest('hex').substring(0, 12);
}

/**
 * 清理错误消息中的敏感信息（API Key / Token / Authorization Header）
 * @param {string} msg
 * @returns {string}
 */
function sanitizeError(msg) {
  if (!msg) return '';
  return msg
    .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_KEY]')
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]{10,}/gi, 'Bearer [REDACTED]')
    .replace(/Authorization:\s*[^\s]+/gi, 'Authorization: [REDACTED]');
}

/**
 * Phase2-D: 获取 HTTP 代理配置
 * @returns {object|null} { host, port, user, pass } 或 null (不启用代理)
 */
function getProxyConfig() {
  const host = process.env.OPENAI_PROXY_HOST;
  if (!host) return null;
  return {
    host: host,
    port: parseInt(process.env.OPENAI_PROXY_PORT, 10) || 18080,
    user: process.env.OPENAI_PROXY_USER || '',
    pass: process.env.OPENAI_PROXY_PASS || '',
  };
}

/**
 * Phase2-D: 创建路由到 HTTP 代理的 https.Agent
 *
 * 使用 Node.js 原生 http.CONNECT 方法建立隧道，然后 TLS 升级。
 * 不引入外部依赖 (如 https-proxy-agent)。
 *
 * @param {object} proxyCfg - { host, port, user, pass }
 * @returns {https.Agent}
 */
function createProxyAgent(proxyCfg) {
  // Phase2-D: 使用原型继承创建 Agent (Node 20 不支持 options 传入 createConnection)
  // 采用 net.Socket + 手动 CONNECT + TLS 升级 (兼容 SSH 隧道 + sing-box 代理链)
  function ProxyAgent() {
    https.Agent.call(this, { keepAlive: false });
  }
  require('util').inherits(ProxyAgent, https.Agent);

  var authHeader = '';
  if (proxyCfg.user) {
    authHeader = 'Basic ' + Buffer.from(proxyCfg.user + ':' + proxyCfg.pass).toString('base64');
  }

  ProxyAgent.prototype.createConnection = function (options, callback) {
    var targetHost = options.host || options.hostname;
    var targetPort = options.port || 443;
    var sock = new net.Socket();

    sock.connect({ host: proxyCfg.host, port: proxyCfg.port }, function () {
      var connectReq = 'CONNECT ' + targetHost + ':' + targetPort + ' HTTP/1.1\r\n' +
        'Host: ' + targetHost + ':' + targetPort + '\r\n';
      if (authHeader) {
        connectReq += 'Proxy-Authorization: ' + authHeader + '\r\n';
      }
      connectReq += '\r\n';
      sock.write(connectReq);

      var buf = '';
      sock.on('data', function onProxyResponse(d) {
        buf += d.toString();
        if (buf.indexOf('\r\n\r\n') === -1) return;
        sock.removeListener('data', onProxyResponse);

        if (buf.indexOf('200') === -1) {
          sock.destroy();
          return callback(new Error('代理 CONNECT 失败: ' + buf.split('\r\n')[0]));
        }

        var tlsSocket = tls.connect({
          socket: sock,
          servername: targetHost,
          rejectUnauthorized: false,
        }, function () {
          callback(null, tlsSocket);
        });

        tlsSocket.on('error', function (err) {
          callback(err);
        });
      });
    });

    sock.on('error', function (err) {
      callback(err);
    });
  };

  return new ProxyAgent();
}

/**
 * 调用 OpenAI Chat Completions API
 *
 * @param {object}  opts
 * @param {string}  opts.taskId        - 任务 ID
 * @param {string}  opts.prompt        - 用户提示词 (dispatch payload)
 * @param {string}  [opts.model]      - 模型 (默认 gpt-4o)
 * @param {number}  [opts.temperature] - 温度 (默认 0.7)
 * @param {number}  [opts.maxTokens]   - 最大 token (默认 4096)
 * @returns {Promise<object>} { taskId, assignee, model, promptHash, outputText, createdAt, safetyNote }
 */
function callOpenAI(opts) {
  const taskId = opts.taskId || 'unknown';
  const prompt = (opts.prompt || '').trim();
  const model = opts.model || DEFAULT_MODEL;
  const temperature = typeof opts.temperature === 'number' ? opts.temperature : DEFAULT_TEMPERATURE;
  const maxTokens = typeof opts.maxTokens === 'number' ? opts.maxTokens : DEFAULT_MAX_TOKENS;

  const promptHash = hashText(prompt);

  return new Promise(function (resolve, reject) {
    const vault = getVault();
    const vaultKey = vault ? vault.tryGet('OPENAI_API_KEY') : null;
    const apiKey = vaultKey || process.env.OPENAI_API_KEY || '';

    // 1. 检查 API Key
    if (!apiKey) {
      return reject(new Error('未配置 OPENAI_API_KEY，任务保持 dispatched 状态'));
    }

    // 2. 构建请求体
    const requestBody = JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant specialized in software development and DevOps.' },
        { role: 'user', content: prompt },
      ],
      temperature: temperature,
      max_tokens: maxTokens,
    });

    // 3. 构建请求选项 (Phase2-D: 支持 HTTP 代理)
    const proxyCfg = getProxyConfig();
    const options = {
      hostname: API_HOST,
      path: '/' + API_VERSION + '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(requestBody),
      },
      timeout: API_TIMEOUT_MS,
    };

    // Phase2-D: 如果配置了代理，注入 agent
    if (proxyCfg) {
      try {
        options.agent = createProxyAgent(proxyCfg);
      } catch (e) {
        return reject(new Error('代理初始化失败: ' + e.message));
      }
    }

    // 4. 发起 HTTPS 请求
    const req = https.request(options, function (res) {
      let data = '';

      res.on('data', function (chunk) {
        data += chunk;
      });

      res.on('end', function () {
        try {
          const parsed = JSON.parse(data);

          // 4a. API 返回错误
          if (parsed.error) {
            return reject(new Error('OpenAI API 错误: ' + (parsed.error.message || '未知错误')));
          }

          // 4b. 提取输出文本
          const outputText = parsed.choices && parsed.choices[0] && parsed.choices[0].message
            ? parsed.choices[0].message.content
            : '';

          if (!outputText) {
            return reject(new Error('OpenAI API 返回空输出'));
          }

          // 4c. 构建产物
          const artifact = {
            taskId: taskId,
            assignee: 'codex',
            model: model,
            promptHash: promptHash,
            outputText: outputText,
            createdAt: new Date().toISOString(),
            safetyNote: 'REVIEW_ONLY__NO_AUTO_APPLY',
          };

          resolve(artifact);
        } catch (e) {
          reject(new Error('解析 OpenAI API 响应失败: ' + e.message));
        }
      });
    });

    req.on('error', function (e) {
      reject(new Error('OpenAI API 请求失败: ' + e.message));
    });

    req.on('timeout', function () {
      req.destroy();
      reject(new Error('OpenAI API 请求超时 (' + (API_TIMEOUT_MS / 1000) + 's)'));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * 执行 OpenAI Worker
 *
 * Phase2-B: 集成安全层检查
 *   1. Feature Gate (灰度开关)
 *   2. Allowlist   (白名单任务)
 *   3. Rate Limit  (调用限流)
 *   4. Audit       (调用审计)
 *
 * @param {object} task - 任务对象 { taskId, userRequest, assignee, ... }
 * @returns {Promise<object>} artifact 或 { error, taskId }
 */
function executeOpenAIWorker(task) {
  const taskId = task.taskId || 'unknown';
  const startTime = Date.now();

  // ======== Phase2-B 安全层 ========

  // 1. 灰度开关检查
  const featureGate = getFeatureGate();
  if (featureGate) {
    const gateResult = featureGate.check({ taskId: taskId, assignee: 'codex' });
    if (gateResult && !gateResult.allowed) {
      return Promise.resolve(makeRejection(task, 'gate_disabled', gateResult.reason, startTime));
    }
  }

  // 2. 白名单检查
  const allowlist = getAllowlist();
  if (allowlist) {
    const allowResult = allowlist.check(task);
    if (!allowResult.allowed) {
      return Promise.resolve(makeRejection(task, 'blocked', allowResult.reason, startTime));
    }
  }

  // 3. 限流检查
  const rateLimit = getRateLimit();
  if (rateLimit) {
    const rateResult = rateLimit.check(taskId);
    if (!rateResult.allowed) {
      return Promise.resolve(makeRejection(task, 'rate_limited', rateResult.reason, startTime));
    }
  }

  // ======== 执行真实调用 ========

  return callOpenAI({
    taskId: taskId,
    prompt: buildPrompt(task),
    model: getModelForTask(task),
  }).then(function (artifact) {
    // 释放限流并发槽位
    if (rateLimit) rateLimit.release();

    // 审计: 成功
    recordAudit(task, 'success', startTime, artifact.outputText);
    return artifact;
  }).catch(function (e) {
    // 释放限流并发槽位
    if (rateLimit) rateLimit.release();

    // 审计: 错误
    recordAudit(task, 'error', startTime, '', e.message);

    // 优雅错误处理：不泄露 key，返回错误摘要
    var sanitized = sanitizeError(e.message);
    return {
      error: sanitized,
      taskId: taskId,
      assignee: 'codex',
      model: getModelForTask(task),
      promptHash: hashText(buildPrompt(task)),
      outputText: '',
      createdAt: new Date().toISOString(),
      safetyNote: 'ERROR__NO_OUTPUT',
    };
  });
}

/**
 * 构建安全层拒绝响应
 *
 * @param {object} task
 * @param {string} rejectType  - gate_disabled | blocked | rate_limited
 * @param {string} reason
 * @param {number} startTime
 * @returns {object} 拒绝 artifact
 */
function makeRejection(task, rejectType, reason, startTime) {
  var taskId = task.taskId || 'unknown';
  recordAudit(task, 'rejected', startTime, '', reason);
  return {
    error: reason,
    taskId: taskId,
    assignee: 'codex',
    model: getModelForTask(task),
    promptHash: hashText(buildPrompt(task)),
    outputText: '',
    createdAt: new Date().toISOString(),
    safetyNote: 'REJECTED__SAFETY_LAYER: ' + rejectType,
  };
}

/**
 * 记录审计日志
 *
 * @param {object} task
 * @param {string} resultStatus - success | error | rejected
 * @param {number} startTime     - 调用开始时间 (Date.now())
 * @param {string} outputText    - 输出文本 (仅用于 token 估算)
 * @param {string} errorMessage  - 错误/拒绝原因
 */
function recordAudit(task, resultStatus, startTime, outputText, errorMessage) {
  var workerAudit = getWorkerAudit();
  if (!workerAudit) return;

  var latency = startTime ? (Date.now() - startTime) : -1;
  workerAudit.record({
    worker: 'codex',
    model: getModelForTask(task),
    taskId: task.taskId || 'unknown',
    latency: latency,
    resultStatus: resultStatus,
    outputText: outputText || '',
    errorMessage: errorMessage || '',
    promptHash: hashText(buildPrompt(task)),
  });
}

/**
 * 根据任务获取模型
 * @param {object} task
 * @returns {string}
 */
function getModelForTask(task) {
  // 可以从 task.model 读取，默认 gpt-4o
  return (task.model && task.model.indexOf('gpt') >= 0) ? task.model : DEFAULT_MODEL;
}

/**
 * 构建发送给 OpenAI 的 prompt
 * @param {object} task
 * @returns {string}
 */
function buildPrompt(task) {
  var lines = [];
  lines.push('=== AI Orchestrator Runtime v0.5 Task ===');
  lines.push('');
  lines.push('Task ID: ' + (task.taskId || 'unknown'));
  lines.push('Assignee: Codex (' + getModelForTask(task) + ')');
  lines.push('');

  // 优先使用 task.prompt（来自 Worker loader 的完整 prompt 文件）
  // 如果存在，作为系统/主 prompt 进入最终请求
  if (task.prompt && typeof task.prompt === 'string' && task.prompt.trim().length > 0) {
    lines.push('--- System Prompt (From Worker Loader) ---');
    lines.push(task.prompt.trim());
    lines.push('');
  } else {
    // Fallback: 使用 userRequest + dispatchPayload 拼接
    if (task.userRequest) {
      lines.push('--- User Request ---');
      lines.push(task.userRequest);
      lines.push('');
    }

    // 附加 dispatch payload (如果有)
    if (task.dispatchPayload && task.dispatchPayload.instruction) {
      lines.push('--- Dispatch Instruction ---');
      lines.push(task.dispatchPayload.instruction.substring(0, 2000));
      lines.push('');
    }
  }

  lines.push('--- Safety Rules ---');
  lines.push('1. REVIEW_ONLY: DO NOT auto-apply any patch.');
  lines.push('2. Output must be in markdown format.');
  lines.push('3. If generating code, include explanation.');
  lines.push('4. No credential or API key in output.');
  lines.push('');
  lines.push('Begin your response:');

  return lines.join('\n');
}

// ========== 导出 ==========
module.exports = {
  executeOpenAIWorker: executeOpenAIWorker,
  callOpenAI: callOpenAI,
  buildPrompt: buildPrompt,
  hashText: hashText,
  // Phase2-B 安全层
  makeRejection: makeRejection,
  recordAudit: recordAudit,
};
