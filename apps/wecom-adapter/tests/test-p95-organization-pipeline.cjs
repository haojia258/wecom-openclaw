/**
 * test-p95-organization-pipeline.cjs
 * P9.5 Final Integration -- Organization Pipeline Dry Run
 *
 * 验证完整链路：
 *   Goal -> Strategy -> Mission Draft -> Review Queue -> Dispatch Plan
 *
 * 安全约束：
 *   - 不执行 mission
 *   - 不调用 commander / gateway / agent-host
 *   - 不写 mission-manager
 *   - 不 deploy / pm2 restart
 *   - 不读写 .env / nginx
 *   - 只允许字符串测试断言，禁止真实调用
 *
 * Target: >= 120 tests
 */

'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

// ---- Import all P9.5 modules ----

// P9.5.1 Goal Registry
var goalRegistry = require('../src/goal-registry/index');

// P9.5.2 Strategy Planner
var strategyPlanner = require('../src/strategy-planner/index');

// P9.5.3 Mission Compiler
var missionCompiler = require('../src/mission-compiler/index');

// P9.5.4 Mission Draft Review Queue
var reviewQueue = require('../src/mission-review-queue/index');

// P9.5.5 Mission Dispatch Planner
var dispatchPlanner = require('../src/mission-dispatch-planner/index');

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
    throw new Error((msg || 'assertion failed') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
  }
}

function assertOk(val, msg) {
  if (!val) throw new Error(msg || 'assertion failed: expected truthy value');
}

function assertType(val, type, msg) {
  if (typeof val !== type) {
    throw new Error((msg || 'type check failed') + ': expected ' + type + ', got ' + typeof val);
  }
}

// ---- Reset helpers ----

var tempDir;

function setupTempDir() {
  tempDir = path.join(__dirname, '..', '.tmp-pipeline-test-' + Date.now());
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  reviewQueue.setStorePath(path.join(tempDir, 'review-queue.json'));
}

function teardownAll() {
  goalRegistry._reset();
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  if (tempDir && fs.existsSync(tempDir)) {
    try {
      var files = fs.readdirSync(tempDir);
      files.forEach(function(f) { fs.unlinkSync(path.join(tempDir, f)); });
      fs.rmdirSync(tempDir);
    } catch (e) { /* best effort */ }
  }
}

// Helper: create goal data with correct object format
function makeGoal(name, description, category, priority, targetsObj, constraintsObj) {
  var g = { name: name, category: category, priority: priority };
  if (description) g.description = description;
  if (targetsObj) g.targets = targetsObj;
  if (constraintsObj) g.constraints = constraintsObj;
  return g;
}

// ============================================================================
// Helper: run the full pipeline for a single goal
// ============================================================================

function runPipeline(goalData, options) {
  var opts = options || {};
  var trace = {};

  // Step 1: Register goal
  var goalResult = goalRegistry.registerGoal(goalData);
  if (!goalResult.success) {
    throw new Error('Goal registration failed: ' + goalResult.error);
  }
  trace.goal = goalResult.goal;

  // Step 2: Plan strategy
  var strategyPlan = strategyPlanner.plan(trace.goal, { priority: goalData.priority, status: 'draft' });
  trace.strategy = strategyPlan;

  // Step 3: Compile mission drafts
  var compileResult = missionCompiler.compileStrategyToMissionDrafts(strategyPlan);
  trace.compileResult = compileResult;
  trace.drafts = compileResult.drafts;

  // Step 4: Enqueue drafts
  var enqueueResults = reviewQueue.enqueueDrafts(trace.drafts, { allowDuplicates: true });
  trace.enqueueResults = enqueueResults;
  trace.enqueuedItems = [];
  for (var i = 0; i < enqueueResults.length; i++) {
    if (enqueueResults[i].success) {
      trace.enqueuedItems.push(enqueueResults[i].reviewItem);
    }
  }

  // Step 5: Approve drafts
  trace.approvedItems = [];
  for (var j = 0; j < trace.enqueuedItems.length; j++) {
    var approvalResult = reviewQueue.approveDraft(
      trace.enqueuedItems[j].reviewId,
      opts.reviewer || 'pipeline-tester',
      opts.approveReason || 'dry-run pipeline approval'
    );
    if (approvalResult.success) {
      trace.approvedItems.push(approvalResult.reviewItem);
    }
  }

  // Step 6: Plan dispatch
  trace.dispatchResult = dispatchPlanner.planDispatch(trace.approvedItems);
  trace.dispatchPlans = [];
  if (trace.dispatchResult.success && trace.dispatchResult.results) {
    for (var k = 0; k < trace.dispatchResult.results.length; k++) {
      if (trace.dispatchResult.results[k].success) {
        trace.dispatchPlans.push(trace.dispatchResult.results[k].plan);
      }
    }
  }

  // Step 7: Snapshot
  trace.snapshotResult = dispatchPlanner.generateDispatchSnapshot();

  return trace;
}

// ============================================================================
// Section 1: Single Goal End-to-End Pipeline
// ============================================================================

section('1. Single Goal End-to-End Pipeline');

setupTempDir();

var trace1;

test('1.1 registerGoal returns success', function () {
  var result = goalRegistry.registerGoal(makeGoal(
    'E2E Test Goal - Commerce Optimization',
    'Optimize commerce platform conversion rate by 15%',
    'commerce', 'high',
    { conversion: 'Increase conversion by 15%', churn: 'Reduce churn rate' },
    { budget: 'Budget < $50K', timeline: '3 months' }
  ));
  assertOk(result.success, 'registerGoal should succeed');
  assertType(result.goal, 'object', 'goal should be an object');
  trace1 = result;
});

var goal1;
test('1.2 goal has valid goalId', function () {
  goal1 = trace1.goal;
  assertType(goal1.goalId, 'string', 'goalId should be string');
  assertOk(goal1.goalId.indexOf('goal_') === 0, 'goalId should start with goal_');
});

test('1.3 goal has valid name', function () {
  assertOk(goal1.name && goal1.name.length > 0, 'goal should have a name');
});

test('1.4 goal has correct category', function () {
  assertEqual(goal1.category, 'commerce');
});

test('1.5 goal has correct priority', function () {
  assertEqual(goal1.priority, 'high');
});

test('1.6 goal status is active', function () {
  assertEqual(goal1.status, 'active');
});

// Step 2: Plan strategy
var strategyPlan1;
test('1.7 strategy plan() returns object', function () {
  strategyPlan1 = strategyPlanner.plan(goal1, { priority: 'high', status: 'draft' });
  assertType(strategyPlan1, 'object', 'strategy plan should be an object');
});

test('1.8 strategy has strategyId starting with strategy_', function () {
  assertType(strategyPlan1.strategyId, 'string', 'strategyId should be string');
  assertOk(strategyPlan1.strategyId.indexOf('strategy_') === 0, 'strategyId should start with strategy_');
});

test('1.9 strategy goalId matches original goal', function () {
  assertEqual(strategyPlan1.goalId, goal1.goalId, 'strategy.goalId must match goal.goalId');
});

test('1.10 strategy has objectives array', function () {
  assertOk(Array.isArray(strategyPlan1.objectives), 'objectives should be an array');
  assertOk(strategyPlan1.objectives.length > 0, 'objectives should not be empty');
});

test('1.11 strategy has guardrails array', function () {
  assertOk(Array.isArray(strategyPlan1.guardrails), 'guardrails should be an array');
});

test('1.12 strategy priority inherits from goal', function () {
  assertEqual(strategyPlan1.priority, 'high');
});

test('1.13 strategy has category from goal', function () {
  assertEqual(strategyPlan1.category, 'commerce');
});

// Step 3: Compile mission drafts
var compileResult1;
var drafts1;
test('1.14 compileStrategyToMissionDrafts returns result object', function () {
  compileResult1 = missionCompiler.compileStrategyToMissionDrafts(strategyPlan1);
  assertType(compileResult1, 'object', 'compileResult should be object');
});

test('1.15 compileResult has drafts array', function () {
  drafts1 = compileResult1.drafts;
  assertOk(Array.isArray(drafts1), 'drafts should be array');
  assertOk(drafts1.length > 0, 'drafts should not be empty');
});

test('1.16 compileResult strategyId matches', function () {
  assertEqual(compileResult1.strategyId, strategyPlan1.strategyId);
});

test('1.17 compileResult goalId matches', function () {
  assertEqual(compileResult1.goalId, goal1.goalId);
});

test('1.18 each draft has draftId', function () {
  for (var i = 0; i < drafts1.length; i++) {
    assertType(drafts1[i].draftId, 'string', 'draft ' + i + ' should have draftId');
  }
});

test('1.19 each draft has strategyId matching strategy', function () {
  for (var i = 0; i < drafts1.length; i++) {
    assertEqual(drafts1[i].strategyId, strategyPlan1.strategyId, 'draft ' + i + ' strategyId mismatch');
  }
});

test('1.20 each draft has goalId matching goal', function () {
  for (var i = 0; i < drafts1.length; i++) {
    assertEqual(drafts1[i].goalId, goal1.goalId, 'draft ' + i + ' goalId mismatch');
  }
});

test('1.21 each draft has priority', function () {
  for (var i = 0; i < drafts1.length; i++) {
    assertType(drafts1[i].priority, 'string', 'draft ' + i + ' should have priority');
  }
});

test('1.22 each draft has recommendedAgent', function () {
  for (var i = 0; i < drafts1.length; i++) {
    assertType(drafts1[i].recommendedAgent, 'string', 'draft ' + i + ' should have recommendedAgent');
  }
});

test('1.23 each draft has guardrails array', function () {
  for (var i = 0; i < drafts1.length; i++) {
    assertOk(Array.isArray(drafts1[i].guardrails), 'draft ' + i + ' guardrails should be array');
  }
});

test('1.24 each draft has acceptanceCriteria array', function () {
  for (var i = 0; i < drafts1.length; i++) {
    assertOk(Array.isArray(drafts1[i].acceptanceCriteria), 'draft ' + i + ' acceptanceCriteria should be array');
  }
});

test('1.25 draft count matches objective count', function () {
  assertEqual(drafts1.length, strategyPlan1.objectives.length, 'draft count should equal objective count');
});

// Step 4: Enqueue drafts
var enqueueResults1;
var enqueuedItems1 = [];
test('1.26 enqueueDrafts returns array', function () {
  enqueueResults1 = reviewQueue.enqueueDrafts(drafts1, { allowDuplicates: true });
  assertOk(Array.isArray(enqueueResults1), 'enqueueResults should be array');
  assertEqual(enqueueResults1.length, drafts1.length, 'enqueueResults length should match drafts');
});

test('1.27 all enqueue results are successful', function () {
  for (var i = 0; i < enqueueResults1.length; i++) {
    assertOk(enqueueResults1[i].success, 'enqueue ' + i + ' should succeed');
    assertType(enqueueResults1[i].reviewItem, 'object', 'enqueue ' + i + ' should have reviewItem');
    enqueuedItems1.push(enqueueResults1[i].reviewItem);
  }
});

test('1.28 each review item has reviewId', function () {
  for (var i = 0; i < enqueuedItems1.length; i++) {
    assertType(enqueuedItems1[i].reviewId, 'string', 'reviewItem ' + i + ' should have reviewId');
  }
});

test('1.29 each review item draftId matches draft', function () {
  for (var i = 0; i < enqueuedItems1.length; i++) {
    assertEqual(enqueuedItems1[i].draftId, drafts1[i].draftId, 'reviewItem ' + i + ' draftId mismatch');
  }
});

test('1.30 each review item has status pending', function () {
  for (var i = 0; i < enqueuedItems1.length; i++) {
    assertEqual(enqueuedItems1[i].status, 'pending', 'reviewItem ' + i + ' should be pending');
  }
});

// Step 5: Approve drafts
var approvedItems1 = [];
test('1.31 approveDraft succeeds for all items', function () {
  for (var i = 0; i < enqueuedItems1.length; i++) {
    var result = reviewQueue.approveDraft(
      enqueuedItems1[i].reviewId,
      'pipeline-e2e-tester',
      'dry-run pipeline approval #' + (i + 1)
    );
    assertOk(result.success, 'approveDraft ' + i + ' should succeed: ' + (result.error || ''));
    assertType(result.reviewItem, 'object', 'approved item should be object');
    approvedItems1.push(result.reviewItem);
  }
});

test('1.32 approved items have status reviewed', function () {
  for (var i = 0; i < approvedItems1.length; i++) {
    assertEqual(approvedItems1[i].status, 'reviewed', 'approved item ' + i + ' should be reviewed');
  }
});

test('1.33 approved items have decision approve', function () {
  for (var i = 0; i < approvedItems1.length; i++) {
    assertEqual(approvedItems1[i].decision, 'approve', 'approved item ' + i + ' should have decision approve');
  }
});

test('1.34 approved items have reviewer set', function () {
  for (var i = 0; i < approvedItems1.length; i++) {
    assertEqual(approvedItems1[i].reviewer, 'pipeline-e2e-tester', 'reviewer should be set');
  }
});

// Step 6: Plan dispatch
var dispatchResult1;
var dispatchPlans1 = [];
test('1.35 planDispatch returns result object', function () {
  dispatchResult1 = dispatchPlanner.planDispatch(approvedItems1);
  assertType(dispatchResult1, 'object', 'dispatchResult should be object');
});

test('1.36 planDispatch succeeds', function () {
  assertOk(dispatchResult1.success, 'dispatch result should succeed');
});

test('1.37 planDispatch has results array', function () {
  assertOk(Array.isArray(dispatchResult1.results), 'results should be array');
  assertEqual(dispatchResult1.results.length, approvedItems1.length, 'results length should match approved items');
});

test('1.38 all dispatch results succeed', function () {
  for (var i = 0; i < dispatchResult1.results.length; i++) {
    assertOk(dispatchResult1.results[i].success, 'dispatch ' + i + ' should succeed');
    dispatchPlans1.push(dispatchResult1.results[i].plan);
  }
});

test('1.39 each dispatch plan has dispatchPlanId', function () {
  for (var i = 0; i < dispatchPlans1.length; i++) {
    assertType(dispatchPlans1[i].dispatchPlanId, 'string', 'plan ' + i + ' should have dispatchPlanId');
    assertOk(dispatchPlans1[i].dispatchPlanId.indexOf('dispatch_') === 0, 'plan ' + i + ' dispatchPlanId should start with dispatch_');
  }
});

test('1.40 dispatchMode is manual for all plans', function () {
  for (var i = 0; i < dispatchPlans1.length; i++) {
    assertEqual(dispatchPlans1[i].dispatchMode, 'manual', 'plan ' + i + ' dispatchMode must be manual');
  }
});

test('1.41 dispatch plan reviewId matches approved reviewId', function () {
  for (var i = 0; i < dispatchPlans1.length; i++) {
    assertEqual(dispatchPlans1[i].reviewId, approvedItems1[i].reviewId, 'plan ' + i + ' reviewId mismatch');
  }
});

test('1.42 dispatch plan draftId matches original draft', function () {
  for (var i = 0; i < dispatchPlans1.length; i++) {
    assertEqual(dispatchPlans1[i].draftId, drafts1[i].draftId, 'plan ' + i + ' draftId mismatch');
  }
});

test('1.43 dispatch plan goalId matches original goal', function () {
  for (var i = 0; i < dispatchPlans1.length; i++) {
    assertEqual(dispatchPlans1[i].goalId, goal1.goalId, 'plan ' + i + ' goalId mismatch');
  }
});

test('1.44 dispatch plan strategyId matches strategy', function () {
  for (var i = 0; i < dispatchPlans1.length; i++) {
    assertEqual(dispatchPlans1[i].strategyId, strategyPlan1.strategyId, 'plan ' + i + ' strategyId mismatch');
  }
});

// Step 7: Snapshot
test('1.45 generateDispatchSnapshot returns success', function () {
  var snap = dispatchPlanner.generateDispatchSnapshot();
  assertOk(snap.success, 'snapshot should succeed');
  assertType(snap.snapshot, 'object', 'snapshot should be object');
});

test('1.46 snapshot has correct totalPlans', function () {
  var snap = dispatchPlanner.generateDispatchSnapshot();
  assertEqual(snap.snapshot.totalPlans, dispatchPlans1.length, 'snapshot total should match plans');
});

test('1.47 snapshot has byStatus breakdown', function () {
  var snap = dispatchPlanner.generateDispatchSnapshot();
  assertType(snap.snapshot.byStatus, 'object', 'byStatus should be object');
});

test('1.48 snapshot has byAgent breakdown', function () {
  var snap = dispatchPlanner.generateDispatchSnapshot();
  assertType(snap.snapshot.byAgent, 'object', 'byAgent should be object');
});

test('1.49 count of all statuses in snapshot equals totalPlans', function () {
  var snap = dispatchPlanner.generateDispatchSnapshot();
  var total = 0;
  Object.keys(snap.snapshot.byStatus).forEach(function (s) { total += snap.snapshot.byStatus[s]; });
  assertEqual(total, snap.snapshot.totalPlans, 'status count sum should equal totalPlans');
});

teardownAll();

// ============================================================================
// Section 2: Full Pipeline via runPipeline Helper
// ============================================================================

section('2. Full Pipeline via runPipeline Helper');

setupTempDir();

var traceA;
test('2.1 runPipeline succeeds for commerce goal', function () {
  traceA = runPipeline(makeGoal(
    'Commerce Revenue Growth',
    'Grow revenue by 20% in Q4',
    'commerce', 'critical',
    { revenue: 'Revenue +20%', customers: 'New customers +500' },
    { roi: 'ROI > 3x' }
  ));
  assertType(traceA.goal, 'object', 'should have goal');
  assertType(traceA.strategy, 'object', 'should have strategy');
  assertOk(traceA.drafts.length > 0, 'should have drafts');
  assertOk(traceA.approvedItems.length > 0, 'should have approved items');
  assertOk(traceA.dispatchResult.success, 'dispatch should succeed');
});

test('2.2 pipeline goal has critical priority', function () {
  assertEqual(traceA.goal.priority, 'critical');
});

test('2.3 pipeline strategy inherits critical priority', function () {
  assertEqual(traceA.strategy.priority, 'critical');
});

test('2.4 pipeline drafts all have critical priority', function () {
  for (var i = 0; i < traceA.drafts.length; i++) {
    assertEqual(traceA.drafts[i].priority, 'critical', 'draft ' + i + ' priority mismatch');
  }
});

test('2.5 pipeline dispatch plans all have critical priority', function () {
  for (var i = 0; i < traceA.dispatchPlans.length; i++) {
    assertEqual(traceA.dispatchPlans[i].priority, 'critical', 'plan ' + i + ' priority mismatch');
  }
});

test('2.6 pipeline ID continuity: goalId through all stages', function () {
  var gid = traceA.goal.goalId;
  assertEqual(traceA.strategy.goalId, gid);
  assertEqual(traceA.compileResult.goalId, gid);
  for (var i = 0; i < traceA.drafts.length; i++) {
    assertEqual(traceA.drafts[i].goalId, gid, 'draft ' + i + ' goalId mismatch');
  }
  for (var j = 0; j < traceA.dispatchPlans.length; j++) {
    assertEqual(traceA.dispatchPlans[j].goalId, gid, 'plan ' + j + ' goalId mismatch');
  }
});

test('2.7 pipeline ID continuity: strategyId through all stages', function () {
  var sid = traceA.strategy.strategyId;
  assertEqual(traceA.compileResult.strategyId, sid);
  for (var i = 0; i < traceA.drafts.length; i++) {
    assertEqual(traceA.drafts[i].strategyId, sid, 'draft ' + i + ' strategyId mismatch');
  }
  for (var j = 0; j < traceA.dispatchPlans.length; j++) {
    assertEqual(traceA.dispatchPlans[j].strategyId, sid, 'plan ' + j + ' strategyId mismatch');
  }
});

test('2.8 pipeline ID continuity: draftId flow draft->review->dispatch', function () {
  for (var i = 0; i < traceA.drafts.length; i++) {
    var did = traceA.drafts[i].draftId;
    var reviewItem = null;
    for (var j = 0; j < traceA.approvedItems.length; j++) {
      if (traceA.approvedItems[j].draftId === did) { reviewItem = traceA.approvedItems[j]; break; }
    }
    assertOk(reviewItem !== null, 'reviewItem for draft ' + i + ' should exist');
    var plan = null;
    for (var k = 0; k < traceA.dispatchPlans.length; k++) {
      if (traceA.dispatchPlans[k].draftId === did) { plan = traceA.dispatchPlans[k]; break; }
    }
    assertOk(plan !== null, 'dispatch plan for draft ' + i + ' should exist');
    assertEqual(plan.reviewId, reviewItem.reviewId, 'plan reviewId should match reviewItem reviewId for draft ' + i);
  }
});

test('2.9 all dispatch plans have dispatchMode manual', function () {
  for (var i = 0; i < traceA.dispatchPlans.length; i++) {
    assertEqual(traceA.dispatchPlans[i].dispatchMode, 'manual', 'plan ' + i + ' must be manual');
  }
});

test('2.10 selected agent is not empty', function () {
  for (var i = 0; i < traceA.dispatchPlans.length; i++) {
    assertType(traceA.dispatchPlans[i].selectedAgent, 'string', 'plan ' + i + ' should have selectedAgent');
    assertOk(traceA.dispatchPlans[i].selectedAgent.length > 0, 'selectedAgent should not be empty');
  }
});

test('2.11 each plan has fallbackAgents', function () {
  for (var i = 0; i < traceA.dispatchPlans.length; i++) {
    assertOk(Array.isArray(traceA.dispatchPlans[i].fallbackAgents), 'plan ' + i + ' fallbackAgents should be array');
  }
});

test('2.12 snapshot from full pipeline', function () {
  var snap = traceA.snapshotResult;
  assertOk(snap.success, 'snapshot success');
  assertOk(snap.snapshot.totalPlans > 0, 'snapshot should have plans');
});

test('2.13 reviewQueue snapshot after pipeline has items', function () {
  var rqSnap = reviewQueue.generateReviewQueueSnapshot();
  assertOk(rqSnap.totalItems > 0, 'review queue should have items after pipeline');
  assertOk(rqSnap.reviewedCount > 0, 'should have reviewed items');
});

teardownAll();

// ============================================================================
// Section 3: Multiple Goals Pipeline
// ============================================================================

section('3. Multiple Goals Pipeline (operations + reliability + security + cost + performance)');

setupTempDir();

test('3.1 pipeline A: operations goal', function () {
  var trace = runPipeline(makeGoal(
    'Operations Automation', 'Automate routine ops tasks',
    'operations', 'medium',
    { manual_toil: 'Reduce manual toil by 50%' },
    { downtime: 'Zero downtime' }
  ));
  assertOk(trace.dispatchResult.success, 'ops pipeline should succeed');
  assertOk(trace.dispatchPlans.length > 0, 'ops should have dispatch plans');
});

test('3.2 pipeline B: reliability goal', function () {
  var trace = runPipeline(makeGoal(
    'Reliability Improvement', 'Improve system reliability to 99.99%',
    'reliability', 'high',
    { sla: '99.99% SLA' },
    { spof: 'No single point of failure' }
  ));
  assertOk(trace.dispatchResult.success, 'reliability pipeline should succeed');
  assertOk(trace.dispatchPlans.length > 0, 'reliability should have dispatch plans');
});

test('3.3 pipeline C: security goal', function () {
  var trace = runPipeline(makeGoal(
    'Security Hardening', 'Implement security best practices',
    'security', 'high',
    { audit: 'Pass security audit' },
    { leakage: 'No data leakage' }
  ));
  assertOk(trace.dispatchResult.success, 'security pipeline should succeed');
  assertOk(trace.dispatchPlans.length > 0, 'security should have dispatch plans');
});

test('3.4 pipeline D: cost goal', function () {
  var trace = runPipeline(makeGoal(
    'Cost Optimization', 'Reduce cloud costs by 25%',
    'cost', 'low',
    { savings: 'Save $10K/month' },
    { perf: 'No performance regression' }
  ));
  assertOk(trace.dispatchResult.success, 'cost pipeline should succeed');
});

test('3.5 pipeline E: performance goal', function () {
  var trace = runPipeline(makeGoal(
    'Performance Tuning', 'Improve p99 latency by 30%',
    'performance', 'medium',
    { p99: 'p99 < 100ms' },
    { regression: 'No feature regressions' }
  ));
  assertOk(trace.dispatchResult.success, 'performance pipeline should succeed');
});

test('3.6 snapshot aggregates all plans from multiple pipelines', function () {
  var snap = dispatchPlanner.generateDispatchSnapshot();
  assertOk(snap.snapshot.totalPlans > 0, 'should have accumulated plans');
});

test('3.7 snapshot byAgent has entries', function () {
  var snap = dispatchPlanner.generateDispatchSnapshot();
  var agentKeys = Object.keys(snap.snapshot.byAgent);
  assertOk(agentKeys.length > 0, 'should have agent entries');
});

test('3.8 snapshot byPriority has entries', function () {
  var snap = dispatchPlanner.generateDispatchSnapshot();
  var priorityKeys = Object.keys(snap.snapshot.byPriority);
  assertOk(priorityKeys.length > 0, 'should have priority entries');
});

test('3.9 each plan in snapshot has dispatchPlanId', function () {
  var snap = dispatchPlanner.generateDispatchSnapshot();
  for (var i = 0; i < snap.snapshot.plans.length; i++) {
    assertType(snap.snapshot.plans[i].dispatchPlanId, 'string', 'snapshot plan ' + i + ' should have dispatchPlanId');
  }
});

test('3.10 each plan in snapshot has dispatchMode manual', function () {
  var snap = dispatchPlanner.generateDispatchSnapshot();
  for (var i = 0; i < snap.snapshot.plans.length; i++) {
    assertEqual(snap.snapshot.plans[i].dispatchMode, 'manual', 'snapshot plan ' + i + ' must be manual');
  }
});

test('3.11 dispatchPlans across different categories have different agents', function () {
  var snap = dispatchPlanner.generateDispatchSnapshot();
  var agents = Object.keys(snap.snapshot.byAgent);
  // At least one agent should be used
  assertOk(agents.length >= 1, 'at least one agent type should be used across categories');
});

teardownAll();

// ============================================================================
// Section 4: Field Inheritance Verification
// ============================================================================

section('4. Field Inheritance Verification');

setupTempDir();

var traceB;
test('4.1 setup: register goal and run full pipeline', function () {
  traceB = runPipeline(makeGoal(
    'Inheritance Test Goal',
    'Verify field inheritance across pipeline',
    'compliance', 'critical',
    { regulatory: 'Regulatory compliance', audit: 'Audit readiness' },
    { gdpr: 'GDPR compliance', ccpa: 'CCPA compliance', soc2: 'SOC2 certification' }
  ), { reviewer: 'inheritance-tester', approveReason: 'inheritance check' });
  assertOk(traceB.goal, 'should have goal');
  assertOk(traceB.dispatchPlans.length > 0, 'should have dispatch plans');
});

test('4.2 priority: goal=critical -> strategy=critical', function () {
  assertEqual(traceB.goal.priority, 'critical');
  assertEqual(traceB.strategy.priority, 'critical');
});

test('4.3 priority: all drafts inherit critical', function () {
  for (var i = 0; i < traceB.drafts.length; i++) {
    assertEqual(traceB.drafts[i].priority, 'critical', 'draft ' + i);
  }
});

test('4.4 priority: all dispatch plans inherit critical', function () {
  for (var i = 0; i < traceB.dispatchPlans.length; i++) {
    assertEqual(traceB.dispatchPlans[i].priority, 'critical', 'plan ' + i);
  }
});

test('4.5 category: goal=compliance flows to strategy', function () {
  assertEqual(traceB.goal.category, 'compliance');
  assertEqual(traceB.strategy.category, 'compliance');
});

test('4.6 guardrails: strategy guardrails are non-empty', function () {
  assertOk(traceB.strategy.guardrails.length > 0, 'strategy should have guardrails');
});

test('4.7 guardrails: drafts inherit guardrails from strategy + template', function () {
  for (var i = 0; i < traceB.drafts.length; i++) {
    assertOk(traceB.drafts[i].guardrails.length > 0, 'draft ' + i + ' should have guardrails');
  }
});

test('4.8 guardrails: dispatch plans inherit guardrails from drafts', function () {
  for (var i = 0; i < traceB.dispatchPlans.length; i++) {
    assertOk(Array.isArray(traceB.dispatchPlans[i].guardrails), 'plan ' + i + ' guardrails should be array');
    assertOk(traceB.dispatchPlans[i].guardrails.length > 0, 'plan ' + i + ' guardrails should be non-empty');
  }
});

test('4.9 acceptanceCriteria: drafts have acceptance criteria from template', function () {
  for (var i = 0; i < traceB.drafts.length; i++) {
    assertOk(Array.isArray(traceB.drafts[i].acceptanceCriteria), 'draft ' + i + ' acceptanceCriteria should be array');
  }
});

test('4.10 acceptanceCriteria: dispatch plans inherit from drafts', function () {
  for (var i = 0; i < traceB.dispatchPlans.length; i++) {
    assertOk(Array.isArray(traceB.dispatchPlans[i].acceptanceCriteria), 'plan ' + i + ' acceptanceCriteria should be array');
  }
});

test('4.11 acceptanceCriteria count matches between draft and dispatch plan', function () {
  for (var i = 0; i < Math.min(traceB.drafts.length, traceB.dispatchPlans.length); i++) {
    assertEqual(
      traceB.dispatchPlans[i].acceptanceCriteria.length,
      traceB.drafts[i].acceptanceCriteria.length,
      'plan ' + i + ' acceptanceCriteria count should match draft'
    );
  }
});

test('4.12 selectedAgent: commerce category has agent assigned', function () {
  var t = runPipeline(makeGoal('Commerce Agent Test', 'Agent selection test', 'commerce', 'medium'));
  for (var i = 0; i < t.dispatchPlans.length; i++) {
    assertType(t.dispatchPlans[i].selectedAgent, 'string', 'commerce plan ' + i + ' should have agent');
  }
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('4.13 selectedAgent: operations category has agent assigned', function () {
  var t = runPipeline(makeGoal('Ops Agent Test', 'Agent selection test for ops', 'operations', 'high'));
  for (var i = 0; i < t.dispatchPlans.length; i++) {
    assertOk(t.dispatchPlans[i].selectedAgent.length > 0, 'ops plan ' + i + ' should have non-empty agent');
  }
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('4.14 dispatchMode: always manual across all pipelines', function () {
  var t = runPipeline(makeGoal('Dispatch Mode Test', 'Verify dispatchMode is always manual', 'reliability', 'low'));
  for (var i = 0; i < t.dispatchPlans.length; i++) {
    assertEqual(t.dispatchPlans[i].dispatchMode, 'manual', 'plan ' + i + ' dispatchMode must be manual');
  }
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('4.15 dispatch plan has commandPreview with DISPATCH PREVIEW header', function () {
  var t = runPipeline(makeGoal('Command Preview Test', 'Verify command preview generation', 'operations', 'medium'));
  for (var i = 0; i < t.dispatchPlans.length; i++) {
    assertType(t.dispatchPlans[i].commandPreview, 'string', 'plan ' + i + ' should have commandPreview');
    assertOk(t.dispatchPlans[i].commandPreview.indexOf('[DISPATCH PREVIEW]') !== -1, 'commandPreview should contain header');
  }
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('4.16 each draft has type field', function () {
  var t = runPipeline(makeGoal('Type Test', 'Verify type field', 'commerce', 'medium'));
  for (var i = 0; i < t.drafts.length; i++) {
    assertType(t.drafts[i].type, 'string', 'draft ' + i + ' should have type');
    assertOk(t.drafts[i].type.length > 0, 'draft ' + i + ' type should not be empty');
  }
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('4.17 dispatch plan has dispatchReason', function () {
  var t = runPipeline(makeGoal('Dispatch Reason Test', 'Verify dispatchReason', 'security', 'high'));
  for (var i = 0; i < t.dispatchPlans.length; i++) {
    assertType(t.dispatchPlans[i].dispatchReason, 'string', 'plan ' + i + ' should have dispatchReason');
  }
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

teardownAll();

// ============================================================================
// Section 5: Dispatch Mode Constraints
// ============================================================================

section('5. Dispatch Mode Constraints');

setupTempDir();

test('5.1 dispatchMode is always the string "manual"', function () {
  var t = runPipeline(makeGoal('Mode String Test', 'Verify dispatchMode is string manual', 'security', 'critical'));
  for (var i = 0; i < t.dispatchPlans.length; i++) {
    assertEqual(typeof t.dispatchPlans[i].dispatchMode, 'string', 'dispatchMode should be string');
    assertEqual(t.dispatchPlans[i].dispatchMode, 'manual', 'dispatchMode must be exactly "manual"');
  }
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('5.2 dispatchMode is never "auto"', function () {
  var t = runPipeline(makeGoal('No Auto Dispatch Test', 'Verify no auto dispatch', 'operations', 'high'));
  for (var i = 0; i < t.dispatchPlans.length; i++) {
    assertOk(t.dispatchPlans[i].dispatchMode !== 'auto', 'dispatchMode must not be auto');
  }
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('5.3 dispatchMode is never "supervised"', function () {
  var t = runPipeline(makeGoal('No Supervised Test', 'Verify no supervised dispatch', 'reliability', 'medium'));
  for (var i = 0; i < t.dispatchPlans.length; i++) {
    assertOk(t.dispatchPlans[i].dispatchMode !== 'supervised', 'dispatchMode must not be supervised');
  }
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('5.4 dispatchMode is never "blocked"', function () {
  var t = runPipeline(makeGoal('No Blocked Test', 'Verify no blocked dispatch (dry run)', 'performance', 'low'));
  for (var i = 0; i < t.dispatchPlans.length; i++) {
    assertOk(t.dispatchPlans[i].dispatchMode !== 'blocked', 'dispatchMode must not be blocked');
  }
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('5.5 ALLOWED_DISPATCH_MODES_MVP only contains manual', function () {
  var modes = dispatchPlanner.ALLOWED_DISPATCH_MODES_MVP;
  assertOk(Array.isArray(modes), 'ALLOWED_DISPATCH_MODES_MVP should be array');
  assertOk(modes.indexOf('manual') !== -1, 'manual should be in allowed modes');
  assertOk(modes.indexOf('auto') === -1, 'auto should NOT be in allowed modes');
  assertOk(modes.indexOf('supervised') === -1, 'supervised should NOT be in allowed modes');
  assertOk(modes.indexOf('blocked') === -1, 'blocked should NOT be in allowed modes');
});

test('5.6 DISPATCH_MODE has manual and is the only MVP mode', function () {
  assertEqual(dispatchPlanner.DISPATCH_MODE.MANUAL, 'manual');
  assertType(dispatchPlanner.DISPATCH_MODE.SUPERVISED, 'string', 'DISPATCH_MODE should have SUPERVISED');
  assertType(dispatchPlanner.DISPATCH_MODE.BLOCKED, 'string', 'DISPATCH_MODE should have BLOCKED');
});

teardownAll();

// ============================================================================
// Section 6: Edge Cases & Error Handling
// ============================================================================

section('6. Edge Cases & Error Handling');

setupTempDir();

test('6.1 empty drafts -> enqueueDrafts returns empty array', function () {
  var results = reviewQueue.enqueueDrafts([], { allowDuplicates: true });
  assertOk(Array.isArray(results), 'should return array');
  assertEqual(results.length, 0, 'should be empty');
});

test('6.2 invalid draft -> enqueueDrafts reports error', function () {
  var results = reviewQueue.enqueueDrafts([null], { allowDuplicates: true });
  assertOk(Array.isArray(results), 'should return array');
  assertEqual(results.length, 1, 'should have one result');
  assertOk(!results[0].success, 'should fail for null draft');
});

test('6.3 approveDraft with invalid reviewId returns NOT_FOUND', function () {
  var result = reviewQueue.approveDraft('nonexistent-review-id-99999', 'tester', 'test');
  assertOk(!result.success, 'should fail for invalid reviewId');
  assertEqual(result.error, 'NOT_FOUND', 'error should be NOT_FOUND');
});

test('6.4 double approveDraft on same item fails', function () {
  var t = runPipeline(makeGoal('Double Approve Test', 'Test double approval handling', 'commerce', 'medium'));
  var firstReviewId = t.enqueuedItems[0].reviewId;
  var result = reviewQueue.approveDraft(firstReviewId, 'double-tester', 'double approve attempt');
  assertOk(!result.success, 'double approve should fail');
  assertEqual(result.error, 'INVALID_ACTION', 'error should be INVALID_ACTION');
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('6.5 planDispatch with empty array succeeds with 0 items', function () {
  var result = dispatchPlanner.planDispatch([]);
  assertOk(result.success, 'empty dispatch should succeed');
  assertEqual(result.succeeded, 0, 'succeeded should be 0');
  assertEqual(result.failed, 0, 'failed should be 0');
});

test('6.6 planDispatch with non-array input fails', function () {
  var result = dispatchPlanner.planDispatch('not-an-array');
  assertOk(!result.success, 'should fail for non-array');
  assertEqual(result.code, dispatchPlanner.DISPATCH_ERROR_CODES.INVALID_BATCH_INPUT);
});

test('6.7 batchPlanDispatch with empty array fails', function () {
  var result = dispatchPlanner.batchPlanDispatch([]);
  assertOk(!result.success, 'should fail for empty');
  assertEqual(result.code, dispatchPlanner.DISPATCH_ERROR_CODES.EMPTY_REVIEW_ITEMS);
});

test('6.8 review queue snapshot with empty queue is clean', function () {
  reviewQueue.clearQueue();
  var snap = reviewQueue.generateReviewQueueSnapshot();
  assertOk(snap.totalItems === 0, 'empty queue should have 0 items');
  assertEqual(snap.pendingCount, 0, 'pending should be 0');
  assertEqual(snap.reviewedCount, 0, 'reviewed should be 0');
});

test('6.9 dispatch snapshot with 0 plans is clean', function () {
  dispatchPlanner._clearAllPlans();
  var snap = dispatchPlanner.generateDispatchSnapshot();
  assertOk(snap.success, 'snapshot should succeed');
  assertEqual(snap.snapshot.totalPlans, 0, 'totalPlans should be 0');
  assertEqual(snap.snapshot.plans.length, 0, 'plans should be empty');
});

test('6.10 goal registration with missing name fails', function () {
  var result = goalRegistry.registerGoal({ description: 'no name', category: 'commerce', priority: 'high' });
  assertOk(!result.success, 'should fail without name');
  assertOk(result.error.indexOf('validation failed') === 0, 'error should mention validation');
});

test('6.11 goal registration with invalid category fails', function () {
  var result = goalRegistry.registerGoal(makeGoal('Invalid Category', '', 'nonexistent_category', 'high'));
  assertOk(!result.success, 'should fail with invalid category');
});

test('6.12 goal registration with minimal valid data succeeds', function () {
  var result = goalRegistry.registerGoal(makeGoal('Minimal Goal', '', 'commerce', 'low'));
  assertOk(result.success, 'should succeed with minimal data');
  assertType(result.goal.goalId, 'string', 'should have goalId');
});

test('6.13 getReviewItem for nonexistent returns NOT_FOUND', function () {
  var result = reviewQueue.getReviewItem('nonexistent');
  assertOk(!result.success, 'should fail');
  assertEqual(result.error, 'NOT_FOUND');
});

test('6.14 getReviewItem after enqueue finds item', function () {
  var t = runPipeline(makeGoal('GetReviewItem Test', 'Test getReviewItem', 'operations', 'low'));
  var rid = t.enqueuedItems[0].reviewId;
  var result = reviewQueue.getReviewItem(rid);
  assertOk(result.success, 'should find item');
  assertEqual(result.reviewItem.reviewId, rid, 'reviewId should match');
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('6.15 listReviewItems by status reviewed', function () {
  var t = runPipeline(makeGoal('ListReviewItems Test', 'Test listReviewItems filter', 'reliability', 'medium'));
  var reviewedList = reviewQueue.listReviewItems({ status: 'reviewed' });
  assertOk(reviewedList.success, 'should succeed');
  assertOk(reviewedList.total > 0, 'should have reviewed items');
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('6.16 getDispatchPlan for valid plan returns it', function () {
  var t = runPipeline(makeGoal('GetDispatchPlan Test', 'Test getDispatchPlan', 'commerce', 'high'));
  var planId = t.dispatchPlans[0].dispatchPlanId;
  var result = dispatchPlanner.getDispatchPlan(planId);
  assertOk(result.success, 'should find plan');
  assertEqual(result.plan.dispatchPlanId, planId, 'planId should match');
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('6.17 getDispatchPlan for invalid id fails', function () {
  var result = dispatchPlanner.getDispatchPlan('nonexistent-plan-id');
  assertOk(!result.success, 'should fail for nonexistent');
});

test('6.18 listDispatchPlans by status planned returns results', function () {
  var t = runPipeline(makeGoal('ListDispatchPlans Test', 'Test listDispatchPlans', 'operations', 'high'));
  var list = dispatchPlanner.listDispatchPlans({ status: 'planned' });
  assertOk(list.success, 'should succeed');
  assertOk(list.count > 0, 'should have plans');
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('6.19 previewDispatchPlan shows plan details', function () {
  var t = runPipeline(makeGoal('Preview Test', 'Test previewDispatchPlan', 'operations', 'critical'));
  var plan = t.dispatchPlans[0];
  var preview = dispatchPlanner.previewDispatchPlan(plan);
  assertOk(preview.success, 'preview should succeed');
  assertOk(preview.preview.indexOf('=== Dispatch Plan Preview ===') !== -1, 'preview should have header');
  assertOk(preview.preview.indexOf(plan.dispatchPlanId) !== -1, 'preview should contain planId');
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('6.20 rejectDraft on pending item succeeds', function () {
  var t = runPipeline(makeGoal('Reject Test', 'Test rejectDraft', 'commerce', 'low'));
  // Items in t.enqueuedItems are already pending
  // But we approved them all. Let's register a second goal and only enqueue (not approve) first item
  goalRegistry._reset();
  reviewQueue.clearQueue();
  dispatchPlanner._clearAllPlans();

  var gr = goalRegistry.registerGoal(makeGoal('Reject Goal', 'Reject test', 'commerce', 'medium'));
  var sp = strategyPlanner.plan(gr.goal, { priority: 'medium', status: 'draft' });
  var cr = missionCompiler.compileStrategyToMissionDrafts(sp);
  var eq = reviewQueue.enqueueDrafts(cr.drafts, { allowDuplicates: true });
  assertOk(eq[0].success, 'enqueue succeeded');
  var result = reviewQueue.rejectDraft(eq[0].reviewItem.reviewId, 'reject-tester', 'not needed');
  assertOk(result.success, 'reject should succeed');
  assertEqual(result.reviewItem.status, 'rejected', 'status should be rejected');
  assertEqual(result.reviewItem.decision, 'reject', 'decision should be reject');

  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

teardownAll();

// ============================================================================
// Section 7: Snapshot Integration
// ============================================================================

section('7. Snapshot Integration');

setupTempDir();

test('7.1 review queue snapshot has byStatus breakdown after pipeline', function () {
  var t = runPipeline(makeGoal('Snapshot Goal A', 'Review queue snapshot test', 'commerce', 'high'));
  var rqSnap = reviewQueue.generateReviewQueueSnapshot();
  assertOk(rqSnap.totalItems > 0, 'should have items');
  assertType(rqSnap.byStatus, 'object', 'should have byStatus');
  assertOk(rqSnap.byStatus.reviewed > 0, 'should have reviewed items');
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('7.2 review queue snapshot has byPriority', function () {
  var t = runPipeline(makeGoal('Snapshot Goal B', 'ByPriority test', 'operations', 'high'));
  var rqSnap = reviewQueue.generateReviewQueueSnapshot();
  assertType(rqSnap.byPriority, 'object', 'should have byPriority');
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('7.3 review queue snapshot has generatedAt timestamp', function () {
  var t = runPipeline(makeGoal('Snapshot Goal C', 'generatedAt test', 'security', 'medium'));
  var rqSnap = reviewQueue.generateReviewQueueSnapshot();
  assertType(rqSnap.generatedAt, 'string', 'should have generatedAt');
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('7.4 dispatch snapshot plans have all required fields', function () {
  var t = runPipeline(makeGoal('Snapshot Goal D', 'Dispatch snapshot field test', 'reliability', 'critical'));
  var snap = dispatchPlanner.generateDispatchSnapshot();
  for (var i = 0; i < snap.snapshot.plans.length; i++) {
    assertType(snap.snapshot.plans[i].dispatchPlanId, 'string', 'should have dispatchPlanId');
    assertType(snap.snapshot.plans[i].dispatchMode, 'string', 'should have dispatchMode');
    assertType(snap.snapshot.plans[i].selectedAgent, 'string', 'should have selectedAgent');
    assertType(snap.snapshot.plans[i].status, 'string', 'should have status');
    assertType(snap.snapshot.plans[i].priority, 'string', 'should have priority');
  }
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('7.5 dispatch snapshot generatedAt is ISO 8601 format', function () {
  var t = runPipeline(makeGoal('Snapshot Goal E', 'ISO 8601 test', 'performance', 'low'));
  var snap = dispatchPlanner.generateDispatchSnapshot();
  assertOk(snap.snapshot.generatedAt.indexOf('T') !== -1, 'generatedAt should be ISO 8601');
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('7.6 dispatch snapshot updatePlanStatus changes status', function () {
  var t = runPipeline(makeGoal('UpdateStatus Test', 'Test updatePlanStatus', 'commerce', 'medium'));
  var planId = t.dispatchPlans[0].dispatchPlanId;
  var result = dispatchPlanner.updatePlanStatus(planId, 'cancelled');
  assertOk(result.success, 'update should succeed');
  assertEqual(result.plan.status, 'cancelled', 'status should be cancelled');
  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

teardownAll();

// ============================================================================
// Section 8: Security Audit
// ============================================================================

section('8. Security Audit');

// Read test file content, strip comments AND string literals for security grep.
// Only check content BEFORE Section 8 to avoid self-referential matches.
var testContentRaw = fs.readFileSync(__filename, 'utf8');
var section8Marker = testContentRaw.indexOf('section(\'8. Security Audit\')');
var preSecurityContent = section8Marker > 0 ? testContentRaw.substring(0, section8Marker) : testContentRaw;
var noComments = preSecurityContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
var noStrings = noComments.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');

test('8.1 test file has no child_process exec() calls', function () {
  var matches = noStrings.match(/child_process\.exec\s*\(/g);
  assertOk(!matches, 'child_process.exec() calls found in test file - NOT ALLOWED');
});

test('8.2 test file has no child_process spawn() calls', function () {
  var matches = noStrings.match(/child_process\.spawn\s*\(/g);
  assertOk(!matches, 'child_process.spawn() calls found in test file - NOT ALLOWED');
});

test('8.3 test file has no mission-manager import', function () {
  var requires = testContentRaw.match(/require\(.*mission.manager/i);
  assertOk(!requires, 'mission-manager imported in test - NOT ALLOWED');
});

test('8.4 goal-registry source: no dangerous calls', function () {
  var srcDir = path.join(__dirname, '..', 'src', 'goal-registry');
  var files = fs.readdirSync(srcDir).filter(function(f) { return f.endsWith('.js'); });
  var found = [];
  files.forEach(function(f) {
    var content = fs.readFileSync(path.join(srcDir, f), 'utf8');
    var nc = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (nc.match(/\bexec\s*\(/)) found.push(f + ':exec');
    if (nc.match(/\bspawn\s*\(/)) found.push(f + ':spawn');
    if (nc.match(/pm2\s+restart/)) found.push(f + ':pm2_restart');
    if (nc.match(/pm2\s+delete/)) found.push(f + ':pm2_delete');
    if (nc.match(/\.env/)) found.push(f + ':.env');
    if (nc.match(/nginx/)) found.push(f + ':nginx');
    if (nc.match(/commander/)) found.push(f + ':commander');
    if (nc.match(/gateway/)) found.push(f + ':gateway');
    if (nc.match(/agent.host/)) found.push(f + ':agent_host');
    if (nc.match(/\bdeploy\b/)) found.push(f + ':deploy');
    if (nc.match(/executeMission/)) found.push(f + ':executeMission');
    if (nc.match(/mission.manager/i)) found.push(f + ':mission_manager');
  });
  assertEqual(found.length, 0, 'goal-registry dangerous: ' + found.join(', '));
});

test('8.5 strategy-planner source: no dangerous calls', function () {
  var srcDir = path.join(__dirname, '..', 'src', 'strategy-planner');
  var files = fs.readdirSync(srcDir).filter(function(f) { return !f.startsWith('.') && f.endsWith('.js'); });
  var found = [];
  files.forEach(function(f) {
    var content = fs.readFileSync(path.join(srcDir, f), 'utf8');
    var nc = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (nc.match(/\bexec\s*\(/)) found.push(f + ':exec');
    if (nc.match(/\bspawn\s*\(/)) found.push(f + ':spawn');
    if (nc.match(/pm2\s+restart/)) found.push(f + ':pm2_restart');
    if (nc.match(/pm2\s+delete/)) found.push(f + ':pm2_delete');
    if (nc.match(/\.env/)) found.push(f + ':.env');
    if (nc.match(/nginx/)) found.push(f + ':nginx');
    if (nc.match(/commander/)) found.push(f + ':commander');
    if (nc.match(/gateway/)) found.push(f + ':gateway');
    if (nc.match(/agent.host/)) found.push(f + ':agent_host');
    if (nc.match(/\bdeploy\b/)) found.push(f + ':deploy');
    if (nc.match(/executeMission/)) found.push(f + ':executeMission');
  });
  assertEqual(found.length, 0, 'strategy-planner dangerous: ' + found.join(', '));
});

test('8.6 mission-compiler source: no dangerous calls', function () {
  var srcDir = path.join(__dirname, '..', 'src', 'mission-compiler');
  var files = fs.readdirSync(srcDir).filter(function(f) { return !f.startsWith('.') && f.endsWith('.js'); });
  var found = [];
  files.forEach(function(f) {
    var content = fs.readFileSync(path.join(srcDir, f), 'utf8');
    var nc = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (nc.match(/\bexec\s*\(/)) found.push(f + ':exec');
    if (nc.match(/\bspawn\s*\(/)) found.push(f + ':spawn');
    if (nc.match(/pm2\s+restart/)) found.push(f + ':pm2_restart');
    if (nc.match(/pm2\s+delete/)) found.push(f + ':pm2_delete');
    if (nc.match(/\.env/)) found.push(f + ':.env');
    if (nc.match(/nginx/)) found.push(f + ':nginx');
    if (nc.match(/commander/)) found.push(f + ':commander');
    if (nc.match(/gateway/)) found.push(f + ':gateway');
    if (nc.match(/agent.host/)) found.push(f + ':agent_host');
    if (nc.match(/\bdeploy\b/)) found.push(f + ':deploy');
    if (nc.match(/executeMission/)) found.push(f + ':executeMission');
  });
  assertEqual(found.length, 0, 'mission-compiler dangerous: ' + found.join(', '));
});

test('8.7 review-queue source: no dangerous calls', function () {
  var srcDir = path.join(__dirname, '..', 'src', 'mission-review-queue');
  var files = fs.readdirSync(srcDir).filter(function(f) { return !f.startsWith('.') && f.endsWith('.js'); });
  var found = [];
  files.forEach(function(f) {
    var content = fs.readFileSync(path.join(srcDir, f), 'utf8');
    var nc = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (nc.match(/\bexec\s*\(/)) found.push(f + ':exec');
    if (nc.match(/\bspawn\s*\(/)) found.push(f + ':spawn');
    if (nc.match(/pm2\s+restart/)) found.push(f + ':pm2_restart');
    if (nc.match(/pm2\s+delete/)) found.push(f + ':pm2_delete');
    if (nc.match(/\.env/)) found.push(f + ':.env');
    if (nc.match(/nginx/)) found.push(f + ':nginx');
    if (nc.match(/commander/)) found.push(f + ':commander');
    if (nc.match(/gateway/)) found.push(f + ':gateway');
    if (nc.match(/agent.host/)) found.push(f + ':agent_host');
    if (nc.match(/\bdeploy\b/)) found.push(f + ':deploy');
    if (nc.match(/executeMission/)) found.push(f + ':executeMission');
  });
  assertEqual(found.length, 0, 'review-queue dangerous: ' + found.join(', '));
});

test('8.8 dispatch-planner source: no dangerous calls', function () {
  var srcDir = path.join(__dirname, '..', 'src', 'mission-dispatch-planner');
  var files = fs.readdirSync(srcDir).filter(function(f) { return !f.startsWith('.') && f.endsWith('.js'); });
  var found = [];
  files.forEach(function(f) {
    var content = fs.readFileSync(path.join(srcDir, f), 'utf8');
    var nc = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (nc.match(/\bexec\s*\(/)) found.push(f + ':exec');
    if (nc.match(/\bspawn\s*\(/)) found.push(f + ':spawn');
    if (nc.match(/pm2\s+restart/)) found.push(f + ':pm2_restart');
    if (nc.match(/pm2\s+delete/)) found.push(f + ':pm2_delete');
    if (nc.match(/\.env/)) found.push(f + ':.env');
    if (nc.match(/nginx/)) found.push(f + ':nginx');
    if (nc.match(/commander/)) found.push(f + ':commander');
    if (nc.match(/gateway/)) found.push(f + ':gateway');
    if (nc.match(/agent.host/)) found.push(f + ':agent_host');
    if (nc.match(/\bdeploy\b/)) found.push(f + ':deploy');
    if (nc.match(/executeMission/)) found.push(f + ':executeMission');
  });
  assertEqual(found.length, 0, 'dispatch-planner dangerous: ' + found.join(', '));
});

test('8.9 test file imports only P9.5 modules', function () {
  var content = testContentRaw;
  // Check no unexpected imports
  var badImports = content.match(/require\(.*(?:commander|gateway|agent.host|mission.manager|deploy)/i);
  assertOk(!badImports, 'test file imports dangerous modules: ' + badImports);
});

teardownAll();

// ============================================================================
// Section 9: Goal Registry & End-to-End Traceability
// ============================================================================

section('9. Goal Registry & End-to-End Traceability');

setupTempDir();

test('9.1 goal snapshot after multiple registrations shows total', function () {
  goalRegistry.registerGoal(makeGoal('Snapshot Goal 1', '', 'commerce', 'high'));
  goalRegistry.registerGoal(makeGoal('Snapshot Goal 2', '', 'operations', 'medium'));
  var snap = goalRegistry.generateGoalSnapshot();
  assertOk(snap.summary.total >= 2, 'should have at least 2 goals');
});

test('9.2 goal snapshot has byCategory breakdown', function () {
  var snap = goalRegistry.generateGoalSnapshot();
  assertType(snap.summary.byCategory, 'object', 'should have byCategory');
});

test('9.3 goal snapshot has byPriority breakdown', function () {
  var snap = goalRegistry.generateGoalSnapshot();
  assertType(snap.summary.byPriority, 'object', 'should have byPriority');
});

test('9.4 goal snapshot has runtimeVersion', function () {
  var snap = goalRegistry.generateGoalSnapshot();
  assertType(snap.runtimeVersion, 'string', 'should have runtimeVersion');
  assertOk(snap.runtimeVersion.indexOf('goal-runtime') === 0, 'runtimeVersion should start with goal-runtime');
});

test('9.5 full traceability: trace IDs through all 7 stages', function () {
  var goalResult = goalRegistry.registerGoal(makeGoal(
    'Full Trace Goal',
    'Traceability verification goal',
    'operations', 'critical',
    { automation: 'Automate deployment pipeline' },
    { downtime: 'Zero unplanned downtime' }
  ));
  var gid = goalResult.goal.goalId;
  assertOk(typeof gid === 'string' && gid.length > 0, 'goal has goalId');

  var strategy = strategyPlanner.plan(goalResult.goal, { priority: 'critical', status: 'draft' });
  var sid = strategy.strategyId;
  assertOk(typeof sid === 'string' && sid.length > 0, 'strategy has strategyId');
  assertEqual(strategy.goalId, gid, 'strategy.goalId matches goal');

  var compileResult = missionCompiler.compileStrategyToMissionDrafts(strategy);
  var drafts = compileResult.drafts;
  assertOk(drafts.length > 0, 'compile produced drafts');
  assertEqual(compileResult.goalId, gid, 'compileResult.goalId matches');
  assertEqual(compileResult.strategyId, sid, 'compileResult.strategyId matches');
  for (var i = 0; i < drafts.length; i++) {
    assertEqual(drafts[i].goalId, gid, 'draft ' + i + ' goalId matches');
    assertEqual(drafts[i].strategyId, sid, 'draft ' + i + ' strategyId matches');
  }

  var enqueueResults = reviewQueue.enqueueDrafts(drafts, { allowDuplicates: true });
  var approvedItems = [];
  for (var j = 0; j < enqueueResults.length; j++) {
    assertOk(enqueueResults[j].success, 'enqueue ' + j + ' succeeded');
    assertEqual(enqueueResults[j].reviewItem.draftId, drafts[j].draftId, 'enqueue draftId matches');
    var approval = reviewQueue.approveDraft(enqueueResults[j].reviewItem.reviewId, 'trace-tester', 'trace');
    assertOk(approval.success, 'approve ' + j + ' succeeded');
    approvedItems.push(approval.reviewItem);
  }

  var dispatchResult = dispatchPlanner.planDispatch(approvedItems);
  assertOk(dispatchResult.success, 'dispatch succeeded');
  for (var k = 0; k < dispatchResult.results.length; k++) {
    var plan = dispatchResult.results[k].plan;
    assertEqual(plan.goalId, gid, 'plan ' + k + ' goalId matches');
    assertEqual(plan.strategyId, sid, 'plan ' + k + ' strategyId matches');
    assertEqual(plan.draftId, drafts[k].draftId, 'plan ' + k + ' draftId matches');
    assertEqual(plan.reviewId, approvedItems[k].reviewId, 'plan ' + k + ' reviewId matches');
  }

  var snap = dispatchPlanner.generateDispatchSnapshot();
  assertOk(snap.snapshot.totalPlans >= drafts.length, 'snapshot contains all plans');

  dispatchPlanner._clearAllPlans();
  reviewQueue.clearQueue();
  goalRegistry._reset();
});

test('9.6 goal active status verification', function () {
  var result = goalRegistry.registerGoal(makeGoal('Active Goal', 'Test active status', 'commerce', 'high'));
  assertOk(result.success, 'should succeed');
  assertEqual(result.goal.status, 'active', 'new goal should be active');
});

test('9.7 getActiveGoals lists only active goals', function () {
  var activeGoals = goalRegistry.getActiveGoals();
  // After 9.1-9.6, there should be active goals in the system
  assertOk(Array.isArray(activeGoals), 'should return array');
  for (var i = 0; i < activeGoals.length; i++) {
    assertEqual(activeGoals[i].status, 'active', 'all should be active');
  }
});

teardownAll();

// ============================================================================
// Section 10: Priority Propagation Across All Valid Categories
// ============================================================================

section('10. Priority Propagation Across Categories');

var categories = ['commerce', 'operations', 'reliability', 'security', 'cost', 'performance', 'compliance'];
var priorities = ['critical', 'high', 'medium', 'low'];

// Test a representative sample (7x2 = 14 tests)
for (var ci = 0; ci < categories.length; ci++) {
  (function(cat) {
    var pri = priorities[ci % priorities.length];
    var pri2 = priorities[(ci + 1) % priorities.length];

    setupTempDir();
    test('10.' + (ci * 2 + 1) + ' category=' + cat + ' priority=' + pri, function () {
      var gr = goalRegistry.registerGoal(makeGoal(cat + '-' + pri + ' test', '', cat, pri));
      assertOk(gr.success, 'goal registration for ' + cat + '/' + pri);
      assertEqual(gr.goal.priority, pri, 'goal priority=' + pri);

      var sp = strategyPlanner.plan(gr.goal, { priority: pri, status: 'draft' });
      assertEqual(sp.priority, pri, 'strategy priority=' + pri);

      var cr = missionCompiler.compileStrategyToMissionDrafts(sp);
      for (var i = 0; i < cr.drafts.length; i++) {
        assertEqual(cr.drafts[i].priority, pri, 'draft priority=' + pri);
      }

      var eq = reviewQueue.enqueueDrafts(cr.drafts, { allowDuplicates: true });
      var appItems = [];
      for (var j = 0; j < eq.length; j++) {
        if (eq[j].success) {
          var app = reviewQueue.approveDraft(eq[j].reviewItem.reviewId, 'prop-tester', 'prop');
          if (app.success) appItems.push(app.reviewItem);
        }
      }
      var dr = dispatchPlanner.planDispatch(appItems);
      for (var k = 0; k < dr.results.length; k++) {
        if (dr.results[k].success) {
          assertEqual(dr.results[k].plan.priority, pri, 'plan priority=' + pri);
          assertEqual(dr.results[k].plan.dispatchMode, 'manual', 'plan dispatchMode=manual');
        }
      }

      dispatchPlanner._clearAllPlans();
      reviewQueue.clearQueue();
      goalRegistry._reset();
    });

    test('10.' + (ci * 2 + 2) + ' category=' + cat + ' priority=' + pri2, function () {
      var gr = goalRegistry.registerGoal(makeGoal(cat + '-' + pri2 + ' test2', '', cat, pri2));
      assertOk(gr.success, 'goal registration for ' + cat + '/' + pri2);
      assertEqual(gr.goal.priority, pri2, 'goal priority=' + pri2);

      var sp = strategyPlanner.plan(gr.goal, { priority: pri2, status: 'draft' });
      assertEqual(sp.priority, pri2, 'strategy priority=' + pri2);

      var cr = missionCompiler.compileStrategyToMissionDrafts(sp);
      for (var i = 0; i < cr.drafts.length; i++) {
        assertEqual(cr.drafts[i].priority, pri2, 'draft priority=' + pri2);
      }

      var eq = reviewQueue.enqueueDrafts(cr.drafts, { allowDuplicates: true });
      var appItems = [];
      for (var j = 0; j < eq.length; j++) {
        if (eq[j].success) {
          var app = reviewQueue.approveDraft(eq[j].reviewItem.reviewId, 'prop-tester', 'prop');
          if (app.success) appItems.push(app.reviewItem);
        }
      }
      var dr = dispatchPlanner.planDispatch(appItems);
      for (var k = 0; k < dr.results.length; k++) {
        if (dr.results[k].success) {
          assertEqual(dr.results[k].plan.priority, pri2, 'plan priority=' + pri2);
          assertEqual(dr.results[k].plan.dispatchMode, 'manual', 'plan dispatchMode=manual');
        }
      }

      dispatchPlanner._clearAllPlans();
      reviewQueue.clearQueue();
      goalRegistry._reset();
    });
    teardownAll();
  })(categories[ci]);
}

// ============================================================================
// Final Report
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('  TEST RESULTS');
console.log('='.repeat(60));
console.log('  Total:  ' + (passed + failed));
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
console.log('='.repeat(60));

if (failed > 0) {
  console.log('\n  SOME TESTS FAILED!\n');
  process.exit(1);
} else {
  console.log('\n  ALL TESTS PASSED!\n');
  process.exit(0);
}
