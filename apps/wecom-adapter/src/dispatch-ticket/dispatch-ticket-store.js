/**
 * dispatch-ticket-store.js
 * P9.6.1 Dispatch Ticket System — JSON file persistence with mutex.
 *
 * Provides CRUD operations for dispatch tickets stored in a JSON file.
 * Atomic writes (tmp → rename), mutex locking (wx lock file),
 * malformed JSON fallback, and auto directory creation.
 */

'use strict';

var path = require('path');
var fs = require('fs');

// ============================================================================
// Storage Path
// ============================================================================

var DEFAULT_STORE_PATH = path.join(
  __dirname, '..', '..', 'storage', 'dispatch-ticket', 'dispatch-tickets.json'
);

var _storePath = DEFAULT_STORE_PATH;
var _lockFilePath = null;

// ============================================================================
// Mutex
// ============================================================================

var LOCK_TIMEOUT_MS = 5000;
var MAX_LOCK_ATTEMPTS = 10;
var LOCK_RETRY_DELAY_MS = 50;

function _ensureDir(filePath) {
  var dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function acquireLock() {
  var lockPath = _storePath + '.lock';
  var pid = String(process.pid);
  _ensureDir(lockPath);

  try {
    fs.writeFileSync(lockPath, pid, { flag: 'wx' });  // exclusive create
    _lockFilePath = lockPath;
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      // Check for stale lock
      try {
        var stats = fs.statSync(lockPath);
        if (Date.now() - stats.mtimeMs > LOCK_TIMEOUT_MS) {
          fs.unlinkSync(lockPath);
          fs.writeFileSync(lockPath, pid, { flag: 'wx' });
          _lockFilePath = lockPath;
          return true;
        }
      } catch (staleErr) {
        // Race condition — lock was removed by another process
      }
      return false;
    }
    throw err;
  }
}

function releaseLock() {
  if (_lockFilePath) {
    try { fs.unlinkSync(_lockFilePath); } catch (e) { /* ignore */ }
    _lockFilePath = null;
  }
}

function withLock(fn) {
  var attempts = 0;
  while (!acquireLock()) {
    attempts++;
    if (attempts >= MAX_LOCK_ATTEMPTS) {
      throw new Error('Could not acquire lock after ' + MAX_LOCK_ATTEMPTS + ' attempts');
    }
    // Busy-wait spin
    var start = Date.now();
    while (Date.now() - start < LOCK_RETRY_DELAY_MS) { /* spin */ }
  }
  try {
    return fn();
  } finally {
    releaseLock();
  }
}

// ============================================================================
// Default Meta
// ============================================================================

var DEFAULT_META = {
  version: '1.0.0',
  totalTickets: 0,
  lastUpdated: null
};

// ============================================================================
// Read / Write
// ============================================================================

function readStore() {
  try {
    if (!fs.existsSync(_storePath)) {
      return { tickets: [], meta: Object.assign({}, DEFAULT_META) };
    }
    var raw = fs.readFileSync(_storePath, 'utf8');
    if (!raw || raw.trim().length === 0) {
      return { tickets: [], meta: Object.assign({}, DEFAULT_META) };
    }
    var data = JSON.parse(raw);
    return {
      tickets: Array.isArray(data.tickets) ? data.tickets : [],
      meta: data.meta || Object.assign({}, DEFAULT_META)
    };
  } catch (err) {
    // Malformed JSON fallback
    return {
      tickets: [],
      meta: Object.assign({}, DEFAULT_META, { error: err.message })
    };
  }
}

function writeStore(data) {
  _ensureDir(_storePath);
  var tempPath = _storePath + '.tmp';

  data.meta = data.meta || Object.assign({}, DEFAULT_META);
  data.meta.totalTickets = (data.tickets || []).length;
  data.meta.lastUpdated = new Date().toISOString();

  var json = JSON.stringify(data, null, 2);

  fs.writeFileSync(tempPath, json, 'utf8');
  fs.renameSync(tempPath, _storePath);  // atomic rename
}

// ============================================================================
// CRUD Operations
// ============================================================================

function createTicket(ticket) {
  return withLock(function () {
    var data = readStore();
    data.tickets.push(ticket);
    writeStore(data);
    return ticket;
  });
}

function createTickets(tickets) {
  return withLock(function () {
    var data = readStore();
    for (var i = 0; i < tickets.length; i++) {
      data.tickets.push(tickets[i]);
    }
    writeStore(data);
    return tickets;
  });
}

function getTicket(ticketId) {
  var data = readStore();
  for (var i = 0; i < data.tickets.length; i++) {
    if (data.tickets[i].ticketId === ticketId) {
      return data.tickets[i];
    }
  }
  return null;
}

function updateTicket(ticketId, updates) {
  return withLock(function () {
    var data = readStore();
    for (var i = 0; i < data.tickets.length; i++) {
      if (data.tickets[i].ticketId === ticketId) {
        data.tickets[i] = Object.assign({}, data.tickets[i], updates, {
          updatedAt: new Date().toISOString()
        });
        writeStore(data);
        return data.tickets[i];
      }
    }
    return null;  // not found
  });
}

function deleteTicket(ticketId) {
  return withLock(function () {
    var data = readStore();
    var initialLength = data.tickets.length;
    data.tickets = data.tickets.filter(function (t) {
      return t.ticketId !== ticketId;
    });
    if (data.tickets.length === initialLength) {
      return false;  // not found
    }
    writeStore(data);
    return true;
  });
}

function listTickets(filter) {
  filter = filter || {};
  var data = readStore();
  var tickets = data.tickets.slice();  // shallow copy

  if (filter.status !== undefined) {
    var statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    tickets = tickets.filter(function (t) {
      return statuses.includes(t.status);
    });
  }

  if (filter.priority !== undefined) {
    var priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
    tickets = tickets.filter(function (t) {
      return priorities.includes(t.priority);
    });
  }

  if (filter.riskLevel !== undefined) {
    var riskLevels = Array.isArray(filter.riskLevel) ? filter.riskLevel : [filter.riskLevel];
    tickets = tickets.filter(function (t) {
      return riskLevels.includes(t.riskLevel);
    });
  }

  if (filter.approvalStatus !== undefined) {
    var approvalStatuses = Array.isArray(filter.approvalStatus) ? filter.approvalStatus : [filter.approvalStatus];
    tickets = tickets.filter(function (t) {
      return approvalStatuses.includes(t.approvalStatus);
    });
  }

  if (filter.ticketId !== undefined) {
    var ids = Array.isArray(filter.ticketId) ? filter.ticketId : [filter.ticketId];
    tickets = tickets.filter(function (t) {
      return ids.includes(t.ticketId);
    });
  }

  return tickets;
}

function findDuplicateTicket(dispatchPlanId) {
  var data = readStore();
  for (var i = 0; i < data.tickets.length; i++) {
    if (data.tickets[i].dispatchPlanId === dispatchPlanId) {
      return data.tickets[i];
    }
  }
  return null;
}

function clearTickets() {
  return withLock(function () {
    writeStore({ tickets: [], meta: Object.assign({}, DEFAULT_META) });
    return true;
  });
}

// ============================================================================
// Path Management (for testing)
// ============================================================================

function setStorePath(newPath) {
  _storePath = newPath;
}

function getStorePath() {
  return _storePath;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // CRUD
  createTicket: createTicket,
  createTickets: createTickets,
  getTicket: getTicket,
  updateTicket: updateTicket,
  deleteTicket: deleteTicket,
  listTickets: listTickets,
  findDuplicateTicket: findDuplicateTicket,
  clearTickets: clearTickets,

  // Store internals (for testing)
  readStore: readStore,
  writeStore: writeStore,
  setStorePath: setStorePath,
  getStorePath: getStorePath,

  // Mutex (for testing)
  withLock: withLock,
  acquireLock: acquireLock,
  releaseLock: releaseLock
};
