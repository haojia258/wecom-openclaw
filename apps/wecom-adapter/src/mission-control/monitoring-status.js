'use strict';

/**
 * Monitoring Status — Runtime monitoring state tracker
 *
 * Tracks:
 *   - running / stopped
 *   - intervalMs
 *   - activeWatchers list
 *   - lastRunAt
 *   - totalChecks / totalTriggers / totalSuppressed
 *   - activeMissions count
 *   - safeMode flag
 *
 * Pure in-memory, no I/O, no shell/pm2/gateway/.env.
 */

// ─── Internal state ────────────────────────────────────────

var _status = {
  running:         false,
  safeMode:        false,
  intervalMs:      60000,
  activeWatchers:  [],
  lastRunAt:       null,
  totalChecks:     0,
  totalTriggers:   0,
  totalSuppressed: 0,
  totalCycles:     0,
  activeMissions:  0
};

// ─── Public API ────────────────────────────────────────────

function getMonitoringStatus() {
  return {
    running:         _status.running,
    safeMode:        _status.safeMode,
    intervalMs:      _status.intervalMs,
    activeWatchers:  _status.activeWatchers.slice(),
    lastRunAt:       _status.lastRunAt,
    totalChecks:     _status.totalChecks,
    totalTriggers:   _status.totalTriggers,
    totalSuppressed: _status.totalSuppressed,
    totalCycles:     _status.totalCycles,
    activeMissions:  _status.activeMissions
  };
}

function setRunning(val) {
  _status.running = !!val;
}

function setSafeMode(val) {
  _status.safeMode = !!val;
}

function setIntervalMs(ms) {
  if (typeof ms === 'number' && ms >= 100) {
    _status.intervalMs = ms;
  }
}

function setActiveWatchers(list) {
  _status.activeWatchers = Array.isArray(list) ? list.slice() : [];
}

function markRun(cycleResult) {
  var now = new Date().toISOString();
  _status.lastRunAt = now;
  _status.totalCycles++;

  if (cycleResult) {
    if (typeof cycleResult.totalChecks === 'number') {
      _status.totalChecks += cycleResult.totalChecks;
    }
    if (typeof cycleResult.totalTriggers === 'number') {
      _status.totalTriggers += cycleResult.totalTriggers;
    }
    if (typeof cycleResult.totalSuppressed === 'number') {
      _status.totalSuppressed += cycleResult.totalSuppressed;
    }
  }
}

function setActiveMissions(count) {
  _status.activeMissions = typeof count === 'number' ? count : 0;
}

function incrementChecks(n) {
  _status.totalChecks += (typeof n === 'number' ? n : 1);
}

function incrementTriggers(n) {
  _status.totalTriggers += (typeof n === 'number' ? n : 1);
}

function incrementSuppressed(n) {
  _status.totalSuppressed += (typeof n === 'number' ? n : 1);
}

function _reset() {
  _status.running         = false;
  _status.safeMode        = false;
  _status.intervalMs      = 60000;
  _status.activeWatchers  = [];
  _status.lastRunAt       = null;
  _status.totalChecks     = 0;
  _status.totalTriggers   = 0;
  _status.totalSuppressed = 0;
  _status.totalCycles     = 0;
  _status.activeMissions  = 0;
}

module.exports = {
  getMonitoringStatus: getMonitoringStatus,
  setRunning:          setRunning,
  setSafeMode:         setSafeMode,
  setIntervalMs:       setIntervalMs,
  setActiveWatchers:   setActiveWatchers,
  markRun:             markRun,
  setActiveMissions:   setActiveMissions,
  incrementChecks:     incrementChecks,
  incrementTriggers:   incrementTriggers,
  incrementSuppressed: incrementSuppressed,
  _reset:              _reset
};
