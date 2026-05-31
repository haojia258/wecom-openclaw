/**
 * test-runtime-state-machine.js
 * 测试状态机的合法转换和非法转换拦截
 */

const {
  validateTransition, transition,
  getNextStates, getNextAction,
  getStateGraph, VALID_TRANSITIONS, TERMINAL_STATUSES,
} = require('../runtime-state-machine');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL: ' + msg);
  }
}

// ── Test 1: VALID_TRANSITIONS structure ──
console.log('\n── Test 1: VALID_TRANSITIONS structure ──');
const states = Object.keys(VALID_TRANSITIONS);
assert(states.length === 8, 'should have 8 non-terminal states');
assert(!VALID_TRANSITIONS.closed, 'closed should not have transitions');
assert(!VALID_TRANSITIONS.rollback_required || VALID_TRANSITIONS.rollback_required.includes('closed'), 'rollback_required should go to closed');

// ── Test 2: validateTransition — valid transitions ──
console.log('\n── Test 2: validateTransition — valid ──');
const validPairs = [
  ['queued', 'planned'],
  ['planned', 'dispatched'],
  ['dispatched', 'artifact_received'],
  ['artifact_received', 'review_pending'],
  ['review_pending', 'approved'],
  ['review_pending', 'rejected'],
  ['approved', 'closed'],
  ['rejected', 'rollback_required'],
  ['rollback_required', 'closed'],
];

validPairs.forEach(function([from, to]) {
  const result = validateTransition(from, to);
  assert(result.valid === true, from + ' → ' + to + ' should be valid');
});

// ── Test 3: validateTransition — invalid transitions ──
console.log('\n── Test 3: validateTransition — invalid ──');
const invalidPairs = [
  ['queued', 'dispatched'],         // skip planned
  ['queued', 'closed'],             // skip everything
  ['dispatched', 'approved'],       // skip artifact and review
  ['approved', 'rejected'],         // wrong direction
  ['review_pending', 'queued'],     // backwards
  ['closed', 'approved'],           // from terminal
];

invalidPairs.forEach(function([from, to]) {
  const result = validateTransition(from, to);
  assert(result.valid === false, from + ' → ' + to + ' should be invalid');
  assert(result.reason, from + ' → ' + to + ' should have reason');
});

// ── Test 4: validateTransition — same state ──
console.log('\n── Test 4: validateTransition — same state ──');
const sameResult = validateTransition('queued', 'queued');
assert(sameResult.valid === false, 'same state should be invalid');
assert(sameResult.reason.includes('same status'), 'reason should mention same status');

// ── Test 5: validateTransition — unknown states ──
console.log('\n── Test 5: validateTransition — unknown states ──');
const unknown1 = validateTransition('eating', 'sleeping');
assert(unknown1.valid === false, 'unknown states should be invalid');

// ── Test 6: transition function ──
console.log('\n── Test 6: transition function ──');
const task = { taskId: 'test-001', status: 'queued', events: [], userRequest: 'test' };
const tResult = transition(task, 'planned');
assert(tResult.success === true, 'transition should succeed');
assert(task.status === 'planned', 'status should be updated');
assert(task.updatedAt, 'updatedAt should be set');
assert(task.lastTransition.from === 'queued', 'lastTransition.from should be queued');
assert(task.lastTransition.to === 'planned', 'lastTransition.to should be planned');
assert(task.events.length === 1, 'should have 1 event');
assert(task.events[0].type === 'state_transition', 'event type should be state_transition');

// 非法转移
const task2 = { taskId: 'test-002', status: 'queued' };
const badResult = transition(task2, 'closed');
assert(badResult.success === false, 'illegal transition should fail');
assert(badResult.error, 'illegal transition should have error message');

// bad task
const badTask = transition(null, 'planned');
assert(badTask.success === false, 'null task should fail');

// ── Test 7: getNextStates ──
console.log('\n── Test 7: getNextStates ──');
assert(getNextStates('queued').length === 1, 'queued should have 1 next');
assert(getNextStates('queued')[0] === 'planned', 'queued next should be planned');
assert(getNextStates('review_pending').length === 2, 'review_pending should have 2 next');
assert(getNextStates('review_pending').includes('approved'), 'should include approved');
assert(getNextStates('review_pending').includes('rejected'), 'should include rejected');
assert(getNextStates('closed').length === 0, 'closed should have 0 next');

// ── Test 8: getNextAction ──
console.log('\n── Test 8: getNextAction ──');
assert(getNextAction('queued') === 'plan', 'queued → plan');
assert(getNextAction('planned') === 'dispatch', 'planned → dispatch');
assert(getNextAction('dispatched') === 'receive_artifact', 'dispatched → receive_artifact');
assert(getNextAction('artifact_received') === 'review', 'artifact_received → review');
assert(getNextAction('review_pending') === 'approve_or_reject', 'review_pending → approve_or_reject');
assert(getNextAction('approved') === 'close', 'approved → close');
assert(getNextAction('rejected') === 'plan_rollback', 'rejected → plan_rollback');
assert(getNextAction('rollback_required') === 'close', 'rollback_required → close');
assert(getNextAction('closed') === 'none', 'closed → none');

// ── Test 9: TERMINAL_STATUSES ──
console.log('\n── Test 9: TERMINAL_STATUSES ──');
assert(TERMINAL_STATUSES.includes('closed'), 'closed should be terminal');

// ── Test 10: getStateGraph ──
console.log('\n── Test 10: getStateGraph ──');
const graph = getStateGraph();
assert(Object.keys(graph).length === 8, 'graph should have 8 source states');

// ── Test 11: full workflow simulation ──
console.log('\n── Test 11: full workflow simulation ──');
const simTask = { taskId: 'sim-001', status: 'queued', events: [] };
const flow = ['planned', 'dispatched', 'artifact_received', 'review_pending', 'approved', 'closed'];
let simOk = true;
flow.forEach(function(target) {
  const r = transition(simTask, target);
  if (!r.success) {
    simOk = false;
    console.error('  FAIL: Sim transition ' + simTask.status + ' → ' + target + ': ' + r.error);
  }
});
assert(simOk, 'full flow should succeed');
assert(simTask.status === 'closed', 'should end at closed');
assert(simTask.events.length === 6, 'should have 6 transition events');

// ── Report ──
console.log('\n' + '='.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
