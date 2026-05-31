'use strict';

/**
 * test-autonomous-board.cjs — P13.4 Autonomous Board Tests
 */

var assert = require('assert');
var board = require('./autonomous-board');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name + ' — ' + e.message);
  }
}

function assertExists(val, msg) { assert.ok(val != null, msg || 'should exist'); }
function assertType(val, type) { assert.strictEqual(typeof val, type); }
function assertRange(val, min, max) { assert.ok(val >= min && val <= max, 'expected ' + min + '-' + max + ', got ' + val); }

console.log('\nP13.4 Autonomous Board Tests\n');

// ─── Group A: Board Members ───────────────────────────────

test('BOARD_MEMBERS 有 5 个成员', function () {
  assert.strictEqual(board.BOARD_MEMBERS.length, 5);
});

test('BOARD_MEMBERS 包含 CEO/COO/CTO/CMO/CFO', function () {
  var roles = board.BOARD_MEMBERS.map(function (m) { return m.role; });
  assert.ok(roles.indexOf('CEO') !== -1);
  assert.ok(roles.indexOf('COO') !== -1);
  assert.ok(roles.indexOf('CTO') !== -1);
  assert.ok(roles.indexOf('CMO') !== -1);
  assert.ok(roles.indexOf('CFO') !== -1);
});

test('CEO/CFO 有 2 票权重', function () {
  var ceo = board.BOARD_MEMBERS.find(function (m) { return m.role === 'CEO'; });
  var cfo = board.BOARD_MEMBERS.find(function (m) { return m.role === 'CFO'; });
  assert.strictEqual(ceo.voteWeight, 2);
  assert.strictEqual(cfo.voteWeight, 2);
});

// ─── Group B: Board Meeting ───────────────────────────────

test('conveneBoardMeeting 返回完整对象', function () {
  var meeting = board.conveneBoardMeeting();
  assertExists(meeting);
  assertExists(meeting.meetingId);
  assertType(meeting.meetingId, 'string');
  assert.ok(meeting.meetingId.startsWith('board-'));
});

test('meeting 包含 5 个成员投票', function () {
  var meeting = board.conveneBoardMeeting();
  assert.strictEqual(meeting.members.length, 5);
});

test('每个成员包含投票信息', function () {
  var meeting = board.conveneBoardMeeting();
  meeting.members.forEach(function (m) {
    assertExists(m.role);
    assertExists(m.vote);
    assert.ok(['approve', 'reject', 'needs_info', 'abstain'].indexOf(m.vote) !== -1,
      'invalid vote: ' + m.vote);
    assertType(m.confidence, 'number');
    assertRange(m.confidence, 0, 100);
    assertExists(m.comment);
  });
});

test('meeting 包含 scorecard', function () {
  var meeting = board.conveneBoardMeeting();
  var sc = meeting.scorecard;
  assertExists(sc.growth);
  assertExists(sc.profit);
  assertExists(sc.risk);
  assertExists(sc.budget);
  assertExists(sc.overall);
  assertType(sc.overall.score, 'number');
  assertRange(sc.overall.score, 0, 100);
});

test('scorecard 每个维度有 grade', function () {
  var meeting = board.conveneBoardMeeting();
  ['growth', 'profit', 'risk', 'budget'].forEach(function (dim) {
    assert.ok(['A', 'B', 'C', 'D'].indexOf(meeting.scorecard[dim].grade) !== -1,
      'invalid grade for ' + dim);
  });
});

test('meeting 包含 recommendations', function () {
  var meeting = board.conveneBoardMeeting();
  assertExists(meeting.recommendations);
  assert.ok(meeting.recommendations.items.length > 0, 'should have recommendations');
});

test('meeting 包含 verdict', function () {
  var meeting = board.conveneBoardMeeting();
  assertExists(meeting.verdict);
  assertExists(meeting.verdict.decision);
  assert.ok(['approve', 'review', 'reject'].indexOf(meeting.verdict.decision) !== -1);
  assertExists(meeting.verdict.risk);
  assert.ok(['low', 'medium', 'high'].indexOf(meeting.verdict.risk) !== -1);
});

test('meeting requiresHumanDecision = true', function () {
  var meeting = board.conveneBoardMeeting();
  assert.strictEqual(meeting.requiresHumanDecision, true);
});

// ─── Group C: Voting Logic ────────────────────────────────

test('voteWeight 设置为数值', function () {
  var meeting = board.conveneBoardMeeting();
  meeting.members.forEach(function (m) {
    assertType(m.voteWeight, 'number');
    assert.ok(m.voteWeight >= 1);
  });
});

test('不同趋势影响投票结果', function () {
  var ctxUp = { gmv: 50000, profit: 15000, profitMargin: 0.35, roi: 2.5, refundRate: 0.02,
    missionSuccessRate: 0.95, gmvTrend: 'up', profitTrend: 'up', budgetScore: 85, budgetStatus: 'healthy',
    budgetRemaining: 25000, planDays: 7, planRiskLevel: 'low', currentMonth: 5 };
  var ctxDown = { gmv: 30000, profit: 6000, profitMargin: 0.18, roi: 1.4, refundRate: 0.06,
    missionSuccessRate: 0.82, gmvTrend: 'down', profitTrend: 'down', budgetScore: 45, budgetStatus: 'warning',
    budgetRemaining: 8000, planDays: 7, planRiskLevel: 'high', currentMonth: 5 };

  var membersUp = board.simulateVoting(ctxUp);
  var membersDown = board.simulateVoting(ctxDown);

  var approvesUp = membersUp.filter(function (m) { return m.vote === 'approve'; }).length;
  var approvesDown = membersDown.filter(function (m) { return m.vote === 'approve'; }).length;

  assert.ok(approvesUp > approvesDown, 'better context should have more approvals: ' + approvesUp + ' vs ' + approvesDown);
});

// ─── Group D: Scorecard ───────────────────────────────────

test('scoreToGrade 正确映射', function () {
  assert.strictEqual(board.scoreToGrade(85), 'A');
  assert.strictEqual(board.scoreToGrade(70), 'B');
  assert.strictEqual(board.scoreToGrade(55), 'C');
  assert.strictEqual(board.scoreToGrade(30), 'D');
});

test('gradeLabel 返回中文标签', function () {
  assert.strictEqual(board.gradeLabel(85), '优秀');
  assert.strictEqual(board.gradeLabel(70), '良好');
  assert.strictEqual(board.gradeLabel(55), '一般');
  assert.strictEqual(board.gradeLabel(30), '需改进');
});

test('buildVerdict 与总体评分一致', function () {
  var goodScorecard = { overall: { score: 85, grade: 'A' }, growth: {}, profit: {}, risk: {}, budget: {} };
  var badScorecard = { overall: { score: 30, grade: 'D' }, growth: {}, profit: {}, risk: {}, budget: {} };

  assert.strictEqual(board.buildVerdict(goodScorecard).decision, 'approve');
  assert.strictEqual(board.buildVerdict(badScorecard).decision, 'reject');
});

// ─── Group E: REVIEW_ONLY ─────────────────────────────────

test('不含 .env 引用', function () {
  var code = require('fs').readFileSync(__filename.replace('test-autonomous-board.cjs', 'autonomous-board.js'), 'utf-8');
  assert.strictEqual(code.indexOf('.env'), -1);
});

test('不含 deploy/merge', function () {
  var code = require('fs').readFileSync(__filename.replace('test-autonomous-board.cjs', 'autonomous-board.js'), 'utf-8');
  var lower = code.toLowerCase();
  assert.strictEqual(lower.indexOf('deploy'), -1);
  assert.strictEqual(lower.indexOf('merge'), -1);
});

// ─── Group F: Idempotency ─────────────────────────────────

test('conveneBoardMeeting 幂等 — 每次不同 meetingId', function () {
  var m1 = board.conveneBoardMeeting();
  var m2 = board.conveneBoardMeeting();
  assert.notStrictEqual(m1.meetingId, m2.meetingId);
});

test('同上下文同投票分布', function () {
  var ctx = { gmv: 45000, profit: 12000, profitMargin: 0.28, roi: 2.1, refundRate: 0.04,
    missionSuccessRate: 0.90, gmvTrend: 'stable', profitTrend: 'stable', budgetScore: 65, budgetStatus: 'caution',
    budgetRemaining: 18000, planDays: 7, planRiskLevel: 'medium', currentMonth: 5 };

  var m1 = board.simulateVoting(ctx);
  var m2 = board.simulateVoting(ctx);
  m1.forEach(function (m, i) { assert.strictEqual(m.vote, m2[i].vote); });
});

// ─── Results ──────────────────────────────────────────────

console.log('');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
