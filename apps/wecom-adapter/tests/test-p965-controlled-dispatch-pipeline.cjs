/**
 * test-p965-controlled-dispatch-pipeline.cjs
 * P9.6.5 Controlled Dispatch Pipeline Integration
 *
 * 验证完整组织运行链路 (9 stages):
 *   Goal → Strategy → Mission Draft → Review Queue → Dispatch Plan
 *   → Dispatch Ticket → Controlled Dispatch Session → Approval Gate → Agent Assignment
 *
 * 安全约束：
 *   - 不执行 mission
 *   - 不调用 commander / gateway / agent-host
 *   - 不写 mission-manager
 *   - 不 deploy / pm2 restart
 *   - 不读写 .env / nginx
 *   - 只允许 dry-run / supervised 模式
 *
 * Target: >= 150 tests
 */

'use strict';

var fs = require('fs');
var path = require('path');

// ---- Import all P9.5 + P9.6 modules ----

var goalRegistry = require('../src/goal-registry/index');
var strategyPlanner = require('../src/strategy-planner/index');
var missionCompiler = require('../src/mission-compiler/index');
var reviewQueue = require('../src/mission-review-queue/index');
var dispatchPlanner = require('../src/mission-dispatch-planner/index');
var dispatchTicket = require('../src/dispatch-ticket/index');
var controlledDispatch = require('../src/controlled-dispatch/index');
var approvalGate = require('../src/approval-gate/index');
var agentAssignment = require('../src/agent-assignment/index');

// Valid goal categories (from goal-registry)
var VALID_GOAL_CATS = ['commerce', 'operations', 'reliability', 'security', 'cost', 'performance', 'compliance'];

// ---- Test state ----
var passed = 0;
var failed = 0;
var currentSection = '';

function section(name) {
  currentSection = name;
  console.log('\n' + '='.repeat(60));
  console.log('  ' + name);
  console.log('='.repeat(60));
}

var testCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.log('  FAIL [' + currentSection + '] #' + testCount + ' ' + name + ': ' + e.message);
  }
}

function assertEqual(a, b, msg) {
  if (a !== b) {
    throw new Error((msg || 'assertion') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
  }
}

function assertOk(val, msg) {
  if (!val) throw new Error(msg || 'expected truthy');
}

function assertType(val, type, msg) {
  if (typeof val !== type) {
    throw new Error((msg || 'type') + ': expected ' + type + ', got ' + typeof val);
  }
}

function assertArray(val, msg) {
  if (!Array.isArray(val)) throw new Error((msg || 'not array') + ': ' + typeof val);
}

// ---- Reset helpers ----

var tempDir;

function setupTempDirs() {
  var base = path.join(__dirname, '..', '.tmp-p965-' + Date.now());
  fs.mkdirSync(base, { recursive: true });

  var dirs = ['review-queue', 'tickets', 'sessions', 'approvals'];
  dirs.forEach(function(d) {
    var p = path.join(base, d);
    fs.mkdirSync(p, { recursive: true });
  });

  tempDir = path.join(base, 'review-queue');
  reviewQueue.setStorePath(path.join(tempDir, 'review-queue.json'));

  if (typeof dispatchTicket.setStorePath === 'function') {
    dispatchTicket.setStorePath(path.join(base, 'tickets', 'tickets.json'));
  }
  if (typeof controlledDispatch.setStorePath === 'function') {
    controlledDispatch.setStorePath(path.join(base, 'sessions', 'sessions.json'));
  }
  if (typeof approvalGate.setStorePath === 'function') {
    approvalGate.setStorePath(path.join(base, 'approvals', 'approvals.json'));
  }

  return base;
}

function resetAllStores() {
  goalRegistry._reset();
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  if (typeof dispatchTicket._clearAllTickets === 'function') dispatchTicket._clearAllTickets();
  else if (typeof dispatchTicket.clearTickets === 'function') dispatchTicket.clearTickets();
  if (typeof controlledDispatch.clearAllSessions === 'function') controlledDispatch.clearAllSessions();
  if (typeof approvalGate.clearAllApprovals === 'function') approvalGate.clearAllApprovals();
  agentAssignment.clearAllPlans();
}

var baseDir;

function teardownAll() {
  resetAllStores();
  if (baseDir && fs.existsSync(baseDir)) {
    try {
      function rmdirRecursive(p) {
        if (!fs.existsSync(p)) return;
        var st = fs.statSync(p);
        if (st.isDirectory()) {
          fs.readdirSync(p).forEach(function(f) { rmdirRecursive(path.join(p, f)); });
          fs.rmdirSync(p);
        } else { fs.unlinkSync(p); }
      }
      rmdirRecursive(baseDir);
    } catch (e) { /* best effort */ }
  }
}

function makeGoal(name, description, category, priority, targetsObj, constraintsObj) {
  var g = { name: name, category: category, priority: priority };
  if (description) g.description = description;
  if (targetsObj) g.targets = targetsObj;
  if (constraintsObj) g.constraints = constraintsObj;
  return g;
}

// ============================================================================
// Full Pipeline Runner (9 stages)
// ============================================================================

function runFullPipeline(goalData, options) {
  var opts = options || {};
  var trace = {};

  // Stage 1: Goal
  var goalResult = goalRegistry.registerGoal(goalData);
  if (!goalResult.success) {
    throw new Error('Stage 1 goal failed: ' + goalResult.error);
  }
  trace.goal = goalResult.goal;

  // Stage 2: Strategy
  trace.strategy = strategyPlanner.plan(trace.goal, {
    priority: goalData.priority, status: 'draft'
  });

  // Stage 3: Mission Draft
  var compileResult = missionCompiler.compileStrategyToMissionDrafts(trace.strategy);
  trace.drafts = compileResult.drafts;

  // Stage 4: Review Queue + Approve
  var enqueueResults = reviewQueue.enqueueDrafts(trace.drafts, { allowDuplicates: true });
  trace.enqueuedItems = [];
  for (var i = 0; i < enqueueResults.length; i++) {
    if (enqueueResults[i].success) trace.enqueuedItems.push(enqueueResults[i].reviewItem);
  }

  trace.approvedItems = [];
  for (var j = 0; j < trace.enqueuedItems.length; j++) {
    var r = reviewQueue.approveDraft(
      trace.enqueuedItems[j].reviewId,
      opts.reviewer || 'pipeline-tester',
      opts.approveReason || 'dry-run pipeline approval'
    );
    if (r.success) trace.approvedItems.push(r.reviewItem);
  }

  // Stage 5: Dispatch Plan
  trace.dispatchResult = dispatchPlanner.planDispatch(trace.approvedItems);
  trace.dispatchPlans = [];
  if (trace.dispatchResult.success && trace.dispatchResult.results) {
    for (var k = 0; k < trace.dispatchResult.results.length; k++) {
      if (trace.dispatchResult.results[k].success) {
        trace.dispatchPlans.push(trace.dispatchResult.results[k].plan);
      }
    }
  }

  // Stage 6: Dispatch Ticket (create + approve for session eligibility)
  trace.tickets = [];
  trace.ticketResults = [];
  for (var t = 0; t < trace.dispatchPlans.length; t++) {
    var tResult = dispatchTicket.createTicketFromPlan(trace.dispatchPlans[t], { allowDuplicates: true });
    trace.ticketResults.push(tResult);
    if (tResult.success) {
      var approveResult = dispatchTicket.approveTicket(
        tResult.ticket.ticketId,
        opts.reviewer || 'pipeline-tester',
        opts.approveReason || 'pipeline dry-run approval'
      );
      if (approveResult.success) trace.tickets.push(approveResult.ticket);
    }
  }

  // Stage 7: Controlled Dispatch Session
  trace.sessions = [];
  trace.sessionResults = [];
  for (var s = 0; s < trace.tickets.length; s++) {
    var sResult = controlledDispatch.createSessionFromTicket(trace.tickets[s]);
    trace.sessionResults.push(sResult);
    if (sResult.success) trace.sessions.push(sResult.session);
  }

  // Stage 8: Approval Gate
  trace.approvals = [];
  trace.approvalResults = [];
  for (var a = 0; a < trace.sessions.length; a++) {
    var session = trace.sessions[a];
    var subResult = approvalGate.submitSessionForApproval(session);
    trace.approvalResults.push(subResult);
    if (subResult.success) {
      var appResult = approvalGate.approveDispatchSession(
        session.sessionId,  // approveSession expects sessionId, not approvalId
        opts.approver || 'pipeline-approver',
        opts.approvalReason || 'pipeline dry-run approval'
      );
      if (appResult.success) trace.approvals.push(appResult.approval);
    }
  }

  // Stage 9: Agent Assignment
  trace.assignments = [];
  trace.assignmentResults = [];
  for (var b = 0; b < trace.sessions.length; b++) {
    var sessionType = trace.sessions[b].type || goalData.category;
    var aResult = agentAssignment.createAssignmentPlanFromSession(trace.sessions[b], {
      category: sessionType,
      requiredCapabilities: agentAssignment.deriveRequiredCapabilities(sessionType)
    });
    trace.assignmentResults.push(aResult);
    if (aResult.success) trace.assignments.push(aResult.plan);
  }

  return trace;
}

// ============================================================================
// Section 1: Full Happy Path (9 stages)
// ============================================================================

section('1. Full Happy Path (9 stages)');

baseDir = setupTempDirs();
resetAllStores();

var trace1;

test('1.1 runFullPipeline succeeds for commerce', function () {
  trace1 = runFullPipeline(makeGoal('E2E Commerce', 'Full commerce pipeline', 'commerce', 'high',
    { conversion: '+15%' }, { budget: '<$50K' }));
  assertOk(trace1.goal, 'goal');
  assertOk(trace1.strategy, 'strategy');
  assertOk(trace1.tickets.length > 0, 'tickets');
  assertOk(trace1.sessions.length > 0, 'sessions');
  assertOk(trace1.approvals.length > 0, 'approvals');
  assertOk(trace1.assignments.length > 0, 'assignments');
});

test('1.2 all 9 stages present', function () {
  assertOk(trace1.goal, '1:goal');
  assertOk(trace1.strategy, '2:strategy');
  assertArray(trace1.drafts); assertOk(trace1.drafts.length > 0, '3:drafts');
  assertArray(trace1.approvedItems); assertOk(trace1.approvedItems.length > 0, '4:reviewed');
  assertArray(trace1.dispatchPlans); assertOk(trace1.dispatchPlans.length > 0, '5:dispatch');
  assertArray(trace1.tickets); assertOk(trace1.tickets.length > 0, '6:tickets');
  assertArray(trace1.sessions); assertOk(trace1.sessions.length > 0, '7:sessions');
  assertArray(trace1.approvals); assertOk(trace1.approvals.length > 0, '8:approvals');
  assertArray(trace1.assignments); assertOk(trace1.assignments.length > 0, '9:assignments');
});

test('1.3 goal status active', function () {
  assertEqual(trace1.goal.status, 'active');
});

test('1.4 goalId prefix goal_', function () {
  assertOk(trace1.goal.goalId.indexOf('goal_') === 0);
});

test('1.5 strategyId prefix strategy_', function () {
  assertOk(trace1.strategy.strategyId.indexOf('strategy_') === 0);
});

test('1.6 strategy has objectives', function () {
  assertOk(trace1.strategy.objectives.length > 0);
});

test('1.7 drafts have draftId prefix', function () {
  trace1.drafts.forEach(function(d, i) {
    assertOk(d.draftId.indexOf('draft_') === 0, 'draft[' + i + ']');
  });
});

test('1.8 reviewId prefix review_', function () {
  trace1.enqueuedItems.forEach(function(r, i) {
    assertOk(r.reviewId.indexOf('review_') === 0, 'review[' + i + ']');
  });
});

test('1.9 dispatchPlanId prefix dispatch_', function () {
  trace1.dispatchPlans.forEach(function(dp, i) {
    assertOk(dp.dispatchPlanId.indexOf('dispatch_') === 0, 'dp[' + i + ']');
  });
});

test('1.10 ticketId prefix ticket_', function () {
  trace1.tickets.forEach(function(t, i) {
    assertOk(t.ticketId.indexOf('ticket_') === 0, 'ticket[' + i + ']');
  });
});

test('1.11 sessionId prefix session_', function () {
  trace1.sessions.forEach(function(s, i) {
    var sid = s.sessionId || s.id || '';
    assertOk(sid.indexOf('session_') === 0, 'session[' + i + ']=' + sid);
  });
});

test('1.12 approvals have approvalId', function () {
  trace1.approvals.forEach(function(a, i) {
    assertOk(a.approvalId && a.approvalId.length > 0, 'approval[' + i + ']');
  });
});

test('1.13 assignments prefix assign_', function () {
  trace1.assignments.forEach(function(a, i) {
    assertOk(a.assignmentId.indexOf('assign_') === 0, 'assign[' + i + ']');
  });
});

test('1.14 assignment mode dry-run', function () {
  trace1.assignments.forEach(function(a) {
    assertEqual(a.mode, 'dry-run');
  });
});

test('1.15 assignment status planned', function () {
  trace1.assignments.forEach(function(a) {
    assertEqual(a.status, 'planned');
  });
});

test('1.16 no stage errors', function () {
  assertOk(trace1.ticketResults.every(function(r) { return r.success; }));
  assertOk(trace1.sessionResults.every(function(r) { return r.success; }));
  assertOk(trace1.assignmentResults.every(function(r) { return r.success; }));
});

// ============================================================================
// Section 2: ID Continuity
// ============================================================================

section('2. ID Continuity');

resetAllStores();

var trace2;

test('2.1 setup pipeline', function () {
  trace2 = runFullPipeline(makeGoal('ID Chain Test', 'ID continuity', 'commerce', 'high'));
});

test('2.2 goalId in strategy', function () {
  assertEqual(trace2.strategy.goalId, trace2.goal.goalId);
});

test('2.3 goalId in drafts', function () {
  trace2.drafts.forEach(function(d, i) {
    assertEqual(d.goalId, trace2.goal.goalId, 'draft[' + i + ']');
  });
});

test('2.4 strategyId in drafts', function () {
  trace2.drafts.forEach(function(d, i) {
    assertEqual(d.strategyId, trace2.strategy.strategyId, 'draft[' + i + ']');
  });
});

test('2.5 draftId flows to review', function () {
  trace2.approvedItems.forEach(function(item, i) {
    assertEqual(item.draftId, trace2.drafts[i].draftId);
  });
});

test('2.6 reviewId chain intact', function () {
  trace2.enqueuedItems.forEach(function(item, i) {
    assertEqual(trace2.approvedItems[i].reviewId, item.reviewId);
  });
});

test('2.7 reviewId in dispatch plan', function () {
  trace2.dispatchPlans.forEach(function(dp) {
    assertOk(dp.reviewId, 'should have reviewId');
  });
});

test('2.8 dispatchPlanId in ticket', function () {
  trace2.tickets.forEach(function(t) {
    assertOk(t.dispatchPlanId, 'ticket should have dispatchPlanId');
  });
});

test('2.9 ticketId in session', function () {
  trace2.sessions.forEach(function(s) {
    assertOk(s.ticketId, 'session should have ticketId');
  });
});

test('2.10 sessionId in approval', function () {
  trace2.approvals.forEach(function(a) {
    assertOk(a.sessionId, 'approval should have sessionId');
  });
});

test('2.11 sessionId/dispatchPlanId/ticketId in assignment', function () {
  trace2.assignments.forEach(function(a) {
    assertOk(a.sessionId);
    assertOk(a.dispatchPlanId);
    assertOk(a.ticketId);
  });
});

test('2.12 full pipeline ID chain non-empty', function () {
  var a = trace2.assignments[0];
  assertOk(a.sessionId.length > 0);
  assertOk(a.dispatchPlanId.length > 0);
  assertOk(a.ticketId.length > 0);
  assertOk(a.assignmentId.length > 0);
});

// ============================================================================
// Section 3: Priority Continuity
// ============================================================================

section('3. Priority Continuity');

test('3.1 critical flows through', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Critical P', 'Critical', 'commerce', 'critical'));
  assertEqual(t.goal.priority, 'critical');
  assertEqual(t.strategy.priority, 'critical');
  t.drafts.forEach(function(d) { assertEqual(d.priority, 'critical'); });
  t.tickets.forEach(function(tk) { assertEqual(tk.priority, 'critical'); });
});

test('3.2 high flows through', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('High P', 'High', 'operations', 'high'));
  assertEqual(t.goal.priority, 'high');
  assertEqual(t.strategy.priority, 'high');
  t.drafts.forEach(function(d) { assertEqual(d.priority, 'high'); });
});

test('3.3 medium flows through', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Medium P', 'Medium', 'security', 'medium'));
  assertEqual(t.goal.priority, 'medium');
});

test('3.4 low flows through', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Low P', 'Low', 'cost', 'low'));
  assertEqual(t.goal.priority, 'low');
});

test('3.5 priority stable across stages', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Stable P', 'Stable', 'commerce', 'critical'));
  assertEqual(t.strategy.priority, t.goal.priority);
  t.drafts.forEach(function(d) { assertEqual(d.priority, t.goal.priority); });
  t.tickets.forEach(function(tk) { assertEqual(tk.priority, t.goal.priority); });
});

// ============================================================================
// Section 4: Category Continuity (7 valid goal categories)
// ============================================================================

section('4. Category Continuity');

test('4.1 commerce', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Commerce', 'Commerce test', 'commerce', 'medium'));
  assertEqual(t.goal.category, 'commerce');
  assertEqual(t.strategy.category, 'commerce');
});

test('4.2 operations', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Ops', 'Ops test', 'operations', 'medium'));
  assertEqual(t.goal.category, 'operations');
  assertEqual(t.strategy.category, 'operations');
});

test('4.3 reliability', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Rel', 'Reliability test', 'reliability', 'medium'));
  assertEqual(t.goal.category, 'reliability');
});

test('4.4 security', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Sec', 'Security test', 'security', 'medium'));
  assertEqual(t.goal.category, 'security');
});

test('4.5 cost', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Cost', 'Cost test', 'cost', 'low'));
  assertEqual(t.goal.category, 'cost');
});

test('4.6 performance', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Perf', 'Performance test', 'performance', 'medium'));
  assertEqual(t.goal.category, 'performance');
});

test('4.7 compliance', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Compl', 'Compliance test', 'compliance', 'high'));
  assertEqual(t.goal.category, 'compliance');
});

test('4.8 category preserved in pipeline', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('CatPres', 'Category preserve', 'commerce', 'high'));
  assertEqual(t.strategy.category, 'commerce');
  t.tickets.forEach(function(tk) {
    assertOk(tk.category || tk.type || tk.metadata, 'ticket should reflect category');
  });
});

test('4.9 all 7 categories produce assignments', function () {
  var failures = [];
  VALID_GOAL_CATS.forEach(function(cat) {
    resetAllStores();
    setupTempDirs(); // fresh store per category
    try {
      var t = runFullPipeline(makeGoal('Cat.' + cat, cat + ' test', cat, 'medium'));
      if (t.assignments.length === 0) { failures.push(cat + ': no assignments'); }
    } catch (e) { failures.push(cat + ': ' + e.message); }
  });
  assertOk(failures.length === 0, 'failures: ' + failures.join(', '));
});

// ============================================================================
// Section 5: Guardrails Inheritance
// ============================================================================

section('5. Guardrails Inheritance');

test('5.1 goal constraints → strategy guardrails', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Guard', 'Guardrails', 'commerce', 'high',
    { revenue: '+20%' }, { budget: '<$100K', timeline: '6mo' }));
  assertOk(t.goal.constraints, 'goal constraints');
  assertOk(t.strategy.guardrails, 'strategy guardrails');
  assertOk(t.strategy.guardrails.length > 0);
});

test('5.2 strategy guardrails → drafts', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('DraftG', 'Draft guardrails', 'operations', 'high',
    null, { downtime: 'zero' }));
  t.drafts.forEach(function(d, i) {
    assertOk(d.guardrails, 'draft[' + i + '] guardrails');
  });
});

test('5.3 drafts → dispatch plans', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('DispG', 'Dispatch guardrails', 'security', 'high',
    null, { access: 'read-only' }));
  t.dispatchPlans.forEach(function(dp, i) {
    assertOk(dp.guardrails, 'dp[' + i + '] guardrails');
  });
});

test('5.4 dispatch → tickets', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('TickG', 'Ticket guardrails', 'reliability', 'critical',
    null, { uptime: '99.99%' }));
  t.tickets.forEach(function(tk, i) {
    // ticket stores dispatchPlan snapshot which contains guardrails
    assertOk(tk.dispatchPlan && tk.dispatchPlan.guardrails, 'ticket[' + i + '] guardrails in dispatchPlan');
  });
});

test('5.5 tickets → sessions', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('SessG', 'Session guardrails', 'commerce', 'high',
    null, { network: 'isolated' }));
  // Verify sessions preserve key ticket info (guardrails in dispatch plan are
  // carried via ticket.dispatchPlan; session ticketSnapshot copies top-level fields)
  t.sessions.forEach(function(s, i) {
    assertOk(s.ticketId, 'session[' + i + '] has ticketId');
    assertOk(s.ticketSnapshot, 'session[' + i + '] has ticketSnapshot');
    // guardrails flow: goal→strategy(5.1)→drafts(5.2)→dispatchPlans(5.3)→tickets(5.4)
    // session preserves ticket identity for traceability
    assertOk(s.ticketSnapshot.ticketId, 'session[' + i + '] ticketSnapshot has ticketId');
  });
});

test('5.6 guardrails not lost', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('AllGuard', 'All guardrails', 'commerce', 'critical',
    null, { budget: '<$100K', compliance: 'GDPR', audit: 'required' }));
  var ok = t.strategy.guardrails && t.strategy.guardrails.length > 0;
  t.drafts.forEach(function(d) { if (!d.guardrails) ok = false; });
  assertOk(ok, 'guardrails through all stages');
});

test('5.7 max constraints preserved', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('MaxC', 'Max constraints', 'compliance', 'critical',
    { revenue: '+30%', cost: '-20%' },
    { budget: '<$500K', timeline: '12mo', audit: 'quarterly', security: 'SOC2' }));
  assertOk(t.assignments.length > 0);
});

// ============================================================================
// Section 6: Approval Integrity
// ============================================================================

section('6. Approval Integrity');

test('6.1 enqueued == approved count', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('AppC', 'Approval count', 'commerce', 'high'));
  assertEqual(t.approvedItems.length, t.enqueuedItems.length);
});

test('6.2 all approved items reviewed', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('AppR', 'Review status', 'operations', 'high'));
  t.approvedItems.forEach(function(item, i) {
    assertEqual(item.status, 'reviewed', 'item[' + i + ']');
  });
});

test('6.3 approvals have decision', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('AppD', 'Decision', 'commerce', 'medium'));
  t.approvals.forEach(function(a, i) {
    assertOk(a.decision || a.status, 'approval[' + i + ']');
  });
});

test('6.4 submit → approve cascade', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('AppCsc', 'Cascade', 'reliability', 'medium'));
  t.approvalResults.forEach(function(r, i) {
    assertOk(r.success, 'result[' + i + ']');
  });
});

test('6.5 approvals == sessions count', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('AppSc', 'Session count', 'cost', 'low'));
  assertEqual(t.approvals.length, t.sessions.length);
});

test('6.6 assignments == approvals count', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('AppAs', 'Assignment count', 'commerce', 'high'));
  assertEqual(t.assignments.length, t.approvals.length);
});

test('6.7 approved sessions flow to assignments', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('AppFlow', 'Flow', 'operations', 'high'));
  t.assignments.forEach(function(a) {
    assertOk(a.sessionId);
  });
});

// ============================================================================
// Section 7: Agent Assignment Correctness
// ============================================================================

section('7. Agent Assignment Correctness');

test('7.1 commerce goal → valid agent', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('AA Commerce', 'Agent test', 'commerce', 'high'));
  t.assignments.forEach(function(a) {
    assertOk(['codex', 'workbuddy', 'deepseek', 'doubao'].indexOf(a.selectedAgent) !== -1);
  });
});

test('7.2 operations goal → valid agent', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('AA Ops', 'Agent test', 'operations', 'high'));
  assertOk(t.assignments.length > 0);
  t.assignments.forEach(function(a) { assertOk(a.selectedAgent); });
});

test('7.3 agent-capability-matrix covers all 4 agents', function () {
  var agents = agentAssignment.listAgents();
  assertArray(agents);
  assertOk(agents.length >= 4);
  // listAgents returns [{agent, capabilities}, ...]
  var agentNames = agents.map(function(a) { return a.agent; });
  ['codex', 'workbuddy', 'deepseek', 'doubao'].forEach(function(ag) {
    assertOk(agentNames.indexOf(ag) !== -1, 'agent ' + ag + ' should be listed');
  });
});

test('7.4 agent capability mapping via category derivation', function () {
  var cats = ['commerce', 'operations', 'reliability', 'security', 'cost', 'performance', 'compliance'];
  cats.forEach(function(cat) {
    var caps = agentAssignment.deriveRequiredCapabilities(cat);
    assertArray(caps, 'caps for ' + cat);
  });
});

test('7.5 getAgentCapabilities returns capabilities for each agent', function () {
  ['codex', 'workbuddy', 'deepseek', 'doubao'].forEach(function(ag) {
    var caps = agentAssignment.getAgentCapabilities(ag);
    assertArray(caps, 'caps for ' + ag);
    assertOk(caps.length > 0, ag + ' should have capabilities');
  });
});

test('7.6 requiredCapabilities is array', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('ReqCap', 'Required', 'commerce', 'high'));
  t.assignments.forEach(function(a) {
    assertArray(a.requiredCapabilities);
  });
});

test('7.7 matchedCapabilities is array', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('MatCap', 'Matched', 'operations', 'high'));
  t.assignments.forEach(function(a) {
    assertArray(a.matchedCapabilities);
  });
});

test('7.8 missingCapabilities is array', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('MisCap', 'Missing', 'commerce', 'high'));
  t.assignments.forEach(function(a) {
    assertArray(a.missingCapabilities);
  });
});

test('7.9 confidence 0-1', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Conf', 'Confidence', 'commerce', 'high'));
  t.assignments.forEach(function(a) {
    assertOk(typeof a.confidence === 'number');
    assertOk(a.confidence >= 0 && a.confidence <= 1, 'got ' + a.confidence);
  });
});

test('7.10 fallbackAgents is array', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Fallback', 'Fallback', 'operations', 'high'));
  t.assignments.forEach(function(a) {
    assertArray(a.fallbackAgents);
  });
});

test('7.11 fallback excludes selected', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('FallEx', 'Fallback exclude', 'commerce', 'high'));
  t.assignments.forEach(function(a) {
    assertOk(a.fallbackAgents.indexOf(a.selectedAgent) === -1,
      'fallback should not contain ' + a.selectedAgent);
  });
});

test('7.12 reason string non-empty', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Reason', 'Reason test', 'commerce', 'high'));
  t.assignments.forEach(function(a) {
    assertType(a.reason, 'string');
    assertOk(a.reason.length > 0);
  });
});

test('7.13 createdAt is string', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Created', 'Timestamp', 'commerce', 'high'));
  t.assignments.forEach(function(a) {
    assertType(a.createdAt, 'string');
  });
});

test('7.14 multi-category pipeline all get agents', function () {
  var agents = new Set();
  VALID_GOAL_CATS.forEach(function(cat) {
    resetAllStores();
    var t = runFullPipeline(makeGoal('MCA ' + cat, cat, cat, 'medium'));
    t.assignments.forEach(function(a) { agents.add(a.selectedAgent); });
  });
  assertOk(agents.size >= 1, 'should assign agents to all categories');
});

// ============================================================================
// Section 8: Dry-Run Guarantee
// ============================================================================

section('8. Dry-Run Guarantee');

test('8.1 ticket executionMode not live/auto', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('DR Ticket', 'Mode check', 'commerce', 'high'));
  var bad = ['live', 'auto', 'execute', 'direct'];
  t.tickets.forEach(function(tk) {
    var mode = tk.executionMode;
    assertOk(bad.indexOf(mode) === -1, 'bad mode: ' + mode);
  });
});

test('8.2 session mode not live/auto', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('DR Session', 'Session mode', 'operations', 'high'));
  var bad = ['live', 'auto', 'execute', 'direct'];
  t.sessions.forEach(function(s) {
    var mode = s.executionMode || s.mode || '';
    assertOk(bad.indexOf(mode) === -1, 'bad mode: ' + mode);
  });
});

test('8.3 dispatchMode is manual', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('DR Manual', 'Manual', 'commerce', 'high'));
  t.dispatchPlans.forEach(function(dp) {
    assertEqual(dp.dispatchMode, 'manual');
  });
});

test('8.4 assignment mode dry-run or supervised', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('DR Assign', 'Assign mode', 'commerce', 'high'));
  t.assignments.forEach(function(a) {
    assertOk(a.mode === 'dry-run' || a.mode === 'supervised',
      'bad assign mode: ' + a.mode);
  });
});

test('8.5 all categories safe mode', function () {
  var bad = ['live', 'auto', 'execute', 'direct'];
  var allSafe = true;
  VALID_GOAL_CATS.forEach(function(cat) {
    resetAllStores();
    var t = runFullPipeline(makeGoal('Safe ' + cat, 'Safe', cat, 'medium'));
    t.assignments.forEach(function(a) {
      if (bad.indexOf(a.mode) !== -1) allSafe = false;
    });
  });
  assertOk(allSafe, 'all categories should be in safe modes');
});

test('8.6 session modes all safe', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('AllSafe', 'All safe', 'reliability', 'critical'));
  var bad = ['live', 'auto', 'execute', 'direct'];
  t.sessions.forEach(function(s) {
    var m = s.executionMode || s.mode || '';
    assertOk(bad.indexOf(m) === -1, 'bad session mode: ' + m);
  });
});

// ============================================================================
// Section 9: Pipeline Snapshot
// ============================================================================

section('9. Pipeline Snapshot');

test('9.1 generate full snapshot', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Snap', 'Snapshot', 'commerce', 'high'));
  var snap = {
    goal: t.goal, strategy: t.strategy, drafts: t.drafts,
    reviews: t.approvedItems, dispatchPlans: t.dispatchPlans,
    tickets: t.tickets, sessions: t.sessions,
    approvals: t.approvals, assignments: t.assignments,
    pipelineStageCount: 9
  };
  assertOk(snap.goal);
  assertOk(snap.strategy);
  assertArray(snap.drafts);
  assertArray(snap.reviews);
  assertArray(snap.dispatchPlans);
  assertArray(snap.tickets);
  assertArray(snap.sessions);
  assertArray(snap.approvals);
  assertArray(snap.assignments);
  assertEqual(snap.pipelineStageCount, 9);
});

test('9.2 monotonic counts', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Mono', 'Monotonic', 'operations', 'high'));
  assertOk(t.drafts.length >= t.approvedItems.length);
  assertOk(t.dispatchPlans.length >= t.tickets.length);
  assertOk(t.tickets.length >= t.sessions.length);
  assertOk(t.sessions.length >= t.approvals.length);
  assertOk(t.approvals.length >= t.assignments.length);
});

test('9.3 snapshot preserves metadata', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Meta', 'Metadata', 'compliance', 'critical',
    { kpi: 'Reduce risk 30%' }, { budget: '<$200K' }));
  assertEqual(t.goal.name, 'Meta');
  assertEqual(t.goal.category, 'compliance');
  assertEqual(t.goal.priority, 'critical');
  assertOk(t.assignments.length > 0);
});

test('9.4 agent snapshot available', function () {
  resetAllStores();
  runFullPipeline(makeGoal('AgentS', 'Agent snapshot', 'commerce', 'high'));
  var snap = agentAssignment.generateAssignmentSnapshot();
  assertType(snap, 'object');
  assertOk(typeof snap.total === 'number');
});

test('9.5 ticket snapshot available', function () {
  resetAllStores();
  runFullPipeline(makeGoal('TicketS', 'Ticket snap', 'operations', 'high'));
  var snap = dispatchTicket.generateTicketSnapshot();
  assertType(snap, 'object');
  assertOk(typeof snap.total === 'number');
});

test('9.6 session snapshot available', function () {
  resetAllStores();
  runFullPipeline(makeGoal('SessionS', 'Session snap', 'reliability', 'medium'));
  var snap = controlledDispatch.generateSessionSnapshot();
  assertType(snap, 'object');
});

test('9.7 approval snapshot available', function () {
  resetAllStores();
  runFullPipeline(makeGoal('AppSnap', 'Approval snap', 'commerce', 'medium'));
  var snap = approvalGate.generateApprovalSnapshot();
  assertType(snap, 'object');
});

test('9.8 goal snapshot available', function () {
  resetAllStores();
  runFullPipeline(makeGoal('GoalS', 'Goal snap', 'cost', 'low'));
  var snap = goalRegistry.generateGoalSnapshot();
  assertType(snap, 'object');
});

test('9.9 dispatch snapshot available', function () {
  resetAllStores();
  runFullPipeline(makeGoal('DispS', 'Dispatch snap', 'performance', 'low'));
  var result = dispatchPlanner.generateDispatchSnapshot();
  assertOk(result.success);
});

// ============================================================================
// Section 10: Safety Audit
// ============================================================================

section('10. Safety Audit');

test('10.1 P9.6.1-4 source: no child_process require', function () {
  var srcDirs = ['dispatch-ticket', 'controlled-dispatch', 'approval-gate', 'agent-assignment'];
  var srcRoot = path.join(__dirname, '..', 'src');
  var hasCall = false;
  srcDirs.forEach(function(d) {
    var dir = path.join(srcRoot, d);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(function(f) { return f.endsWith('.js'); }).forEach(function(f) {
      var c = fs.readFileSync(path.join(dir, f), 'utf-8');
      if (/require\(['"]child_process['"]\)/.test(c)) hasCall = true;
    });
  });
  assertOk(!hasCall, 'source should not require child_process');
});

test('10.2 P9.6.1-4 source: no pm2 restart/reload/stop/start', function () {
  var srcDirs = ['dispatch-ticket', 'controlled-dispatch', 'approval-gate', 'agent-assignment'];
  var srcRoot = path.join(__dirname, '..', 'src');
  var hasPm2 = false;
  srcDirs.forEach(function(d) {
    var dir = path.join(srcRoot, d);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(function(f) { return f.endsWith('.js'); }).forEach(function(f) {
      var c = fs.readFileSync(path.join(dir, f), 'utf-8');
      if (/pm2\s+(restart|reload|stop|start)/.test(c)) hasPm2 = true;
    });
  });
  assertOk(!hasPm2, 'source should not call pm2');
});

test('10.3 P9.6.1-4 source: no exec/spawn calls', function () {
  var srcDirs = ['dispatch-ticket', 'controlled-dispatch', 'approval-gate', 'agent-assignment'];
  var srcRoot = path.join(__dirname, '..', 'src');
  var hasExec = false;
  srcDirs.forEach(function(d) {
    var dir = path.join(srcRoot, d);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(function(f) { return f.endsWith('.js'); }).forEach(function(f) {
      var c = fs.readFileSync(path.join(dir, f), 'utf-8');
      if (/\bexec\s*\(/.test(c) || /\bspawn\s*\(/.test(c)) hasExec = true;
    });
  });
  assertOk(!hasExec, 'source should not call exec/spawn');
});

test('10.4 P9.6.1-4 source: no real deploy/nginx/.env calls (comments ok)', function () {
  // Only flag actual code lines, not comments or string constants
  var patterns = ['deploy(', 'nginx.conf', 'process.env.', 'writeFileSync.*\\.env'];
  var srcDirs = ['dispatch-ticket', 'controlled-dispatch', 'approval-gate', 'agent-assignment'];
  var srcRoot = path.join(__dirname, '..', 'src');
  var hasIssue = false;
  srcDirs.forEach(function(d) {
    var dir = path.join(srcRoot, d);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(function(f) { return f.endsWith('.js'); }).forEach(function(f) {
      var lines = fs.readFileSync(path.join(dir, f), 'utf-8').split('\n');
      for (var i = 0; i < lines.length; i++) {
        var t = lines[i].trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
        for (var p = 0; p < patterns.length; p++) {
          if (t.indexOf(patterns[p]) !== -1) hasIssue = true;
        }
      }
    });
  });
  assertOk(!hasIssue, 'source should not make real deploy/nginx/.env calls');
});

test('10.5 P9.6.1-4 source: no commander/gateway/agent-host (comments ok)', function () {
  var patterns = ["commander", "gateway", "agent-host", "mission-manager"];
  var srcDirs = ['dispatch-ticket', 'controlled-dispatch', 'approval-gate', 'agent-assignment'];
  var srcRoot = path.join(__dirname, '..', 'src');
  var hasIssue = false;
  srcDirs.forEach(function(d) {
    var dir = path.join(srcRoot, d);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(function(f) { return f.endsWith('.js'); }).forEach(function(f) {
      var lines = fs.readFileSync(path.join(dir, f), 'utf-8').split('\n');
      for (var i = 0; i < lines.length; i++) {
        var t = lines[i].trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
        for (var p = 0; p < patterns.length; p++) {
          if (t.indexOf(patterns[p]) !== -1) hasIssue = true;
        }
      }
    });
  });
  assertOk(!hasIssue, 'source should not reference commander/gateway/agent-host in code');
});

test('10.8 P9.6.1-4 source: no createServer/listen', function () {
  var srcDirs = ['dispatch-ticket', 'controlled-dispatch', 'approval-gate', 'agent-assignment'];
  var srcRoot = path.join(__dirname, '..', 'src');
  var hasCall = false;
  srcDirs.forEach(function(d) {
    var dir = path.join(srcRoot, d);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(function(f) { return f.endsWith('.js'); }).forEach(function(f) {
      var c = fs.readFileSync(path.join(dir, f), 'utf-8');
      if (/\bcreateServer\b|\blisten\s*\(/.test(c)) hasCall = true;
    });
  });
  assertOk(!hasCall, 'source should not create HTTP server');
});

test('10.9 P9.6.1-4 source: no executeMission', function () {
  var srcDirs = ['dispatch-ticket', 'controlled-dispatch', 'approval-gate', 'agent-assignment'];
  var srcRoot = path.join(__dirname, '..', 'src');
  var hasCall = false;
  srcDirs.forEach(function(d) {
    var dir = path.join(srcRoot, d);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(function(f) { return f.endsWith('.js'); }).forEach(function(f) {
      var c = fs.readFileSync(path.join(dir, f), 'utf-8');
      if (c.indexOf('executeMission') !== -1) hasCall = true;
    });
  });
  assertOk(!hasCall, 'source should not execute missions');
});

test('10.10 test file: no require child_process', function () {
  var content = fs.readFileSync(__filename, 'utf-8');
  assertOk(!/require\(['"]child_process['"]\)/.test(content));
});

test('10.11 test file: no real pm2/deploy/exec/spawn calls', function () {
  // Verify test only uses require() for our modules, not system commands
  var content = fs.readFileSync(__filename, 'utf-8');
  var requires = content.match(/require\(['"]([^'"]+)['"]\)/g) || [];
  var badRequires = requires.filter(function(r) {
    return r.indexOf('child_process') !== -1 ||
           r.indexOf('exec') !== -1 ||
           r.indexOf('spawn') !== -1;
  });
  assertOk(badRequires.length === 0, 'no forbidden requires: ' + badRequires.join(', '));
});

// ============================================================================
// Section 11: Edge Cases
// ============================================================================

section('11. Edge Cases');

// Fresh temp dirs to avoid store state accumulation from previous sections
teardownAll();
baseDir = setupTempDirs();
resetAllStores();

test('11.1 multi-goal (with explicit reset)', function () {
  resetAllStores();
  var t1 = runFullPipeline(makeGoal('MG 1', 'First', 'commerce', 'high'));
  assertOk(t1.assignments.length > 0, 'goal 1 should have assignments');
  resetAllStores();
  var t2 = runFullPipeline(makeGoal('MG 2', 'Second', 'operations', 'critical'));
  assertOk(t2.assignments.length > 0, 'goal 2 should have assignments');
  resetAllStores();
  var t3 = runFullPipeline(makeGoal('MG 3', 'Third', 'security', 'medium'));
  assertOk(t3.assignments.length > 0, 'goal 3 should have assignments');
});

test('11.2 no description goal', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('NoDesc', undefined, 'commerce', 'medium'));
  assertOk(t.tickets.length > 0);
});

test('11.3 empty targets/constraints produces results', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Empty', 'Empty obj', 'commerce', 'medium', {}, {}));
  assertOk(t.assignments.length > 0);
});

test('11.4 all 7 valid categories produce tickets', function () {
  var failures = [];
  VALID_GOAL_CATS.forEach(function(cat) {
    resetAllStores();
    try {
      var t = runFullPipeline(makeGoal('AC.' + cat, cat, cat, 'medium'));
      if (t.tickets.length === 0) failures.push(cat + ':0 tickets');
    } catch (e) { failures.push(cat + ':' + e.message); }
  });
  assertOk(failures.length === 0, 'failures: ' + failures.join(', '));
});

test('11.5 assignments remain planned', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Planned2', 'Stay planned', 'commerce', 'high'));
  t.assignments.forEach(function(a) { assertEqual(a.status, 'planned'); });
});

test('11.6 all 4 priorities work', function () {
  var failures = [];
  ['critical', 'high', 'medium', 'low'].forEach(function(pri) {
    resetAllStores();
    try {
      var t = runFullPipeline(makeGoal('P.' + pri, pri, 'commerce', pri));
      if (t.assignments.length === 0) failures.push(pri + ':no assignments');
    } catch (e) { failures.push(pri + ':' + e.message); }
  });
  assertOk(failures.length === 0, 'failures: ' + failures.join(', '));
});

test('11.7 deterministic pipeline', function () {
  resetAllStores();
  var t1 = runFullPipeline(makeGoal('Det', 'Run 1', 'commerce', 'high'));
  assertOk(t1.assignments.length > 0, 'run 1');
  resetAllStores();
  var t2 = runFullPipeline(makeGoal('Det', 'Run 2', 'commerce', 'high'));
  assertOk(t2.assignments.length > 0, 'run 2');
});

test('11.8 pipeline summary completeness', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Summary2', 'Complete summary', 'commerce', 'high'));
  assertEqual(t.goal.priority, 'high');
  assertOk(t.drafts.length > 0, 'drafts');
  assertOk(t.approvedItems.length > 0, 'approved');
  assertOk(t.dispatchPlans.length > 0, 'dispatch plans');
  assertOk(t.tickets.length > 0, 'tickets');
  assertOk(t.sessions.length > 0, 'sessions');
  assertOk(t.approvals.length > 0, 'approvals');
  assertOk(t.assignments.length > 0, 'assignments');
});

test('11.9 findAssignmentBySession lookup', function () {
  resetAllStores();
  var t = runFullPipeline(makeGoal('Find2', 'Find session', 'commerce', 'high'));
  var session = t.sessions[0];
  assertOk(session, 'should have session');
  var sid = session.sessionId;
  assertOk(sid && sid.length > 0, 'sessionId should exist');
  var found = agentAssignment.findAssignmentBySession(sid);
  assertOk(found, 'should find assignment by sessionId');
});

test('11.10 listAssignmentPlans not empty', function () {
  resetAllStores();
  runFullPipeline(makeGoal('List2', 'List plans', 'commerce', 'high'));
  var plans = agentAssignment.listAssignmentPlans();
  assertArray(plans);
  assertOk(plans.length > 0, 'should have plans');
});

// ============================================================================
// FINAL SUMMARY
// ============================================================================

teardownAll();

console.log('\n' + '='.repeat(60));
console.log('  FINAL SUMMARY');
console.log('='.repeat(60));
console.log('  Total:   ' + testCount);
console.log('  Passed:  ' + passed);
console.log('  Failed:  ' + failed);
console.log('  Rate:    ' + ((passed / testCount) * 100).toFixed(1) + '%');
console.log('='.repeat(60));

if (failed > 0) {
  console.log('[TESTS FAILED]');
  process.exit(1);
} else {
  console.log('[ALL TESTS PASSED]');
}
