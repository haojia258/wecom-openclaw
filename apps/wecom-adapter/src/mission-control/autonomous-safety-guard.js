'use strict';

/**
 * Autonomous Safety Guard — Production safety boundaries
 *
 * Enforces hard limits to prevent mission storms:
 *   - max missions per hour (default: 60)
 *   - max critical missions per hour (default: 10)
 *   - global cooldown between cycles (default: 10s)
 *   - panic stop: auto-stop monitoring + enter safe mode
 *
 * When any threshold is reached:
 *   1. Stop passive monitoring
 *   2. Enter safe mode
 *   3. Log safe mode event
 *   4. Block all further mission creation until manually reset
 *
 * NO shell/pm2/gateway/.env access.
 *
 * Must be paired with:
 *   - monitoring-status.js  (to query safeMode)
 *   - mission-audit-log.js   (to log safe mode events)
 *   - passive-monitor-loop.js (which checks safeMode before each cycle)
 */

var auditLog = null; // injected — avoids circular require

// ─── Default thresholds ────────────────────────────────────

var MAX_MISSIONS_PER_HOUR  = 60;
var MAX_CRITICAL_PER_HOUR  = 10;
var GLOBAL_COOLDOWN_MS     = 10000;   // 10s between cycles
var WINDOW_MS              = 60000;  // 1 minute sliding window

// ─── Internal state ────────────────────────────────────────

var _missionTimestamps   = [];   // [{at: ms, severity: string}]
var _lastCycleAt         = 0;
var _safeMode            = false;
var _panicReason         = null;
var _panicAt             = null;

// ─── Helpers ───────────────────────────────────────────────

function _purgeOld() {
  var cutoff = Date.now() - WINDOW_MS;
  while (_missionTimestamps.length > 0 && _missionTimestamps[0].at < cutoff) {
    _missionTimestamps.shift();
  }
}

function _countMissions() {
  _purgeOld();
  return _missionTimestamps.length;
}

function _countCritical() {
  _purgeOld();
  var count = 0;
  for (var i = 0; i < _missionTimestamps.length; i++) {
    if (_missionTimestamps[i].severity === 'critical') count++;
  }
  return count;
}

// ─── Core checks ───────────────────────────────────────────

/**
 * Called before each mission is created.
 * Returns { allowed: true } or { allowed: false, reason: '...' }
 */
function beforeMissionCreate(mission) {
  if (_safeMode) {
    return { allowed: false, reason: 'safe_mode_active', detail: _panicReason };
  }

  var severity = (mission && mission.metadata && mission.metadata.anomalySeverity) || 'warning';

  _purgeOld();

  var total = _missionTimestamps.length;

  if (total >= MAX_MISSIONS_PER_HOUR) {
    _enterSafeMode('MAX_MISSIONS_PER_HOUR: ' + total + ' >= ' + MAX_MISSIONS_PER_HOUR);
    return { allowed: false, reason: 'safe_mode_triggered', detail: _panicReason };
  }

  if (severity === 'critical') {
    var critCount = 0;
    for (var i = 0; i < _missionTimestamps.length; i++) {
      if (_missionTimestamps[i].severity === 'critical') critCount++;
    }
    if (critCount >= MAX_CRITICAL_PER_HOUR) {
      _enterSafeMode('MAX_CRITICAL_PER_HOUR: ' + critCount + ' >= ' + MAX_CRITICAL_PER_HOUR);
      return { allowed: false, reason: 'safe_mode_triggered', detail: _panicReason };
    }
  }

  // Track this mission
  _missionTimestamps.push({ at: Date.now(), severity: severity });

  return { allowed: true };
}

/**
 * Called before each monitoring cycle.
 * Returns { allowed: true } or { allowed: false, reason: '...' }
 */
function beforeCycle() {
  if (_safeMode) {
    return { allowed: false, reason: 'safe_mode_active', detail: _panicReason };
  }

  var now = Date.now();
  if (_lastCycleAt > 0 && (now - _lastCycleAt) < GLOBAL_COOLDOWN_MS) {
    return { allowed: false, reason: 'global_cooldown', remainingMs: GLOBAL_COOLDOWN_MS - (now - _lastCycleAt) };
  }

  _lastCycleAt = now;
  _purgeOld();

  // Pre-cycle threshold check
  var total = _missionTimestamps.length;
  if (total >= MAX_MISSIONS_PER_HOUR) {
    _enterSafeMode('MAX_MISSIONS_PER_HOUR (pre-cycle): ' + total + ' >= ' + MAX_MISSIONS_PER_HOUR);
    return { allowed: false, reason: 'safe_mode_triggered', detail: _panicReason };
  }

  return { allowed: true };
}

/**
 * Called by the trigger engine after a set of triggers.
 * Allows post-trigger threshold checks.
 */
function afterTriggers(triggerCount, criticalCount) {
  _purgeOld();

  var total = _missionTimestamps.length;

  if (total >= MAX_MISSIONS_PER_HOUR) {
    _enterSafeMode('MAX_MISSIONS_PER_HOUR (post-trigger): ' + total + ' >= ' + MAX_MISSIONS_PER_HOUR);
    return { safeMode: true, reason: _panicReason };
  }

  var critCount = 0;
  for (var i = 0; i < _missionTimestamps.length; i++) {
    if (_missionTimestamps[i].severity === 'critical') critCount++;
  }
  if (critCount >= MAX_CRITICAL_PER_HOUR) {
    _enterSafeMode('MAX_CRITICAL_PER_HOUR (post-trigger): ' + critCount + ' >= ' + MAX_CRITICAL_PER_HOUR);
    return { safeMode: true, reason: _panicReason };
  }

  return { safeMode: false };
}

// ─── Panic / Safe Mode ─────────────────────────────────────

function _enterSafeMode(reason) {
  if (_safeMode) return; // already in safe mode
  _safeMode    = true;
  _panicReason = reason;
  _panicAt     = new Date().toISOString();

  // Log to audit log if injected
  if (auditLog) {
    try {
      auditLog.logSafeMode({
        correlationId: 'safety_guard_' + Date.now(),
        timestamp:     _panicAt,
        reason:        reason,
        metadata:      {
          totalMissions:   _missionTimestamps.length,
          maxPerHour:      MAX_MISSIONS_PER_HOUR,
          maxCritical:     MAX_CRITICAL_PER_HOUR,
          trigger:         reason
        }
      });
    } catch (_) { /* audit log failure must not block panic */ }
  }
}

function isSafeMode() {
  return _safeMode;
}

function getSafeModeReason() {
  return _panicReason;
}

function resetSafeMode() {
  _safeMode    = false;
  _panicReason = null;
  _panicAt     = null;
}

// ─── Configuration ─────────────────────────────────────────

function configure(options) {
  var opts = options || {};
  if (typeof opts.maxMissionsPerHour === 'number' && opts.maxMissionsPerHour > 0) {
    MAX_MISSIONS_PER_HOUR = opts.maxMissionsPerHour;
  }
  if (typeof opts.maxCriticalPerHour === 'number' && opts.maxCriticalPerHour > 0) {
    MAX_CRITICAL_PER_HOUR = opts.maxCriticalPerHour;
  }
  if (typeof opts.globalCooldownMs === 'number' && opts.globalCooldownMs >= 0) {
    GLOBAL_COOLDOWN_MS = opts.globalCooldownMs;
  }
  if (typeof opts.windowMs === 'number' && opts.windowMs > 0) {
    WINDOW_MS = opts.windowMs;
  }
  return getConfig();
}

function getConfig() {
  return {
    maxMissionsPerHour:  MAX_MISSIONS_PER_HOUR,
    maxCriticalPerHour:  MAX_CRITICAL_PER_HOUR,
    globalCooldownMs:    GLOBAL_COOLDOWN_MS,
    windowMs:            WINDOW_MS,
    safeMode:            _safeMode,
    safeModeReason:      _panicReason,
    currentMissionCount: _countMissions(),
    currentCriticalCount: _countCritical()
  };
}

// ─── Dependency injection (for audit log, to avoid circular require) ──

function setAuditLog(al) {
  auditLog = al;
}

// ─── Stats ─────────────────────────────────────────────────

function getStats() {
  _purgeOld();
  return {
    safeMode:            _safeMode,
    panicReason:         _panicReason,
    panicAt:             _panicAt,
    missionsInWindow:    _missionTimestamps.length,
    criticalInWindow:    _countCritical(),
    maxPerHour:          MAX_MISSIONS_PER_HOUR,
    maxCritical:         MAX_CRITICAL_PER_HOUR,
    lastCycleAt:         _lastCycleAt > 0 ? new Date(_lastCycleAt).toISOString() : null,
    globalCooldownMs:    GLOBAL_COOLDOWN_MS
  };
}

function _reset() {
  MAX_MISSIONS_PER_HOUR  = 60;
  MAX_CRITICAL_PER_HOUR  = 10;
  GLOBAL_COOLDOWN_MS     = 10000;
  WINDOW_MS              = 60000;
  _missionTimestamps  = [];
  _lastCycleAt        = 0;
  _safeMode           = false;
  _panicReason        = null;
  _panicAt            = null;
}

module.exports = {
  beforeMissionCreate: beforeMissionCreate,
  beforeCycle:         beforeCycle,
  afterTriggers:       afterTriggers,
  isSafeMode:          isSafeMode,
  getSafeModeReason:   getSafeModeReason,
  resetSafeMode:       resetSafeMode,
  configure:           configure,
  getConfig:           getConfig,
  getStats:            getStats,
  setAuditLog:         setAuditLog,
  _reset:              _reset
};
