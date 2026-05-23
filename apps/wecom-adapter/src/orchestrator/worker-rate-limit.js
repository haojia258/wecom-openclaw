'use strict';

/**
 * worker-rate-limit.js — 调用限流
 *
 * 限制 OpenAI Worker 的调用频率，防止超量消耗。
 *
 * 限制规则:
 *   - 每分钟最多 2 次
 *   - 每小时最多 10 次
 *   - 并发最多 1
 *
 * 超限返回: { allowed: false, reason: 'RATE_LIMIT_EXCEEDED: ...' }
 *
 * Phase2-B: Worker Safety Layer
 */

// 限制常量
const LIMIT_PER_MINUTE = 2;
const LIMIT_PER_HOUR = 10;
const LIMIT_CONCURRENT = 1;

// 滑动窗口存储 (内存)
var minuteWindow = [];   // { taskId, timestamp }
var hourWindow = [];
var currentConcurrent = 0;

/**
 * 清理过期的窗口记录
 */
function cleanWindows(now) {
  var oneMinuteAgo = now - 60 * 1000;
  var oneHourAgo = now - 60 * 60 * 1000;

  minuteWindow = minuteWindow.filter(function (entry) {
    return entry.timestamp > oneMinuteAgo;
  });
  hourWindow = hourWindow.filter(function (entry) {
    return entry.timestamp > oneHourAgo;
  });
}

/**
 * 检查是否允许调用
 *
 * @param {string} taskId - 任务 ID
 * @returns {{ allowed: boolean, reason?: string }}
 */
function check(taskId) {
  var now = Date.now();

  // 清理过期记录
  cleanWindows(now);

  // 检查并发限制
  if (currentConcurrent >= LIMIT_CONCURRENT) {
    return {
      allowed: false,
      reason: 'RATE_LIMIT_EXCEEDED: 并发限制 (' + LIMIT_CONCURRENT + ')',
    };
  }

  // 检查每分钟限制
  if (minuteWindow.length >= LIMIT_PER_MINUTE) {
    return {
      allowed: false,
      reason: 'RATE_LIMIT_EXCEEDED: 每分钟限制 (' + LIMIT_PER_MINUTE + ')',
    };
  }

  // 检查每小时限制
  if (hourWindow.length >= LIMIT_PER_HOUR) {
    return {
      allowed: false,
      reason: 'RATE_LIMIT_EXCEEDED: 每小时限制 (' + LIMIT_PER_HOUR + ')',
    };
  }

  // 通过，记录调用
  var entry = { taskId: taskId, timestamp: now };
  minuteWindow.push(entry);
  hourWindow.push(entry);
  currentConcurrent++;

  return { allowed: true };
}

/**
 * 标记一次调用完成（释放并发槽位）
 */
function release() {
  if (currentConcurrent > 0) {
    currentConcurrent--;
  }
}

/**
 * 获取当前限流状态（用于监控）
 * @returns {{ minuteCount: number, hourCount: number, concurrent: number, limits: object }}
 */
function getStatus() {
  var now = Date.now();
  cleanWindows(now);
  return {
    minuteCount: minuteWindow.length,
    hourCount: hourWindow.length,
    concurrent: currentConcurrent,
    limits: {
      perMinute: LIMIT_PER_MINUTE,
      perHour: LIMIT_PER_HOUR,
      concurrent: LIMIT_CONCURRENT,
    },
  };
}

/**
 * 重置所有限流状态（仅用于测试）
 */
function reset() {
  minuteWindow = [];
  hourWindow = [];
  currentConcurrent = 0;
}

module.exports = {
  check: check,
  release: release,
  getStatus: getStatus,
  reset: reset,
  // 常量
  LIMIT_PER_MINUTE: LIMIT_PER_MINUTE,
  LIMIT_PER_HOUR: LIMIT_PER_HOUR,
  LIMIT_CONCURRENT: LIMIT_CONCURRENT,
};
