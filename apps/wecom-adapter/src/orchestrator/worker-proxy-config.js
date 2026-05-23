'use strict';

/**
 * worker-proxy-config.js — Worker 代理配置统一管理
 *
 * 从 openai-worker.js 剥离代理配置，提供统一的配置加载、
 * 健康检查和状态查询接口。
 *
 * 环境变量:
 *   OPENAI_PROXY_HOST   — 代理主机 (必填, 否则代理不启用)
 *   OPENAI_PROXY_PORT   — 代理端口 (默认 18080)
 *   OPENAI_PROXY_USER   — 代理认证用户名
 *   OPENAI_PROXY_PASS   — 代理认证密码
 *   OPENAI_PROXY_TIMEOUT — 代理请求超时 ms (默认 60000)
 *
 * 安全约束:
 *   - 禁止打印/日志 key/password 原文
 *   - 健康检查不访问外部 API (仅 TCP 探测)
 */

const http = require('http');
const net = require('net');

var _configCache = null;
var _healthCache = { healthy: null, at: 0 };
var HEALTH_CACHE_TTL = 10000; // 10s 缓存

// 默认配置
var DEFAULTS = {
  port: 18080,
  timeout: 60000,
};

/**
 * 从环境变量加载代理配置
 * @returns {object|null} config 或 null (不启用代理)
 */
function load() {
  var host = process.env.OPENAI_PROXY_HOST;
  if (!host) {
    _configCache = null;
    return null;
  }

  _configCache = {
    host: host,
    port: parseInt(process.env.OPENAI_PROXY_PORT, 10) || DEFAULTS.port,
    user: process.env.OPENAI_PROXY_USER || '',
    pass: process.env.OPENAI_PROXY_PASS || '',
    timeout: parseInt(process.env.OPENAI_PROXY_TIMEOUT, 10) || DEFAULTS.timeout,
  };

  return _configCache;
}

/**
 * 获取当前配置 (懒加载)
 * @returns {object|null}
 */
function getConfig() {
  if (_configCache === null) {
    load();
  }
  return _configCache;
}

/**
 * 代理是否启用
 * @returns {boolean}
 */
function isEnabled() {
  return getConfig() !== null;
}

/**
 * TCP 健康检查 (异步)
 *
 * 仅探测本地 127.0.0.1:18080 端口是否可连通，
 * 不发送任何 HTTP 请求，不会触发代理认证。
 *
 * @param {number} [timeoutMs] — 超时 ms (默认 5000)
 * @returns {Promise<boolean>}
 */
function healthCheck(timeoutMs) {
  var cfg = getConfig();
  if (!cfg) {
    return Promise.resolve(false);
  }

  var timeout = timeoutMs || 5000;
  var cache = _healthCache;

  // 使用缓存 (10s 内不重复探测)
  var now = Date.now();
  if (cache.at > 0 && (now - cache.at) < HEALTH_CACHE_TTL) {
    return Promise.resolve(cache.healthy);
  }

  return new Promise(function (resolve) {
    var socket = net.Socket();
    var done = false;

    var finish = function (result) {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch (e) { /* ignore */ }
      cache.healthy = result;
      cache.at = Date.now();
      resolve(result);
    };

    socket.setTimeout(timeout, function () {
      finish(false);
    });

    socket.on('error', function () {
      finish(false);
    });

    socket.on('connect', function () {
      finish(true);
    });

    try {
      socket.connect(cfg.port, cfg.host);
    } catch (e) {
      finish(false);
    }
  });
}

/**
 * 获取配置状态 (用于监控/日志)
 * @returns {{ enabled: boolean, healthy: boolean|null, config: object }}
 */
function getStatus() {
  var cfg = getConfig();
  return {
    enabled: cfg !== null,
    healthy: _healthCache.healthy,
    config: cfg ? {
      host: cfg.host,
      port: cfg.port,
      hasAuth: !!(cfg.user && cfg.pass),
      timeout: cfg.timeout,
    } : null,
  };
}

/**
 * 重新加载配置 (用于环境变量变更后)
 */
function reload() {
  _configCache = null;
  _healthCache = { healthy: null, at: 0 };
  load();
}

/**
 * 创建 http.Agent (HTTP CONNECT 隧道 + TLS 升级)
 *
 * 与 openai-worker.js 原 createProxyAgent() 逻辑一致，
 * 但使用统一配置对象。
 *
 * @param {object} cfg — getConfig() 返回的配置对象
 * @returns {https.Agent}
 */
function createProxyAgent(cfg) {
  var https = require('https');
  var tls = require('tls');

  return new https.Agent({
    keepAlive: true,
    createConnection: function (options, callback) {
      var connectOpts = {
        host: cfg.host,
        port: cfg.port,
        method: 'CONNECT',
        path: options.hostname + ':' + (options.port || 443),
        headers: { 'Host': options.hostname },
      };

      // 代理认证
      if (cfg.user && cfg.pass) {
        var auth = Buffer.from(cfg.user + ':' + cfg.pass).toString('base64');
        connectOpts.headers['Proxy-Authorization'] = 'Basic ' + auth;
      }

      var req = http.request(connectOpts);

      req.on('connect', function (res, socket) {
        if (res.statusCode !== 200) {
          socket.destroy();
          return callback(new Error('代理 CONNECT 失败: HTTP ' + res.statusCode));
        }

        // TLS 升级
        var tlsSocket = tls.connect({
          socket: socket,
          servername: options.hostname,
          rejectUnauthorized: true,
        }, function () {
          callback(null, tlsSocket);
        });

        tlsSocket.on('error', function (err) {
          callback(err);
        });
      });

      req.on('error', function (err) {
        callback(err);
      });

      req.end();
    },
  });
}

module.exports = {
  load: load,
  getConfig: getConfig,
  isEnabled: isEnabled,
  healthCheck: healthCheck,
  getStatus: getStatus,
  reload: reload,
  createProxyAgent: createProxyAgent,
};
