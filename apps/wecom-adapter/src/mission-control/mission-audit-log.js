'use strict';

/**
 * Mission Audit Log — Append-only JSONL audit trail
 *
 * Records every Observe→Detect→Trigger→Mission event:
 *   - Watcher run results
 *   - Anomaly detections
 *   - Triggered missions
 *   - Cooldown-suppressed triggers
 *   - Dedup-suppressed triggers
 *
 * Safety:
 *   - correlationId mandatory on every entry
 *   - Token masking via regex patterns
 *   - Max file size protection (auto-rotate)
 *   - Append-only, never overwrites
 *
 * NO shell/pm2/gateway/.env access.
 */

var fs   = require('fs');
var path = require('path');

// ─── Constants ─────────────────────────────────────────────

var DEFAULT_LOG_DIR  = '.';
var DEFAULT_LOG_NAME = 'mission-audit.jsonl';
var MAX_FILE_SIZE    = 100 * 1024 * 1024; // 100 MB
var MAX_ROTATIONS    = 5;

// ─── Token masking patterns ────────────────────────────────

var SECRET_PATTERNS = [
  { pattern: /sk-[a-zA-Z0-9]{20,}/g,     replace: 'sk-***REDACTED***' },
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, replace: 'Bearer ***REDACTED***' },
  { pattern: /eyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_.+\/=]*/g, replace: '***JWT_REDACTED***' },
  { pattern: /ghp_[A-Za-z0-9]{36,}/g,    replace: 'ghp_***REDACTED***' },
  { pattern: /github_pat_[A-Za-z0-9_]{22,}/g, replace: 'github_pat_***REDACTED***' },
  { pattern: /AKIA[0-9A-Z]{16}/g,        replace: 'AKIA***REDACTED***' },
  { pattern: /"api[Kk]ey"\s*:\s*"[^"]+"/g, replace: '"apiKey":"***REDACTED***"' },
  { pattern: /"secret"\s*:\s*"[^"]+"/g,  replace: '"secret":"***REDACTED***"' },
  { pattern: /"token"\s*:\s*"[^"]+"/g,   replace: '"token":"***REDACTED***"' },
  { pattern: /"password"\s*:\s*"[^"]+"/g, replace: '"password":"***REDACTED***"' },
  { pattern: /"authorization"\s*:\s*"[^"]+"/g, replace: '"authorization":"***REDACTED***"' },
  { pattern: /"gateway[_-]?token"\s*:\s*"[^"]+"/gi, replace: '"gateway_token":"***REDACTED***"' },
  { pattern: /"bridge[_-]?token"\s*:\s*"[^"]+"/gi,  replace: '"bridge_token":"***REDACTED***"' }
];

// ─── Sensitive keyword block ───────────────────────────────

var BLOCKED_KEYWORDS = ['password', 'secret', 'token', 'authorization', 'api_key', 'apikey'];

// ─── Internal state ────────────────────────────────────────

var _logDir      = DEFAULT_LOG_DIR;
var _logPath     = null;
var _initialized = false;

// ─── Helpers ───────────────────────────────────────────────

function _ts() { return new Date().toISOString(); }

function _maskSecrets(str) {
  if (typeof str !== 'string') return str;
  var result = str;
  for (var i = 0; i < SECRET_PATTERNS.length; i++) {
    result = result.replace(SECRET_PATTERNS[i].pattern, SECRET_PATTERNS[i].replace);
  }
  return result;
}

function _blockedInKeys(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      if (_blockedInKeys(obj[i])) return true;
    }
    return false;
  }
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i].toLowerCase();
    for (var j = 0; j < BLOCKED_KEYWORDS.length; j++) {
      if (k.indexOf(BLOCKED_KEYWORDS[j]) !== -1) return true;
    }
    if (typeof obj[keys[i]] === 'object' && obj[keys[i]] !== null) {
      if (_blockedInKeys(obj[keys[i]])) return true;
    }
  }
  return false;
}

function _maskString(str) {
  if (typeof str !== 'string') return str;
  var result = str;
  for (var i = 0; i < SECRET_PATTERNS.length; i++) {
    result = result.replace(SECRET_PATTERNS[i].pattern, SECRET_PATTERNS[i].replace);
  }
  return result;
}

function _sanitizeEntry(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'string') obj[i] = _maskString(obj[i]);
      else _sanitizeEntry(obj[i]);
    }
    return;
  }
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    if (typeof obj[keys[i]] === 'string') obj[keys[i]] = _maskString(obj[keys[i]]);
    else if (typeof obj[keys[i]] === 'object' && obj[keys[i]] !== null) _sanitizeEntry(obj[keys[i]]);
  }
}

function _serialize(entry) {
  try {
    var json = JSON.stringify(entry);
    return _maskSecrets(json) + '\n';
  } catch (_) {
    return '';
  }
}

function _getLogPath() {
  if (_logPath) return _logPath;
  return path.join(_logDir, DEFAULT_LOG_NAME);
}

function _checkRotation() {
  var p = _getLogPath();
  try {
    var stat = fs.statSync(p);
    if (stat.size >= MAX_FILE_SIZE) _rotate();
  } catch (_) { /* file doesn't exist yet, ok */ }
}

function _rotate() {
  var base = _getLogPath();
  for (var i = MAX_ROTATIONS - 1; i >= 0; i--) {
    var src = i === 0 ? base : base + '.' + i;
    var dst = base + '.' + (i + 1);
    try { fs.renameSync(src, dst); } catch (_) { /* ok */ }
  }
  // Don't remove the oldest rotation (MAX_ROTATIONS) — caller will create fresh
  try { fs.unlinkSync(base + '.' + (MAX_ROTATIONS + 1)); } catch (_) { /* ok */ }
}

// ─── Public API ────────────────────────────────────────────

function init(options) {
  var opts = options || {};
  _logDir = opts.logDir || DEFAULT_LOG_DIR;
  _logPath = opts.logPath || null;
  if (_logPath) {
    _logDir = path.dirname(_logPath);
  }
  _initialized = true;
  return { logDir: _logDir, logPath: _getLogPath() };
}

function logTrigger(entry) {
  if (!_initialized) throw new Error('Audit log not initialized. Call init() first.');
  if (!entry || !entry.correlationId) {
    throw new Error('correlationId is mandatory for audit log entries');
  }

  var record = {
    correlationId: entry.correlationId,
    timestamp:     entry.timestamp || _ts(),
    type:          entry.type || 'UNKNOWN',
    watcher:       entry.watcher || 'unknown',
    anomaly:       entry.anomaly || null,
    mission:       entry.mission || null,
    reason:        entry.reason || null,
    metadata:      entry.metadata || {}
  };

  // Block entries with sensitive keys (recursive check)
  if (_blockedInKeys(record)) {
    throw new Error('Audit log entry contains blocked sensitive key(s)');
  }

  // Sanitize: mask secrets in string values recursively
  _sanitizeEntry(record);

  _checkRotation();

  var line = _serialize(record);
  if (!line) return false;

  try {
    fs.appendFileSync(_getLogPath(), line, 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

function logSuppress(entry) {
  if (!_initialized) throw new Error('Audit log not initialized. Call init() first.');
  if (!entry || !entry.correlationId) {
    throw new Error('correlationId is mandatory for audit log entries');
  }

  var record = {
    correlationId: entry.correlationId,
    timestamp:     entry.timestamp || _ts(),
    type:          entry.type || 'SUPPRESS',
    watcher:       entry.watcher || 'unknown',
    anomaly:       entry.anomaly || null,
    mission:       null,
    reason:        entry.reason || 'unknown',
    metadata:      entry.metadata || {}
  };

  if (_blockedInKeys(record)) {
    throw new Error('Audit log entry contains blocked sensitive key(s)');
  }

  // Sanitize: mask secrets in string values recursively
  _sanitizeEntry(record);

  _checkRotation();

  var line = _serialize(record);
  if (!line) return false;

  try {
    fs.appendFileSync(_getLogPath(), line, 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

function logCycle(entry) {
  if (!_initialized) throw new Error('Audit log not initialized. Call init() first.');
  if (!entry || !entry.correlationId) {
    throw new Error('correlationId is mandatory for audit log entries');
  }

  var record = {
    correlationId: entry.correlationId,
    timestamp:     entry.timestamp || _ts(),
    type:          'MONITOR_CYCLE',
    watcher:       'system',
    anomaly:       null,
    mission:       null,
    reason:        null,
    metadata:      {
      cycleIndex:    entry.cycleIndex,
      totalChecks:   entry.totalChecks,
      totalTriggers: entry.totalTriggers,
      totalSuppressed: entry.totalSuppressed,
      activeMissions:  entry.activeMissions,
      watcherResults:  entry.watcherResults
    }
  };

  if (_blockedInKeys(record)) {
    throw new Error('Audit log entry contains blocked sensitive key(s)');
  }

  // Sanitize: mask secrets in string values recursively
  _sanitizeEntry(record);

  _checkRotation();

  var line = _serialize(record);
  if (!line) return false;

  try {
    fs.appendFileSync(_getLogPath(), line, 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

function logSafeMode(entry) {
  if (!_initialized) throw new Error('Audit log not initialized. Call init() first.');
  if (!entry || !entry.correlationId) {
    throw new Error('correlationId is mandatory for audit log entries');
  }

  var record = {
    correlationId: entry.correlationId,
    timestamp:     entry.timestamp || _ts(),
    type:          'SAFE_MODE',
    watcher:       'safety-guard',
    anomaly:       null,
    mission:       null,
    reason:        entry.reason || 'threshold exceeded',
    metadata:      entry.metadata || {}
  };

  if (_blockedInKeys(record)) {
    throw new Error('Audit log entry contains blocked sensitive key(s)');
  }

  // Sanitize: mask secrets in string values recursively
  _sanitizeEntry(record);

  _checkRotation();

  var line = _serialize(record);
  if (!line) return false;

  try {
    fs.appendFileSync(_getLogPath(), line, 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

function getLogPath() {
  return _getLogPath();
}

function getLogStats() {
  var p = _getLogPath();
  try {
    var stat = fs.statSync(p);
    return { path: p, sizeBytes: stat.size, exists: true };
  } catch (_) {
    return { path: p, sizeBytes: 0, exists: false };
  }
}

function _reset() {
  _logDir      = DEFAULT_LOG_DIR;
  _logPath     = null;
  _initialized = false;
}

module.exports = {
  init:          init,
  logTrigger:    logTrigger,
  logSuppress:   logSuppress,
  logCycle:      logCycle,
  logSafeMode:   logSafeMode,
  getLogPath:    getLogPath,
  getLogStats:   getLogStats,
  _reset:        _reset
};
