'use strict';

/**
 * Bridge Watcher — Bridge health check (read-only)
 * Mock-first: pass status object directly. No disk/shell/.env access.
 * NEVER reads secrets, NEVER executes shell commands.
 */

var SIZE_MAX  = 256 * 1024 * 1024;   // 256 MB
var AGE_MAX   = 24 * 60 * 60 * 1000; // 24 hours
var REJ_MAX   = 20;
var DUR_MAX   = 1000;                // ms
var SECRET    = /token|bearer|authorization|gateway[-_]?token|bridge[-_]?token/i;

function _mb(b) {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + 'GB';
  if (b >= 1048576)    return (b / 1048576).toFixed(1) + 'MB';
  if (b >= 1024)       return (b / 1024).toFixed(1) + 'KB';
  return b + 'B';
}

function normalizeBridgeStatus(input) {
  if (!input || typeof input !== 'object') input = {};
  var out = {}, keys = Object.keys(input), i;
  for (i = 0; i < keys.length; i++) { out[keys[i]] = input[keys[i]]; }
  out.jsonlExists   = out.jsonlExists !== false;
  out.jsonlSizeBytes = typeof out.jsonlSizeBytes === 'number' ? out.jsonlSizeBytes : 0;
  out.lastWriteAt   = out.lastWriteAt || null;
  out.recentEvents  = Array.isArray(out.recentEvents) ? out.recentEvents : [];
  out.errorCount    = typeof out.errorCount === 'number' ? out.errorCount : 0;
  out.rejectedCount = typeof out.rejectedCount === 'number' ? out.rejectedCount : 0;
  out.allowedCount  = typeof out.allowedCount === 'number' ? out.allowedCount : 0;
  out.avgDurationMs = typeof out.avgDurationMs === 'number' ? out.avgDurationMs : 0;
  return out;
}

function detectBridgeAnomalies(status, options) {
  var opts      = options || {};
  var sizeMax   = opts.sizeThresholdBytes || SIZE_MAX;
  var maxAge    = opts.maxWriteAgeMs != null ? opts.maxWriteAgeMs : AGE_MAX;
  var rejMax    = opts.rejectedThreshold != null ? opts.rejectedThreshold : REJ_MAX;
  var durMax    = opts.durationThresholdMs != null ? opts.durationThresholdMs : DUR_MAX;
  var anomalies = [];
  var now       = Date.now();

  function add(type, sev, msg) { anomalies.push({ type: type, severity: sev, message: msg }); }

  if (!status.jsonlExists) {
    add('MISSING_JSONL', 'warning', 'Bridge JSONL not found');
  }
  if (status.jsonlSizeBytes > sizeMax) {
    add('HIGH_JSONL_SIZE', 'warning',
      'Bridge JSONL size ' + _mb(status.jsonlSizeBytes) + ' exceeds ' + _mb(sizeMax));
  }
  if (status.lastWriteAt) {
    var last = new Date(status.lastWriteAt).getTime();
    if (!isNaN(last) && (now - last) > maxAge) {
      var hrs = Math.round((now - last) / 3600000);
      add('STALE_WRITE', 'warning', 'Last bridge write ' + hrs + 'h ago, exceeds ' + Math.round(maxAge / 3600000) + 'h');
    }
  }
  if (status.errorCount > 0) {
    add('ERROR_COUNT', 'warning', status.errorCount + ' bridge error(s) detected');
  }
  if (status.rejectedCount > rejMax) {
    add('HIGH_REJECTED', 'warning', 'Rejected ' + status.rejectedCount + ' events, exceeds ' + rejMax);
  }
  if (status.allowedCount === 0) {
    add('ZERO_ALLOWED', 'warning', 'No allowed events — bridge may be blocking everything');
  }
  if (status.avgDurationMs > durMax) {
    add('HIGH_DURATION', 'warning',
      'Avg duration ' + status.avgDurationMs + 'ms exceeds ' + durMax + 'ms');
  }
  // secret scan on recentEvents
  var events = status.recentEvents;
  for (var i = 0; i < events.length; i++) {
    var evt = events[i];
    var str = typeof evt === 'string' ? evt : (evt && typeof evt === 'object' ? JSON.stringify(evt) : '');
    if (str && SECRET.test(str)) {
      add('SECRET_LEAK', 'critical',
        'Bridge recentEvents contains potential secret pattern (token/bearer/authorization)');
      break;
    }
  }
  return anomalies;
}

function summarizeBridgeHealth(result) {
  if (!result || !Array.isArray(result.anomalies)) return 'Bridge health unknown';
  if (result.anomalies.length === 0) return 'Bridge healthy';
  var c = 0, i;
  for (i = 0; i < result.anomalies.length; i++) {
    if (result.anomalies[i].severity === 'critical') c++;
  }
  return 'Bridge ' + result.status + ': ' + c + ' critical, ' +
    (result.anomalies.length - c) + ' warning(s)';
}

function checkBridgeHealth(input, options) {
  var status = normalizeBridgeStatus(input);
  var result = {
    ok: true, status: 'healthy', bridge: status,
    anomalies: [], summary: '', checkedAt: new Date().toISOString()
  };
  result.anomalies = detectBridgeAnomalies(status, options);

  var critical = false, i;
  for (i = 0; i < result.anomalies.length; i++) {
    if (result.anomalies[i].severity === 'critical') { critical = true; break; }
  }
  result.ok     = !critical;
  result.status = critical ? 'critical' : result.anomalies.length > 0 ? 'degraded' : 'healthy';
  result.summary = summarizeBridgeHealth(result);
  return result;
}

module.exports = {
  normalizeBridgeStatus: normalizeBridgeStatus,
  checkBridgeHealth: checkBridgeHealth,
  detectBridgeAnomalies: detectBridgeAnomalies,
  summarizeBridgeHealth: summarizeBridgeHealth
};
