/**
 * execution-store.js
 * P9.7.1 Execution Session Runtime — JSON file persistence with mutex.
 *
 * Provides CRUD operations for execution sessions, checkpoints, and audit events.
 * Atomic writes (tmp → rename), mutex locking (wx lock file),
 * malformed JSON fallback, and auto directory creation.
 *
 * Storage files:
 *   storage/execution-runtime/sessions.json
 *   storage/execution-runtime/checkpoints.json
 *   storage/execution-runtime/audit.json
 */

'use strict';

var path = require('path');
var fs   = require('fs');

// ============================================================================
// Storage Paths
// ============================================================================
var DEFAULT_BASE_PATH = path.join(
  __dirname, '..', '..', 'storage', 'execution-runtime'
);

var _sessionsPath   = path.join(DEFAULT_BASE_PATH, 'sessions.json');
var _checkpointsPath = path.join(DEFAULT_BASE_PATH, 'checkpoints.json');
var _auditPath        = path.join(DEFAULT_BASE_PATH, 'audit.json');

// ============================================================================
// Mutex  (same pattern as dispatch-ticket-store)
// ============================================================================
var LOCK_TIMEOUT_MS   = 5000;
var MAX_LOCK_ATTEMPTS = 10;
var LOCK_RETRY_DELAY_MS = 50;

function _ensureDir(filePath) {
  var dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function _lockPath(filePath) {
  return filePath + '.lock';
}

function acquireLock(filePath) {
  var lockPath = _lockPath(filePath);
  var pid = String(process.pid);
  _ensureDir(lockPath);

  try {
    fs.writeFileSync(lockPath, pid, { flag: 'wx' });
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      try {
        var stats = fs.statSync(lockPath);
        if (Date.now() - stats.mtimeMs > LOCK_TIMEOUT_MS) {
          fs.unlinkSync(lockPath);
          fs.writeFileSync(lockPath, pid, { flag: 'wx' });
          return true;
        }
      } catch (staleErr) { /* race */ }
      return false;
    }
    throw err;
  }
}

function releaseLock(filePath) {
  var lockPath = _lockPath(filePath);
  try { fs.unlinkSync(lockPath); } catch (e) { /* ignore */ }
}

function withLock(filePath, fn) {
  var attempts = 0;
  while (!acquireLock(filePath)) {
    attempts++;
    if (attempts >= MAX_LOCK_ATTEMPTS) {
      throw new Error('Could not acquire lock for ' + filePath);
    }
    var start = Date.now();
    while (Date.now() - start < LOCK_RETRY_DELAY_MS) { /* spin */ }
  }
  try {
    return fn();
  } finally {
    releaseLock(filePath);
  }
}

// ============================================================================
// Default Meta
// ============================================================================
var DEFAULT_META = { version: '1.0.0', total: 0, lastUpdated: null };

function _readFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    var raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || raw.trim().length === 0) {
      return null;
    }
    return JSON.parse(raw);
  } catch (err) {
    return null;  // malformed JSON → return null (caller falls back)
  }
}

function _writeFile(filePath, data) {
  _ensureDir(filePath);
  var tempPath = filePath + '.tmp';

  data.meta = data.meta || Object.assign({}, DEFAULT_META);
  data.meta.total = (data.items || []).length;
  data.meta.lastUpdated = new Date().toISOString();

  var json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tempPath, json, 'utf8');
  fs.renameSync(tempPath, filePath);  // atomic
}

// ============================================================================
// Generic helpers
// ============================================================================
function _findById(items, idField, id) {
  for (var j = 0; j < items.length; j++) {
    if (items[j][idField] === id) return items[j];
  }
  return null;
}

function _findAllBy(items, field, value) {
  var results = [];
  for (var j = 0; j < items.length; j++) {
    if (items[j][field] === value) results.push(items[j]);
  }
  return results;
}

// ============================================================================
// Sessions
// ============================================================================
function readSessions() {
  var data = _readFile(_sessionsPath);
  if (!data) return { items: [], meta: Object.assign({}, DEFAULT_META) };
  return { items: Array.isArray(data.items) ? data.items : [], meta: data.meta || Object.assign({}, DEFAULT_META) };
}

function createSessionRecord(session) {
  return withLock(_sessionsPath, function () {
    var data = readSessions();
    if (_findById(data.items, 'executionSessionId', session.executionSessionId)) {
      throw new Error('Duplicate executionSessionId: ' + session.executionSessionId);
    }
    data.items.push(JSON.parse(JSON.stringify(session)));
    _writeFile(_sessionsPath, data);
    return session;
  });
}

function updateSessionRecord(sessionId, updates) {
  return withLock(_sessionsPath, function () {
    var data = readSessions();
    for (var i = 0; i < data.items.length; i++) {
      if (data.items[i].executionSessionId === sessionId) {
        data.items[i] = Object.assign({}, data.items[i], JSON.parse(JSON.stringify(updates)), {
          updatedAt: new Date().toISOString()
        });
        _writeFile(_sessionsPath, data);
        return data.items[i];
      }
    }
    return null;
  });
}

function getSessionRecord(sessionId) {
  var data = readSessions();
  return _findById(data.items, 'executionSessionId', sessionId);
}

function listSessionRecords(filter) {
  filter = filter || {};
  var data = readSessions();
  var items = data.items.slice();
  if (filter.status) {
    var statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    items = items.filter(function (s) { return statuses.indexOf(s.status) !== -1; });
  }
  if (filter.mode) {
    var modes = Array.isArray(filter.mode) ? filter.mode : [filter.mode];
    items = items.filter(function (s) { return modes.indexOf(s.mode) !== -1; });
  }
  if (filter.sessionId) {
    var ids = Array.isArray(filter.sessionId) ? filter.sessionId : [filter.sessionId];
    items = items.filter(function (s) { return ids.indexOf(s.executionSessionId) !== -1; });
  }
  return items;
}

function deleteSessionRecord(sessionId) {
  return withLock(_sessionsPath, function () {
    var data = readSessions();
    var len = data.items.length;
    data.items = data.items.filter(function (s) {
      return s.executionSessionId !== sessionId;
    });
    if (data.items.length === len) return false;
    _writeFile(_sessionsPath, data);
    return true;
  });
}

function clearSessionRecords() {
  return withLock(_sessionsPath, function () {
    _writeFile(_sessionsPath, { items: [], meta: Object.assign({}, DEFAULT_META) });
    return true;
  });
}

// ============================================================================
// Checkpoints
// ============================================================================
function readCheckpoints() {
  var data = _readFile(_checkpointsPath);
  if (!data) return { items: [], meta: Object.assign({}, DEFAULT_META) };
  return { items: Array.isArray(data.items) ? data.items : [], meta: data.meta || Object.assign({}, DEFAULT_META) };
}

function createCheckpointRecord(cp) {
  return withLock(_checkpointsPath, function () {
    var data = readCheckpoints();
    if (_findById(data.items, 'checkpointId', cp.checkpointId)) {
      throw new Error('Duplicate checkpointId: ' + cp.checkpointId);
    }
    data.items.push(JSON.parse(JSON.stringify(cp)));
    _writeFile(_checkpointsPath, data);
    return cp;
  });
}

function getCheckpointRecord(checkpointId) {
  var data = readCheckpoints();
  return _findById(data.items, 'checkpointId', checkpointId);
}

function listCheckpointRecords(filter) {
  filter = filter || {};
  var data = readCheckpoints();
  var items = data.items.slice();
  if (filter.sessionId) {
    var ids = Array.isArray(filter.sessionId) ? filter.sessionId : [filter.sessionId];
    items = items.filter(function (c) { return ids.indexOf(c.sessionId) !== -1; });
  }
  if (filter.step) {
    items = items.filter(function (c) { return c.step === filter.step; });
  }
  return items;
}

function deleteCheckpointRecord(checkpointId) {
  return withLock(_checkpointsPath, function () {
    var data = readCheckpoints();
    var len = data.items.length;
    data.items = data.items.filter(function (c) {
      return c.checkpointId !== checkpointId;
    });
    if (data.items.length === len) return false;
    _writeFile(_checkpointsPath, data);
    return true;
  });
}

function clearCheckpointRecords() {
  return withLock(_checkpointsPath, function () {
    _writeFile(_checkpointsPath, { items: [], meta: Object.assign({}, DEFAULT_META) });
    return true;
  });
}

// ============================================================================
// Audit Events
// ============================================================================
function readAuditEvents() {
  var data = _readFile(_auditPath);
  if (!data) return { items: [], meta: Object.assign({}, DEFAULT_META) };
  return { items: Array.isArray(data.items) ? data.items : [], meta: data.meta || Object.assign({}, DEFAULT_META) };
}

function createAuditEventRecord(evt) {
  return withLock(_auditPath, function () {
    var data = readAuditEvents();
    if (_findById(data.items, 'eventId', evt.eventId)) {
      throw new Error('Duplicate eventId: ' + evt.eventId);
    }
    data.items.push(JSON.parse(JSON.stringify(evt)));
    _writeFile(_auditPath, data);
    return evt;
  });
}

function getAuditEventRecord(eventId) {
  var data = readAuditEvents();
  return _findById(data.items, 'eventId', eventId);
}

function listAuditEventRecords(filter) {
  filter = filter || {};
  var data = readAuditEvents();
  var items = data.items.slice();
  if (filter.sessionId) {
    var ids = Array.isArray(filter.sessionId) ? filter.sessionId : [filter.sessionId];
    items = items.filter(function (e) { return ids.indexOf(e.sessionId) !== -1; });
  }
  if (filter.event) {
    var events = Array.isArray(filter.event) ? filter.event : [filter.event];
    items = items.filter(function (e) { return events.indexOf(e.event) !== -1; });
  }
  if (filter.actor) {
    var actors = Array.isArray(filter.actor) ? filter.actor : [filter.actor];
    items = items.filter(function (e) { return actors.indexOf(e.actor) !== -1; });
  }
  return items;
}

function deleteAuditEventRecord(eventId) {
  return withLock(_auditPath, function () {
    var data = readAuditEvents();
    var len = data.items.length;
    data.items = data.items.filter(function (e) {
      return e.eventId !== eventId;
    });
    if (data.items.length === len) return false;
    _writeFile(_auditPath, data);
    return true;
  });
}

function clearAuditEventRecords() {
  return withLock(_auditPath, function () {
    _writeFile(_auditPath, { items: [], meta: Object.assign({}, DEFAULT_META) });
    return true;
  });
}

// ============================================================================
// Path management (for testing)
// ============================================================================
function setSessionsPath(p)   { _sessionsPath   = p; }
function setCheckpointsPath(p) { _checkpointsPath = p; }
function setAuditPath(p)       { _auditPath        = p; }

function getSessionsPath()   { return _sessionsPath; }
function getCheckpointsPath() { return _checkpointsPath; }
function getAuditPath()       { return _auditPath; }

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  // Sessions
  createSessionRecord:    createSessionRecord,
  updateSessionRecord:    updateSessionRecord,
  getSessionRecord:       getSessionRecord,
  listSessionRecords:     listSessionRecords,
  deleteSessionRecord:    deleteSessionRecord,
  clearSessionRecords:    clearSessionRecords,
  readSessions:          readSessions,

  // Checkpoints
  createCheckpointRecord: createCheckpointRecord,
  getCheckpointRecord:    getCheckpointRecord,
  listCheckpointRecords:  listCheckpointRecords,
  deleteCheckpointRecord: deleteCheckpointRecord,
  clearCheckpointRecords: clearCheckpointRecords,
  readCheckpoints:        readCheckpoints,

  // Audit events
  createAuditEventRecord: createAuditEventRecord,
  getAuditEventRecord:    getAuditEventRecord,
  listAuditEventRecords:  listAuditEventRecords,
  deleteAuditEventRecord: deleteAuditEventRecord,
  clearAuditEventRecords: clearAuditEventRecords,
  readAuditEvents:        readAuditEvents,

  // Path management
  setSessionsPath:       setSessionsPath,
  setCheckpointsPath:    setCheckpointsPath,
  setAuditPath:          setAuditPath,
  getSessionsPath:       getSessionsPath,
  getCheckpointsPath:    getCheckpointsPath,
  getAuditPath:          getAuditPath,

  // Mutex (for testing)
  withLock:    withLock,
  acquireLock: acquireLock,
  releaseLock: releaseLock
};
