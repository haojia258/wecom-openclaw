'use strict';

/**
 * Passive Monitor Loop — Production observation runtime
 *
 * Iterative cycle:
 *   1. Run all 5 watchers with mock/pre-fetched data
 *   2. evaluateTriggers() on all results
 *   3. Create missions for triggered anomalies
 *   4. Output runtime monitoring snapshot
 *
 * Guards:
 *   - Safety guard checks before each cycle (beforeCycle)
 *   - Safety guard checks before each mission (beforeMissionCreate)
 *   - Cooldown + dedup via trigger-engine
 *   - Global cooldown via safety guard
 *   - Panic stop via safety guard
 *
 * Watchers (all mock-first, read-only):
 *   - pm2-watcher      → checkPM2Status()
 *   - gateway-watcher  → checkGatewayHealth()
 *   - agent-host-watcher → checkAgentHostHealth()
 *   - memory-watcher   → checkMemoryHealth()
 *   - bridge-watcher   → checkBridgeHealth()
 *
 * Configurable:
 *   - interval (default 60s, min 1s)
 *   - watcher options per type
 *
 * NO shell/pm2/gateway/deploy/restart/.env.
 * Only Observe → Detect → Trigger → Mission.
 */

var pm2Watcher       = require('../runtime-watchers/pm2-watcher');
var gatewayWatcher   = require('../runtime-watchers/gateway-watcher');
var agentHostWatcher = require('../runtime-watchers/agent-host-watcher');
var memoryWatcher    = require('../runtime-watchers/memory-watcher');
var bridgeWatcher    = require('../runtime-watchers/bridge-watcher');

var triggerEngine    = require('./trigger-engine');
var missionManager   = require('./mission-manager');
var monitoringStatus = require('./monitoring-status');
var safetyGuard      = require('./autonomous-safety-guard');
var auditLog         = require('./mission-audit-log');

// ─── Inject auditLog dependency into safety guard ──────────
safetyGuard.setAuditLog(auditLog);

// ─── Defaults ──────────────────────────────────────────────

var DEFAULT_INTERVAL_MS = 60000; // 60 seconds
var MIN_INTERVAL_MS     = 100;   // 100ms minimum

// ─── Internal state ────────────────────────────────────────

var _timer        = null;
var _running      = false;
var _intervalMs   = DEFAULT_INTERVAL_MS;
var _cycleIndex   = 0;
var _watcherData  = {};   // per-watcher mock data: { pm2: [...], gateway: {...}, ... }
var _watcherOpts  = {};   // per-watcher options
var _onSnapshot   = null; // callback(snapshot) for external consumers
var _onPanic      = null; // callback(reason) for panic events

// ─── Watcher helpers ───────────────────────────────────────

function _runPM2Watcher() {
  var data    = _watcherData.pm2 || [];
  var options = _watcherOpts.pm2 || {};
  var result  = pm2Watcher.checkPM2Status(data, options);
  result.watcher = 'pm2';
  return result;
}

function _runGatewayWatcher() {
  var data    = _watcherData.gateway || {};
  var options = _watcherOpts.gateway || {};
  var result  = gatewayWatcher.checkGatewayHealth(data, options);
  result.watcher = 'gateway';
  return result;
}

function _runAgentHostWatcher() {
  var data    = _watcherData.agentHost || {};
  var options = _watcherOpts.agentHost || {};
  var result  = agentHostWatcher.checkAgentHostHealth(data, options);
  result.watcher = 'agent-host';
  return result;
}

function _runMemoryWatcher() {
  var data    = _watcherData.memory || {};
  var options = _watcherOpts.memory || {};
  var result  = memoryWatcher.checkMemoryHealth(data, options);
  result.watcher = 'memory';
  return result;
}

function _runBridgeWatcher() {
  var data    = _watcherData.bridge || {};
  var options = _watcherOpts.bridge || {};
  var result  = bridgeWatcher.checkBridgeHealth(data, options);
  result.watcher = 'bridge';
  return result;
}

// ─── Cycle execution ───────────────────────────────────────

function _executeCycle() {
  // 1. Check safety guard before cycle
  var cycleCheck = safetyGuard.beforeCycle();
  if (!cycleCheck.allowed) {
    // Log suppressed cycle
    if (auditLog) {
      try {
        auditLog.logSuppress({
          correlationId: 'cycle_suppress_' + Date.now(),
          type:          'CYCLE_SUPPRESS',
          watcher:       'system',
          reason:        cycleCheck.reason,
          metadata:      { detail: cycleCheck.detail, remainingMs: cycleCheck.remainingMs }
        });
      } catch (_) { /* non-fatal */ }
    }
    return;
  }

  var snapshot = {
    cycleIndex:    _cycleIndex + 1,
    timestamp:     new Date().toISOString(),
    watcherResults: {},
    triggerResult:  null,
    safeMode:       safetyGuard.isSafeMode()
  };

  // 2. Run all 5 watchers
  try {
    snapshot.watcherResults.pm2        = _runPM2Watcher();
  } catch (e) {
    snapshot.watcherResults.pm2 = { ok: false, status: 'error', error: e.message, watcher: 'pm2', anomalies: [], summary: 'PM2 watcher error: ' + e.message, checkedAt: new Date().toISOString() };
  }

  try {
    snapshot.watcherResults.gateway    = _runGatewayWatcher();
  } catch (e) {
    snapshot.watcherResults.gateway = { ok: false, status: 'error', error: e.message, watcher: 'gateway', anomalies: [], summary: 'Gateway watcher error: ' + e.message, checkedAt: new Date().toISOString() };
  }

  try {
    snapshot.watcherResults.agentHost  = _runAgentHostWatcher();
  } catch (e) {
    snapshot.watcherResults.agentHost = { ok: false, status: 'error', error: e.message, watcher: 'agent-host', anomalies: [], summary: 'Agent Host watcher error: ' + e.message, checkedAt: new Date().toISOString() };
  }

  try {
    snapshot.watcherResults.memory     = _runMemoryWatcher();
  } catch (e) {
    snapshot.watcherResults.memory = { ok: false, status: 'error', error: e.message, watcher: 'memory', anomalies: [], summary: 'Memory watcher error: ' + e.message, checkedAt: new Date().toISOString() };
  }

  try {
    snapshot.watcherResults.bridge     = _runBridgeWatcher();
  } catch (e) {
    snapshot.watcherResults.bridge = { ok: false, status: 'error', error: e.message, watcher: 'bridge', anomalies: [], summary: 'Bridge watcher error: ' + e.message, checkedAt: new Date().toISOString() };
  }

  // 3. Build watcher results array for trigger engine
  var watcherResults = [
    snapshot.watcherResults.pm2,
    snapshot.watcherResults.gateway,
    snapshot.watcherResults.agentHost,
    snapshot.watcherResults.memory,
    snapshot.watcherResults.bridge
  ];

  // 4. evaluateTriggers (with cooldown + dedup)
  var triggerResult = triggerEngine.evaluateTriggers(watcherResults);
  snapshot.triggerResult = triggerResult;

  // 5. For each triggered anomaly, check safety guard, then create audit entry
  var createdCount    = 0;
  var blockedCount    = 0;
  var criticalCreated = 0;

  for (var t = 0; t < triggerResult.triggered.length; t++) {
    var item = triggerResult.triggered[t];
    var mission = item.mission;

    // Safety guard: should we allow this mission?
    var guardCheck = safetyGuard.beforeMissionCreate(mission);
    if (!guardCheck.allowed) {
      blockedCount++;
      if (auditLog) {
        try {
          auditLog.logSuppress({
            correlationId: 'guard_block_' + mission.missionId + '_' + Date.now(),
            type:          'SAFETY_BLOCK',
            watcher:       mission.source,
            anomaly:       item.anomaly,
            reason:        guardCheck.reason,
            metadata:      { detail: guardCheck.detail, missionId: mission.missionId }
          });
        } catch (_) { /* non-fatal */ }
      }
      continue;
    }

    // Log trigger to audit log
    if (auditLog) {
      try {
        auditLog.logTrigger({
          correlationId: mission.correlationId,
          type:          'TRIGGER',
          watcher:       mission.source,
          anomaly:       item.anomaly,
          mission:       { missionId: mission.missionId, type: mission.type, priority: mission.priority }
        });
      } catch (_) { /* non-fatal */ }
    }

    var isCritical = item.anomaly && item.anomaly.severity === 'critical';
    if (isCritical) criticalCreated++;
    createdCount++;
  }

  // 6. Log suppressed items to audit log
  for (var s = 0; s < triggerResult.suppressed.length; s++) {
    var sup = triggerResult.suppressed[s];
    if (auditLog) {
      try {
        auditLog.logSuppress({
          correlationId: 'suppress_' + (sup.key || 'unknown') + '_' + Date.now(),
          type:          sup.reason === 'dedup' ? 'SUPPRESS_DEDUP' : 'SUPPRESS_COOLDOWN',
          watcher:       sup.watcher || 'unknown',
          anomaly:       sup.anomaly,
          reason:        sup.reason || 'cooldown'
        });
      } catch (_) { /* non-fatal */ }
    }
  }

  // 7. Post-trigger safety check
  var postCheck = safetyGuard.afterTriggers(createdCount, criticalCreated);
  if (postCheck.safeMode) {
    monitoringStatus.setSafeMode(true);
    snapshot.safeMode = true;
    snapshot.panicReason = postCheck.reason;

    if (_onPanic) {
      try { _onPanic(postCheck.reason); } catch (_) { /* non-fatal */ }
    }
  }

  // 8. Update monitoring status
  _cycleIndex++;
  var activeMissions = missionManager.listMissions({ status: 'CREATED' }).length +
                       missionManager.listMissions({ status: 'RUNNING' }).length;

  monitoringStatus.markRun({
    totalChecks:     5, // 5 watchers
    totalTriggers:   createdCount,
    totalSuppressed: triggerResult.suppressed.length + blockedCount
  });
  monitoringStatus.setActiveMissions(activeMissions);

  // 9. Log cycle to audit
  if (auditLog) {
    try {
      auditLog.logCycle({
        correlationId:  'cycle_' + _cycleIndex + '_' + Date.now(),
        cycleIndex:     _cycleIndex,
        totalChecks:    5,
        totalTriggers:  createdCount,
        totalSuppressed: triggerResult.suppressed.length + blockedCount,
        activeMissions:  activeMissions,
        watcherResults:  _summarizeWatchers(watcherResults)
      });
    } catch (_) { /* non-fatal */ }
  }

  // 10. Call snapshot callback
  if (_onSnapshot) {
    try { _onSnapshot(snapshot); } catch (_) { /* non-fatal */ }
  }

  // 11. If safe mode triggered, stop monitoring
  if (snapshot.safeMode || safetyGuard.isSafeMode()) {
    stopPassiveMonitoring();
  }

  return snapshot;
}

function _summarizeWatchers(results) {
  var summary = {};
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (!r) continue;
    summary[r.watcher || ('watcher_' + i)] = {
      ok:         r.ok,
      status:     r.status,
      summary:    r.summary,
      anomalyCount: Array.isArray(r.anomalies) ? r.anomalies.length : 0
    };
  }
  return summary;
}

// ─── Public API ────────────────────────────────────────────

function startPassiveMonitoring(options) {
  if (_running) return { started: false, reason: 'already_running' };

  var opts = options || {};

  // Configure interval
  var intervalMs = opts.intervalMs || DEFAULT_INTERVAL_MS;
  if (intervalMs < MIN_INTERVAL_MS) intervalMs = MIN_INTERVAL_MS;
  _intervalMs = intervalMs;

  // Configure watcher data
  _watcherData.pm2       = opts.pm2Data       || [];
  _watcherData.gateway   = opts.gatewayData   || {};
  _watcherData.agentHost = opts.agentHostData  || {};
  _watcherData.memory    = opts.memoryData    || {};
  _watcherData.bridge    = opts.bridgeData    || {};

  // Configure watcher options
  _watcherOpts.pm2       = opts.pm2Options       || {};
  _watcherOpts.gateway   = opts.gatewayOptions   || {};
  _watcherOpts.agentHost = opts.agentHostOptions  || {};
  _watcherOpts.memory    = opts.memoryOptions    || {};
  _watcherOpts.bridge    = opts.bridgeOptions    || {};

  // Configure safety guard
  if (opts.safetyGuard) {
    safetyGuard.configure(opts.safetyGuard);
  }

  // Configure audit log
  if (opts.auditLog) {
    auditLog.init(opts.auditLog);
  } else {
    // Default: initialize in tmp
    auditLog.init({ logDir: '.' });
  }

  // Initialize safety guard audit log
  safetyGuard.setAuditLog(auditLog);

  // Callbacks
  _onSnapshot = opts.onSnapshot || null;
  _onPanic    = opts.onPanic || null;

  // Set monitoring status
  monitoringStatus.setRunning(true);
  monitoringStatus.setSafeMode(false);
  monitoringStatus.setIntervalMs(_intervalMs);
  monitoringStatus.setActiveWatchers(['pm2', 'gateway', 'agent-host', 'memory', 'bridge']);

  _running = true;
  _cycleIndex = 0;

  // Start the interval
  _timer = setInterval(function() {
    // Safe mode check — if in safe mode, don't run cycles
    if (safetyGuard.isSafeMode()) {
      monitoringStatus.setSafeMode(true);
      return;
    }
    try {
      _executeCycle();
    } catch (e) {
      // Cycle error — log but don't crash the loop
      if (auditLog) {
        try {
          auditLog.logSuppress({
            correlationId: 'cycle_error_' + Date.now(),
            type:          'CYCLE_ERROR',
            watcher:       'system',
            reason:        e.message,
            metadata:      { stack: (e.stack || '').substring(0, 500) }
          });
        } catch (_) { /* non-fatal */ }
      }
    }
  }, _intervalMs);

  // Don't let the timer hold the process
  if (_timer && typeof _timer.unref === 'function') {
    _timer.unref();
  }

  return {
    started:     true,
    intervalMs:  _intervalMs,
    watchers:    ['pm2', 'gateway', 'agent-host', 'memory', 'bridge'],
    safeMode:    safetyGuard.isSafeMode()
  };
}

function stopPassiveMonitoring() {
  if (!_running) return { stopped: false, reason: 'not_running' };

  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }

  _running = false;
  monitoringStatus.setRunning(false);

  return {
    stopped:      true,
    totalCycles:  _cycleIndex,
    status:       monitoringStatus.getMonitoringStatus()
  };
}

function getMonitoringStatus() {
  var ms   = monitoringStatus.getMonitoringStatus();
  var sg   = safetyGuard.getStats();
  var mm   = {
    total:    missionManager.listMissions().length,
    created:  missionManager.listMissions({ status: 'CREATED' }).length,
    running:  missionManager.listMissions({ status: 'RUNNING' }).length,
    completed: missionManager.listMissions({ status: 'COMPLETED' }).length,
    failed:   missionManager.listMissions({ status: 'FAILED' }).length,
    cancelled: missionManager.listMissions({ status: 'CANCELLED' }).length
  };

  return {
    running:         ms.running,
    safeMode:        ms.safeMode || sg.safeMode,
    safeModeReason:  safetyGuard.getSafeModeReason(),
    intervalMs:      _intervalMs,
    activeWatchers:  ms.activeWatchers,
    lastRunAt:       ms.lastRunAt,
    totalChecks:     ms.totalChecks,
    totalTriggers:   ms.totalTriggers,
    totalSuppressed: ms.totalSuppressed,
    totalCycles:     ms.totalCycles,
    activeMissions:  ms.activeMissions,
    missionsByStatus: mm,
    safetyGuard:     sg
  };
}

function runOnce() {
  if (safetyGuard.isSafeMode()) {
    return { error: 'safe_mode_active', reason: safetyGuard.getSafeModeReason() };
  }
  return _executeCycle();
}

function setWatcherData(watcherName, data) {
  _watcherData[watcherName] = data;
}

function setWatcherOptions(watcherName, options) {
  _watcherOpts[watcherName] = options;
}

function isRunning() {
  return _running;
}

function _reset() {
  stopPassiveMonitoring();
  _timer         = null;
  _running       = false;
  _intervalMs    = DEFAULT_INTERVAL_MS;
  _cycleIndex    = 0;
  _watcherData   = {};
  _watcherOpts   = {};
  _onSnapshot    = null;
  _onPanic       = null;
  monitoringStatus._reset();
  safetyGuard._reset();
  missionManager._reset();
  triggerEngine.resetTriggerState();
  auditLog._reset();
}

module.exports = {
  startPassiveMonitoring:  startPassiveMonitoring,
  stopPassiveMonitoring:   stopPassiveMonitoring,
  getMonitoringStatus:     getMonitoringStatus,
  runOnce:                 runOnce,
  setWatcherData:          setWatcherData,
  setWatcherOptions:       setWatcherOptions,
  isRunning:               isRunning,
  _reset:                  _reset
};
