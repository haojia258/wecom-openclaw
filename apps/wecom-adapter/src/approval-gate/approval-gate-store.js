/**
 * approval-gate-store.js
 * P9.6.3 Approval Gate — JSON file persistence layer.
 *
 * Stores approval records in a JSON file with mutex-guarded atomic writes.
 *
 * Store location: storage/approval-gate/approvals.json
 *
 * Safety constraints:
 *   - No shell, no exec, no spawn, no pm2, no deploy, no nginx, no .env
 *   - Atomic writes: write to temp → rename (prevents corruption)
 *   - Mutex: prevents concurrent writes
 *   - Malformed JSON fallback
 */

'use strict';

var fs = require('fs');
var path = require('path');
var types = require('./approval-gate-types');
var validator = require('./approval-gate-validator');

// ============================================================================
// Store Configuration
// ============================================================================

var DEFAULT_STORE_PATH = path.join(__dirname, '..', '..', 'storage', 'approval-gate', 'approvals.json');
var _storePath = DEFAULT_STORE_PATH;

// ============================================================================
// Mutex
// ============================================================================

var _lockPath = null;
var _lockFd = null;

function _getLockPath() {
  if (!_lockPath) {
    _lockPath = path.join(path.dirname(_storePath), '.approvals.lock');
  }
  return _lockPath;
}

function _updateLockPath() {
  _lockPath = path.join(path.dirname(_storePath), '.approvals.lock');
}

/**
 * Acquires a write lock (wx flag: exclusive create).
 * @returns {boolean}
 */
function acquireLock() {
  var lp = _getLockPath();
  try {
    // Ensure lock directory exists
    var lockDir = path.dirname(lp);
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true });
    }
    // Try to create lock file exclusively
    _lockFd = fs.openSync(lp, 'wx');
    // Write PID
    fs.writeSync(_lockFd, String(process.pid || 0));
    return true;
  } catch (e) {
    // Lock exists — check if stale
    if (e.code === 'EEXIST') {
      try {
        var content = fs.readFileSync(lp, 'utf8');
        var stalePid = parseInt(content, 10);
        // Different PID: check if process is alive
        if (!isNaN(stalePid) && stalePid !== process.pid) {
          try {
            process.kill(stalePid, 0); // Signal 0 checks existence
            // Process still alive — lock is valid
            return false;
          } catch (killErr) {
            // Process dead — stale lock, remove and retry
            fs.unlinkSync(lp);
            _lockFd = fs.openSync(lp, 'wx');
            fs.writeSync(_lockFd, String(process.pid || 0));
            return true;
          }
        }
        // Same PID: our own lock — fail
        return false;
      } catch (readErr) {
        return false;
      }
    }
    return false;
  }
}

/**
 * Releases the write lock.
 * @returns {boolean}
 */
function releaseLock() {
  try {
    if (_lockFd !== null && _lockFd !== undefined) {
      fs.closeSync(_lockFd);
      _lockFd = null;
    }
    var lp = _getLockPath();
    if (fs.existsSync(lp)) {
      fs.unlinkSync(lp);
    }
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Executes a function with the write lock held.
 * Auto-releases lock even if fn throws.
 *
 * @param {Function} fn
 * @returns {*} Result of fn
 */
function withLock(fn) {
  var attempts = 0;
  var maxAttempts = 10;
  while (!acquireLock()) {
    attempts++;
    if (attempts >= maxAttempts) {
      throw new Error('Unable to acquire approval store lock after ' + maxAttempts + ' attempts');
    }
    // Small delay before retry
    var start = Date.now();
    while (Date.now() - start < 50) { /* spin */ }
  }
  try {
    return fn();
  } finally {
    releaseLock();
  }
}

// ============================================================================
// Store Path Management
// ============================================================================

/**
 * Sets the store file path (for testing).
 * @param {string} newPath
 */
function setStorePath(newPath) {
  _storePath = newPath;
  _updateLockPath();
}

/**
 * Gets the current store file path.
 * @returns {string}
 */
function getStorePath() {
  return _storePath;
}

/**
 * Resets store path to default.
 */
function resetStorePath() {
  _storePath = DEFAULT_STORE_PATH;
  _updateLockPath();
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Reads all approvals from the JSON file.
 * @returns {{ approvals: Object[], meta: Object }}
 */
function _readAll() {
  try {
    if (!fs.existsSync(_storePath)) {
      // Create directory if needed
      var dir = path.dirname(_storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return { approvals: [], meta: { version: '1.0', module: 'approval-gate' } };
    }
    var raw = fs.readFileSync(_storePath, 'utf8');
    if (!raw || raw.trim().length === 0) {
      return { approvals: [], meta: { version: '1.0', module: 'approval-gate' } };
    }
    var data = JSON.parse(raw);
    if (!data.approvals || !Array.isArray(data.approvals)) {
      return { approvals: [], meta: { error: 'Missing approvals array' } };
    }
    return data;
  } catch (e) {
    // Malformed JSON — return empty with error info
    return { approvals: [], meta: { version: '1.0', module: 'approval-gate', error: e.message } };
  }
}

/**
 * Writes all approvals atomically.
 * @param {Object[]} approvals
 */
function _writeAll(approvals) {
  var data = {
    approvals: approvals,
    meta: {
      version: '1.0',
      module: 'approval-gate',
      updatedAt: new Date().toISOString(),
      count: approvals.length
    }
  };

  var dir = path.dirname(_storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Atomic write: temp → rename
  var tempPath = _storePath + '.tmp.' + Date.now();
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, _storePath);
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Creates a new approval record.
 *
 * @param {Object} record — Approval record to create
 * @returns {Object} Created approval record
 */
function createApproval(record) {
  return withLock(function () {
    var data = _readAll();

    // Check for duplicate approvalId
    var existing = data.approvals.find(function (a) {
      return a.approvalId === record.approvalId;
    });
    if (existing) {
      throw new Error('Duplicate approvalId: ' + record.approvalId);
    }

    data.approvals.push(record);
    _writeAll(data.approvals);
    return record;
  });
}

/**
 * Creates multiple approval records in a single atomic operation.
 *
 * @param {Object[]} records
 * @returns {Object[]} Created records
 */
function createApprovals(records) {
  return withLock(function () {
    var data = _readAll();

    // Check for duplicate IDs within batch
    var seen = {};
    records.forEach(function (r) {
      if (seen[r.approvalId]) {
        throw new Error('Duplicate approvalId in batch: ' + r.approvalId);
      }
      seen[r.approvalId] = true;

      // Check for duplicate in existing store
      var existing = data.approvals.find(function (a) {
        return a.approvalId === r.approvalId;
      });
      if (existing) {
        throw new Error('Duplicate approvalId: ' + r.approvalId);
      }
    });

    records.forEach(function (r) {
      data.approvals.push(r);
    });
    _writeAll(data.approvals);
    return records;
  });
}

/**
 * Gets an approval record by ID.
 *
 * @param {string} approvalId
 * @returns {Object|null}
 */
function getApproval(approvalId) {
  var data = _readAll();
  return data.approvals.find(function (a) {
    return a.approvalId === approvalId;
  }) || null;
}

/**
 * Finds an approval record by session ID (returns first match).
 *
 * @param {string} sessionId
 * @returns {Object|null}
 */
function findApprovalBySessionId(sessionId) {
  var data = _readAll();
  return data.approvals.find(function (a) {
    return a.sessionId === sessionId;
  }) || null;
}

/**
 * Finds all approval records for a given session ID.
 *
 * @param {string} sessionId
 * @returns {Object[]}
 */
function findApprovalsBySessionId(sessionId) {
  var data = _readAll();
  return data.approvals.filter(function (a) {
    return a.sessionId === sessionId;
  });
}

/**
 * Updates an approval record in place.
 *
 * @param {string} approvalId
 * @param {Object} updates — Fields to update
 * @returns {Object} Updated approval record
 */
function updateApproval(approvalId, updates) {
  return withLock(function () {
    var data = _readAll();
    var idx = -1;
    data.approvals.forEach(function (a, i) {
      if (a.approvalId === approvalId) idx = i;
    });

    if (idx === -1) {
      throw new Error('Approval not found: ' + approvalId);
    }

    Object.keys(updates).forEach(function (key) {
      data.approvals[idx][key] = updates[key];
    });
    data.approvals[idx].updatedAt = new Date().toISOString();

    _writeAll(data.approvals);
    return data.approvals[idx];
  });
}

/**
 * Deletes an approval record by ID.
 *
 * @param {string} approvalId
 * @returns {boolean} true if deleted
 */
function deleteApproval(approvalId) {
  return withLock(function () {
    var data = _readAll();
    var idx = -1;
    data.approvals.forEach(function (a, i) {
      if (a.approvalId === approvalId) idx = i;
    });

    if (idx === -1) return false;

    data.approvals.splice(idx, 1);
    _writeAll(data.approvals);
    return true;
  });
}

/**
 * Lists approval records with optional filtering.
 *
 * @param {Object} [filter]
 * @param {string} [filter.status]
 * @param {string} [filter.priority]
 * @param {string} [filter.sessionId]
 * @param {string} [filter.reviewer]
 * @param {string} [filter.ticketId]
 * @returns {Object[]}
 */
function listApprovals(filter) {
  var data = _readAll();
  var approvals = data.approvals;

  if (!filter) return approvals;

  if (filter.status) {
    approvals = approvals.filter(function (a) {
      return a.status === filter.status;
    });
  }

  if (filter.priority) {
    approvals = approvals.filter(function (a) {
      return a.priority === filter.priority;
    });
  }

  if (filter.sessionId) {
    approvals = approvals.filter(function (a) {
      return a.sessionId === filter.sessionId;
    });
  }

  if (filter.reviewer) {
    approvals = approvals.filter(function (a) {
      return a.reviewer === filter.reviewer;
    });
  }

  if (filter.ticketId) {
    approvals = approvals.filter(function (a) {
      return a.ticketId === filter.ticketId;
    });
  }

  return approvals;
}

/**
 * Gets the count of approval records.
 *
 * @returns {number}
 */
function getApprovalCount() {
  var data = _readAll();
  return data.approvals.length;
}

/**
 * Clears all approval records (for testing).
 */
function clearAllApprovals() {
  return withLock(function () {
    _writeAll([]);
  });
}

/**
 * Resets the store completely (for testing).
 */
function resetStore() {
  _lockFd = null;
  _lockPath = null;
  try {
    if (fs.existsSync(_storePath)) {
      fs.unlinkSync(_storePath);
    }
    var lockP = path.join(path.dirname(_storePath), '.approvals.lock');
    if (fs.existsSync(lockP)) {
      fs.unlinkSync(lockP);
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  // Config
  setStorePath: setStorePath,
  getStorePath: getStorePath,
  resetStorePath: resetStorePath,

  // Mutex
  acquireLock: acquireLock,
  releaseLock: releaseLock,
  withLock: withLock,

  // CRUD
  createApproval: createApproval,
  createApprovals: createApprovals,
  getApproval: getApproval,
  findApprovalBySessionId: findApprovalBySessionId,
  findApprovalsBySessionId: findApprovalsBySessionId,
  updateApproval: updateApproval,
  deleteApproval: deleteApproval,
  listApprovals: listApprovals,
  getApprovalCount: getApprovalCount,
  clearAllApprovals: clearAllApprovals,
  resetStore: resetStore
};
