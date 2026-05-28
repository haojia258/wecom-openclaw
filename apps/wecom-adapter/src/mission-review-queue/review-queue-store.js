/**
 * review-queue-store.js
 * P9.5.4 Mission Draft Review Queue — JSON file persistence layer.
 *
 * Features:
 * - JSON file storage at storage/mission-review/review-queue.json
 * - Auto-create directory
 * - Malformed/empty JSON tolerance
 * - Atomic writes (temp file + rename)
 * - Simple mutex via lock file (defensive, not performance-optimized)
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_STORE_PATH = path.join(
  __dirname, '..', '..', 'storage', 'mission-review', 'review-queue.json'
);

const DEFAULT_META = {
  version: '1.0.0',
  totalItems: 0,
  lastUpdated: null
};

const LOCK_TIMEOUT_MS = 5000;
const MAX_LOCK_ATTEMPTS = 10;
const LOCK_RETRY_DELAY_MS = 50;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _storePath = DEFAULT_STORE_PATH;
let _lockFilePath = null;

// ---------------------------------------------------------------------------
// Path management
// ---------------------------------------------------------------------------

function setStorePath(customPath) {
  _storePath = customPath;
}

function getStorePath() {
  return _storePath;
}

// ---------------------------------------------------------------------------
// Directory utilities
// ---------------------------------------------------------------------------

function _ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Core read/write
// ---------------------------------------------------------------------------

/**
 * Read the review queue from disk.
 * Tolerates missing file, empty file, and malformed JSON.
 *
 * @returns {{ items: Array, meta: Object }}
 */
function readQueue() {
  try {
    if (!fs.existsSync(_storePath)) {
      return { items: [], meta: { ...DEFAULT_META } };
    }

    const raw = fs.readFileSync(_storePath, 'utf8');

    // Empty file
    if (!raw || raw.trim().length === 0) {
      return { items: [], meta: { ...DEFAULT_META } };
    }

    const data = JSON.parse(raw);

    // Ensure items is always an array
    return {
      items: Array.isArray(data.items) ? data.items : [],
      meta: data.meta || { ...DEFAULT_META }
    };
  } catch (err) {
    // Malformed JSON or read error — return empty state
    return {
      items: [],
      meta: { ...DEFAULT_META, error: err.message }
    };
  }
}

/**
 * Write the review queue to disk atomically.
 * Uses temp file + rename to prevent partial writes.
 *
 * @param {{ items: Array, meta?: Object }} data
 */
function writeQueue(data) {
  _ensureDir(_storePath);

  const tempPath = _storePath + '.tmp';

  // Update metadata
  data.meta = data.meta || { ...DEFAULT_META };
  data.meta.totalItems = (data.items || []).length;
  data.meta.lastUpdated = new Date().toISOString();

  const json = JSON.stringify(data, null, 2);

  // Atomic write: write to temp, then rename
  fs.writeFileSync(tempPath, json, 'utf8');
  fs.renameSync(tempPath, _storePath);
}

// ---------------------------------------------------------------------------
// Simple mutex (lock-file based)
// ---------------------------------------------------------------------------

function acquireLock() {
  const lockPath = _storePath + '.lock';
  const pid = String(process.pid);

  // Ensure lock directory exists
  _ensureDir(lockPath);

  try {
    // Exclusive create — fails if lock already exists
    fs.writeFileSync(lockPath, pid, { flag: 'wx' });
    _lockFilePath = lockPath;
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      // Check if lock is stale
      try {
        const stats = fs.statSync(lockPath);
        if (Date.now() - stats.mtimeMs > LOCK_TIMEOUT_MS) {
          // Stale lock — break it
          fs.unlinkSync(lockPath);
          fs.writeFileSync(lockPath, pid, { flag: 'wx' });
          _lockFilePath = lockPath;
          return true;
        }
      } catch (staleErr) {
        // Lock removed between stat and unlink — try again
      }
      return false;
    }
    throw err;
  }
}

function releaseLock() {
  if (_lockFilePath) {
    try {
      fs.unlinkSync(_lockFilePath);
    } catch (e) {
      // Lock already removed — ignore
    }
    _lockFilePath = null;
  }
}

/**
 * Execute a function under lock protection.
 * Retries up to MAX_LOCK_ATTEMPTS with delay.
 *
 * @param {Function} fn - The function to execute
 * @returns {*} The function's return value
 */
function withLock(fn) {
  let attempts = 0;

  while (!acquireLock()) {
    attempts++;
    if (attempts >= MAX_LOCK_ATTEMPTS) {
      throw new Error('Could not acquire lock after ' + MAX_LOCK_ATTEMPTS + ' attempts');
    }
    // Busy-wait for lock retry
    const start = Date.now();
    while (Date.now() - start < LOCK_RETRY_DELAY_MS) {
      // spin
    }
  }

  try {
    return fn();
  } finally {
    releaseLock();
  }
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Add a single ReviewItem to the queue.
 */
function addItem(item) {
  return withLock(function () {
    const data = readQueue();
    data.items.push(item);
    writeQueue(data);
    return item;
  });
}

/**
 * Add multiple ReviewItems to the queue atomically.
 */
function addItems(items) {
  return withLock(function () {
    const data = readQueue();
    for (const item of items) {
      data.items.push(item);
    }
    writeQueue(data);
    return items;
  });
}

/**
 * Get a single ReviewItem by reviewId.
 */
function getItem(reviewId) {
  const data = readQueue();
  return data.items.find(function (item) { return item.reviewId === reviewId; }) || null;
}

/**
 * Update a ReviewItem in-place.
 * Returns the updated item, or null if not found.
 */
function updateItem(reviewId, updates) {
  return withLock(function () {
    const data = readQueue();
    const index = data.items.findIndex(function (item) { return item.reviewId === reviewId; });
    if (index === -1) {
      return null;
    }
    data.items[index] = Object.assign({}, data.items[index], updates, {
      updatedAt: new Date().toISOString()
    });
    writeQueue(data);
    return data.items[index];
  });
}

/**
 * List ReviewItems with optional filter.
 *
 * Supported filter fields:
 *   status (string|string[])
 *   priority (string)
 *   draftId (string)
 *   strategyId (string)
 *   goalId (string)
 *   reviewer (string)
 *   since (ISO date string)
 *   until (ISO date string)
 */
function listItems(filter) {
  filter = filter || {};
  const data = readQueue();
  var items = data.items;

  if (filter.status) {
    var statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    items = items.filter(function (item) { return statuses.indexOf(item.status) !== -1; });
  }
  if (filter.priority) {
    items = items.filter(function (item) { return item.priority === filter.priority; });
  }
  if (filter.draftId) {
    items = items.filter(function (item) { return item.draftId === filter.draftId; });
  }
  if (filter.strategyId) {
    items = items.filter(function (item) { return item.strategyId === filter.strategyId; });
  }
  if (filter.goalId) {
    items = items.filter(function (item) { return item.goalId === filter.goalId; });
  }
  if (filter.reviewer) {
    items = items.filter(function (item) { return item.reviewer === filter.reviewer; });
  }
  if (filter.since) {
    var sinceTs = new Date(filter.since).getTime();
    items = items.filter(function (item) { return new Date(item.createdAt).getTime() >= sinceTs; });
  }
  if (filter.until) {
    var untilTs = new Date(filter.until).getTime();
    items = items.filter(function (item) { return new Date(item.createdAt).getTime() <= untilTs; });
  }

  return items;
}

/**
 * Find a review item by draftId to detect duplicates.
 */
function findDuplicateDraft(draftId) {
  const data = readQueue();
  return data.items.find(function (item) { return item.draftId === draftId; }) || null;
}

/**
 * Clear the entire queue (for testing).
 */
function clearQueue() {
  return withLock(function () {
    writeQueue({ items: [], meta: { ...DEFAULT_META } });
    return true;
  });
}

/**
 * Get total item count without reading all items.
 */
function getQueueSize() {
  const data = readQueue();
  return (data.items || []).length;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Configuration
  setStorePath: setStorePath,
  getStorePath: getStorePath,
  DEFAULT_STORE_PATH: DEFAULT_STORE_PATH,

  // Core I/O
  readQueue: readQueue,
  writeQueue: writeQueue,

  // CRUD
  addItem: addItem,
  addItems: addItems,
  getItem: getItem,
  updateItem: updateItem,
  listItems: listItems,
  findDuplicateDraft: findDuplicateDraft,
  clearQueue: clearQueue,
  getQueueSize: getQueueSize,

  // Locking
  withLock: withLock,
  acquireLock: acquireLock,
  releaseLock: releaseLock,

  // Constants
  LOCK_TIMEOUT_MS: LOCK_TIMEOUT_MS
};
