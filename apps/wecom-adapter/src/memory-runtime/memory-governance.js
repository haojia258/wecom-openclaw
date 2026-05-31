'use strict';

/**
 * memory-governance.js — 记忆治理与安全 (P9.2)
 *
 * 负责记忆数据的安全和合规:
 *   - sanitizeMemory()     屏蔽敏感信息
 *   - validateMemory()     验证写入合规
 *   - retainPolicy()       保留策略
 *
 * 永远禁止写入:
 *   - token / bearer / authorization
 *   - gateway-token / bridge-token
 *   - .env 内容
 *   - cookies
 */

// ─── 禁止字段正则 ────────────────────────────────────────────

/**
 * 敏感字段正则列表
 *
 * 匹配即屏蔽，替换为 [REDACTED]。
 */
var SENSITIVE_PATTERNS = [
  // API Keys
  { pattern: /sk-[a-zA-Z0-9]{20,}/gi,          replacement: '[REDACTED:api-key]' },
  { pattern: /sk-[a-zA-Z0-9_-]{20,}/gi,         replacement: '[REDACTED:api-key]' },

  // Bearer tokens — must run BEFORE auth-header to avoid being eaten
  { pattern: /bearer\s+[a-zA-Z0-9._\-+/=]{20,}/gi, replacement: '[REDACTED:bearer-token]' },

  // Authorization headers — skip if already redacted (prevents double-masking)
  { pattern: /authorization:\s*(?!\[REDACTED)[^\s]{20,}/gi, replacement: '[REDACTED:auth-header]' },

  // Token parameters
  { pattern: /token=([a-zA-Z0-9._\-]{20,})/gi,    replacement: 'token=[REDACTED]' },

  // Password parameters
  { pattern: /password=([^\s&]{4,})/gi,           replacement: 'password=[REDACTED]' },

  // API secrets
  { pattern: /api[_-]?secret[=:]\s*[^\s,}]{8,}/gi, replacement: 'api_secret=[REDACTED]' },

  // Access keys
  { pattern: /access[_-]?key[=:]\s*[^\s,}]{8,}/gi, replacement: 'access_key=[REDACTED]' },

  // Private keys (PEM blocks)
  { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[^-]*-----END\s+(RSA\s+)?PRIVATE\s+KEY-----/gi,
    replacement: '[REDACTED:private-key]' },

  // JWT tokens — lowered min header from 47 to 20 for standard JWTs (~33 chars after eyJ)
  { pattern: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    replacement: '[REDACTED:jwt]' },

  // .env variable assignments with sensitive keys
  { pattern: /(GATEWAY_TOKEN|BRIDGE_TOKEN|VAULT_TOKEN|OPENAI_API_KEY|DEEPSEEK_API_KEY|DOUBAO_API_KEY)\s*=\s*[^\n]{4,}/gi,
    replacement: '$1=[REDACTED]' },

  // GitHub tokens
  { pattern: /gh[pousr]_[a-zA-Z0-9]{20,}/gi,       replacement: '[REDACTED:github-token]' },

  // Generic secret/private patterns
  { pattern: /secret[=:]\s*[^\s,}]{8,}/gi,         replacement: 'secret=[REDACTED]' },
];

// ─── 禁止写入的关键词 ────────────────────────────────────────

/**
 * 如果记忆内容包含以下关键词，拒绝写入。
 * 这是硬性阻止，不是 masking。
 */
var BLOCKED_KEYWORDS = [
  'GATEWAY_TOKEN',
  'BRIDGE_TOKEN',
  'VAULT_TOKEN',
  '.env',
  'cookies'
];

// ─── 公共 API ────────────────────────────────────────────────

/**
 * sanitizeMemory — 对记忆数据进行脱敏
 *
 * 递归处理对象/数组/字符串，对所有敏感模式进行 regex masking。
 *
 * @param {*} data - 要脱敏的数据（字符串、对象或数组）
 * @returns {*} 脱敏后的数据
 */
function sanitizeMemory(data) {
  if (typeof data === 'string') {
    var sanitized = data;
    for (var i = 0; i < SENSITIVE_PATTERNS.length; i++) {
      sanitized = sanitized.replace(SENSITIVE_PATTERNS[i].pattern, SENSITIVE_PATTERNS[i].replacement);
    }
    return sanitized;
  }

  if (Array.isArray(data)) {
    return data.map(function(item) { return sanitizeMemory(item); });
  }

  if (data !== null && typeof data === 'object') {
    var result = {};
    var keys = Object.keys(data);
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      // 检查 key 本身是否敏感
      var sanitizedKey = key;
      for (var k = 0; k < SENSITIVE_PATTERNS.length; k++) {
        sanitizedKey = sanitizedKey.replace(SENSITIVE_PATTERNS[k].pattern, SENSITIVE_PATTERNS[k].replacement);
      }
      result[sanitizedKey] = sanitizeMemory(data[key]);
    }
    return result;
  }

  // 布尔值、数字等直接返回
  return data;
}

/**
 * validateMemory — 验证记忆是否可以写入
 *
 * 检查:
 *   1. 是否包含禁止关键词 → 拒绝
 *   2. 是否包含敏感模式 → 脱敏后允许
 *
 * @param {Object} record - 记忆记录
 * @returns {{ allowed: boolean, sanitized: Object|null, violations: Array<string> }}
 */
function validateMemory(record) {
  var violations = [];
  var recordStr = JSON.stringify(record);

  // 检查禁止关键词
  for (var i = 0; i < BLOCKED_KEYWORDS.length; i++) {
    if (recordStr.indexOf(BLOCKED_KEYWORDS[i]) !== -1) {
      violations.push('BLOCKED: 包含禁止关键词 "' + BLOCKED_KEYWORDS[i] + '"');
    }
  }

  if (violations.length > 0) {
    return { allowed: false, sanitized: null, violations: violations };
  }

  // 脱敏处理
  var sanitized = sanitizeMemory(record);

  return { allowed: true, sanitized: sanitized, violations: [] };
}

/**
 * safeAppend — 安全写入（自动 validate + sanitize）
 *
 * @param {Function} writeFn  - 写入函数
 * @param {Object} record     - 记录数据
 * @returns {{ success: boolean, sanitized: boolean, violations: Array }}
 */
function safeAppend(writeFn, record) {
  var validation = validateMemory(record);

  if (!validation.allowed) {
    return { success: false, sanitized: false, violations: validation.violations };
  }

  var result = writeFn(validation.sanitized);
  return { success: result, sanitized: true, violations: [] };
}

// ─── 保留策略 ────────────────────────────────────────────────

/**
 * retainPolicy — 记忆保留策略
 *
 * @returns {{
 *   maxRecordsPerType: number,
 *   maxAgeDays: number,
 *   dedupWindow: number,
 *   policy: string
 * }}
 */
function retainPolicy() {
  return {
    maxRecordsPerType: 10000,
    maxAgeDays: 90,
    dedupWindow: 300, // 5 分钟内重复写入视为重复
    policy: 'FIFO: 超过 maxRecordsPerType 时删除最早记录; 超过 maxAgeDays 的记录归档或删除'
  };
}

/**
 * checkDuplicate — 检查是否为重复记录
 *
 * 同一 correlationId + 同一类型在 dedupWindow 内的记录视为重复。
 *
 * @param {Array<Object>} existingRecords - 已有记录
 * @param {Object} newRecord             - 新记录
 * @param {number} [dedupWindow=300]     - 去重窗口（秒）
 * @returns {boolean}
 */
function checkDuplicate(existingRecords, newRecord, dedupWindow) {
  dedupWindow = dedupWindow || 300;
  var newTs = new Date(newRecord.timestamp).getTime();

  for (var i = 0; i < existingRecords.length; i++) {
    var existing = existingRecords[i];
    if (existing.correlationId === newRecord.correlationId) {
      var existingTs = new Date(existing.timestamp).getTime();
      if (Math.abs(newTs - existingTs) < dedupWindow * 1000) {
        return true;
      }
    }
  }

  return false;
}

/**
 * maskSensitiveFields — 对指定字段进行脱敏（用于批量处理）
 *
 * @param {string} text - 要脱敏的文本
 * @returns {string}
 */
function maskSensitiveFields(text) {
  return sanitizeMemory(text);
}

/**
 * getGovernanceReport — 获取治理报告
 *
 * @returns {{ patterns: number, blockedKeywords: Array, retentionPolicy: Object }}
 */
function getGovernanceReport() {
  return {
    activePatterns: SENSITIVE_PATTERNS.length,
    blockedKeywords: BLOCKED_KEYWORDS,
    retentionPolicy: retainPolicy(),
    sensitivePatternDescriptions: SENSITIVE_PATTERNS.map(function(p) {
      return { pattern: p.pattern.toString(), replacement: p.replacement };
    })
  };
}

module.exports = {
  // 核心
  sanitizeMemory: sanitizeMemory,
  validateMemory: validateMemory,
  safeAppend: safeAppend,

  // 保留
  retainPolicy: retainPolicy,
  checkDuplicate: checkDuplicate,

  // 工具
  maskSensitiveFields: maskSensitiveFields,
  getGovernanceReport: getGovernanceReport,

  // 暴露常量（用于测试）
  SENSITIVE_PATTERNS: SENSITIVE_PATTERNS,
  BLOCKED_KEYWORDS: BLOCKED_KEYWORDS
};
