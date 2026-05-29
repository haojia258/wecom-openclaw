/**
 * runtime-deadlock-detector.js
 * P9.7.1a Runtime Stability Layer — Deadlock detection.
 *
 * Detects sessions that appear deadlocked:
 *   - session.status === 'running'
 *   - heartbeat stale (exceeds threshold)
 *   - updatedAt not changing
 *   - no recent checkpoint updates
 *
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

var DEFAULT_DEADLOCK_MINUTES = 30;       // 30 min no activity = deadlock suspected
var DEFAULT_DEADLOCK_MS      = DEFAULT_DEADLOCK_MINUTES * 60 * 1000;
var MIN_CHECKPOINT_COUNT     = 1;        // At least 1 checkpoint expected for running sessions

// ============================================================================
// Public API
// ============================================================================

/**
 * Detect deadlocked sessions.
 *
 * A session is considered deadlocked if:
 *   1. status === 'running'
 *   2. Heartbeat is stale (exceeds deadlockThresholdMs)
 *   3. updatedAt has not changed recently
 *   4. No checkpoint updates in the deadlock window
 *
 * @param {Object[]} sessions       — execution session objects
 * @param {Object[]} [checkpoints]  — checkpoint objects for these sessions
 * @param {Object}   [options]
 * @param {number}   [options.deadlockMinutes] — deadlock threshold in minutes (default: 30)
 * @param {number}   [options.deadlockMs]      — deadlock threshold in ms
 * @param {string}   [options.now]             — override "now" timestamp
 * @returns {{ deadlocked: Object[], healthy: Object[], summary: Object }}
 */
function detectDeadlocks(sessions, checkpoints, options) {
  options = options || {};

  if (!Array.isArray(sessions)) {
    return {
      deadlocked: [],
      healthy: [],
      summary: { total: 0, deadlockCount: 0, healthyCount: 0, error: 'sessions must be an array' }
    };
  }

  checkpoints = checkpoints || [];

  var deadlockMs = options.deadlockMs || (options.deadlockMinutes || DEFAULT_DEADLOCK_MINUTES) * 60 * 1000;
  var now = options.now || new Date().toISOString();
  var nowMs = new Date(now).getTime();

  var deadlocked = [];
  var healthy = [];

  for (var i = 0; i < sessions.length; i++) {
    var session = sessions[i];
    if (!session || !session.executionSessionId) continue;

    // Only check running sessions
    if (session.status !== 'running') {
      healthy.push(session);
      continue;
    }

    var reasons = [];
    var deadlockScore = 0;

    // Check 1: Heartbeat stale?
    var hbData = hb.getHeartbeat(session.executionSessionId);
    var hbLag = 0;

    if (hbData && hbData.heartbeatAt) {
      hbLag = nowMs - new Date(hbData.heartbeatAt).getTime();
      if (hbLag > deadlockMs) {
        reasons.push('heartbeat_stale: lag=' + Math.round(hbLag / 1000) + 's');
        deadlockScore += 3;
      }
    } else {
      // No heartbeat at all for a running session
      reasons.push('no_heartbeat_record');
      deadlockScore += 2;
    }

    // Check 2: updatedAt not changing
    if (session.updatedAt) {
      var updateLag = nowMs - new Date(session.updatedAt).getTime();
      if (updateLag > deadlockMs) {
        reasons.push('updatedAt_stale: lag=' + Math.round(updateLag / 1000) + 's');
        deadlockScore += 2;
      }
    } else {
      reasons.push('no_updatedAt');
      deadlockScore += 1;
    }

    // Check 3: No checkpoint updates
    var sessionCheckpoints = checkpoints.filter(function (cp) {
      return cp.sessionId === session.executionSessionId;
    });

    if (sessionCheckpoints.length < MIN_CHECKPOINT_COUNT) {
      reasons.push('no_checkpoints: expected >= ' + MIN_CHECKPOINT_COUNT);
      deadlockScore += 1;
    } else {
      // Check if the latest checkpoint is stale
      var latestCp = sessionCheckpoints.reduce(function (latest, cp) {
        if (!latest) return cp;
        return (cp.createdAt > latest.createdAt) ? cp : latest;
      }, null);

      if (latestCp && latestCp.createdAt) {
        var cpLag = nowMs - new Date(latestCp.createdAt).getTime();
        if (cpLag > deadlockMs) {
          reasons.push('latest_checkpoint_stale: lag=' + Math.round(cpLag / 1000) + 's');
          deadlockScore += 2;
        }
      }
    }

    // Deadlock suspected if score >= 5 (at least 2 strong indicators)
    if (deadlockScore >= 5) {
      deadlocked.push({
        sessionId:    session.executionSessionId,
        status:       session.status,
        reasons:      reasons,
        score:        deadlockScore,
        hbLag:        hbLag,
        detectedAt:   now,
        suspicion:    deadlockScore >= 7 ? 'high' : 'medium'
      });
    } else {
      healthy.push(session);
    }
  }

  return {
    deadlocked: deadlocked,
    healthy:    healthy,
    summary: {
      total:           sessions.length,
      deadlockCount:   deadlocked.length,
      healthyCount:    healthy.length,
      thresholdMinutes: options.deadlockMinutes || DEFAULT_DEADLOCK_MINUTES,
      thresholdMs:      deadlockMs,
      checkedAt:         now,
      highSuspicion:    deadlocked.filter(function (d) { return d.suspicion === 'high'; }).length,
      mediumSuspicion:  deadlocked.filter(function (d) { return d.suspicion === 'medium'; }).length
    }
  };
}

/**
 * Get the default deadlock threshold.
 *
 * @returns {{ minutes: number, ms: number }}
 */
function getDefaultDeadlockThreshold() {
  return {
    minutes: DEFAULT_DEADLOCK_MINUTES,
    ms:      DEFAULT_DEADLOCK_MS
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  detectDeadlocks:            detectDeadlocks,
  getDefaultDeadlockThreshold: getDefaultDeadlockThreshold
};
