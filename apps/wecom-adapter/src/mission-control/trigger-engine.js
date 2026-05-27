'use strict';

/**
 * Trigger Engine — Observe → Detect → Trigger → Mission
 * Analyzes watcher results, builds missions from anomalies.
 * Cooldown + dedup to prevent duplicate missions.
 * NO shell/pm2/gateway calls. Only creates missions.
 */

var mm       = require('./mission-manager');
var SEVERITY = { critical: 'high', warning: 'medium' };
var COOLDOWN_MS = 5 * 60 * 1000; // 5 min default

var _lastTrigger = {};  // dedupKey → lastTriggerTime

function _watcherType(watcherName) {
  if (!watcherName) return 'generic-health';
  var s = String(watcherName).toLowerCase();
  if (s.indexOf('pm2')     !== -1) return 'pm2-health';
  if (s.indexOf('gateway') !== -1) return 'gateway-health';
  if (s.indexOf('agent')   !== -1 || s.indexOf('host') !== -1) return 'agent-host-health';
  if (s.indexOf('memory')  !== -1) return 'memory-health';
  if (s.indexOf('bridge')  !== -1) return 'bridge-health';
  return 'generic-health';
}

function _dedupKey(watcherResult, anomaly) {
  var watcher  = watcherResult.watcher || 'unknown';
  var type     = anomaly.type || 'unknown';
  var target   = watcherResult.target || watcherResult.url || '';
  return watcher + '|' + type + '|' + target;
}

function shouldSuppressTrigger(key, now, options) {
  var opts   = options || {};
  var cooldown = opts.cooldownMs != null ? opts.cooldownMs : COOLDOWN_MS;
  var last   = _lastTrigger[key];
  var ts     = now || Date.now();
  return last ? (ts - last < cooldown) : false;
}

function resetTriggerState() {
  _lastTrigger = {};
}

function buildMissionFromAnomaly(anomaly, context) {
  var watcherResult = context || {};
  var priority = SEVERITY[anomaly.severity] || 'medium';
  var type     = _watcherType(watcherResult.watcher);
  var title    = '[' + type + '] ' + anomaly.type + ': ' + (anomaly.message || '');
  return mm.createMission({
    correlationId: watcherResult.watcher + '_' + anomaly.type + '_' + Date.now(),
    type:          type,
    source:        watcherResult.watcher || 'unknown',
    priority:      priority,
    title:         title,
    metadata:      {
      anomalyType:   anomaly.type,
      anomalySeverity: anomaly.severity,
      watcherStatus: watcherResult.status || 'unknown',
      target:        watcherResult.target || watcherResult.url || ''
    }
  });
}

function evaluateTriggers(watcherResults, options) {
  var results = Array.isArray(watcherResults) ? watcherResults : [];
  var now     = Date.now();
  var output  = { triggered: [], suppressed: [], checkedAt: new Date(now).toISOString() };

  for (var i = 0; i < results.length; i++) {
    var wr = results[i];
    if (!wr || !Array.isArray(wr.anomalies)) continue;

    for (var j = 0; j < wr.anomalies.length; j++) {
      var anomaly = wr.anomalies[j];
      var key     = _dedupKey(wr, anomaly);

      if (shouldSuppressTrigger(key, now, options)) {
        output.suppressed.push({ key: key, anomaly: anomaly, watcher: wr.watcher });
        continue;
      }

      try {
        var mission = buildMissionFromAnomaly(anomaly, wr);
        _lastTrigger[key] = now;
        output.triggered.push({ key: key, anomaly: anomaly, mission: mission });
      } catch (e) {
        // build failed (e.g. missing correlationId) — skip
        output.suppressed.push({ key: key, anomaly: anomaly, watcher: wr.watcher, reason: e.message });
      }
    }
  }
  return output;
}

module.exports = {
  evaluateTriggers:   evaluateTriggers,
  buildMissionFromAnomaly: buildMissionFromAnomaly,
  shouldSuppressTrigger: shouldSuppressTrigger,
  resetTriggerState:  resetTriggerState
};
