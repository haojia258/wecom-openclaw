/**
 * runtime-heartbeat.js
 * P9.7.1a Runtime Stability Layer — Heartbeat management.
 *
 * Tracks execution session heartbeats using an in-memory store.
 * Each heartbeat update is an immutable timestamp record.
 *
 * Safety constraints:
 *   - No shell, no exec, no spawn, no pm2, no deploy, no nginx, no .env
 *   - No auto-recovery, no auto-restart, no auto-dispatch, no auto-retry
 *   - Detect / analyze / report ONLY
 */

'use strict';

// ============================================================================
// In-memory heartbeat store
// ============================================================================

var _heartbeats = {};  // sessionId → { sessionId, heartbeatAt, updatedAt, history[] }

// ============================================================================
// Public API
// ============================================================================

/**
 * Update (or create) a heartbeat for the given session.
 * Immutable: creates a new timestamp entry, does NOT mutate the input session.
 *
 * @param {string} sessionId
 * @param {Object} [options]
 * @param {string} [options.timestamp] — override timestamp (ISO format)
 * @returns {{ success: boolean, heartbeat?: Object, error?: string }}
 */
function updateHeartbeat(sessionId, options) {
  options = options || {};

  if (!sessionId || typeof sessionId !== 'string') {
    return { success: false, error: 'sessionId is required and must be a string' };
  }

  var now = options.timestamp || new Date().toISOString();
  var existing = _heartbeats[sessionId];

  if (existing) {
    // Append to history
    var history = existing.history || [];
    history.push({
      heartbeatAt: existing.heartbeatAt,
      updatedAt:   now
    });

    // Keep last 100 history entries
    if (history.length > 100) {
      history = history.slice(-100);
    }

    existing.heartbeatAt = now;
    existing.updatedAt   = now;
    existing.history     = history;
    existing.count       = (existing.count || 0) + 1;

    return { success: true, heartbeat: existing };
  }

  // New heartbeat
  var hb = {
    sessionId:   sessionId,
    heartbeatAt: now,
    createdAt:   now,
    updatedAt:   now,
    history:     [],
    count:       1
  };

  _heartbeats[sessionId] = hb;
  return { success: true, heartbeat: hb };
}

/**
 * Get the current heartbeat for a session.
 *
 * @param {string} sessionId
 * @returns {Object|null}
 */
function getHeartbeat(sessionId) {
  if (!sessionId) return null;
  return _heartbeats[sessionId] || null;
}

/**
 * Check if a session's heartbeat is stale (exceeds threshold).
 *
 * @param {string} sessionId
 * @param {number} thresholdMs — max allowed milliseconds without heartbeat
 * @param {Object} [options]
 * @param {string} [options.now] — override "now" timestamp
 * @returns {{ stale: boolean, lag: number, heartbeatAt: string|null }}
 */
function isHeartbeatStale(sessionId, thresholdMs, options) {
  options = options || {};

  var hb = _heartbeats[sessionId];
  if (!hb) {
    return { stale: true, lag: -1, heartbeatAt: null, reason: 'no_heartbeat' };
  }

  var now = options.now ? new Date(options.now).getTime() : Date.now();
  var hbTime = new Date(hb.heartbeatAt).getTime();
  var lag = now - hbTime;

  return {
    stale:       lag > thresholdMs,
    lag:         lag,
    heartbeatAt: hb.heartbeatAt,
    staleMs:     lag > thresholdMs ? lag - thresholdMs : 0
  };
}

/**
 * List all heartbeat records.
 *
 * @param {Object} [filter]
 * @param {number} [filter.minCount] — minimum heartbeat count
 * @param {string} [filter.staleBefore] — ISO timestamp: heartbeats older than this
 * @returns {Object[]}
 */
function listHeartbeats(filter) {
  filter = filter || {};
  var ids = Object.keys(_heartbeats);
  var results = [];

  for (var i = 0; i < ids.length; i++) {
    var hb = _heartbeats[ids[i]];
    var include = true;

    if (typeof filter.minCount === 'number' && (hb.count || 0) < filter.minCount) {
      include = false;
    }

    if (filter.staleBefore) {
      var hbTime = new Date(hb.heartbeatAt).getTime();
      var cutoff  = new Date(filter.staleBefore).getTime();
      if (hbTime > cutoff) {
        include = false;
      }
    }

    if (include) {
      results.push(hb);
    }
  }

  return results;
}

/**
 * Get heartbeat lag stats across all sessions.
 *
 * @param {Object} [options]
 * @param {string} [options.now]
 * @returns {{ total: number, maxLag: number, minLag: number, avgLag: number, staleCount: number }}
 */
function getHeartbeatStats(options) {
  options = options || {};
  var now = options.now ? new Date(options.now).getTime() : Date.now();
  var ids = Object.keys(_heartbeats);
  var total = ids.length;
  var maxLag = 0;
  var minLag = Infinity;
  var sumLag = 0;
  var staleCount = 0;
  var thresholdMs = options.thresholdMs || 15 * 60 * 1000; // 15 min default

  for (var i = 0; i < ids.length; i++) {
    var hb = _heartbeats[ids[i]];
    var hbTime = new Date(hb.heartbeatAt).getTime();
    var lag = now - hbTime;

    if (lag > maxLag) maxLag = lag;
    if (lag < minLag) minLag = lag;
    sumLag += lag;
    if (lag > thresholdMs) staleCount++;
  }

  return {
    total:      total,
    maxLag:     total > 0 ? maxLag : 0,
    minLag:     total > 0 ? minLag : 0,
    avgLag:     total > 0 ? Math.round(sumLag / total) : 0,
    staleCount: staleCount,
    thresholdMs: thresholdMs
  };
}

/**
 * Remove a heartbeat (e.g., when session is archived/completed).
 *
 * @param {string} sessionId
 * @returns {boolean}
 */
function removeHeartbeat(sessionId) {
  if (!_heartbeats[sessionId]) return false;
  delete _heartbeats[sessionId];
  return true;
}

/**
 * Clear all heartbeats (for testing).
 */
function _clearAllHeartbeats() {
  _heartbeats = {};
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  updateHeartbeat:    updateHeartbeat,
  getHeartbeat:       getHeartbeat,
  isHeartbeatStale:   isHeartbeatStale,
  listHeartbeats:     listHeartbeats,
  getHeartbeatStats:  getHeartbeatStats,
  removeHeartbeat:    removeHeartbeat,
  _clearAllHeartbeats: _clearAllHeartbeats
};
