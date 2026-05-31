'use strict';

/**
 * multi-agent-board.js — P14.4 Multi-Agent Board
 *
 * 多 Agent 共同决策。
 * Codex/WorkBuddy/DeepSeek/Doubao + 4 个 role agent 参与投票，
 * 基于 Decision/Goal/Execution Plan 产出一致决策。
 *
 * REVIEW_ONLY — 投票结果仅供人类 CEO 参考。
 */

var crypto = require('crypto');

var _sources = {};
function getSource(n, p) { if (!_sources[n]) { try { _sources[n] = require(p); } catch (_) { _sources[n] = null; } } return _sources[n]; }

var AGENTS = [
  { id: 'codex',      name: 'Codex',      role: 'codex',      emoji: '🤖', focus: 'code',   weight: 1 },
  { id: 'workbuddy',  name: 'WorkBuddy',  role: 'workbuddy',  emoji: '🔧', focus: 'ops',    weight: 1 },
  { id: 'deepseek',   name: 'DeepSeek',   role: 'deepseek',   emoji: '🧠', focus: 'audit',  weight: 2 },
  { id: 'doubao',     name: 'Doubao',     role: 'doubao',     emoji: '🎬', focus: 'content',weight: 1 },
  { id: 'planner',    name: 'Planner',    role: 'planner',    emoji: '📋', focus: 'plan',   weight: 2 },
  { id: 'analysis',   name: 'Analysis',   role: 'analysis',   emoji: '📊', focus: 'data',   weight: 2 },
  { id: 'risk',       name: 'Risk',       role: 'risk',       emoji: '🛡️', focus: 'risk',   weight: 2 },
  { id: 'review',     name: 'Review',     role: 'review',     emoji: '🔍', focus: 'review', weight: 2 },
];

/**
 * 召集多 Agent 董事会议
 */
function convene() {
  var decisionEngine = getSource('decision', '../decision-engine/decision-engine');
  var goalManager = getSource('goal', '../goal-manager/goal-manager');
  var executionPlanner = getSource('execution', '../execution-planner/execution-planner');

  var decisions = null, goals = null, plan = null;
  try { if (decisionEngine) decisions = decisionEngine.analyze(); } catch (_) {}
  try { if (goalManager) goals = goalManager.getProgress(); } catch (_) {}
  try { if (executionPlanner) plan = executionPlanner.generateTaskPlan(); } catch (_) {}

  var proposals = _buildProposals(decisions, goals, plan);
  var votes = AGENTS.map(function (a) { return _agentVote(a, proposals); });
  var result = _tally(votes, proposals);

  return {
    meetingId: 'mab-' + crypto.randomBytes(4).toString('hex'),
    convenedAt: new Date().toISOString(),
    agents: AGENTS,
    proposals: proposals,
    votes: votes,
    result: result,
    _note: 'REVIEW_ONLY — AI 模拟投票，最终决策权在人类 CEO',
  };
}

function _buildProposals(decisions, goals, plan) {
  var props = [];

  if (plan && plan.tasks) {
    plan.tasks.filter(function (t) { return t.priority === 'urgent'; }).slice(0, 3).forEach(function (t) {
      props.push({ id: 'prop-' + t.id, title: t.action, source: 'Execution Plan', priority: 'urgent', detail: t.reason });
    });
  }

  if (decisions && decisions.decisions) {
    decisions.decisions.filter(function (d) { return d.priority === 'high'; }).slice(0, 3).forEach(function (d) {
      props.push({ id: 'prop-' + d.id, title: d.action, source: 'Decision Engine', priority: 'high', detail: d.reason });
    });
  }

  if (goals && goals.goals) {
    goals.goals.filter(function (g) { return g.status === 'behind'; }).slice(0, 2).forEach(function (g) {
      props.push({ id: 'prop-goal-' + g.id, title: g.name + ' 追赶计划', source: 'Goal Manager', priority: 'high', detail: '完成率 ' + (g.completion * 100).toFixed(0) + '%' });
    });
  }

  return props.slice(0, 5);
}

function _agentVote(agent, proposals) {
  var votes = proposals.map(function (p) {
    var score = _scoreProposal(agent, p);
    return { proposalId: p.id, vote: score >= 60 ? 'approve' : score >= 40 ? 'needs_info' : 'reject', score: score, reason: agent.focus + ': ' + (score >= 60 ? '赞成' : '需更多信息') };
  });
  return { agentId: agent.id, agentName: agent.name, emoji: agent.emoji, weight: agent.weight, votes: votes };
}

function _scoreProposal(agent, p) {
  var score = 50;
  if (agent.focus === 'code' && p.source === 'Execution Plan') score += 20;
  if (agent.focus === 'audit' && p.priority === 'high') score += 15;
  if (agent.focus === 'data' && p.source === 'Decision Engine') score += 15;
  if (agent.focus === 'risk' && p.priority === 'urgent') score += 20;
  if (agent.focus === 'plan') score += 10;
  return Math.min(100, score);
}

function _tally(votes, proposals) {
  var tally = {};
  proposals.forEach(function (p) { tally[p.id] = { approve: 0, reject: 0, needs_info: 0, weightedApprove: 0, weightedReject: 0 }; });

  votes.forEach(function (v) {
    v.votes.forEach(function (vv) {
      var t = tally[vv.proposalId];
      t[vv.vote]++;
      if (vv.vote === 'approve') t.weightedApprove += v.weight;
      else if (vv.vote === 'reject') t.weightedReject += v.weight;
    });
  });

  var results = proposals.map(function (p) {
    var t = tally[p.id];
    var totalWeight = votes.reduce(function (s, v) { return s + v.weight; }, 0);
    var decision = t.weightedApprove >= t.weightedReject ? 'approved' : 'rejected';
    return {
      proposal: p.title,
      approve: t.approve, reject: t.reject, needsInfo: t.needs_info,
      weightedApprove: t.weightedApprove, weightedReject: t.weightedReject,
      decision: decision,
      consensus: t.weightedApprove / totalWeight,
    };
  });

  var overallConsensus = results.length > 0 ? results.reduce(function (s, r) { return s + r.consensus; }, 0) / results.length : 0;

  return {
    results: results,
    approved: results.filter(function (r) { return r.decision === 'approved'; }).length,
    rejected: results.filter(function (r) { return r.decision === 'rejected'; }).length,
    consensus: (overallConsensus * 100).toFixed(0) + '%',
    recommendation: overallConsensus > 0.6 ? '多数赞成，建议执行' : overallConsensus > 0.4 ? '意见分歧，需 CEO 决断' : '多数反对，建议重新审议',
  };
}

module.exports = { convene: convene, AGENTS: AGENTS };
