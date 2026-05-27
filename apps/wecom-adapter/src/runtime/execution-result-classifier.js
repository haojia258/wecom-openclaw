'use strict';

/**
 * execution-result-classifier.js — 执行结果分类器 (P9.1)
 *
 * 将执行结果自动分类为以下七种类型之一：
 *   - SUCCESS           正常完成
 *   - TRANSIENT_FAILURE 瞬时故障（可重试）
 *   - POLICY_BLOCKED    策略阻断（不可重试）
 *   - EXECUTOR_ERROR    执行器内部错误
 *   - INFRA_ERROR       基础设施故障
 *   - TIMEOUT           超时
 *   - UNKNOWN           未知错误
 *
 * 支持多协议分类:
 *   - HTTP 响应（axios error / status codes）
 *   - PM2 输出（command not found, process not found）
 *   - npm test 输出（test failures, transient errors）
 *   - executor throw 模式（Error 对象字符串匹配）
 */

// ─── 分类枚举 ─────────────────────────────────────────────────

var ResultType = {
  SUCCESS:           'SUCCESS',
  TRANSIENT_FAILURE: 'TRANSIENT_FAILURE',
  POLICY_BLOCKED:    'POLICY_BLOCKED',
  EXECUTOR_ERROR:    'EXECUTOR_ERROR',
  INFRA_ERROR:       'INFRA_ERROR',
  TIMEOUT:           'TIMEOUT',
  UNKNOWN:           'UNKNOWN'
};

// ─── HTTP 状态码映射 ──────────────────────────────────────────

var HTTP_TRANSIENT_CODES = {
  408: true,  // Request Timeout
  429: true,  // Too Many Requests
  500: true,  // Internal Server Error
  502: true,  // Bad Gateway
  503: true,  // Service Unavailable
  504: true   // Gateway Timeout
};

var HTTP_TIMEOUT_CODES = {
  408: true
};

// ─── HTTP Error code 字符串模式 ─────────────────────────────

var HTTP_TRANSIENT_ERRORS = [
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND',
  'EPIPE', 'EHOSTUNREACH', 'EAI_AGAIN', 'ECONNABORTED',
  'socket hang up', 'read ECONNRESET', 'connect ETIMEDOUT',
  'connect ECONNREFUSED', 'Client network socket disconnected'
];

var HTTP_TIMEOUT_ERRORS = [
  'ETIMEDOUT', 'timeout', 'TIMEDOUT', 'ESOCKETTIMEDOUT',
  'connect ETIMEDOUT', 'timeout of'
];

var HTTP_POLICY_ERRORS = [
  '401', '403', 'permission denied', 'unauthorized',
  'forbidden', 'not allowed', 'RBAC', 'policy'
];

// ─── PM2 错误模式 ────────────────────────────────────────────

var PM2_TRANSIENT_ERRORS = [
  'Process not found', 'ENOENT', 'spawn',
  'connection refused', 'Daemon not running',
  'not connected'
];

var PM2_INFRA_ERRORS = [
  'command not found', 'pm2: command not found',
  'cannot find module'
];

var PM2_TIMEOUT_ERRORS = [
  'timed out', 'timeout', 'ETIMEDOUT'
];

// ─── npm test 错误模式 ───────────────────────────────────────

var NPM_TEST_TRANSIENT_ERRORS = [
  'EADDRINUSE', 'port.*already in use', 'connection reset',
  'EPIPE', 'ECONNRESET'
];

var NPM_TEST_INFRA_ERRORS = [
  'ENOENT', 'command not found', 'cannot find module',
  'node: not found', 'npm: not found'
];

var NPM_TEST_TIMEOUT_ERRORS = [
  'timeout', 'exceeded timeout', 'test timed out',
  'Tests timed out', 'Timeout of'
];

// ─── 执行器 throw 分类 ───────────────────────────────────────

var EXECUTOR_THROW_TRANSIENT = [
  'temporarily unavailable', 'try again', 'rate limit',
  'too many requests', 'overloaded', 'busy',
  'connection', 'ECONNREFUSED', 'ETIMEDOUT'
];

var EXECUTOR_THROW_POLICY = [
  'permission denied', 'not allowed', 'blocked',
  'forbidden', 'RBAC', 'policy deny', 'unauthorized',
  'not in whitelist', 'auth'
];

var EXECUTOR_THROW_INFRA = [
  'ENOENT', 'command not found', 'not installed',
  'cannot find', 'missing'
];

var EXECUTOR_THROW_TIMEOUT = [
  'timeout', 'timed out', 'ETIMEDOUT', 'exceeded'
];

// ─── 核心 API ────────────────────────────────────────────────

/**
 * 分类执行结果
 *
 * @param {Object} params
 * @param {string} params.protocol   - 协议: 'http' | 'pm2' | 'npm-test' | 'executor-throw' | 'generic'
 * @param {boolean} [params.success] - 执行是否成功（executor 返回）
 * @param {number} [params.statusCode] - HTTP 状态码
 * @param {string} [params.error]      - 错误消息
 * @param {string} [params.output]     - 输出内容
 * @param {number} [params.durationMs] - 执行耗时
 * @param {Object} [params.errorObj]   - 原始 Error 对象
 * @returns {{ type: string, retryable: boolean, reason: string, details: Object }}
 */
function classify(params) {
  params = params || {};

  // ─── 0. 成功 ───
  if (params.success === true) {
    return makeResult(ResultType.SUCCESS, false, 'Execution completed successfully', {
      durationMs: params.durationMs
    });
  }

  var error = (params.error || '').toString();
  var output = (params.output || '').toString();
  var protocol = (params.protocol || 'generic').toLowerCase();
  var statusCode = params.statusCode;
  var combined = (error + ' ' + output).toLowerCase();

  // ─── 策略阻断检查（所有协议通用） ───
  if (statusCode === 401 || statusCode === 403) {
    return makeResult(ResultType.POLICY_BLOCKED, false,
      'HTTP ' + statusCode + ' — policy/authentication blocked', { statusCode: statusCode });
  }
  for (var p = 0; p < HTTP_POLICY_ERRORS.length; p++) {
    if (combined.indexOf(HTTP_POLICY_ERRORS[p].toLowerCase()) !== -1) {
      return makeResult(ResultType.POLICY_BLOCKED, false,
        'Policy blocked: "' + HTTP_POLICY_ERRORS[p] + '" matched', { pattern: HTTP_POLICY_ERRORS[p] });
    }
  }

  // ─── 超时检查（所有协议） ───
  // HTTP 408
  if (statusCode === 408) {
    return makeResult(ResultType.TIMEOUT, true,
      'HTTP 408 Request Timeout', { statusCode: 408 });
  }

  // 通用超时模式
  var allTimeoutPatterns = HTTP_TIMEOUT_ERRORS.concat(PM2_TIMEOUT_ERRORS)
    .concat(NPM_TEST_TIMEOUT_ERRORS).concat(EXECUTOR_THROW_TIMEOUT);
  for (var t = 0; t < allTimeoutPatterns.length; t++) {
    if (combined.indexOf(allTimeoutPatterns[t].toLowerCase()) !== -1) {
      return makeResult(ResultType.TIMEOUT, true,
        'Timeout detected: "' + allTimeoutPatterns[t] + '" matched', { pattern: allTimeoutPatterns[t] });
    }
  }

  // ─── 按协议分类 ───

  // HTTP 协议
  if (protocol === 'http') {
    return classifyHttp(statusCode, error, combined);
  }

  // PM2 协议
  if (protocol === 'pm2') {
    return classifyPm2(error, combined);
  }

  // npm-test 协议
  if (protocol === 'npm-test') {
    return classifyNpmTest(error, combined);
  }

  // executor-throw 协议
  if (protocol === 'executor-throw') {
    return classifyExecutorThrow(error, combined);
  }

  // ─── 通用降级分类 ───
  return classifyGeneric(error, combined);
}

/**
 * HTTP 协议分类
 */
function classifyHttp(statusCode, error, combined) {
  // 瞬时 HTTP 错误码
  if (statusCode && HTTP_TRANSIENT_CODES[statusCode]) {
    var isTimeout = statusCode === 408;
    return makeResult(
      isTimeout ? ResultType.TIMEOUT : ResultType.TRANSIENT_FAILURE,
      true,
      'HTTP ' + statusCode + ' — ' + (isTimeout ? 'timeout' : 'transient server error'),
      { statusCode: statusCode }
    );
  }

  // 瞬时连接错误
  for (var i = 0; i < HTTP_TRANSIENT_ERRORS.length; i++) {
    if (combined.indexOf(HTTP_TRANSIENT_ERRORS[i].toLowerCase()) !== -1) {
      return makeResult(ResultType.TRANSIENT_FAILURE, true,
        'HTTP transient error: "' + HTTP_TRANSIENT_ERRORS[i] + '"', { pattern: HTTP_TRANSIENT_ERRORS[i] });
    }
  }

  // 基础设施错误
  if (combined.indexOf('ENOTFOUND') !== -1 || combined.indexOf('dns') !== -1) {
    return makeResult(ResultType.INFRA_ERROR, false,
      'DNS/infrastructure error: host not found', {});
  }

  return makeResult(ResultType.UNKNOWN, false, 'HTTP error: ' + (error || 'unknown'), {});
}

/**
 * PM2 协议分类
 */
function classifyPm2(error, combined) {
  // 基础设施错误优先
  for (var i = 0; i < PM2_INFRA_ERRORS.length; i++) {
    if (combined.indexOf(PM2_INFRA_ERRORS[i].toLowerCase()) !== -1) {
      return makeResult(ResultType.INFRA_ERROR, false,
        'PM2 infrastructure error: "' + PM2_INFRA_ERRORS[i] + '"', { pattern: PM2_INFRA_ERRORS[i] });
    }
  }

  // 瞬时错误
  for (var j = 0; j < PM2_TRANSIENT_ERRORS.length; j++) {
    if (combined.indexOf(PM2_TRANSIENT_ERRORS[j].toLowerCase()) !== -1) {
      return makeResult(ResultType.TRANSIENT_FAILURE, true,
        'PM2 transient error: "' + PM2_TRANSIENT_ERRORS[j] + '"', { pattern: PM2_TRANSIENT_ERRORS[j] });
    }
  }

  return makeResult(ResultType.EXECUTOR_ERROR, false,
    'PM2 execution error: ' + (error || 'unknown'), {});
}

/**
 * npm-test 协议分类
 */
function classifyNpmTest(error, combined) {
  // 基础设施错误优先
  for (var i = 0; i < NPM_TEST_INFRA_ERRORS.length; i++) {
    if (combined.indexOf(NPM_TEST_INFRA_ERRORS[i].toLowerCase()) !== -1) {
      return makeResult(ResultType.INFRA_ERROR, false,
        'npm test infrastructure error: "' + NPM_TEST_INFRA_ERRORS[i] + '"', { pattern: NPM_TEST_INFRA_ERRORS[i] });
    }
  }

  // 瞬时错误
  for (var j = 0; j < NPM_TEST_TRANSIENT_ERRORS.length; j++) {
    if (combined.indexOf(NPM_TEST_TRANSIENT_ERRORS[j].toLowerCase()) !== -1) {
      return makeResult(ResultType.TRANSIENT_FAILURE, true,
        'npm test transient error: "' + NPM_TEST_TRANSIENT_ERRORS[j] + '"', { pattern: NPM_TEST_TRANSIENT_ERRORS[j] });
    }
  }

  // 测试失败本身是 EXECUTOR_ERROR（非瞬时，但可触发 recovery）
  if (combined.indexOf('failing') !== -1 || combined.indexOf('failed') !== -1 ||
      combined.indexOf('assert') !== -1) {
    return makeResult(ResultType.EXECUTOR_ERROR, false,
      'npm test assertion/test failure', {});
  }

  return makeResult(ResultType.EXECUTOR_ERROR, false,
    'npm test error: ' + (error || 'unknown'), {});
}

/**
 * executor-throw 协议分类
 */
function classifyExecutorThrow(error, combined) {
  // 策略阻断
  for (var i = 0; i < EXECUTOR_THROW_POLICY.length; i++) {
    if (combined.indexOf(EXECUTOR_THROW_POLICY[i].toLowerCase()) !== -1) {
      return makeResult(ResultType.POLICY_BLOCKED, false,
        'Executor policy blocked: "' + EXECUTOR_THROW_POLICY[i] + '"', { pattern: EXECUTOR_THROW_POLICY[i] });
    }
  }

  // 瞬时故障
  for (var j = 0; j < EXECUTOR_THROW_TRANSIENT.length; j++) {
    if (combined.indexOf(EXECUTOR_THROW_TRANSIENT[j].toLowerCase()) !== -1) {
      return makeResult(ResultType.TRANSIENT_FAILURE, true,
        'Executor transient error: "' + EXECUTOR_THROW_TRANSIENT[j] + '"', { pattern: EXECUTOR_THROW_TRANSIENT[j] });
    }
  }

  // 基础设施
  for (var k = 0; k < EXECUTOR_THROW_INFRA.length; k++) {
    if (combined.indexOf(EXECUTOR_THROW_INFRA[k].toLowerCase()) !== -1) {
      return makeResult(ResultType.INFRA_ERROR, false,
        'Executor infrastructure error: "' + EXECUTOR_THROW_INFRA[k] + '"', { pattern: EXECUTOR_THROW_INFRA[k] });
    }
  }

  return makeResult(ResultType.EXECUTOR_ERROR, false,
    'Executor threw: ' + (error || 'unknown'), {});
}

/**
 * 通用降级分类
 */
function classifyGeneric(error, combined) {
  // 策略阻断模式
  for (var p = 0; p < EXECUTOR_THROW_POLICY.length; p++) {
    if (combined.indexOf(EXECUTOR_THROW_POLICY[p].toLowerCase()) !== -1) {
      return makeResult(ResultType.POLICY_BLOCKED, false,
        'Generic policy blocked: "' + EXECUTOR_THROW_POLICY[p] + '"', {});
    }
  }

  // 瞬时故障模式
  for (var j = 0; j < EXECUTOR_THROW_TRANSIENT.length; j++) {
    if (combined.indexOf(EXECUTOR_THROW_TRANSIENT[j].toLowerCase()) !== -1) {
      return makeResult(ResultType.TRANSIENT_FAILURE, true,
        'Generic transient: "' + EXECUTOR_THROW_TRANSIENT[j] + '"', {});
    }
  }

  // 基础设施模式
  for (var k = 0; k < EXECUTOR_THROW_INFRA.length; k++) {
    if (combined.indexOf(EXECUTOR_THROW_INFRA[k].toLowerCase()) !== -1) {
      return makeResult(ResultType.INFRA_ERROR, false,
        'Generic infrastructure: "' + EXECUTOR_THROW_INFRA[k] + '"', {});
    }
  }

  return makeResult(ResultType.UNKNOWN, false,
    'Unclassified error: ' + (error || 'unknown'), {});
}

/**
 * 快速判断是否可重试
 *
 * @param {string} resultType - classify() 返回的 type
 * @returns {boolean}
 */
function isRetryable(resultType) {
  return resultType === ResultType.TRANSIENT_FAILURE ||
         resultType === ResultType.TIMEOUT;
}

/**
 * 快速判断是否需要 recovery plan
 *
 * @param {string} resultType - classify() 返回的 type
 * @returns {boolean}
 */
function needsRecovery(resultType) {
  return resultType === ResultType.EXECUTOR_ERROR ||
         resultType === ResultType.INFRA_ERROR;
}

// ─── 辅助函数 ────────────────────────────────────────────────

/**
 * 构建标准分类结果
 */
function makeResult(type, retryable, reason, details) {
  return {
    type: type,
    retryable: retryable,
    reason: reason,
    details: details || {}
  };
}

/**
 * 从 Error 对象推断协议并分类
 *
 * @param {Error|Object} err - 错误对象
 * @param {string} [protocol] - 可选协议覆盖
 * @returns {{ type: string, retryable: boolean, reason: string, details: Object }}
 */
function classifyFromError(err, protocol) {
  if (!err) {
    return makeResult(ResultType.UNKNOWN, false, 'No error provided', {});
  }

  var message = err.message || String(err);
  var code = err.code || '';
  var statusCode = err.status || err.statusCode || (err.response ? err.response.status : undefined);

  // 自动检测协议
  var detectedProtocol = protocol || 'generic';
  if (statusCode) {
    detectedProtocol = 'http';
  }

  return classify({
    protocol: detectedProtocol,
    success: false,
    statusCode: statusCode,
    error: code ? (code + ': ' + message) : message,
    output: ''
  });
}

// ─── 导出 ────────────────────────────────────────────────────

module.exports = {
  // 枚举
  ResultType: ResultType,

  // 核心 API
  classify: classify,
  classifyFromError: classifyFromError,
  isRetryable: isRetryable,
  needsRecovery: needsRecovery,

  // 子分类器（暴露用于测试）
  classifyHttp: classifyHttp,
  classifyPm2: classifyPm2,
  classifyNpmTest: classifyNpmTest,
  classifyExecutorThrow: classifyExecutorThrow,
  classifyGeneric: classifyGeneric,

  // 模式表（暴露用于测试）
  HTTP_TRANSIENT_CODES: HTTP_TRANSIENT_CODES,
  HTTP_TRANSIENT_ERRORS: HTTP_TRANSIENT_ERRORS,
  HTTP_TIMEOUT_ERRORS: HTTP_TIMEOUT_ERRORS,
  HTTP_POLICY_ERRORS: HTTP_POLICY_ERRORS
};
