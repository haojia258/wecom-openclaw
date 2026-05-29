/**
 * index.js
 * P9.7.1a Runtime Stability Layer — Barrel export.
 *
 * Safety constraints:
 *   - No shell, no exec, no spawn, no pm2, no deploy, no nginx, no .env
 *   - No auto-recovery, no auto-restart, no auto-dispatch, no auto-retry
 *   - Detect / analyze / report ONLY
 */

'use strict';

var heartbeat    = require('./runtime-heartbeat');
var timeoutMgr   = require('./runtime-timeout-manager');
var deadlockDet  = require('./runtime-deadlock-detector');
var watchdog     = require('./runtime-watchdog');
var stability    = require('./runtime-stability-runtime');

module.exports = {
  // Heartbeat
  updateHeartbeat:   heartbeat.updateHeartbeat,
  getHeartbeat:      heartbeat.getHeartbeat,
  isHeartbeatStale:  heartbeat.isHeartbeatStale,
  listHeartbeats:    heartbeat.listHeartbeats,
  getHeartbeatStats: heartbeat.getHeartbeatStats,
  removeHeartbeat:   heartbeat.removeHeartbeat,

  // Timeout
  detectTimeoutSessions:    timeoutMgr.detectTimeoutSessions,
  getDefaultTimeoutThreshold: timeoutMgr.getDefaultTimeoutThreshold,

  // Deadlock
  detectDeadlocks:             deadlockDet.detectDeadlocks,
  getDefaultDeadlockThreshold: deadlockDet.getDefaultDeadlockThreshold,

  // Watchdog
  scanRuntimeHealth: watchdog.scanRuntimeHealth,

  // Stability Runtime
  detectTimeouts:                stability.detectTimeouts,
  scanHealth:                    stability.scanHealth,
  generateRuntimeHealthSnapshot: stability.generateRuntimeHealthSnapshot,

  // Test helpers
  _clearAllHeartbeats: heartbeat._clearAllHeartbeats
};
