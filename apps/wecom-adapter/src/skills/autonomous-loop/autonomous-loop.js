'use strict';

/**
 * autonomous-loop.js — P14.5 Autonomous Company Loop
 *
 * 自治公司闭环。
 * Goal → Decision → Plan → Board → Task → Review → Memory → Goal Update
 *
 * REVIEW_ONLY — 闭环仅供人类 CEO 审查，不自动执行任何生产操作。
 */

var crypto = require('crypto');

var _sources = {};
function src(n, p) { if (!_sources[n]) { try { _sources[n] = require(p); } catch (_) { _sources[n] = null; } } return _sources[n]; }

// ─── 闭环执行 ──────────────────────────────────────────────

/**
 * 执行一次自治闭环
 * @returns {object} { loopId, stages[], summary }
 */
function runLoop() {
  var stages = [];
  var loopId = 'loop-' + crypto.randomBytes(4).toString('hex');
  var now = new Date().toISOString();

  // Stage 1: Goal — 读取当前目标
  var goalManager = src('goal', '../goal-manager/goal-manager');
  var goals = null;
  try { if (goalManager) goals = goalManager.getProgress(); } catch (_) {}
  stages.push({ stage: 1, name: 'Goal', status: goals ? 'ok' : 'skipped', data: goals ? goals.summary : null });

  // Stage 2: Decision — 生成决策
  var decisionEngine = src('decision', '../decision-engine/decision-engine');
  var decisions = null;
  try { if (decisionEngine) decisions = decisionEngine.analyze(); } catch (_) {}
  stages.push({ stage: 2, name: 'Decision', status: decisions ? 'ok' : 'skipped', data: decisions ? decisions.summary : null });

  // Stage 3: Plan — 生成执行计划
  var executionPlanner = src('execution', '../execution-planner/execution-planner');
  var plan = null;
  try { if (executionPlanner) plan = executionPlanner.generateTaskPlan(); } catch (_) {}
  stages.push({ stage: 3, name: 'Plan', status: plan ? 'ok' : 'skipped', data: plan ? plan.summary : null });

  // Stage 4: Board — 多Agent投票
  var multiAgentBoard = src('board', '../multi-agent-board/multi-agent-board');
  var meeting = null;
  try { if (multiAgentBoard) meeting = multiAgentBoard.convene(); } catch (_) {}
  stages.push({ stage: 4, name: 'Board', status: meeting ? 'ok' : 'skipped', data: meeting ? meeting.result : null });

  // Stage 5: Task — 待派发任务（仅生成清单，不实际派发）
  var tasks = [];
  if (meeting && meeting.result) {
    tasks = meeting.result.results.filter(function (r) { return r.decision === 'approved'; }).map(function (r) {
      return { proposal: r.proposal, consensus: r.consensus, status: 'pending_approval' };
    });
  }
  stages.push({ stage: 5, name: 'Task', status: tasks.length > 0 ? 'ok' : 'empty', data: { pending: tasks.length, items: tasks } });

  // Stage 6: Review — 闭环审查
  var reviewNote = _reviewLoop(stages);
  stages.push({ stage: 6, name: 'Review', status: 'ok', data: reviewNote });

  // Stage 7: Memory — 存档
  var memoryStore = src('memory', '../long-term-memory/memory-store');
  try {
    if (memoryStore) memoryStore.append('board', {
      loopId: loopId, stages: stages.map(function (s) { return s.status; }), timestamp: now,
    });
  } catch (_) {}
  stages.push({ stage: 7, name: 'Memory', status: 'archived', data: { loopId: loopId } });

  return {
    loopId: loopId,
    executedAt: now,
    stages: stages,
    summary: _summarize(stages),
    _note: 'REVIEW_ONLY — 闭环仅生成建议，不执行任何生产操作',
  };
}

function _reviewLoop(stages) {
  var ok = stages.filter(function (s) { return s.status === 'ok' || s.status === 'archived'; }).length;
  var total = stages.filter(function (s) { return s.status !== 'empty'; }).length;
  var health = ok / total;

  return {
    score: Math.round(health * 100),
    grade: health >= 0.8 ? 'A' : health >= 0.6 ? 'B' : 'C',
    note: health >= 0.8 ? '闭环健康，所有阶段正常执行' : '部分阶段缺失，需检查依赖链路',
    readyForDeploy: false,
    requiresHumanApproval: true,
  };
}

function _summarize(stages) {
  var statuses = stages.map(function (s) { return s.stage + ':' + s.name + '=' + s.status; }).join(', ');
  var health = stages.filter(function (s) { return s.status === 'ok' || s.status === 'archived'; }).length / stages.length;
  return {
    stages: statuses,
    health: (health * 100).toFixed(0) + '%',
    recommendation: health >= 0.7 ? '系统运行正常，建议按计划推进' : '部分链路异常，建议检查并修复后再运行闭环',
  };
}

module.exports = { runLoop: runLoop };
