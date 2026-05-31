'use strict';

/**
 * worker-network-policy.js — Worker 网络策略层
 *
 * 统一管理超时、重试、熔断、降级策略。
 *
 * 策略:
 *   - 超时: 默认 60s 全局，支持按调用覆盖
 *   - 重试: 最多 3 次，指数退避 (1s, 2s, 4s)
 *   - 熔断: CLOSED→OPEN(3次失败)→HALF_OPEN(30s冷却)
 *   - 降级: 代理不可用 → 自动切换 mock
 *
 * 安全约束:
 *   - 禁止打印 key/token/Authorization
 *   - 禁止打印完整 prompt
 *   - REVIEW_ONLY 模式
 */

var _proxyConfig = null; // 延迟引用，避免循环依赖

// 默认策略参数
var DEFAULT_TIMEOUT = 60000;       // 60s
var DEFAULT_CONNECT_TIMEOUT = 10000; // 10s
var DEFAULT_MAX_RETRIES = 3;
var DEFAULT_BACKOFF_BASE = 1000;    // 1s
var CIRCUIT_FAILURE_THRESHOLD = 3;
var CIRCUIT_COOLDOWN_MS = 30000;  // 30s

// ========== 熔断器 ==========

/**
 * CircuitBreaker — 熔断器状态机
 *
 * 状态:
 *   CLOSED    — 正常，请求直接通过
 *   OPEN       — 熔断打开，请求快速失败
 *   HALF_OPEN  — 半开，允许 1 个请求探测
 *
 * 转换:
 *   CLOSED ──(失败>=阈值)──▶ OPEN
 *   OPEN ──(冷却时间到)──▶ HALF_OPEN
 *   HALF_OPEN ──(成功)──▶ CLOSED
 *   HALF_OPEN ──(失败)──▶ OPEN
 */
function CircuitBreaker(opts) {
  opts = opts || {};

  this.failureThreshold = opts.failureThreshold || CIRCUIT_FAILURE_THRESHOLD;
  this.cooldownMs = opts.cooldownMs || CIRCUIT_COOLDOWN_MS;

  this.state = 'CLOSED';
  this.failureCount = 0;
  this.lastFailureAt = 0;
  this.nextTryAt = 0;
}

/**
 * 包装函数调用，执行熔断逻辑
 * @param {Function} fn — 返回 Promise 的函数
 * @param {string}  [taskId] — 任务 ID (仅日志)
 * @returns {Promise}
 */
CircuitBreaker.prototype.call = function (fn, taskId) {
  var self = this;

  // OPEN 状态: 检查是否进入 HALF_OPEN
  if (self.state === 'OPEN') {
    var now = Date.now();
    if (now >= self.nextTryAt) {
      self.state = 'HALF_OPEN';
    } else {
      return Promise.reject(new Error('CircuitBreaker: OPEN (next try in ' + Math.ceil((self.nextTryAt - now) / 1000) + 's)'));
    }
  }

  return Promise.resolve().then(fn).then(
    function (result) {
      // 成功: CLOSED 重置计数; HALF_OPEN → CLOSED
      if (self.state === 'HALF_OPEN' || self.state === 'OPEN') {
        self.state = 'CLOSED';
        self.failureCount = 0;
        self.lastFailureAt = 0;
        self.nextTryAt = 0;
      }
      return result;
    },
    function (err) {
      // 失败: 累计计数
      self.failureCount++;
      self.lastFailureAt = Date.now();

      if (self.state === 'HALF_OPEN') {
        // HALF_OPEN 探测失败 → 回到 OPEN
        self.state = 'OPEN';
        self.nextTryAt = Date.now() + self.cooldownMs;
      } else if (self.state === 'CLOSED') {
        if (self.failureCount >= self.failureThreshold) {
          self.state = 'OPEN';
          self.nextTryAt = Date.now() + self.cooldownMs;
        }
      }

      throw err;
    }
  );
};

/**
 * 获取当前状态
 * @returns {{ state: string, failureCount: number, lastFailureAt: number, nextTryAt: number }}
 */
CircuitBreaker.prototype.getState = function () {
  return {
    state: this.state,
    failureCount: this.failureCount,
    lastFailureAt: this.lastFailureAt,
    nextTryAt: this.nextTryAt,
  };
};

/**
 * 重置熔断器 (仅用于测试)
 */
CircuitBreaker.prototype.reset = function () {
  this.state = 'CLOSED';
  this.failureCount = 0;
  this.lastFailureAt = 0;
  this.nextTryAt = 0;
};

// ========== 全局熔断器实例 ==========

var _globalBreaker = new CircuitBreaker();

// ========== 超时包装 ==========

/**
 * 为 Promise 添加超时
 *
 * @param {Function} fn         — 返回 Promise 的函数
 * @param {string}  [taskId]  — 任务 ID (日志用)
 * @param {number}  [timeoutMs] — 超时 ms (默认 DEFAULT_TIMEOUT)
 * @returns {Promise}
 */
function executeWithTimeout(fn, taskId, timeoutMs) {
  var ms = timeoutMs || DEFAULT_TIMEOUT;
  var timer = null;

  return new Promise(function (resolve, reject) {
    timer = setTimeout(function () {
      var msg = 'Network timeout (' + (ms / 1000) + 's)';
      if (taskId) msg += ' [task:' + taskId + ']';
      reject(new Error(msg));
    }, ms);

    var clean = function () {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    try {
      var result = fn();
      if (result && typeof result.then === 'function') {
        result.then(
          function (v) { clean(); resolve(v); },
          function (e) { clean(); reject(e); }
        );
      } else {
        clean();
        resolve(result);
      }
    } catch (e) {
      clean();
      reject(e);
    }
  });
}

// ========== 重试包装 ==========

/**
 * 带重试的函数执行
 *
 * @param {Function} fn           — 返回 Promise 的函数
 * @param {string}  [taskId]    — 任务 ID
 * @param {object}   [options]
 *   - maxRetries: 最大重试次数 (默认 3)
 *   - backoffBase: 退避基数 ms (默认 1000)
 * @returns {Promise}
 */
function executeWithRetry(fn, taskId, options) {
  options = options || {};
  var maxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;
  var backoffBase = options.backoffBase || DEFAULT_BACKOFF_BASE;

  function attempt(retryCount) {
    return executeWithTimeout(fn, taskId).then(
      function (result) {
        return result; // 成功
      },
      function (err) {
        if (retryCount >= maxRetries) {
          throw err; // 重试用完
        }

        // 指数退避
        var delay = backoffBase * Math.pow(2, retryCount);
        return new Promise(function (resolve) {
          setTimeout(function () {
            resolve(attempt(retryCount + 1));
          }, delay);
        }).then(function (next) {
          return next; // 下一轮 Promise
        });
      }
    );
  }

  return attempt(0);
}

// ========== 降级策略 ==========

/**
 * 获取当前生效模式
 *
 * 优先级:
 *   1. Feature Gate 关闭 → 'mock'
 *   2. 代理未配置 → 'mock'
 *   3. 代理健康检查失败 → 'mock'
 *   4. 熔断器 OPEN → 'mock'
 *   5. 以上都通过 → 'real'
 *
 * @returns {Promise<string>} 'real' | 'mock'
 */
function getEffectiveMode() {
  // 1. Feature Gate
  var gate = null;
  try { gate = require('../worker-feature-gate'); } catch (e) { /* ignore */ }
  if (gate && gate.isEnabled() === false) {
    return Promise.resolve('mock');
  }

  // 2. 代理配置
  if (!_proxyConfig) {
    try { _proxyConfig = require('../worker-proxy-config'); } catch (e) { /* ignore */ }
  }
  if (!_proxyConfig || !_proxyConfig.isEnabled()) {
    return Promise.resolve('mock');
  }

  // 3. 健康检查 + 熔断状态
  var breakerState = _globalBreaker.getState();
  if (breakerState.state === 'OPEN') {
    return Promise.resolve('mock');
  }

  return _proxyConfig.healthCheck(5000).then(
    function (healthy) {
      if (!healthy) {
        return 'mock';
      }
      return 'real';
    },
    function () {
      return 'mock'; // 健康检查失败 → 降级
    }
  );
}

// ========== 导出 ==========

module.exports = {
  // 超时
  executeWithTimeout: executeWithTimeout,
  DEFAULT_TIMEOUT: DEFAULT_TIMEOUT,
  DEFAULT_CONNECT_TIMEOUT: DEFAULT_CONNECT_TIMEOUT,

  // 重试
  executeWithRetry: executeWithRetry,
  DEFAULT_MAX_RETRIES: DEFAULT_MAX_RETRIES,
  DEFAULT_BACKOFF_BASE: DEFAULT_BACKOFF_BASE,

  // 熔断器
  CircuitBreaker: CircuitBreaker,
  getGlobalBreaker: function () { return _globalBreaker; },
  resetGlobalBreaker: function () { _globalBreaker.reset(); },

  // 降级
  getEffectiveMode: getEffectiveMode,

  // 策略参数 (可覆盖)
  CIRCUIT_FAILURE_THRESHOLD: CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_COOLDOWN_MS: CIRCUIT_COOLDOWN_MS,
};
