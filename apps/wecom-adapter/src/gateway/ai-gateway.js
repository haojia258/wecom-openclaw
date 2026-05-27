'use strict';

/**
 * ai-gateway.js - AI Gateway 主入口 (P8.0.3)
 *
 * 提供 POST /gateway/command 作为外部入口。
 * ChatGPT 通过此端点发送指令，Gateway 进行安全验证后，
 * 通过内部 HTTP 调用 /runtime/command（server-side 注入 BRIDGE_TOKEN）。
 *
 * 安全层：
 *   1. Gateway Token 验证（Gateway-Token header）
 *   2. Timestamp 重放防护（±5min）
 *   3. IP Allowlist
 *   4. Rate Limiting（滑动窗口）
 *   5. Policy — command/mode allowlist
 *   6. 强制 plan-only
 *   7. Server-side BRIDGE_TOKEN 注入
 *   8. 审计日志
 */

var http = require('http');
var url = require('url');
var gatewayPolicy = require('./gateway-policy');
var gatewayRateLimit = require('./gateway-rate-limit');
var gatewayAudit = require('./gateway-audit');

// ─── 配置 ─────────────────────────────────────────────────

var GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
var GATEWAY_IP_ALLOWLIST = (process.env.GATEWAY_IP_ALLOWLIST || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
var RUNTIME_PORT = parseInt(process.env.WECOM_ADAPTER_PORT || '3001', 10);
var INTERNAL_TIMEOUT_MS = 30000; // 内部 HTTP 调用超时 30s

// ─── Gateway Token 验证 ──────────────────────────────────

/**
 * 从 Gateway-Token header 提取 token
 *
 * @param {object} req - Express request
 * @returns {{ valid: boolean, token?: string, error?: string }}
 */
function extractGatewayToken(req) {
  var token = req.headers['gateway-token'] || '';

  if (!token) {
    return {
      valid: false,
      error: '[GATEWAY] 缺少 Gateway-Token header'
    };
  }

  if (typeof token !== 'string' || token.length < 16) {
    return {
      valid: false,
      error: '[GATEWAY] Gateway-Token 格式错误，长度不足'
    };
  }

  return { valid: true, token: token };
}

/**
 * 验证 Gateway Token（常量时间比较防止时序攻击）
 *
 * @param {string} token
 * @returns {{ valid: boolean, error?: string }}
 */
function validateGatewayToken(token) {
  if (!GATEWAY_TOKEN) {
    return {
      valid: false,
      error: '[GATEWAY] 服务器未配置 GATEWAY_TOKEN，请联系管理员'
    };
  }

  if (!token) {
    return {
      valid: false,
      error: '[GATEWAY] Token 验证失败：无效的 GATEWAY_TOKEN'
    };
  }

  // 常量时间比较
  var expected = GATEWAY_TOKEN;
  var actual = token;

  if (expected.length !== actual.length) {
    // 仍然进行虚拟比较以防止时序分析
    var dummy = '';
    for (var i = 0; i < expected.length; i++) dummy += expected[i];
    dummy = actual;
    return {
      valid: false,
      error: '[GATEWAY] Token 验证失败：无效的 GATEWAY_TOKEN'
    };
  }

  var mismatch = false;
  for (var j = 0; j < expected.length; j++) {
    if (expected[j] !== actual[j]) {
      mismatch = true;
    }
  }

  if (mismatch) {
    return {
      valid: false,
      error: '[GATEWAY] Token 验证失败：无效的 GATEWAY_TOKEN'
    };
  }

  return { valid: true };
}

// ─── Timestamp 验证 ─────────────────────────────────────

/**
 * 验证请求时间戳
 *
 * @param {number} ts - Unix timestamp (ms)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateTimestamp(ts) {
  if (!ts || typeof ts !== 'number') {
    return { valid: false, error: '[GATEWAY] 缺少有效的 timestamp' };
  }

  var windowSec = parseInt(process.env.GATEWAY_TIMESTAMP_WINDOW_SEC || '300', 10);
  var now = Date.now();
  var age = Math.abs(now - ts);

  if (age > windowSec * 1000) {
    return {
      valid: false,
      error: '[GATEWAY] Timestamp 过期：偏差 ' + Math.round(age / 1000) + 's 超过允许的 ' + windowSec + 's'
    };
  }

  return { valid: true };
}

// ─── IP Allowlist ────────────────────────────────────────

/**
 * 检查客户端 IP 是否在 allowlist 中
 *
 * @param {object} req - Express request
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkIPAllowlist(req) {
  if (!GATEWAY_IP_ALLOWLIST || GATEWAY_IP_ALLOWLIST.length === 0) {
    // 未配置 allowlist = 允许所有 IP
    return { allowed: true };
  }

  var clientIP = getClientIP(req);

  for (var i = 0; i < GATEWAY_IP_ALLOWLIST.length; i++) {
    if (clientIP === GATEWAY_IP_ALLOWLIST[i]) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: 'IP "' + clientIP + '" 不在 Gateway 白名单中'
  };
}

/**
 * 获取客户端 IP
 *
 * @param {object} req
 * @returns {string}
 */
function getClientIP(req) {
  // 优先从 x-forwarded-for 读取（穿透 nginx/代理）
  var forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    var parts = forwarded.split(',');
    return parts[0].trim();
  }

  // 其次从 x-real-ip 读取
  var realIP = req.headers['x-real-ip'];
  if (realIP) {
    return realIP.trim();
  }

  // 最后读取直接连接 IP
  return req.connection ? (req.connection.remoteAddress || 'unknown') : 'unknown';
}

// ─── Plan-Only 强制 ─────────────────────────────────────

/**
 * 强制覆盖 mode 为 plan-only
 *
 * @param {object} params - 请求参数
 * @returns {object} 修改后的参数
 */
function enforcePlanOnly(params) {
  if (params.mode !== 'plan-only') {
    params._originalMode = params.mode;
    params.mode = 'plan-only';
  }
  return params;
}

// ─── 内部 HTTP 调用 ─────────────────────────────────────

/**
 * 内部 HTTP 调用 /runtime/command
 * server-side 注入 BRIDGE_TOKEN
 *
 * @param {object} params - 请求参数（含 command, user, mode 等）
 * @returns {Promise<object>} runtime 响应
 */
function callRuntimeInternal(params) {
  var bridgeToken = process.env.BRIDGE_TOKEN;

  if (!bridgeToken) {
    return Promise.reject(new Error('[GATEWAY] 服务器未配置 BRIDGE_TOKEN'));
  }

  // 构建内部请求体（只传必要字段）
  var internalBody = {
    source: 'chatgpt',
    user: params.user,
    command: params.command,
    mode: params.mode || 'plan-only'
  };

  var bodyString = JSON.stringify(internalBody);

  var options = {
    hostname: '127.0.0.1',
    port: RUNTIME_PORT,
    path: '/runtime/command',
    method: 'POST',
    timeout: INTERNAL_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyString),
      'Authorization': 'Bearer ' + bridgeToken
    }
  };

  return new Promise(function(resolve, reject) {
    var req = http.request(options, function(res) {
      var chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() {
        var raw = Buffer.concat(chunks).toString('utf-8');
        try {
          var data = JSON.parse(raw);
          resolve(data);
        } catch (e) {
          reject(new Error('[GATEWAY] 解析 runtime 响应失败: ' + e.message));
        }
      });
    });

    req.on('timeout', function() {
      req.destroy();
      reject(new Error('[GATEWAY] 内部调用 /runtime/command 超时 (' + (INTERNAL_TIMEOUT_MS / 1000) + 's)'));
    });

    req.on('error', function(e) {
      reject(new Error('[GATEWAY] 内部调用 /runtime/command 失败: ' + e.message));
    });

    req.write(bodyString);
    req.end();
  });
}

// ─── 结构化响应 ──────────────────────────────────────────

/**
 * 构建成功响应
 *
 * @param {object} data
 * @param {string} data.requestId
 * @param {string} data.correlationId
 * @param {object} data.runtimeResult - /runtime/command 的返回结果
 * @returns {object}
 */
function buildSuccessResponse(data) {
  return {
    success: true,
    requestId: data.requestId,
    correlationId: data.correlationId,
    taskId: data.runtimeResult.taskId || '',
    mode: data.runtimeResult.mode || 'plan-only',
    output: data.runtimeResult.result || data.runtimeResult.output || null,
    source: 'ai-gateway'
  };
}

/**
 * 构建拒绝响应
 *
 * @param {string} reason - 拒绝原因
 * @param {string} requestId
 * @param {string} correlationId
 * @param {string} errorCode - 错误码
 * @param {number} statusCode - HTTP 状态码
 * @returns {{ status: number, body: object }}
 */
function buildDenyResponse(reason, requestId, correlationId, errorCode, statusCode) {
  var code = errorCode || 'ACCESS_DENIED';
  var status = statusCode || 403;

  return {
    status: status,
    body: {
      success: false,
      requestId: requestId || gatewayAudit.uuidv4(),
      correlationId: correlationId || 'unknown',
      error: code,
      reason: reason || 'Access denied',
      source: 'ai-gateway',
      timestamp: new Date().toISOString()
    }
  };
}

// ─── JSON Body Parser ────────────────────────────────────

/**
 * 解析 JSON 请求体
 *
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next
 */
function parseGatewayBody(req, res, next) {
  if (req.method !== 'POST') {
    var deny = buildDenyResponse('[GATEWAY] 仅支持 POST 方法', null, null, 'METHOD_NOT_ALLOWED', 405);
    return res.status(deny.status).json(deny.body);
  }

  var chunks = [];
  var totalSize = 0;
  var MAX_BODY_SIZE = 16 * 1024;

  req.on('data', function(chunk) {
    totalSize += chunk.length;
    if (totalSize > MAX_BODY_SIZE) {
      var denySize = buildDenyResponse('[GATEWAY] 请求体超过 16KB 限制', null, null, 'PAYLOAD_TOO_LARGE', 413);
      res.status(denySize.status).json(denySize.body);
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', function() {
    var raw = Buffer.concat(chunks).toString('utf-8');
    try {
      req._gatewayBody = JSON.parse(raw);
    } catch (e) {
      var denyJSON = buildDenyResponse('[GATEWAY] 请求体 JSON 解析失败: ' + e.message, null, null, 'BAD_REQUEST', 400);
      res.status(denyJSON.status).json(denyJSON.body);
      return;
    }
    next();
  });

  req.on('error', function() {
    // 客户端断开，静默处理
  });
}

// ─── Express 路由注册 ────────────────────────────────────

/**
 * 在 Express app 上注册 /gateway/command 路由
 *
 * @param {object} app - Express app 实例
 */
function registerGatewayRoutes(app) {
  // Body parser middleware
  app.use('/gateway/command', parseGatewayBody);

  // POST /gateway/command
  app.post('/gateway/command', async function(req, res) {
    var startTime = Date.now();
    var requestId = gatewayAudit.uuidv4();
    var correlationId = gatewayAudit.generateCorrelationId();

    var body = req._gatewayBody || {};
    var clientIP = getClientIP(req);

    var user = (body.user || '').trim();
    var command = (body.command || '').trim();
    var mode = (body.mode || 'plan-only').trim();

    // ─── 1. Gateway Token 验证 ───
    var tokenResult = extractGatewayToken(req);
    if (!tokenResult.valid) {
      var deny1 = buildDenyResponse(tokenResult.error, requestId, correlationId, 'UNAUTHORIZED', 401);
      gatewayAudit.writeBlockedEntry({
        requestId: requestId, correlationId: correlationId,
        sourceIP: clientIP, user: user, command: command, mode: mode,
        tokenPrefix: 'none', blockedReason: tokenResult.error
      });
      return res.status(deny1.status).json(deny1.body);
    }

    var tokenCheck = validateGatewayToken(tokenResult.token);
    if (!tokenCheck.valid) {
      var deny2 = buildDenyResponse(tokenCheck.error, requestId, correlationId, 'UNAUTHORIZED', 401);
      gatewayAudit.writeBlockedEntry({
        requestId: requestId, correlationId: correlationId,
        sourceIP: clientIP, user: user, command: command, mode: mode,
        tokenPrefix: gatewayAudit.sanitizeToken(tokenResult.token), blockedReason: tokenCheck.error
      });
      return res.status(deny2.status).json(deny2.body);
    }

    // ─── 2. 请求体校验 ───
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      var denyBody = buildDenyResponse('[GATEWAY] 请求体必须为 JSON 对象', requestId, correlationId, 'BAD_REQUEST', 400);
      gatewayAudit.writeBlockedEntry({
        requestId: requestId, correlationId: correlationId,
        sourceIP: clientIP, user: user, command: command, mode: mode,
        tokenPrefix: gatewayAudit.sanitizeToken(tokenResult.token), blockedReason: '请求体为空'
      });
      return res.status(denyBody.status).json(denyBody.body);
    }

    if (!user) {
      var denyUser = buildDenyResponse('[GATEWAY] 缺少必填字段: user', requestId, correlationId, 'BAD_REQUEST', 400);
      gatewayAudit.writeBlockedEntry({
        requestId: requestId, correlationId: correlationId,
        sourceIP: clientIP, user: 'unknown', command: command, mode: mode,
        tokenPrefix: gatewayAudit.sanitizeToken(tokenResult.token), blockedReason: '缺少 user 字段'
      });
      return res.status(denyUser.status).json(denyUser.body);
    }

    if (!command) {
      var denyCmd = buildDenyResponse('[GATEWAY] 缺少必填字段: command', requestId, correlationId, 'BAD_REQUEST', 400);
      gatewayAudit.writeBlockedEntry({
        requestId: requestId, correlationId: correlationId,
        sourceIP: clientIP, user: user, command: 'empty', mode: mode,
        tokenPrefix: gatewayAudit.sanitizeToken(tokenResult.token), blockedReason: '缺少 command 字段'
      });
      return res.status(denyCmd.status).json(denyCmd.body);
    }

    // ─── 3. Timestamp 验证 ───
    if (body.hasOwnProperty('timestamp')) {
      var tsCheck = validateTimestamp(body.timestamp);
      if (!tsCheck.valid) {
        var denyTS = buildDenyResponse(tsCheck.error, requestId, correlationId, 'BAD_REQUEST', 400);
        gatewayAudit.writeBlockedEntry({
          requestId: requestId, correlationId: correlationId,
          sourceIP: clientIP, user: user, command: command, mode: mode,
          tokenPrefix: gatewayAudit.sanitizeToken(tokenResult.token), blockedReason: tsCheck.error
        });
        return res.status(denyTS.status).json(denyTS.body);
      }
    }

    // ─── 4. 重放检测 ───
    if (body.requestId && body.timestamp) {
      var replayCheck = gatewayRateLimit.checkReplay(body.requestId, body.timestamp);
      if (!replayCheck.valid) {
        var denyReplay = buildDenyResponse(replayCheck.reason, requestId, correlationId, 'REPLAY_DETECTED', 400);
        gatewayAudit.writeBlockedEntry({
          requestId: requestId, correlationId: correlationId,
          sourceIP: clientIP, user: user, command: command, mode: mode,
          tokenPrefix: gatewayAudit.sanitizeToken(tokenResult.token), blockedReason: replayCheck.reason
        });
        return res.status(denyReplay.status).json(denyReplay.body);
      }
    }

    // ─── 5. IP Allowlist ───
    var ipCheck = checkIPAllowlist(req);
    if (!ipCheck.allowed) {
      var denyIP = buildDenyResponse(ipCheck.reason, requestId, correlationId, 'FORBIDDEN', 403);
      gatewayAudit.writeBlockedEntry({
        requestId: requestId, correlationId: correlationId,
        sourceIP: clientIP, user: user, command: command, mode: mode,
        tokenPrefix: gatewayAudit.sanitizeToken(tokenResult.token), blockedReason: ipCheck.reason
      });
      return res.status(denyIP.status).json(denyIP.body);
    }

    // ─── 6. Rate Limiting ───
    var rateCheck = gatewayRateLimit.checkRateLimit(clientIP);
    if (!rateCheck.allowed) {
      var denyRate = buildDenyResponse(rateCheck.reason, requestId, correlationId, 'RATE_LIMITED', 429);
      gatewayAudit.writeBlockedEntry({
        requestId: requestId, correlationId: correlationId,
        sourceIP: clientIP, user: user, command: command, mode: mode,
        tokenPrefix: gatewayAudit.sanitizeToken(tokenResult.token), blockedReason: rateCheck.reason
      });
      return res.status(denyRate.status).json(denyRate.body);
    }

    // ─── 7. Policy 检查 ───
    var policyCheck = gatewayPolicy.enforcePolicy({ command: command, mode: mode, agent: body.agent });
    if (!policyCheck.allowed) {
      var denyPolicy = buildDenyResponse(policyCheck.reason, requestId, correlationId, 'FORBIDDEN', 403);
      gatewayAudit.writeBlockedEntry({
        requestId: requestId, correlationId: correlationId,
        sourceIP: clientIP, user: user, command: command, mode: mode,
        tokenPrefix: gatewayAudit.sanitizeToken(tokenResult.token), blockedReason: policyCheck.reason
      });
      return res.status(denyPolicy.status).json(denyPolicy.body);
    }

    // ─── 8. 强制 plan-only ───
    if (mode !== 'plan-only') {
      mode = 'plan-only';
      body.mode = 'plan-only';
    }

    // 构建内部参数字典
    var internalParams = {
      user: user,
      command: command,
      mode: 'plan-only'
    };

    // ─── 9. 内部 HTTP 调用 /runtime/command ───
    try {
      var runtimeResult = await callRuntimeInternal(internalParams);

      var durationMs = Date.now() - startTime;

      gatewayAudit.writeSuccessEntry({
        requestId: requestId,
        correlationId: correlationId,
        sourceIP: clientIP,
        user: user,
        command: command,
        mode: 'plan-only',
        tokenPrefix: gatewayAudit.sanitizeToken(tokenResult.token),
        durationMs: durationMs,
        taskId: runtimeResult.taskId || ''
      });

      var successResp = buildSuccessResponse({
        requestId: requestId,
        correlationId: correlationId,
        runtimeResult: runtimeResult
      });

      return res.status(200).json(successResp);
    } catch (e) {
      var durationMsErr = Date.now() - startTime;

      gatewayAudit.writeGatewayAuditEntry({
        requestId: requestId,
        correlationId: correlationId,
        sourceIP: clientIP,
        user: user,
        command: command,
        mode: 'plan-only',
        tokenPrefix: gatewayAudit.sanitizeToken(tokenResult.token),
        result: 'error',
        blockedReason: e.message,
        durationMs: durationMsErr
      });

      var denyErr = buildDenyResponse('[GATEWAY] 内部执行失败: ' + e.message, requestId, correlationId, 'INTERNAL_ERROR', 502);
      return res.status(denyErr.status).json(denyErr.body);
    }
  });
}

module.exports = {
  extractGatewayToken,
  validateGatewayToken,
  validateTimestamp,
  checkIPAllowlist,
  getClientIP,
  enforcePlanOnly,
  callRuntimeInternal,
  buildSuccessResponse,
  buildDenyResponse,
  registerGatewayRoutes
};
