/**
 * execution-sandbox-store.js
 * P9.7.2 Execution Sandbox — Persistent storage.
 *
 * In-memory + JSON file storage with mutex-based concurrent write protection.
 * Tolerates empty/corrupted JSON files.
 *
 * Safety constraints:
 *   - No real task execution, no shell/exec/spawn
 *   - Dry-run only
 */

'use strict';

var fs   = require('fs');
var path = require('path');

// ============================================================================
// Store config
// ============================================================================

var STORE_DIR  = path.join(__dirname, '..', '..', 'storage', 'execution-sandbox');
var SESSIONS_FILE     = path.join(STORE_DIR, 'sessions.json');
var CHECKPOINTS_FILE  = path.join(STORE_DIR, 'checkpoints.json');
var AUDIT_FILE        = path.join(STORE_DIR, 'audit.jsonl');

// ============================================================================
// In-memory cache
// ============================================================================

var _sessions    = {};
var _checkpoints = {};
var _auditLog    = [];

// ============================================================================
// Mutex
// ============================================================================

var _mutex = { locked: false, owner: null, lockedAt: null };

function _acquireLock(owner) {
  var now = Date.now();
  // Auto-release stale locks (30s timeout)
  if (_mutex.locked && _mutex.lockedAt && (now - _mutex.lockedAt > 30000)) {
    _mutex.locked = false;
    _mutex.owner = null;
    _mutex.lockedAt = null;
  }
  if (_mutex.locked) return false;
  _mutex.locked   = true;
  _mutex.owner    = owner;
  _mutex.lockedAt = now;
  return true;
}

function _releaseLock(owner) {
  if (_mutex.owner === owner) {
    _mutex.locked   = false;
    _mutex.owner    = null;
    _mutex.lockedAt = null;
    return true;
  }
  return false;
}

// ============================================================================
// File I/O helpers
// ============================================================================

function _ensureDir() {
  try { if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) { /* best effort */ }
}

function _readJson(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    var raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || raw.trim() === '') return defaultValue;
    return JSON.parse(raw);
  } catch (e) {
    return defaultValue;
  }
}

function _writeJson(filePath, data) {
  var lockOwner = 'write_' + Date.now();
  if (!_acquireLock(lockOwner)) {
    throw new Error('STORE_WRITE_FAILED: Could not acquire lock');
  }
  try {
    _ensureDir();
    var tmp = filePath + '.tmp.' + Date.now();
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  } finally {
    _releaseLock(lockOwner);
  }
}

// ============================================================================
// Session CRUD
// ============================================================================

function createSession(session) {
  if (!session || !session.sessionId) return null;
  if (_sessions[session.sessionId]) return null;
  _sessions[session.sessionId] = session;
  _persistSessions();
  return session;
}

function getSession(sessionId) {
  return _sessions[sessionId] || null;
}

function updateSession(sessionId, updates) {
  var s = _sessions[sessionId];
  if (!s) return null;

  if (updates.status) s.status = updates.status;
  if (updates.updatedAt) s.updatedAt = updates.updatedAt;
  if (updates.checkpointIds) s.checkpointIds = updates.checkpointIds;
  if (updates.auditTrail) s.auditTrail = updates.auditTrail;
  if (updates.assignedAgent) s.assignedAgent = updates.assignedAgent;

  s.updatedAt = updates.updatedAt || new Date().toISOString();
  _persistSessions();
  return s;
}

function deleteSession(sessionId) {
  if (!_sessions[sessionId]) return false;
  delete _sessions[sessionId];
  _persistSessions();
  return true;
}

function listSessions(filter) {
  filter = filter || {};
  var ids = Object.keys(_sessions);
  var results = [];
  for (var i = 0; i < ids.length; i++) {
    var s = _sessions[ids[i]];
    var include = true;
    if (filter.status && s.status !== filter.status) include = false;
    if (filter.planId && s.planId !== filter.planId) include = false;
    if (filter.agentName && s.assignedAgent && s.assignedAgent.name !== filter.agentName) include = false;
    if (include) results.push(s);
  }
  return results;
}

function _persistSessions() {
  try { _writeJson(SESSIONS_FILE, _sessions); } catch (e) { /* best effort */ }
}

// ============================================================================
// Checkpoint CRUD
// ============================================================================

function createCheckpointRecord(cp) {
  if (!cp || !cp.checkpointId) return null;
  _checkpoints[cp.checkpointId] = cp;
  _persistCheckpoints();
  return cp;
}

function getCheckpoint(checkpointId) {
  return _checkpoints[checkpointId] || null;
}

function listCheckpoints(sessionId) {
  var ids = Object.keys(_checkpoints);
  var results = [];
  for (var i = 0; i < ids.length; i++) {
    var cp = _checkpoints[ids[i]];
    if (!sessionId || cp.sessionId === sessionId) results.push(cp);
  }
  return results;
}

function _persistCheckpoints() {
  try { _writeJson(CHECKPOINTS_FILE, _checkpoints); } catch (e) { /* best effort */ }
}

// ============================================================================
// Audit
// ============================================================================

function recordAudit(event) {
  _auditLog.push(event);
  _persistAudit();
  return event;
}

function listAudit(sessionId) {
  if (!sessionId) return _auditLog.slice();
  return _auditLog.filter(function (e) { return e.sessionId === sessionId; });
}

function _persistAudit() {
  try {
    _ensureDir();
    var lines = _auditLog.map(function (e) { return JSON.stringify(e); }).join('\n') + '\n';
    var lockOwner = 'audit_' + Date.now();
    if (_acquireLock(lockOwner)) {
      try { fs.writeFileSync(AUDIT_FILE, lines, 'utf8'); } catch (e) { /* best effort */ }
      _releaseLock(lockOwner);
    }
  } catch (e) { /* best effort */ }
}

// ============================================================================
// Store init & reset
// ============================================================================

function loadFromDisk() {
  try {
    _sessions    = _readJson(SESSIONS_FILE, {});
    _checkpoints = _readJson(CHECKPOINTS_FILE, {});
    try {
      if (fs.existsSync(AUDIT_FILE)) {
        var raw = fs.readFileSync(AUDIT_FILE, 'utf8');
        _auditLog = raw.split('\n').filter(function (l) { return l.trim(); }).map(function (l) {
          try { return JSON.parse(l); } catch (e) { return null; }
        }).filter(function (e) { return e !== null; });
      }
    } catch (e) { _auditLog = []; }
  } catch (e) {
    _sessions = {}; _checkpoints = {}; _auditLog = [];
  }
}

function clearAll() {
  _sessions = {}; _checkpoints = {}; _auditLog = [];
  try {
    if (fs.existsSync(SESSIONS_FILE)) fs.unlinkSync(SESSIONS_FILE);
    if (fs.existsSync(CHECKPOINTS_FILE)) fs.unlinkSync(CHECKPOINTS_FILE);
    if (fs.existsSync(AUDIT_FILE)) fs.unlinkSync(AUDIT_FILE);
  } catch (e) { /* best effort */ }
}

// Initialize on load
loadFromDisk();

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  createSession:     createSession,
  getSession:        getSession,
  updateSession:     updateSession,
  deleteSession:     deleteSession,
  listSessions:      listSessions,

  createCheckpointRecord: createCheckpointRecord,
  getCheckpoint:          getCheckpoint,
  listCheckpoints:        listCheckpoints,

  recordAudit: recordAudit,
  listAudit:   listAudit,

  clearAll:   clearAll,
  loadFromDisk: loadFromDisk
};
