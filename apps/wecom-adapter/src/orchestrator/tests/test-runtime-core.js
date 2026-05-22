/**
 * test-runtime-core.js
 * 端到端测试 Runtime Core 完整生命周期
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// 使用临时目录
const tmpDir = path.join(os.tmpdir(), 'runtime-core-test-' + Date.now());
const orchestratorDir = path.join(tmpDir);

// 注入临时存储目录
const taskQueue = require('../task-queue');
const artifactStore = require('../artifact-store');
const auditRecorder = require('../audit-recorder');

taskQueue.setStorageDir(orchestratorDir);
artifactStore.setBaseDir(path.join(orchestratorDir, 'artifacts'));
auditRecorder.setStorageDir(orchestratorDir);

const runtimeCore = require('../runtime-core');

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

console.log('Storage dir:', orchestratorDir);

// ── Test 1: createRuntimeTask ──
console.log('\n── Test 1: createRuntimeTask ──');
const result = runtimeCore.createRuntimeTask({ userRequest: '修复 ROI 计算 bug' });
const task = result.task;
assert(task && task.taskId, 'should create task');
assert(task.status === 'queued', 'status should be queued');
assert(task.userRequest === '修复 ROI 计算 bug', 'userRequest should match');
assert(result.version === '0.4', 'version should be 0.4');
assert(result.plan, 'should have plan');
assert(result.auditId, 'should have auditId');
console.log('  Task ID:', task.taskId);
console.log('  Audit ID:', result.auditId);

// ── Test 2: planTask ──
console.log('\n── Test 2: planTask ──');
const planned = runtimeCore.planTask(task.taskId);
assert(planned.status === 'planned', 'should be planned');

// 重复规划应失败
try {
  runtimeCore.planTask(task.taskId);
  assert(false, 're-plan should fail');
} catch (e) {
  assert(e.message.includes('Cannot plan'), 're-plan should fail with message');
}

// ── Test 3: dispatchTask ──
console.log('\n── Test 3: dispatchTask ──');
const dispatchResult = runtimeCore.dispatchTask(task.taskId);
assert(dispatchResult.task.status === 'dispatched', 'should be dispatched');
assert(dispatchResult.dispatch.assigneeName, 'should have assignee name');
assert(dispatchResult.dispatch.payload.instruction, 'should have instruction');
console.log('  Assignee:', dispatchResult.dispatch.assigneeName);

// ── Test 4: receiveArtifact ──
console.log('\n── Test 4: receiveArtifact ──');
const artifactResult = runtimeCore.receiveArtifact(task.taskId, {
  patch: '--- a/file.js\n+++ b/file.js\n-foo\n+bar',
  logs: 'Test completed successfully',
});
assert(artifactResult.task.status === 'artifact_received', 'should be artifact_received');
assert(Object.keys(artifactResult.savedArtifacts).length === 2, 'should save 2 artifacts');

// ── Test 5: reviewTask ──
console.log('\n── Test 5: reviewTask ──');
const reviewResult = runtimeCore.reviewTask(task.taskId);
assert(reviewResult.task.status === 'review_pending', 'should be review_pending');
assert(reviewResult.review, 'should have review result');
assert(reviewResult.review.overallRisk, 'should have overallRisk');
assert(reviewResult.review.recommendation, 'should have recommendation');
assert(reviewResult.review.taskId === task.taskId, 'review taskId should match');
console.log('  Risk:', reviewResult.review.overallRisk);
console.log('  Recommendation:', reviewResult.review.recommendation);
console.log('  Safe:', reviewResult.review.safe);

// ── Test 6: approveTask ──
console.log('\n── Test 6: approveTask ──');
const approved = runtimeCore.approveTask(task.taskId);
assert(approved.status === 'approved', 'should be approved');

// ── Test 7: create another task → reject → rollback flow ──
console.log('\n── Test 7: reject → rollback flow ──');
const result2 = runtimeCore.createRuntimeTask({ userRequest: '危险操作：删除数据库' });
const task2 = result2.task;
console.log('  Task 2 ID:', task2.taskId);

runtimeCore.planTask(task2.taskId);
runtimeCore.dispatchTask(task2.taskId);
runtimeCore.receiveArtifact(task2.taskId, { logs: 'done' });

// 审查任务 2
const review2 = runtimeCore.reviewTask(task2.taskId);
console.log('  Task 2 Risk:', review2.review.overallRisk);

// 拒绝
const rejected = runtimeCore.rejectTask(task2.taskId);
assert(rejected.status === 'rejected', 'should be rejected');

// 回滚规划
const rollback = runtimeCore.planRollback(task2.taskId);
assert(rollback.task.status === 'rollback_required', 'should be rollback_required');
assert(rollback.rollbackPlan, 'should have rollback plan');
console.log('  Rollback steps:', rollback.rollbackPlan.steps.length);

// 关闭任务 2
const closed2 = runtimeCore.closeTask(task2.taskId);
assert(closed2.status === 'closed', 'task 2 should be closed');

// ── Test 8: closeTask ──
console.log('\n── Test 8: closeTask ──');
// task 1 是 approved，可以关闭
const closed = runtimeCore.closeTask(task.taskId);
assert(closed.status === 'closed', 'should be closed');

// ── Test 9: getTaskStatus ──
console.log('\n── Test 9: getTaskStatus ──');
const status1 = runtimeCore.getTaskStatus(task.taskId);
assert(status1.status === 'closed', 'task 1 should be closed');
assert(status1.nextAction === 'none', 'closed task should have no next action');

const status2 = runtimeCore.getTaskStatus(task2.taskId);
assert(status2.status === 'closed', 'task 2 should be closed');

// 不存在的任务
const missingStatus = runtimeCore.getTaskStatus('nonexistent');
assert(missingStatus.error, 'should return error for missing task');

// ── Test 10: formatStatusForWecom ──
console.log('\n── Test 10: formatStatusForWecom ──');
const formatted = runtimeCore.formatStatusForWecom(status1);
assert(typeof formatted === 'string', 'should return string');
assert(formatted.includes('🏁'), 'should include closed icon');
assert(formatted.includes(task.taskId), 'should include taskId');

// ── Test 11: VERSION ──
console.log('\n── Test 11: VERSION ──');
assert(runtimeCore.VERSION === '0.4', 'VERSION should be 0.4');

// ── Test 12: error handling ──
console.log('\n── Test 12: error handling ──');
try {
  runtimeCore.planTask('nonexistent-task');
  assert(false, 'should throw for nonexistent task');
} catch (e) {
  assert(e.message.includes('Task not found'), 'should say task not found');
}

// ── Cleanup ──
console.log('\n── Cleanup ──');
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('  Removed:', tmpDir);
} catch (e) {
  console.log('  Cleanup warning:', e.message);
}

// ── Report ──
console.log('\n' + '='.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
