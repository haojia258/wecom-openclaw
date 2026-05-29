'use strict';

/**
 * Mission Manager — In-memory mission CRUD
 * NO disk I/O, NO shell commands, NO pm2/gateway calls.
 */

var sm    = require('./mission-state-machine');
var store = {};

function _ts() { return new Date().toISOString(); }

function createMission(input) {
  var m = sm.normalizeMission(input || {});
  if (!m.correlationId) {
    var e = new Error('correlationId is required');
    e.code = 'MISSING_CORRELATION_ID';
    throw e;
  }
  if (!m.type || m.type === 'generic') {
    var e2 = new Error('mission type is required');
    e2.code = 'MISSING_TYPE';
    throw e2;
  }
  m.status    = sm.MISSION_STATES.CREATED;
  m.createdAt = _ts();
  m.updatedAt = m.createdAt;
  store[m.missionId] = m;
  return m;
}

function getMission(id) {
  return store[id] || null;
}

function listMissions(filter) {
  var result = [], id;
  for (id in store) {
    if (!store.hasOwnProperty(id)) continue;
    var m = store[id];
    if (!filter) { result.push(m); continue; }
    var match = true;
    if (filter.status && m.status !== filter.status) match = false;
    if (filter.type && m.type !== filter.type) match = false;
    if (filter.priority && m.priority !== filter.priority) match = false;
    if (filter.source && m.source !== filter.source) match = false;
    if (filter.correlationId && m.correlationId !== filter.correlationId) match = false;
    if (match) result.push(m);
  }
  return result;
}

function updateMission(id, patch) {
  var m = store[id];
  if (!m) return null;
  var keys = Object.keys(patch || {}), i;
  for (i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === 'missionId' || k === 'createdAt') continue;
    m[k] = patch[k];
  }
  m.updatedAt = _ts();
  return m;
}

function _transition(id, toStatus, extra) {
  var m = store[id];
  if (!m) return null;
  var v = sm.validateTransition(m.status, toStatus);
  if (!v.valid) {
    var err = new Error(v.reason);
    err.code = 'INVALID_TRANSITION';
    throw err;
  }
  m.status = toStatus;
  m.updatedAt = _ts();
  if (extra) {
    var keys = Object.keys(extra);
    for (var i = 0; i < keys.length; i++) { m[keys[i]] = extra[keys[i]]; }
  }
  return m;
}

function completeMission(id, result) {
  return _transition(id, sm.MISSION_STATES.COMPLETED, { result: result });
}

function failMission(id, error) {
  return _transition(id, sm.MISSION_STATES.FAILED, { error: error });
}

function cancelMission(id, reason) {
  return _transition(id, sm.MISSION_STATES.CANCELLED, { reason: reason });
}

// exposed for testing
function _reset() { store = {}; }

module.exports = {
  createMission:  createMission,
  getMission:     getMission,
  listMissions:   listMissions,
  updateMission:  updateMission,
  completeMission: completeMission,
  failMission:    failMission,
  cancelMission:  cancelMission,
  _reset:         _reset
};
