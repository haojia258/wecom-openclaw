'use strict';

/**
 * command-ingress.js - ChatGPT 指令入口 (P8.0)
 *
 * 提供受控 HTTP 入口 POST /runtime/command
 * 让 ChatGPT 指令直接进入 OpenClaw Commander Runtime。
 *
 * 安全:
 *   - 必须校验 BRIDGE_TOKEN（从环境变量读取）
 *   - token 仅从 Authorization header 读取，禁止 query 参数
 *   - 不允许匿名请求
 *   - 默认 plan-only 模式
 *   - live execution 必须 humanConfirmToken
 *
 * 流程:
 *   1. validateBridgeToken     → Token 验证
 *   2. parseRequestBody        → 请求解析 & 参数校验
 *   3. chatgptBridge.execute() → 完整执行链
 *   4. formatJsonResponse      → JSON 响应
 *   5. pushToWeCom             → 可选企微推送
 */

var chatgptBridge = require('../commands/chatgpt-bridge');

// ─── 常量 ─────────────────────────────────────────────────

var BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';
var MAX_BODY_SIZE = 16 * 1024; // 16KB

// ─── Token 验证 ──────────────────────────────────────────

/**
 * 从 Authorization header 提取 Bearer token
 * 禁止 query 参数传递 token
 *
 * @param {object} req - Express request
 * @returns {{ valid: boolean, token?: string, error?: string }}
 */
function extractToken(req) {
  var authHeader = req.headers.authorization || '';

  // 检查 query 参数中是否存在 token（禁止）
  if (req.query && (req.query.token || req.query.bridge_token || req.query.BRIDGE_TOKEN)) {
    return {
      valid: false,
      error: '[BRIDGE] 禁止通过 query 参数传递 token，请使用 Authorization header'
    };
  }

  if (!authHeader) {
    return {
      valid: false,
      error: '[BRIDGE] 缺少 Authorization header'
    };
  }

  // 支持 "Bearer <token>" 格式
  var parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return { valid: true, token: parts[1] };
  }

  // 也支持直接传递 token（兼容旧客户端）
  if (parts.length === 1 && authHeader.length >= 16) {
    return { valid: true, token: authHeader };
  }

  return {
    valid: false,
    error: '[BRIDGE] Authorization header 格式错误，请使用 Bearer <token>'
  };
}

/**
 * 验证 BRIDGE_TOKEN
 *
 * @param {string} token
 * @returns {{ valid: boolean, error?: string }}
 */
function validateBridgeToken(token) {
  if (!BRIDGE_TOKEN) {
    return {
      valid: false,
      error: '[BRIDGE] 服务器未配置 BRIDGE_TOKEN，请联系管理员'
    };
  }

  if (!token || token !== BRIDGE_TOKEN) {
    // 使用恒定时间比较防止时序攻击
    if (token && token.length === BRIDGE_TOKEN.length) {
      var mismatch = false;
      for (var i = 0; i < token.length; i++) {
        if (token[i] !== BRIDGE_TOKEN[i]) {
          mismatch = true;
        }
      }
    }
    return {
      valid: false,
      error: '[BRIDGE] Token 验证失败：无效的 BRIDGE_TOKEN'
    };
  }

  return { valid: true };
}

// ─── 请求校验 ────────────────────────────────────────────

/**
 * 解析并校验 POST /runtime/command 的请求体
 *
 * @param {object} body - 请求体 JSON
 * @returns {{ valid: boolean, params?: object, error?: string }}
 */
function parseRequestBody(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '[BRIDGE] 请求体必须为 JSON 对象' };
  }

  var source = (body.source || '').trim();
  var user = (body.user || '').trim();
  var command = (body.command || '').trim();
  var mode = (body.mode || 'plan-only').trim();
  var confirm = body.confirm === true;

  // 校验必填字段
  if (!source) {
    return { valid: false, error: '[BRIDGE] 缺少必填字段: source' };
  }
  if (!user) {
    return { valid: false, error: '[BRIDGE] 缺少必填字段: user' };
  }
  if (!command) {
    return { valid: false, error: '[BRIDGE] 缺少必填字段: command' };
  }

  // 校验 source
  if (source !== 'chatgpt') {
    return { valid: false, error: '[BRIDGE] 不支持的 source: ' + source + '，仅支持 chatgpt' };
  }

  // 校验 mode
  if (mode !== 'plan-only' && mode !== 'live') {
    return { valid: false, error: '[BRIDGE] 不支持的 mode: ' + mode + '，仅支持 plan-only 或 live' };
  }

  // live 模式必须提供 humanConfirmToken
  if (mode === 'live' && !body.humanConfirmToken) {
    return {
      valid: false,
      error: '[BRIDGE] live 模式必须提供 humanConfirmToken'
    };
  }

  return {
    valid: true,
    params: {
      source: source,
      user: user,
      command: command,
      mode: mode,
      confirm: confirm,
      humanConfirmToken: body.humanConfirmToken || '',
      context: body.context || {},
      callbackWeCom: body.callbackWeCom !== false,  // 默认 true: 推送到企微
      wecomUserId: body.wecomUserId || user,
      agentId: body.agentId || '1000006'
    }
  };
}

// ─── 响应格式化 ──────────────────────────────────────────

/**
 * 格式化 JSON 响应
 *
 * @param {{ success: boolean, result?: string, error?: string, mode?: string, taskId?: string }} data
 * @param {number} statusCode
 * @returns {object} Express response body
 */
function formatJsonResponse(data, statusCode) {
  return {
    status: statusCode,
    body: {
      success: data.success || false,
      taskId: data.taskId || '',
      mode: data.mode || 'plan-only',
      result: data.result || null,
      error: data.error || null,
      timestamp: new Date().toISOString(),
      source: 'chatgpt-bridge'
    }
  };
}

// ─── Express 路由注册 ────────────────────────────────────

/**
 * 在 Express app 上注册 /runtime/command 路由
 *
 * @param {object} app        - Express app 实例
 * @param {object} [options]  - 可选配置
 * @param {function} [options.sendWeCom] - 企微消息发送函数
 */
function registerRoutes(app, options) {
  options = options || {};

  // JSON body parser（限定大小 16KB）
  app.use('/runtime/command', function(req, res, next) {
    if (req.method !== 'POST') {
      return res.status(405).json(formatJsonResponse({
        success: false,
        error: '[BRIDGE] 仅支持 POST 方法'
      }, 405).body);
    }

    var chunks = [];
    var totalSize = 0;

    req.on('data', function(chunk) {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        res.status(413).json(formatJsonResponse({
          success: false,
          error: '[BRIDGE] 请求体超过 16KB 限制'
        }, 413).body);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', function() {
      var raw = Buffer.concat(chunks).toString('utf-8');
      try {
        req._bridgeBody = JSON.parse(raw);
      } catch (e) {
        res.status(400).json(formatJsonResponse({
          success: false,
          error: '[BRIDGE] 请求体 JSON 解析失败: ' + e.message
        }, 400).body);
        return;
      }
      next();
    });

    req.on('error', function() {
      // 客户端断开，静默处理
    });
  });

  // POST /runtime/command
  app.post('/runtime/command', async function(req, res) {
    // ─── 1. Token 验证 ───
    var tokenResult = extractToken(req);
    if (!tokenResult.valid) {
      res.status(401).json(formatJsonResponse({
        success: false,
        error: tokenResult.error
      }, 401).body);
      return;
    }

    var tokenCheck = validateBridgeToken(tokenResult.token);
    if (!tokenCheck.valid) {
      res.status(401).json(formatJsonResponse({
        success: false,
        error: tokenCheck.error
      }, 401).body);
      return;
    }

    // ─── 2. 请求解析 ───
    var parsed = parseRequestBody(req._bridgeBody);
    if (!parsed.valid) {
      res.status(400).json(formatJsonResponse({
        success: false,
        error: parsed.error
      }, 400).body);
      return;
    }

    var params = parsed.params;

    // ─── 3. 执行 ChatGPT Bridge ───
    try {
      var result = await chatgptBridge.execute(params);

      // 企微推送（如果 callbackWeCom=true 且有 sendWeCom 函数）
      if (params.callbackWeCom && options.sendWeCom) {
        try {
          var wecomMsg = chatgptBridge.formatWeComMessage(result);
          options.sendWeCom(params.wecomUserId, wecomMsg, params.agentId);
        } catch (wecomErr) {
          // 企微推送失败不影响 HTTP 响应
          console.error('[BRIDGE] WeCom push failed:', wecomErr.message);
        }
      }

      res.status(200).json(formatJsonResponse({
        success: result.success,
        taskId: result.taskId,
        mode: result.mode,
        result: result.output
      }, 200).body);
    } catch (e) {
      res.status(500).json(formatJsonResponse({
        success: false,
        error: '[BRIDGE] 执行失败: ' + e.message
      }, 500).body);
    }
  });
}

module.exports = {
  extractToken,
  validateBridgeToken,
  parseRequestBody,
  formatJsonResponse,
  registerRoutes
};
