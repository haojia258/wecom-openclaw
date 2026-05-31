/**
 * execution-audit.js
 * P9.7.1 Execution Session Runtime — Audit Trail Runtime.
 *
 * Implements audit event recording, listing, and snapshot generation.
 *
 * Audit event types:
 *   session_created, session_started, session_paused, session_resumed,
 *   session_failed, session_completed, rollback_planned, checkpoint_created
 *
 * Safety rules:
 *   - No shell, no exec, no spawn, no pm2, no deploy, no nginx, no .env
 *   - No real task execution, no real rollback, no real dispatch
 *   - Append-only audit log, no modification of past events
 */

'use strict';

var t = require('./execution-types');
var v = require('./execution-validator');
var store = require('./execution-store');

// ============================================================================
// recordAuditEvent(sessionId, eventType, actor, details) → { success, event?, error? }
// ============================================================================

/**
 * Record a new audit event.
 *
 * @param {string} sessionId
 * @param {string} eventType — one of AUDIT_EVENT_TYPE
 * @param {string} [actor]    — human | system | agent
 * @param {Object} [details]  — event-specific details
 * @param {Object} [options]
 * @returns {{ success: boolean, event?: Object, error?: string, code?: string }}
 */
function recordAuditEvent(sessionId, eventType, actor, details, options) {
  options = options || {};

  // Validate inputs
  if (!sessionId || typeof sessionId !== 'string') {
    return {
      success: false,
      error: 'sessionId is required and must be a string',
      code:  t.EXECUTION_ERROR_CODES.INVALID_SESSION_ID
    };
  }

  if (!eventType || t.AUDIT_EVENT_TYPE_VALUES.indexOf(eventType) === -1) {
    return {
      success: false,
      error: 'Invalid audit event type: ' + eventType,
      code:  t.EXECUTION_ERROR_CODES.AUDIT_EVENT_INVALID
    };
  }

  if (actor && t.ACTOR_TYPE_VALUES.indexOf(actor) === -1) {
    return {
      success: false,
      error: 'Invalid actor type: ' + actor,
      code:  t.EXECUTION_ERROR_CODES.INVALID_ACTOR
    };
  }

  // Create audit event object
  var evt;
  try {
    evt = t.createAuditEvent(sessionId, eventType, actor || t.ACTOR_TYPE.SYSTEM, details, {
      eventId:  options.eventId,
      metadata: options.metadata
    });
  } catch (e) {
    return {
      success: false,
      error: 'Failed to create audit event: ' + e.message,
      code:  t.EXECUTION_ERROR_CODES.AUDIT_EVENT_INVALID
    };
  }

  // Validate event
  var evtResult = v.validateAuditEvent(evt);
  if (!evtResult.valid) {
    return {
      success: false,
      error: evtResult.errors[0].message,
      code:  evtResult.errors[0].code
    };
  }

  // Persist
  try {
    store.createAuditEventRecord(evt);
  } catch (e) {
    return {
      success: false,
      error: 'Failed to persist audit event: ' + e.message,
      code:  t.EXECUTION_ERROR_CODES.AUDIT_EVENT_INVALID
    };
  }

  return { success: true, event: evt };
}

// ============================================================================
// listAuditEvents(filter) → auditEvent[]
// ============================================================================

/**
 * List audit events, optionally filtered by sessionId or event type.
 *
 * @param {Object} [filter] — { sessionId?, event?, actor? }
 * @returns {Object[]}
 */
function listAuditEvents(filter) {
  return store.listAuditEventRecords(filter || {});
}

// ============================================================================
// getAuditEvent(eventId) → auditEvent | null
// ============================================================================

/**
 * Get a single audit event by its ID.
 *
 * @param {string} eventId
 * @returns {Object|null}
 */
function getAuditEvent(eventId) {
  if (!eventId || typeof eventId !== 'string') {
    return null;
  }
  return store.getAuditEventRecord(eventId);
}

// ============================================================================
// listAuditEventsForSession(sessionId) → auditEvent[]
// ============================================================================

/**
 * List all audit events for a specific session.
 *
 * @param {string} sessionId
 * @returns {Object[]}
 */
function listAuditEventsForSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return [];
  }
  return store.listAuditEventRecords({ sessionId: sessionId });
}

// ============================================================================
// generateAuditSnapshot() → { success, snapshot?, error? }
// ============================================================================

/**
 * Generate a summary snapshot of all audit events.
 *
 * @param {Object} [options]
 * @returns {{ success: boolean, snapshot?: Object, error?: string }}
 */
function generateAuditSnapshot(options) {
  options = options || {};

  var events = store.listAuditEventRecords();

  var snapshot = {
    snapshotId:      'audit_snap_' + Date.now(),
    generatedAt:      new Date().toISOString(),
    totalEvents:       events.length,
    eventBreakdown:   {},
    actorBreakdown:   {},
    sessionBreakdown: {},
    recentEvents:     [],
    oldestEventAt:    null,
    newestEventAt:    null,
    metadata:         options.metadata || {}
  };

  // Sort events by time (oldest first) for ordering
  var sorted = events.slice().sort(function (a, b) {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  if (sorted.length > 0) {
    snapshot.oldestEventAt = sorted[0].createdAt;
    snapshot.newestEventAt = sorted[sorted.length - 1].createdAt;
  }

  // Build breakdowns
  for (var i = 0; i < events.length; i++) {
    var evt = events[i];

    // Event type breakdown
    var et = evt.event || 'unknown';
    snapshot.eventBreakdown[et] = (snapshot.eventBreakdown[et] || 0) + 1;

    // Actor breakdown
    var ac = evt.actor || 'unknown';
    snapshot.actorBreakdown[ac] = (snapshot.actorBreakdown[ac] || 0) + 1;

    // Session breakdown
    var sid = evt.sessionId || 'unknown';
    snapshot.sessionBreakdown[sid] = (snapshot.sessionBreakdown[sid] || 0) + 1;
  }

  // Collect recent events (last 10, sorted newest first)
  var recent = events.slice().sort(function (a, b) {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }).slice(0, 10);

  for (var r = 0; r < recent.length; r++) {
    snapshot.recentEvents.push({
      eventId:    recent[r].eventId,
      sessionId:  recent[r].sessionId,
      event:      recent[r].event,
      actor:      recent[r].actor,
      createdAt:  recent[r].createdAt
    });
  }

  return { success: true, snapshot: snapshot };
}

// ============================================================================
// deleteAuditEvent(eventId) → boolean
// ============================================================================

/**
 * Delete a single audit event.
 * Normally audit events are append-only; this is for maintenance only.
 *
 * @param {string} eventId
 * @returns {boolean}
 */
function deleteAuditEvent(eventId) {
  return store.deleteAuditEventRecord(eventId);
}

// ============================================================================
// clearAuditEvents() → boolean
// ============================================================================

/**
 * Clear all audit events.
 * For testing / maintenance only.
 *
 * @returns {boolean}
 */
function clearAuditEvents() {
  return store.clearAuditEventRecords();
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  recordAuditEvent:        recordAuditEvent,
  listAuditEvents:         listAuditEvents,
  getAuditEvent:           getAuditEvent,
  listAuditEventsForSession: listAuditEventsForSession,
  generateAuditSnapshot:   generateAuditSnapshot,
  deleteAuditEvent:        deleteAuditEvent,
  clearAuditEvents:        clearAuditEvents
};
