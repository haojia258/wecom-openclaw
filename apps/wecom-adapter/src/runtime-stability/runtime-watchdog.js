/**
 * runtime-watchdog.js
 * P9.7.1a Runtime Stability Layer — Health scanner.
 *
 * Aggregates timeout detection, deadlock detection, and heartbeat stats
 * into a single runtime health scan.
 *
 * Safety constraints:
 *   - No shell, no exec, no spawn, no pm2, no deploy, no nginx, no .env
 *   - No auto-recovery, no auto-restart, no auto-dispatch, no auto-retry
 *   - Detect / analyze / report ONLY
 */

'use strict';

var hb   = require('./runtime-heartbeat');
var tm   = require('./runtime-timeout-manager');
var dd   = require('./runtime-deadlock-detector');

// ============================================================================
// Public API
// ============================================================================

/**
 * Scan all runtime sessions and produce a health report.
 *
 * @param {Object[]} sessions       — execution session objects
 * @param {Object[]} [checkpoints]  — checkpoint objects
 * @param {Object}   [options]
 * @param {number}   [options.timeoutMinutes]   — default: 15
 * @param {number}   [options.deadlockMinutes]  — default: 30
 * @param {string}   [options.now]              — override "now" timestamp
 * @returns {{
 *   healthy: boolean,
 *   staleSessions: Object[],
 *   timeoutSessions: Object[],
 *   deadlockedSessions: Object[],
 *   orphanedCheckpoints: Object[],
 *   snapshot: Object
 * }}
 */
function scanRuntimeHealth(sessions, checkpoints, options) {
  options = options || {};
  checkpoints = checkpoints || [];
  sessions = sessions || [];

  var now = options.now || new Date().toISOString();

  // 1. Detect timeouts
  var timeoutResult = tm.detectTimeoutSessions(sessions, {
    timeoutMinutes: options.timeoutMinutes || 15,
    now:            now
  });

  // 2. Detect deadlocks
  var deadlockResult = dd.detectDeadlocks(sessions, checkpoints, {
    deadlockMinutes: options.deadlockMinutes || 30,
    now:             now
  });

  // 3. Find stale sessions (heartbeat lag > threshold but not yet timeout)
  var hbStats = hb.getHeartbeatStats({ now: now, thresholdMs: (options.timeoutMinutes || 15) * 60 * 1000 });
  var staleThresholdMs = (options.timeoutMinutes || 15) * 60 * 1000;
  var staleSessions = [];

  for (var i = 0; i < sessions.length; i++) {
    var s = sessions[i];
    if (!s || !s.executionSessionId) continue;
    if (s.status !== 'running') continue;

    var staleCheck = hb.isHeartbeatStale(s.executionSessionId, staleThresholdMs, { now: now });
    if (staleCheck.stale && staleCheck.lag > 0 && staleCheck.lag <= staleThresholdMs) {
      staleSessions.push({
        sessionId: s.executionSessionId,
        status:    s.status,
        lagMs:     staleCheck.lag,
        heartbeatAt: staleCheck.heartbeatAt
      });
    }
  }

  // 4. Find orphaned checkpoints (checkpoint belongs to non-existent session)
  var sessionIds = {};
  for (var j = 0; j < sessions.length; j++) {
    if (sessions[j] && sessions[j].executionSessionId) {
      sessionIds[sessions[j].executionSessionId] = true;
    }
  }

  var orphanedCheckpoints = [];
  for (var k = 0; k < checkpoints.length; k++) {
    var cp = checkpoints[k];
    if (cp && cp.sessionId && !sessionIds[cp.sessionId]) {
      orphanedCheckpoints.push({
        checkpointId: cp.checkpointId || 'unknown',
        sessionId:    cp.sessionId,
        step:         cp.step || 'unknown'
      });
    }
  }

  // 5. Determine overall health
  var isHealthy = timeoutResult.timeoutSessions.length === 0 &&
                  deadlockResult.deadlocked.length === 0 &&
                  orphanedCheckpoints.length === 0;

  // 6. Build snapshot
  var snapshot = {
    totalSessions:        sessions.length,
    runningSessions:      sessions.filter(function (s) { return s && s.status === 'running'; }).length,
    timeoutSessions:      timeoutResult.timeoutSessions.length,
    deadlockedSessions:   deadlockResult.deadlocked.length,
    staleSessions:        staleSessions.length,
    orphanedCheckpoints:  orphanedCheckpoints.length,
    heartbeatStats:       hbStats,
    checkedAt:            now
  };

  return {
    healthy:              isHealthy,
    staleSessions:        staleSessions,
    timeoutSessions:      timeoutResult.timeoutSessions,
    deadlockedSessions:   deadlockResult.deadlocked,
    orphanedCheckpoints:  orphanedCheckpoints,
    snapshot:             snapshot
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  scanRuntimeHealth: scanRuntimeHealth
};
