'use strict';

/**
 * Mission State Machine — 5 states, 6 transitions
 * Pure logic, no I/O, no side effects.
 */

var MISSION_STATES = {
  CREATED:   'CREATED',
  RUNNING:   'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED:    'FAILED',
  CANCELLED: 'CANCELLED'
};

// from → [valid to]
var TRANSITIONS = {};
TRANSITIONS[MISSION_STATES.CREATED]   = [MISSION_STATES.RUNNING, MISSION_STATES.CANCELLED];
TRANSITIONS[MISSION_STATES.RUNNING]   = [MISSION_STATES.COMPLETED, MISSION_STATES.FAILED, MISSION_STATES.CANCELLED];
TRANSITIONS[MISSION_STATES.COMPLETED] = [];
TRANSITIONS[MISSION_STATES.FAILED]    = [MISSION_STATES.RUNNING];
TRANSITIONS[MISSION_STATES.CANCELLED] = [];

function canTransition(from, to) {
  if (!from || !to) return false;
  var allowed = TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.indexOf(to) !== -1;
}

function validateTransition(from, to) {
  if (!from || !MISSION_STATES[from]) {
    return { valid: false, reason: 'Unknown source state: ' + from };
  }
  if (!to || !MISSION_STATES[to]) {
    return { valid: false, reason: 'Unknown target state: ' + to };
  }
  if (canTransition(from, to)) {
    return { valid: true, reason: null };
  }
  return { valid: false, reason: 'Cannot transition from ' + from + ' to ' + to };
}

function normalizeMission(mission) {
  if (!mission || typeof mission !== 'object') mission = {};
  var now = new Date().toISOString();
  return {
    missionId:     mission.missionId || ('mission_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
    correlationId: mission.correlationId || null,
    type:          mission.type || 'generic',
    source:        mission.source || null,
    priority:      mission.priority || 'medium',
    status:        MISSION_STATES[mission.status] ? mission.status : MISSION_STATES.CREATED,
    title:         mission.title || '',
    reason:        mission.reason || null,
    createdAt:     mission.createdAt || now,
    updatedAt:     mission.updatedAt || now,
    metadata:      mission.metadata || {}
  };
}

module.exports = {
  MISSION_STATES:    MISSION_STATES,
  canTransition:     canTransition,
  validateTransition: validateTransition,
  normalizeMission:  normalizeMission
};
