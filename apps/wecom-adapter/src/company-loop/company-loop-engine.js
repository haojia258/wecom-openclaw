'use strict';
/**
 * company-loop-engine.js - P24 Autonomous Company Loop
 * 
 * The ultimate control layer: autonomous observe→analyze→decide→execute→learn cycle.
 * 
 * SAFETY FIRST: Default READ ONLY. All dangerous actions require board approval.
 * Loop Guards: maxLoopsPerDay, maxMissionsPerDay, maxBudgetImpact.
 */

var crypto = require('crypto');

// ─── Safety Limits ────────────────────────────────────────

var MAX_LOOPS_PER_DAY = 1;
var MAX_MISSIONS_PER_DAY = 5;
var MAX_BUDGET_IMPACT = 50000; // CNY
var MAX_CONCURRENT_LOOPS = 1;

var FORBIDDEN_AUTO = [
  'deploy.production', 'git.merge', 'pm2.restart',
  'server.write', 'budget.increase', 'campaign.enroll',
  'customer.high_risk_reply', 'trading.order'
];

// ─── State Machine ────────────────────────────────────────

var STATES = ['idle','observing','analyzing','planning','board_review','executing','learning','completed','blocked'];

var STATE_TRANSITIONS = {
  idle:          ['observing','blocked'],
  observing:     ['analyzing','blocked'],
  analyzing:     ['planning','blocked'],
  planning:      ['board_review','blocked'],
  board_review:  ['executing','blocked'],
  executing:     ['learning','blocked'],
  learning:      ['completed','idle','blocked'],
  completed:     ['idle'],
  blocked:       ['idle']
};

// ─── Loop Store ───────────────────────────────────────────

var loops = {};
var dailyStats = { loops: 0, missions: 0, lastReset: new Date().toISOString().substring(0,10) };

function resetDailyIfNeeded() {
  var today = new Date().toISOString().substring(0,10);
  if (dailyStats.lastReset !== today) {
    dailyStats = { loops: 0, missions: 0, lastReset: today };
  }
}

function canStartLoop() {
  resetDailyIfNeeded();
  if (dailyStats.loops >= MAX_LOOPS_PER_DAY) return { ok: false, reason: '每日循环上限: ' + MAX_LOOPS_PER_DAY };
  var active = Object.values(loops).filter(function(l) { return l.status !== 'completed' && l.status !== 'blocked'; });
  if (active.length >= MAX_CONCURRENT_LOOPS) return { ok: false, reason: '并发循环上限' };
  return { ok: true };
}

// ─── Trigger Detection ────────────────────────────────────

function detectTriggers() {
  var triggers = [];
  // Simulated observation - in production, reads from KPI/Budget/Memory
  triggers.push({ type: 'scheduled', priority: 'normal', message: '定时公司循环检查' });
  return { success: true, triggers: triggers, timestamp: new Date().toISOString() };
}

// ─── Observe Layer ────────────────────────────────────────

function observe() {
  return {
    success: true,
    observations: {
      memory_count: 0,  // would read from Memory Fabric
      kpi_status: 'pending_check',
      budget_usage: 0,
      agent_health: 'online',
      recent_missions: 0,
      pending_approvals: 0
    },
    timestamp: new Date().toISOString()
  };
}

// ─── Analyze Layer ─────────────────────────────────────────

function analyze(observations) {
  var findings = [];
  // Rule-based analysis
  var obs = observations || {};
  if (obs.kpi_status === 'pending_check') findings.push({ type: 'kpi_check_needed', severity: 'info', msg: 'KPI需要检查' });
  if (obs.budget_usage > 80) findings.push({ type: 'budget_high', severity: 'warning', msg: '预算使用超80%' });
  if (obs.pending_approvals > 0) findings.push({ type: 'approvals_pending', severity: 'info', msg: '有待审批项' });
  
  var recommendedActions = [];
  if (findings.length > 0) recommendedActions.push('generate_audit_mission');
  
  return {
    success: true,
    findings: findings,
    recommended: recommendedActions,
    risk_level: findings.some(function(f) { return f.severity === 'danger'; }) ? 'high' : findings.length > 2 ? 'medium' : 'low',
    timestamp: new Date().toISOString()
  };
}

// ─── Strategy Integration ─────────────────────────────────

function generateStrategy(analysis) {
  var strategies = [];
  var riskLevel = analysis.risk_level || 'low';

  if (riskLevel === 'high') {
    strategies.push({ type: 'risk_reduction', priority: 'high', goal: '降低系统风险' });
  } else if (riskLevel === 'medium') {
    strategies.push({ type: 'efficiency', priority: 'medium', goal: '优化运营效率' });
  } else {
    strategies.push({ type: 'growth', priority: 'normal', goal: '持续增长' });
  }

  return { success: true, strategies: strategies, timestamp: new Date().toISOString() };
}

// ─── Board Review (simulated) ─────────────────────────────

function boardReview(proposal) {
  var members = ['CEO Agent', 'COO Agent', 'CTO Agent', 'CMO Agent', 'CFO Agent'];
  var votes = {};
  var approved = true;
  
  members.forEach(function(m) {
    var approves = true;
    // CFO blocks if budget impact too high
    if (m === 'CFO Agent' && proposal.budget_impact > MAX_BUDGET_IMPACT) approves = false;
    // CTO blocks if involves forbidden actions
    if (m === 'CTO Agent' && FORBIDDEN_AUTO.some(function(a) { return (proposal.text || '').indexOf(a) !== -1; })) approves = false;
    votes[m] = approves ? 'approve' : 'reject';
    if (!approves) approved = false;
  });

  return {
    success: true,
    approved: approved,
    votes: votes,
    requires_human: !approved,
    decision: approved ? 'approved' : 'requires_human_review',
    timestamp: new Date().toISOString()
  };
}

// ─── Mission Generation ───────────────────────────────────

function generateMissions(strategies, boardDecision) {
  if (!boardDecision.approved) return { success: false, reason: '董事会未批准', missions: [] };
  if (dailyStats.missions >= MAX_MISSIONS_PER_DAY) return { success: false, reason: '每日Mission上限', missions: [] };

  var missions = strategies.map(function(s, i) {
    return {
      mission_id: 'auto_' + Date.now().toString(36) + '_' + i,
      type: s.type,
      domain: 'general',
      goal: s.goal,
      priority: s.priority,
      auto_generated: true,
      requiresApproval: true,
      status: 'created'
    };
  });

  dailyStats.missions += missions.length;
  return { success: true, missions: missions, total: missions.length };
}

// ─── Main Loop Runner ─────────────────────────────────────

function createLoop(params) {
  var guardCheck = canStartLoop();
  if (!guardCheck.ok) return { success: false, reason: guardCheck.reason };

  var id = 'loop_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
  var loop = {
    loop_id: id,
    status: 'idle',
    stage: 'init',
    trigger: params.trigger || 'manual',
    stages: [],
    safety_limits: {
      max_loops_per_day: MAX_LOOPS_PER_DAY,
      max_missions_per_day: MAX_MISSIONS_PER_DAY,
      max_budget_impact: MAX_BUDGET_IMPACT,
      forbidden_auto: FORBIDDEN_AUTO
    },
    created_at: new Date().toISOString(),
    completed_at: null,
    observations: null,
    analysis: null,
    strategies: null,
    board_decision: null,
    missions: null,
    learning: null
  };

  loops[id] = loop;
  dailyStats.loops++;
  return { success: true, loop: loop };
}

function runLoop(loopId) {
  var loop = loops[loopId];
  if (!loop) return { success: false, error: 'loop not found' };
  if (loop.status === 'completed' || loop.status === 'blocked') return { success: false, error: 'loop already finished' };

  try {
    // Stage 1: Observe
    loop.status = 'observing'; loop.stage = 'observe';
    loop.observations = observe();
    loop.stages.push({ stage: 'observe', result: 'ok', timestamp: new Date().toISOString() });

    // Stage 2: Analyze
    loop.status = 'analyzing'; loop.stage = 'analyze';
    loop.analysis = analyze(loop.observations.observations);
    loop.stages.push({ stage: 'analyze', findings: loop.analysis.findings.length, timestamp: new Date().toISOString() });

    // Stage 3: Strategy
    loop.status = 'planning'; loop.stage = 'strategy';
    loop.strategies = generateStrategy(loop.analysis);
    loop.stages.push({ stage: 'strategy', count: loop.strategies.strategies.length, timestamp: new Date().toISOString() });

    // Stage 4: Board Review
    loop.status = 'board_review'; loop.stage = 'board';
    loop.board_decision = boardReview({ text: 'auto_loop', budget_impact: 0 });
    loop.stages.push({ stage: 'board', approved: loop.board_decision.approved, timestamp: new Date().toISOString() });

    // Stage 5: Execute (generate missions)
    loop.status = 'executing'; loop.stage = 'execute';
    loop.missions = generateMissions(loop.strategies.strategies, loop.board_decision);
    loop.stages.push({ stage: 'execute', missions: loop.missions.total || 0, timestamp: new Date().toISOString() });

    // Stage 6: Learn
    loop.status = 'learning'; loop.stage = 'learn';
    loop.learning = { summary: 'Loop completed. Findings: ' + loop.analysis.findings.length + ', Strategies: ' + loop.strategies.strategies.length, actions_taken: loop.missions.success ? 'missions generated' : 'blocked by board', timestamp: new Date().toISOString() };
    loop.stages.push({ stage: 'learn', timestamp: new Date().toISOString() });

    // Complete
    loop.status = 'completed'; loop.completed_at = new Date().toISOString();
    return { success: true, loop: loop };
  } catch (e) {
    loop.status = 'blocked';
    return { success: false, error: e.message, loop: loop };
  }
}

function getLoop(id) { return loops[id] ? { success: true, loop: loops[id] } : { success: false }; }
function listLoops() {
  var l = Object.values(loops);
  l.sort(function(a, b) { return b.created_at.localeCompare(a.created_at); });
  return { success: true, loops: l, total: l.length, daily_stats: dailyStats };
}

function blockLoop(id) {
  var loop = loops[id];
  if (!loop) return { success: false };
  loop.status = 'blocked';
  return { success: true, loop: loop };
}

// ─── Export ───────────────────────────────────────────────

module.exports = {
  createLoop, runLoop, getLoop, listLoops, blockLoop,
  observe, analyze, generateStrategy, boardReview, generateMissions,
  detectTriggers, canStartLoop,
  STATES, STATE_TRANSITIONS,
  MAX_LOOPS_PER_DAY, MAX_MISSIONS_PER_DAY, MAX_BUDGET_IMPACT,
  FORBIDDEN_AUTO
};
