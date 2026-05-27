'use strict';

/**
 * Memory Watcher — Shared Memory health check (read-only)
 * Mock-first: pass status object directly. No disk/shell/.env access.
 * NEVER reads secrets, NEVER executes shell commands.
 */

var DB_MAX  = 256 * 1024 * 1024;   // 256 MB
var WAL_MAX = 64 * 1024 * 1024;    // 64 MB
var AGE_MAX = 24 * 60 * 60 * 1000; // 24 hours
var REC_MAX = 10000;
var SECRET  = /token|bearer|authorization|gateway[-_]?token|bridge[-_]?token/i;

function _mb(b) {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + 'GB';
  if (b >= 1048576)    return (b / 1048576).toFixed(1) + 'MB';
  if (b >= 1024)       return (b / 1024).toFixed(1) + 'KB';
  return b + 'B';
}

function normalizeMemoryStatus(input) {
  if (!input || typeof input !== 'object') input = {};
  var out = {}, keys = Object.keys(input), i;
  for (i = 0; i < keys.length; i++) { out[keys[i]] = input[keys[i]]; }
  out.dbExists     = out.dbExists !== false;
  out.dbSizeBytes  = typeof out.dbSizeBytes  === 'number' ? out.dbSizeBytes  : 0;
  out.walSizeBytes = typeof out.walSizeBytes === 'number' ? out.walSizeBytes : 0;
  out.jsonlFiles   = Array.isArray(out.jsonlFiles) ? out.jsonlFiles : [];
  out.lastWriteAt  = out.lastWriteAt || null;
  out.writeErrors  = typeof out.writeErrors === 'number' ? out.writeErrors : 0;
  out.recordCounts = out.recordCounts && typeof out.recordCounts === 'object' ? out.recordCounts : {};
  return out;
}

function detectMemoryAnomalies(status, options) {
  var opts      = options || {};
  var dbMax     = opts.dbSizeThresholdBytes || DB_MAX;
  var walMax    = opts.walSizeThresholdBytes || WAL_MAX;
  var maxAge    = opts.maxWriteAgeMs != null ? opts.maxWriteAgeMs : AGE_MAX;
  var recMax    = opts.recordCountThreshold != null ? opts.recordCountThreshold : REC_MAX;
  var anomalies = [];
  var now       = Date.now();

  function add(type, sev, msg) { anomalies.push({ type: type, severity: sev, message: msg }); }

  if (!status.dbExists) {
    add('MISSING_DB', 'warning', 'runtime-memory.db not found');
  }
  if (status.dbSizeBytes > dbMax) {
    add('HIGH_DB_SIZE', 'warning', 'DB size ' + _mb(status.dbSizeBytes) + ' exceeds ' + _mb(dbMax));
  }
  if (status.walSizeBytes > walMax) {
    add('HIGH_WAL_SIZE', 'warning', 'WAL size ' + _mb(status.walSizeBytes) + ' exceeds ' + _mb(walMax));
  }
  if (status.lastWriteAt) {
    var lastMs = new Date(status.lastWriteAt).getTime();
    if (!isNaN(lastMs) && (now - lastMs) > maxAge) {
      var hrs = Math.round((now - lastMs) / 3600000);
      add('STALE_WRITE', 'warning', 'Last write ' + hrs + 'h ago, exceeds ' + Math.round(maxAge / 3600000) + 'h');
    }
  }
  if (status.writeErrors > 0) {
    add('WRITE_ERRORS', 'critical', status.writeErrors + ' write error(s) in shared memory');
  }
  var files = status.jsonlFiles;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (f && typeof f === 'object') {
      var errs = f.errors || f.appendErrors || 0;
      if (errs > 0) {
        add('JSONL_ERROR', 'critical',
          'JSONL append error in ' + (f.name || f.path || 'file#' + i) + ': ' + errs + ' error(s)');
      }
    }
  }
  var counts = status.recordCounts;
  var keys = Object.keys(counts);
  for (var j = 0; j < keys.length; j++) {
    var k = keys[j], v = counts[k];
    if (typeof v === 'number' && v > recMax) {
      add('HIGH_RECORD_COUNT', 'warning', 'Record "' + k + '" has ' + v + ' entries, exceeds ' + recMax);
    }
  }
  if (SECRET.test(JSON.stringify(status))) {
    add('SUSPICIOUS_SECRET', 'critical',
      'Memory status contains potential secret text (token/bearer/authorization/gateway-token/bridge-token)');
  }
  return anomalies;
}

function summarizeMemoryHealth(result) {
  if (!result || !Array.isArray(result.anomalies)) return 'Shared Memory health unknown';
  if (result.anomalies.length === 0) return 'Shared Memory healthy';
  var c = 0, i;
  for (i = 0; i < result.anomalies.length; i++) {
    if (result.anomalies[i].severity === 'critical') c++;
  }
  return 'Shared Memory ' + result.status + ': ' + c + ' critical, ' +
    (result.anomalies.length - c) + ' warning(s)';
}

function checkMemoryHealth(input, options) {
  var status = normalizeMemoryStatus(input);
  var result = {
    ok: true, status: 'healthy', memory: status,
    anomalies: [], summary: '', checkedAt: new Date().toISOString()
  };
  result.anomalies = detectMemoryAnomalies(status, options);

  var critical = false, i;
  for (i = 0; i < result.anomalies.length; i++) {
    if (result.anomalies[i].severity === 'critical') { critical = true; break; }
  }
  result.ok     = !critical;
  result.status = critical ? 'critical' : result.anomalies.length > 0 ? 'degraded' : 'healthy';
  result.summary = summarizeMemoryHealth(result);
  return result;
}

module.exports = {
  normalizeMemoryStatus: normalizeMemoryStatus,
  checkMemoryHealth: checkMemoryHealth,
  detectMemoryAnomalies: detectMemoryAnomalies,
  summarizeMemoryHealth: summarizeMemoryHealth
};
