/**
 * test-task-queue.js
 * 测试任务队列 CRUD 操作
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// 使用临时目录避免污染真实存储
const tmpDir = path.join(os.tmpdir(), 'orchestrator-test-' + Date.now());
const {
  createTask, getTask, listTasks, listAllTasks,
  updateStatus, updateTask, appendEvent,
  setStorageDir, getStorageDir, getTasksPath,
  VALID_STATUSES, generateTaskId,
} = require('../task-queue');

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

// 设置临时存储目录
setStorageDir(tmpDir);
console.log('Storage dir:', getStorageDir());

// ── Test 1: createTask ──
console.log('\n── Test 1: createTask ──');
const task1 = createTask({
  userRequest: '修复 ROI 计算 bug',
  assignee: 'codex',
  branch: 'feature/fix-roi',
  forbidden: ['nginx', '.env'],
  acceptance: 'ROI 计算正确',
});

assert(task1.taskId && task1.taskId.startsWith('task-'), 'taskId should start with task-');
assert(task1.status === 'queued', 'status should be queued');
assert(task1.assignee === 'codex', 'assignee should be codex');
assert(task1.userRequest === '修复 ROI 计算 bug', 'userRequest should match');
assert(task1.branch === 'feature/fix-roi', 'branch should match');
assert(Array.isArray(task1.forbidden) && task1.forbidden.length === 2, 'forbidden should have 2 items');
assert(task1.acceptance === 'ROI 计算正确', 'acceptance should match');
assert(task1.createdAt, 'createdAt should exist');
assert(task1.events.length === 0, 'events should start empty');

// 验证 JSONL 文件存在
const tasksPath = getTasksPath();
assert(fs.existsSync(tasksPath), 'tasks.jsonl should exist');
console.log('  tasks.jsonl:', tasksPath);

// ── Test 2: getTask ──
console.log('\n── Test 2: getTask ──');
const found = getTask(task1.taskId);
assert(found !== null, 'should find created task');
assert(found.taskId === task1.taskId, 'taskId should match');
assert(found.assignee === 'codex', 'assignee should match');

const notFound = getTask('task-nonexistent');
assert(notFound === null, 'should return null for nonexistent task');

// ── Test 3: createTask defaults ──
console.log('\n── Test 3: createTask defaults ──');
const task2 = createTask({});
assert(task2.status === 'queued', 'default status should be queued');
assert(task2.assignee === 'workbuddy', 'default assignee should be workbuddy');
assert(task2.userRequest === '', 'default userRequest should be empty');
assert(task2.taskId !== task1.taskId, 'taskIds should be unique');

// ── Test 4: updateStatus ──
console.log('\n── Test 4: updateStatus ──');
const updated = updateStatus(task1.taskId, 'planned');
assert(updated.status === 'planned', 'status should be updated to planned');
assert(updated.updatedAt !== task1.updatedAt, 'updatedAt should change');
assert(updated.events.length > 0, 'events should be appended');

// 非法状态
try {
  updateStatus(task1.taskId, 'invalid-status');
  assert(false, 'should throw for invalid status');
} catch (e) {
  assert(e.message.includes('Invalid status'), 'should reject invalid status');
}

// ── Test 5: updateTask ──
console.log('\n── Test 5: updateTask ──');
const patched = updateTask(task1.taskId, {
  assignee: 'deepseek',
  branch: 'feature/fix-roi-v2',
});
assert(patched.assignee === 'deepseek', 'assignee should be updated');
assert(patched.branch === 'feature/fix-roi-v2', 'branch should be updated');

// ── Test 6: appendEvent ──
console.log('\n── Test 6: appendEvent ──');
const evented = appendEvent(task1.taskId, { type: 'review', result: 'pass' });
const foundAgain = getTask(task1.taskId);
const lastEvent = foundAgain.events[foundAgain.events.length - 1];
assert(lastEvent.type === 'review', 'last event type should be review');
assert(lastEvent.result === 'pass', 'last event result should be pass');
assert(lastEvent.ts, 'event should have timestamp');

// ── Test 7: listTasks ──
console.log('\n── Test 7: listTasks ──');
const list = listTasks(10);
assert(list.length >= 2, 'should list at least 2 tasks');
assert(list[0].taskId === task1.taskId || list[0].taskId === task2.taskId, 'latest task first');

// ── Test 8: listAllTasks ──
console.log('\n── Test 8: listAllTasks ──');
const all = listAllTasks();
assert(all.length >= 2, 'all tasks should be at least 2');

// ── Test 9: generateTaskId ──
console.log('\n── Test 9: generateTaskId ──');
const id1 = generateTaskId();
const id2 = generateTaskId();
assert(id1.startsWith('task-'), 'generated id should start with task-');
assert(id1 !== id2, 'generated ids should be unique');

// ── Test 10: VALID_STATUSES ──
console.log('\n── Test 10: VALID_STATUSES ──');
assert(VALID_STATUSES.length === 9, 'should have 9 valid statuses');
assert(VALID_STATUSES.includes('queued'), 'should include queued');
assert(VALID_STATUSES.includes('closed'), 'should include closed');

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
