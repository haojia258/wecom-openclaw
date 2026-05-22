/**
 * test-artifact-store.js
 * 测试产物存储的保存、读取、列出操作
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const tmpDir = path.join(os.tmpdir(), 'artifact-test-' + Date.now());
const {
  saveArtifact, saveArtifacts, readArtifact,
  listArtifacts, hasArtifact, getArtifactDir,
  getArtifactPath, ensureArtifactDir,
  setBaseDir, getBaseDir,
} = require('../artifact-store');

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

setBaseDir(tmpDir);
console.log('Base dir:', getBaseDir());

const taskId = 'task-test-artifact-001';

// ── Test 1: ensureArtifactDir ──
console.log('\n── Test 1: ensureArtifactDir ──');
const dir = ensureArtifactDir(taskId);
assert(fs.existsSync(dir), 'artifact directory should exist');
console.log('  Dir:', dir);

// ── Test 2: saveArtifact ──
console.log('\n── Test 2: saveArtifact ──');
const promptPath = saveArtifact(taskId, 'prompt', 'This is a test prompt');
assert(fs.existsSync(promptPath), 'prompt file should exist');
const patchPath = saveArtifact(taskId, 'patch', '--- a/file.js\n+++ b/file.js');
assert(fs.existsSync(patchPath), 'patch file should exist');
const reviewPath = saveArtifact(taskId, 'review', '# Review\nPassed');
assert(fs.existsSync(reviewPath), 'review file should exist');
const diffPath = saveArtifact(taskId, 'diff', 'diff output');
assert(fs.existsSync(diffPath), 'diff file should exist');
const logsPath = saveArtifact(taskId, 'logs', 'log line 1\nlog line 2');
assert(fs.existsSync(logsPath), 'logs file should exist');
const rollbackPath = saveArtifact(taskId, 'rollbackPlan', 'Rollback step 1');
assert(fs.existsSync(rollbackPath), 'rollbackPlan file should exist');

// 非法类型
try {
  saveArtifact(taskId, 'unknown', 'test');
  assert(false, 'should throw for unknown type');
} catch (e) {
  assert(e.message.includes('Unknown artifact type'), 'should reject unknown type');
}

// ── Test 3: readArtifact ──
console.log('\n── Test 3: readArtifact ──');
const prompt = readArtifact(taskId, 'prompt');
assert(prompt === 'This is a test prompt', 'prompt content should match');
const review = readArtifact(taskId, 'review');
assert(review === '# Review\nPassed', 'review content should match');

// 不存在的产物
const missing = readArtifact(taskId, 'rollbackPlan');
assert(missing === 'Rollback step 1', 'rollbackPlan should exist');

// 不存在的 taskId
const noTask = readArtifact('nonexistent-task', 'prompt');
assert(noTask === null, 'should return null for nonexistent task');

// ── Test 4: listArtifacts ──
console.log('\n── Test 4: listArtifacts ──');
const artifacts = listArtifacts(taskId);
assert(artifacts.length === 6, 'should list 6 artifacts');
assert(artifacts.includes('prompt.txt'), 'should include prompt.txt');
assert(artifacts.includes('patch.diff'), 'should include patch.diff');
assert(artifacts.includes('review.md'), 'should include review.md');

// 不存在的 taskId
const emptyList = listArtifacts('nonexistent-task');
assert(emptyList.length === 0, 'should return empty for nonexistent task');

// ── Test 5: saveArtifacts (batch) ──
console.log('\n── Test 5: saveArtifacts (batch) ──');
const taskId2 = 'task-test-artifact-002';
const saved = saveArtifacts(taskId2, {
  prompt: 'Batch prompt',
  patch: 'Batch patch',
  review: 'Batch review',
  rollbackPlan: null,  // skip null
});
assert(Object.keys(saved).length === 3, 'should save 3 artifacts');
assert(saved.prompt, 'should have prompt path');
assert(saved.patch, 'should have patch path');

const batchArtifacts = listArtifacts(taskId2);
assert(batchArtifacts.length === 3, 'should have 3 artifacts');

// ── Test 6: hasArtifact ──
console.log('\n── Test 6: hasArtifact ──');
assert(hasArtifact(taskId, 'prompt') === true, 'should have prompt');
assert(hasArtifact(taskId, 'logs') === true, 'should have logs');
assert(hasArtifact(taskId, 'review') === true, 'should have review');
assert(hasArtifact('nonexistent', 'prompt') === false, 'should not have for nonexistent');

// ── Test 7: getArtifactPath ──
console.log('\n── Test 7: getArtifactPath ──');
const pPath = getArtifactPath(taskId, 'prompt');
assert(pPath.endsWith('prompt.txt'), 'path should end with prompt.txt');
assert(pPath.includes(taskId), 'path should include taskId');

// ── Test 8: getArtifactDir ──
console.log('\n── Test 8: getArtifactDir ──');
const artDir = getArtifactDir(taskId);
assert(artDir.endsWith(taskId), 'dir should end with taskId');

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
