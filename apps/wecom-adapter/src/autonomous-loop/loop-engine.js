'use strict';

// P17 Autonomous Company Loop v1.0 — Loop Engine
// REVIEW_ONLY=true — orchestrates daily loop, no real execution
var scheduler = require('./task-scheduler');
var collector = require('./artifact-collector');
var reporter = require('./report-generator');

var _loops = [];
var _currentLoopId = null;

var LOOP_STATUSES = ['pending', 'collecting', 'scheduling', 'executing', 'reviewing', 'complete'];

/**
 * Run one full daily autonomous loop cycle
 */
function runDailyLoop(date) {
  var loopId = 'loop-' + (date || new Date().toISOString().substring(0, 10));
  var startedAt = new Date().toISOString();

  var loop = {
    loopId: loopId,
    date: date || new Date().toISOString().substring(0, 10),
    status: 'collecting',
    phases: {},
    reviewRequired: true,
    reviewOnly: true,
    requiresHumanApproval: true,
    startedAt: startedAt
  };

  // Phase 1: Collect operational data
  loop.phases.collect = collector.collectAllData();
  loop.status = 'scheduling';

  // Phase 2: Generate daily tasks via scheduler
  loop.phases.schedule = scheduler.generateDailySchedule(loop.date, loop.phases.collect);
  loop.status = 'executing';

  // Phase 3: Simulate execution → artifacts
  loop.phases.execute = collector.collectArtifacts(loop.phases.schedule.tasks);
  loop.status = 'reviewing';

  // Phase 4: Generate report
  loop.phases.report = reporter.generateDailyReport(loop);
  loop.status = 'complete';
  loop.completedAt = new Date().toISOString();

  _loops.push(loop);
  _currentLoopId = loopId;
  return loop;
}

/**
 * Get loop status
 */
function getLoopStatus(loopId) {
  var loop = _loops.find(function (l) { return l.loopId === loopId; });
  return loop ? {
    loopId: loop.loopId,
    date: loop.date,
    status: loop.status,
    phases: Object.keys(loop.phases),
    taskCount: loop.phases.schedule ? loop.phases.schedule.taskCount : 0,
    artifactCount: loop.phases.execute ? loop.phases.execute.artifactCount : 0,
    reviewRequired: loop.reviewRequired,
    reviewOnly: loop.reviewOnly
  } : null;
}

function listLoops() {
  return _loops.map(function (l) {
    return { loopId: l.loopId, date: l.date, status: l.status, taskCount: l.phases.schedule ? l.phases.schedule.taskCount : 0 };
  });
}

function getCurrentLoop() {
  return _currentLoopId ? _loops.find(function (l) { return l.loopId === _currentLoopId; }) : null;
}

function stats() {
  return {
    totalLoops: _loops.length,
    totalTasks: _loops.reduce(function (s, l) { return s + (l.phases.schedule ? l.phases.schedule.taskCount : 0); }, 0),
    totalArtifacts: _loops.reduce(function (s, l) { return s + (l.phases.execute ? l.phases.execute.artifactCount : 0); }, 0)
  };
}

function _reset() {
  _loops = [];
  _currentLoopId = null;
}

module.exports = {
  runDailyLoop: runDailyLoop,
  getLoopStatus: getLoopStatus,
  listLoops: listLoops,
  getCurrentLoop: getCurrentLoop,
  stats: stats,
  _reset: _reset,
  LOOP_STATUSES: LOOP_STATUSES
};
