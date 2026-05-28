/**
 * runtime-timeout-manager.js
 * P9.7.1a Runtime Stability Layer — Timeout detection.
 *
 * Reads execution sessions and detects timeouts based on heartbeat/updatedAt.
 * Only detects and reports. Does NOT execute, restart, or auto-recover.
 *
 * Safety constraints:
 *   - No shell, no exec, no spawn, no pm2, no deploy, no nginx, no .env
 *   - No auto-recovery, no auto-restart, no auto-dispatch, no auto-retry
 *   - Detect / analyze / report ONLY
 */

'use strict';

var hb = require('./runtime-heartbeat');

// ============================================================================
// Constants
// ============================================================================

var DEFAULT_TIMEOUT_MINUTES = 15;
var DEFAULT_TIMEOUT_MS      = DEFAULT_TIMEOUT_MINUTES * 60 * 1000;

// Session statuses that should be checked for timeout
var TIMEOUT_CHECK_STATUSES = ['running'];

// Session statuses that should be ignored (terminal/completed)
var IGNORED_STATUSES = ['created', 'ready', 'paused', 'completed', 'failed', 'rolled_back', 'archived'];

// ============================================================================
// Public API
// ============================================================================

/**
 * Detect sessions that have exceeded the timeout threshold.
 *
 * @param {Object[]} sessions — array of execution session objects
 * @param {Object} [options]
 * @param {number} [options.timeoutMinutes] — timeout threshold in minutes (default: 15)
 * @param {number} [options.timeoutMs]      — timeout threshold in milliseconds
 * @param {string} [options.now]            — override "now" timestamp
 * @returns {{ timeoutSessions: Object[], healthySessions: Object[], summary: Object }}
 */
function detectTimeoutSessions(sessions, options) {
  options = options || {};

  if (!Array.isArray(sessions)) {
    return {
      timeoutSessions: [],
      healthySessions: [],
      summary: { total: 0, timeoutCount: 0, healthyCount: 0, error: 'sessions must be an array' }
    };
  }

  var timeoutMs = options.timeoutMs || (options.timeoutMinutes || DEFAULT_TIMEOUT_MINUTES) * 60 * 1000;

  var timeoutSessions = [];
  var healthySessions = [];
  var now = options.now || new Date().toISOString();
  var nowMs = new Date(now).getTime();
  var ignoredCount = 0;

  for (var i = 0; i < sessions.length; i++) {
    var session = sessions[i];
    if (!session || !session.executionSessionId) continue;

    // Skip terminal/completed sessions
    if (IGNORED_STATUSES.indexOf(session.status) !== -1) {
      ignoredCount++;
      continue;
    }

    // Only check running sessions
    if (TIMEOUT_CHECK_STATUSES.indexOf(session.status) === -1) {
      healthySessions.push(session);
      continue;
    }

    var isTimeout = false;
    var timeoutReason = '';

    // Check heartbeat first (preferred)
    var hbData = hb.getHeartbeat(session.executionSessionId);
    if (hbData && hbData.heartbeatAt) {
      var hbTime = new Date(hbData.heartbeatAt).getTime();
      if (nowMs - hbTime > timeoutMs) {
        isTimeout = true;
        timeoutReason = 'heartbeat_stale: last heartbeat at ' + hbData.heartbeatAt;
      }
    } else if (session.updatedAt) {
      // Fallback to session.updatedAt
      var updatedTime = new Date(session.updatedAt).getTime();
      if (nowMs - updatedTime > timeoutMs) {
        isTimeout = true;
        timeoutReason = 'session_stale: last updated at ' + session.updatedAt;
      }
    } else if (session.createdAt) {
      // Fallback to session.createdAt
      var createdTime = new Date(session.createdAt).getTime();
      if (nowMs - createdTime > timeoutMs) {
        isTimeout = true;
        timeoutReason = 'no_heartbeat_no_update: created at ' + session.createdAt;
      }
    }

    if (isTimeout) {
      timeoutSessions.push({
        sessionId:  session.executionSessionId,
        status:     session.status,
        reason:     timeoutReason,
        detectedAt: now,
        lagMs:      hbData ? (nowMs - new Date(hbData.heartbeatAt).getTime()) : 0
      });
    } else {
      healthySessions.push(session);
    }
  }

  return {
    timeoutSessions: timeoutSessions,
    healthySessions: healthySessions,
    summary: {
      total:         sessions.length,
      timeoutCount:  timeoutSessions.length,
      healthyCount:  healthySessions.length,
      ignoredCount:  ignoredCount,
      thresholdMinutes: options.timeoutMinutes || DEFAULT_TIMEOUT_MINUTES,
      thresholdMs:     timeoutMs,
      checkedAt:       now
    }
  };
}

/**
 * Get the default timeout threshold.
 *
 * @returns {{ minutes: number, ms: number }}
 */
function getDefaultTimeoutThreshold() {
  return {
    minutes: DEFAULT_TIMEOUT_MINUTES,
    ms:      DEFAULT_TIMEOUT_MS
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  detectTimeoutSessions:    detectTimeoutSessions,
  getDefaultTimeoutThreshold: getDefaultTimeoutThreshold,
  TIMEOUT_CHECK_STATUSES:   TIMEOUT_CHECK_STATUSES,
  IGNORED_STATUSES:         IGNORED_STATUSES
};
