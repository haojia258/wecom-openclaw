'use strict';

/**
 * execution-planner.js — P14.3 Execution Planner
 *
 * 把决策拆解为可执行任务计划。
 * 从 Decision Engine + Goal Manager 聚合输入，
 * 输出结构化任务计划（owner/priority/deadline/dependency）。
 *
 * REVIEW_ONLY — 任务计划仅供人工审批，不自动派发。
 */

var crypto = require('crypto');

var _sources = {};
function getSource(name, modulePath) {
  if (!_sources[name]) {
    try { _sources[name] = require(modulePath); } catch (_) { _sources[name] = null; }
  }
  return _sources[name];
}

// ─── 任务计划生成 ──────────────────────────────────────────

/**
 * 生成可执行任务计划
 * @returns {object} { planId, tasks[], phases[], summary }
 */
function generateTaskPlan() {
  var decisionEngine = getSource('decision', '../decision-engine/decision-engine');
  var goalManager = getSource('goal', '../goal-manager/goal-manager');

  var decisions = null;
  try { if (decisionEngine) decisions = decisionEngine.analyze().decisions; } catch (_) {}
  var goalProgress = null;
  try { if (goalManager) goalProgress = goalManager.getProgress(); } catch (_) {}

  var tasks = [];
  var planId = 'plan-' + crypto.randomBytes(4).toString('hex');

  // Phase 1: 紧急响应 (urgent — behind goals + high priority decisions)
  var phase1 = [];
  if (goalProgress) {
    goalProgress.goals.filter(function (g) { return g.status === 'behind'; }).forEach(function (g) {
      var task = _goalToTask(g, 'urgent');
      phase1.push(task);
      tasks.push(task);
    });
  }
  if (decisions) {
    decisions.filter(function (d) { return d.priority === 'high'; }).forEach(function (d) {
      var task = _decisionToTask(d, 'urgent');
      phase1.push(task);
      tasks.push(task);
    });
  }

  // Phase 2: 常规推进 (goal-driven normal)
  var phase2 = [];
  if (goalProgress) {
    goalProgress.goals.filter(function (g) { return g.status === 'at_risk'; }).forEach(function (g) {
      var task = _goalToTask(g, 'normal');
      phase2.push(task);
      tasks.push(task);
    });
  }

  // Phase 3: 优化维护 (low priority + maintenance)
  var phase3 = [];
  if (decisions) {
    decisions.filter(function (d) { return d.priority === 'normal' || d.priority === 'low'; }).forEach(function (d) {
      var task = _decisionToTask(d, 'normal');
      phase3.push(task);
      tasks.push(task);
    });
  }

  // 去重
  var seen = new Set();
  tasks = tasks.filter(function (t) {
    var key = t.action.substring(0, 20);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    planId: planId,
    generatedAt: new Date().toISOString(),
    phases: [
      { phase: 1, label: '紧急响应', priority: 'urgent', tasks: phase1 },
      { phase: 2, label: '常规推进', priority: 'normal', tasks: phase2 },
      { phase: 3, label: '优化维护', priority: 'normal', tasks: phase3 },
    ],
    tasks: tasks,
    summary: {
      total: tasks.length,
      urgent: phase1.length,
      normal: phase2.length + phase3.length,
      owners: _unique(tasks.map(function (t) { return t.owner; })),
    },
  };
}

function _goalToTask(g, priority) {
  var ownerMap = { gmv: 'CMO', profit: 'CFO', roi: 'CMO', refund: 'COO', video: 'CMO', mission: 'CTO', growth: 'CEO' };
  return {
    id: 'task-' + g.id,
    action: g.name + ' 推进',
    owner: ownerMap[g.type] || 'COO',
    priority: priority,
    deadline: _relativeDate(priority === 'urgent' ? 2 : 5),
    dependency: null,
    reason: '目标 ' + (g.completion * 100).toFixed(0) + '% (' + g.current + '/' + g.target + g.unit + ')',
  };
}

function _decisionToTask(d, priority) {
  var ownerMap = { scale_ads: 'CMO', reduce_ads: 'CMO', maintain_ads: 'CMO',
    launch_campaign: 'CMO', pause_campaign: 'CMO', selective_campaign: 'CMO',
    increase_videos: 'CMO', optimize_videos: 'CMO', maintain_videos: 'CMO',
    expand_budget: 'CFO', tighten_budget: 'CFO', balance_budget: 'CFO',
    reduce_inventory: 'COO', normal_inventory: 'COO', board_followup: 'CEO' };
  return {
    id: 'task-' + d.id,
    action: d.action,
    owner: ownerMap[d.id] || 'COO',
    priority: priority,
    deadline: _relativeDate(priority === 'urgent' ? 1 : 3),
    dependency: null,
    reason: d.reason,
  };
}

function _relativeDate(days) {
  var d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function _unique(arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); }

module.exports = { generateTaskPlan: generateTaskPlan };
