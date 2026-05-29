/**
 * controlled-dispatch-store.js
 * P9.6.2 Controlled Dispatch Runtime — JSON file persistence layer.
 *
 * Stores controlled dispatch sessions as JSON at:
 *   storage/controlled-dispatch/sessions.json
 *
 * Features:
 *   - Atomic writes (temp file + rename)
 *   - Mutex locking (wx flag + PID + stale lock detection)
 *   - Malformed JSON fallback
 *   - Filtered listing (status, executionMode, safetyLevel)
 */

'use strict';

var fs = require('fs');
var path = require('path');

// ============================================================================
// Configuration
// ============================================================================
var DEFAULT_STORE_DIR = path.join(__dirname, '..', '..', 'storage', 'controlled-dispatch');
var DEFAULT_STORE_PATH = path.join(DEFAULT_STORE_DIR, 'sessions.json');
var storePath = DEFAULT_STORE_PATH;

// Mutex config
var LOCK_TIMEOUT_MS = 5000;
var MAX_LOCK_RETRIES = 10;
var LOCK_RETRY_DELAY_MS = 50;

// ============================================================================
// Mutex
// ============================================================================

function _getLockPath() {
  return storePath + '.lock';
}

function acquireLock() {
  var lockPath = _getLockPath();
  var pid = String(process.pid);

  // Check for stale lock
  try {
    var staleContent = fs.readFileSync(lockPath, 'utf8');
    var stalePid = staleContent.trim();
    var lockStat = fs.statSync(lockPath);
    var lockAge = Date.now() - lockStat.mtimeMs;

    // Stale lock: older than LOCK_TIMEOUT_MS
    if (lockAge > LOCK_TIMEOUT_MS) {
      try { fs.unlinkSync(lockPath); } catch (e) { /* ignore */ }
    }
    // Same PID: our own lock (already holding it — fail)
    else if (stalePid === pid) {
      return false;
    }
  } catch (e) {
    // Lock file does not exist or cannot be read — proceed
  }

  // Try to acquire lock with retries
  for (var i = 0; i < MAX_LOCK_RETRIES; i++) {
    try {
      fs.writeFileSync(lockPath, pid, { flag: 'wx' });
      return true; // Acquired
    } catch (e) {
      if (e.code === 'EEXIST') {
        // Lock exists — check if stale
        try {
          var existingContent = fs.readFileSync(lockPath, 'utf8');
          var existingPid = existingContent.trim();
          var existingStat = fs.statSync(lockPath);
          var existingAge = Date.now() - existingStat.mtimeMs;
          if (existingAge > LOCK_TIMEOUT_MS) {
            try { fs.unlinkSync(lockPath); } catch (e2) { /* ignore */ }
            continue;
          }
        } catch (e2) {
          // Lock file removed between check and read
          continue;
        }
        // Wait and retry
        var end = Date.now() + LOCK_RETRY_DELAY_MS;
        while (Date.now() < end) { /* spin */ }
      } else {
        throw e;
      }
    }
  }

  return false; // Failed to acquire
}

function releaseLock() {
  var lockPath = _getLockPath();
  try {
    var content = fs.readFileSync(lockPath, 'utf8');
    if (content.trim() === String(process.pid)) {
      fs.unlinkSync(lockPath);
    }
  } catch (e) { /* ignore */ }
}

function withLock(fn) {
  var acquired = acquireLock();
  if (!acquired) {
    throw new Error('Failed to acquire store lock');
  }
  try {
    return fn();
  } finally {
    releaseLock();
  }
}

// ============================================================================
// Store — Core Read/Write
// ============================================================================

function _ensureStoreDir() {
  var dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function _readStore() {
  _ensureStoreDir();
  try {
    var raw = fs.readFileSync(storePath, 'utf8');
    var data = JSON.parse(raw);
    if (!data.sessions || !Array.isArray(data.sessions)) {
      return { sessions: [], meta: {} };
    }
    return data;
  } catch (e) {
    if (e.code === 'ENOENT') {
      return { sessions: [], meta: {} };
    }
    // Malformed JSON
    return { sessions: [], meta: { error: 'Malformed store, reset: ' + e.message } };
  }
}

function _writeStore(data) {
  _ensureStoreDir();
  var dir = path.dirname(storePath);
  var tempPath = path.join(dir, 'sessions.json.tmp.' + process.pid + '_' + Date.now());

  var json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tempPath, json, 'utf8');
  fs.renameSync(tempPath, storePath);
}

// ============================================================================
// Store — CRUD
// ============================================================================

/**
 * Creates a session in the store.
 * @param {Object} session
 * @returns {Object} Created session
 */
function createSession(session) {
  return withLock(function () {
    var store = _readStore();
    var existing = store.sessions.filter(function (s) {
      return s.sessionId === session.sessionId;
    });
    if (existing.length > 0) {
      throw new Error('Duplicate session ID: ' + session.sessionId);
    }
    store.sessions.push(session);
    store.meta.updatedAt = new Date().toISOString();
    store.meta.count = store.sessions.length;
    _writeStore(store);
    return session;
  });
}

/**
 * Creates multiple sessions in the store.
 * @param {Object[]} sessions
 * @returns {Object[]} Created sessions
 */
function createSessions(sessions) {
  return withLock(function () {
    var store = _readStore();

    // Check for duplicates within batch
    var seenIds = {};
    sessions.forEach(function (s) {
      if (seenIds[s.sessionId]) {
        throw new Error('Duplicate session ID in batch: ' + s.sessionId);
      }
      seenIds[s.sessionId] = true;

      // Check against existing
      var dup = store.sessions.filter(function (ex) { return ex.sessionId === s.sessionId; });
      if (dup.length > 0) {
        throw new Error('Duplicate session ID: ' + s.sessionId);
      }
    });

    store.sessions = store.sessions.concat(sessions);
    store.meta.updatedAt = new Date().toISOString();
    store.meta.count = store.sessions.length;
    _writeStore(store);
    return sessions;
  });
}

/**
 * Gets a session by ID.
 * @param {string} sessionId
 * @returns {Object|null}
 */
function getSession(sessionId) {
  var store = _readStore();
  var results = store.sessions.filter(function (s) { return s.sessionId === sessionId; });
  return results.length > 0 ? results[0] : null;
}

/**
 * Updates a session in place.
 * @param {string} sessionId
 * @param {Object} updates
 * @returns {Object|null} Updated session or null if not found
 */
function updateSession(sessionId, updates) {
  return withLock(function () {
    var store = _readStore();
    var found = false;
    for (var i = 0; i < store.sessions.length; i++) {
      if (store.sessions[i].sessionId === sessionId) {
        Object.keys(updates).forEach(function (key) {
          store.sessions[i][key] = updates[key];
        });
        store.sessions[i].updatedAt = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (!found) return null;
    store.meta.updatedAt = new Date().toISOString();
    _writeStore(store);
    return store.sessions.filter(function (s) { return s.sessionId === sessionId; })[0];
  });
}

/**
 * Deletes a session by ID.
 * @param {string} sessionId
 * @returns {boolean}
 */
function deleteSession(sessionId) {
  return withLock(function () {
    var store = _readStore();
    var before = store.sessions.length;
    store.sessions = store.sessions.filter(function (s) { return s.sessionId !== sessionId; });
    if (store.sessions.length === before) return false;
    store.meta.updatedAt = new Date().toISOString();
    store.meta.count = store.sessions.length;
    _writeStore(store);
    return true;
  });
}

/**
 * Lists sessions with optional filtering.
 * @param {Object} [filter]
 * @param {string[]} [filter.status]
 * @param {string[]} [filter.executionMode]
 * @param {string[]} [filter.safetyLevel]
 * @param {string} [filter.sessionId] — Single or comma-separated IDs
 * @param {string} [filter.ticketId]
 * @returns {Object[]}
 */
function listSessions(filter) {
  var store = _readStore();
  var results = store.sessions;

  if (filter) {
    if (filter.status && Array.isArray(filter.status) && filter.status.length > 0) {
      results = results.filter(function (s) { return filter.status.indexOf(s.status) !== -1; });
    }
    if (filter.executionMode && Array.isArray(filter.executionMode) && filter.executionMode.length > 0) {
      results = results.filter(function (s) { return filter.executionMode.indexOf(s.executionMode) !== -1; });
    }
    if (filter.safetyLevel && Array.isArray(filter.safetyLevel) && filter.safetyLevel.length > 0) {
      results = results.filter(function (s) { return filter.safetyLevel.indexOf(s.safetyLevel) !== -1; });
    }
    if (filter.sessionId) {
      var ids = Array.isArray(filter.sessionId) ? filter.sessionId : [filter.sessionId];
      results = results.filter(function (s) { return ids.indexOf(s.sessionId) !== -1; });
    }
    if (filter.ticketId) {
      results = results.filter(function (s) { return s.ticketId === filter.ticketId; });
    }
  }

  return results;
}

/**
 * Finds a session by ticket ID (dedup check).
 * @param {string} ticketId
 * @returns {Object|null}
 */
function findSessionByTicket(ticketId) {
  var store = _readStore();
  var results = store.sessions.filter(function (s) { return s.ticketId === ticketId; });
  return results.length > 0 ? results[0] : null;
}

/**
 * Clears all sessions from store (for testing).
 */
function clearAllSessions() {
  return withLock(function () {
    _writeStore({ sessions: [], meta: { clearedAt: new Date().toISOString() } });
  });
}

/**
 * Gets total session count.
 * @returns {number}
 */
function getSessionCount() {
  var store = _readStore();
  return store.sessions.length;
}

/**
 * Override store path (for testing).
 * @param {string} newPath
 */
function setStorePath(newPath) {
  storePath = newPath;
}

/**
 * Gets current store path.
 * @returns {string}
 */
function getStorePath() {
  return storePath;
}

/**
 * Resets store path to default.
 */
function resetStorePath() {
  storePath = DEFAULT_STORE_PATH;
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  // CRUD
  createSession: createSession,
  createSessions: createSessions,
  getSession: getSession,
  updateSession: updateSession,
  deleteSession: deleteSession,
  listSessions: listSessions,
  findSessionByTicket: findSessionByTicket,
  clearAllSessions: clearAllSessions,
  getSessionCount: getSessionCount,

  // Config
  setStorePath: setStorePath,
  getStorePath: getStorePath,
  resetStorePath: resetStorePath,

  // Mutex (for testing)
  acquireLock: acquireLock,
  releaseLock: releaseLock,
  withLock: withLock,
  _readStore: _readStore,
  _writeStore: _writeStore
};
