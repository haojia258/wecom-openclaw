'use strict';

/**
 * gateway-rate-limit.js - Gateway 限流与重放检测 (P8.0.3)
 *
 * - 基于 IP 的滑动窗口限流（内存 Map）
 * - 基于 requestId + timestamp 的重放检测（内存 Set，TTL 5min）
 */

// ─── 配置 ─────────────────────────────────────────────────

var RATE_LIMIT_MAX = parseInt(process.env.GATEWAY_RATE_LIMIT_MAX || '60', 10);
var RATE_LIMIT_WINDOW_MS = 60 * 1000;          // 窗口大小 60s
var REPLAY_TTL_MS = 5 * 60 * 1000;              // 重放 TTL 5min
var REPLAY_MAX_ENTRIES = 10000;                  // 最大去重条目数

// ─── 限流状态 ────────────────────────────────────────────

/**
 * IP → { count: number, windowStart: number }
 */
var rateLimitMap = {};

// ─── 重放检测状态 ────────────────────────────────────────

/**
 * Set of "requestId:timestamp"
 * 定期清理过期条目
 */
var replaySet = new Set();
var replayTimestamps = {}; // requestId → timestamp (for TTL)

// ─── 限流 ────────────────────────────────────────────────

/**
 * 检查 IP 是否超过限流
 *
 * @param {string} ip - 客户端 IP
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkRateLimit(ip) {
  if (!ip) {
    return { allowed: false, reason: '无法获取客户端 IP' };
  }

  // 如果没有配置 IP allowlist，且 RATE_LIMIT_MAX=0，则跳过限流
  if (RATE_LIMIT_MAX <= 0) {
    return { allowed: true };
  }

  var now = Date.now();
  var entry = rateLimitMap[ip];

  // 新窗口或首次请求
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap[ip] = { count: 1, windowStart: now };
    return { allowed: true };
  }

  // 窗口内，递增计数
  entry.count++;

  if (entry.count > RATE_LIMIT_MAX) {
    return {
      allowed: false,
      reason: 'Rate limit exceeded: ' + RATE_LIMIT_MAX + ' requests per ' + (RATE_LIMIT_WINDOW_MS / 1000) + 's'
    };
  }

  return { allowed: true };
}

// ─── 重放检测 ────────────────────────────────────────────

/**
 * 检查请求是否为重放攻击
 *
 * @param {string} requestId - 请求 ID
 * @param {number} timestamp - 请求时间戳 (Unix ms)
 * @returns {{ valid: boolean, reason?: string }}
 */
function checkReplay(requestId, timestamp) {
  if (!requestId) {
    return { valid: false, reason: '缺少 requestId' };
  }

  if (!timestamp || typeof timestamp !== 'number') {
    return { valid: false, reason: '缺少有效的 timestamp' };
  }

  var now = Date.now();
  var age = Math.abs(now - timestamp);

  // 1. 时间戳窗口检查
  var windowSec = parseInt(process.env.GATEWAY_TIMESTAMP_WINDOW_SEC || '300', 10);
  if (age > windowSec * 1000) {
    return {
      valid: false,
      reason: 'Timestamp expired: 偏差 ' + Math.round(age / 1000) + 's 超过允许的 ' + windowSec + 's'
    };
  }

  // 2. 重放检查
  var key = requestId + ':' + timestamp;

  if (replaySet.has(key)) {
    return {
      valid: false,
      reason: 'Duplicate request: 相同的 requestId 和 timestamp 已被使用'
    };
  }

  // 记录
  replaySet.add(key);
  replayTimestamps[key] = now;

  // 清理过期条目
  _purgeExpired();

  return { valid: true };
}

// ─── 清理过期重放条目 ────────────────────────────────────

function _purgeExpired() {
  if (replaySet.size <= REPLAY_MAX_ENTRIES) {
    return;
  }

  var now = Date.now();
  var keysToDelete = [];

  var keys = Object.keys(replayTimestamps);
  for (var i = 0; i < keys.length; i++) {
    if (now - replayTimestamps[keys[i]] > REPLAY_TTL_MS) {
      keysToDelete.push(keys[i]);
    }
  }

  for (var j = 0; j < keysToDelete.length; j++) {
    replaySet.delete(keysToDelete[j]);
    delete replayTimestamps[keysToDelete[j]];
  }
}

// ─── 重置（测试用）────────────────────────────────────────

/**
 * 重置所有限流和重放状态
 */
function resetRateLimit() {
  rateLimitMap = {};
  replaySet = new Set();
  replayTimestamps = {};
}

/**
 * 获取当前限流状态（调试用）
 *
 * @param {string} [ip] - 指定 IP，不传返回全部
 * @returns {object}
 */
function getRateLimitStatus(ip) {
  if (ip) {
    return {
      ip: ip,
      rateLimit: rateLimitMap[ip] || null,
      replayCount: replaySet.size
    };
  }
  return {
    rateLimitMap: rateLimitMap,
    replaySetSize: replaySet.size,
    replayMaxEntries: REPLAY_MAX_ENTRIES
  };
}

module.exports = {
  checkRateLimit,
  checkReplay,
  resetRateLimit,
  getRateLimitStatus
};
