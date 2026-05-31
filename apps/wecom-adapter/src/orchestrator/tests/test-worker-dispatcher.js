/**
 * test-worker-dispatcher.js
 * 测试 Worker 调度器的 payload 生成和 assignee 验证
 */

const {
  generateDispatchPayload, listAssignees,
  getAssigneeConfig, VALID_ASSIGNEES, ASSIGNEE_CONFIG,
} = require('../worker-dispatcher');

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

// ── Test 1: VALID_ASSIGNEES ──
console.log('\n── Test 1: VALID_ASSIGNEES ──');
assert(VALID_ASSIGNEES.length === 4, 'should have 4 valid assignees');
assert(VALID_ASSIGNEES.includes('codex'), 'should include codex');
assert(VALID_ASSIGNEES.includes('workbuddy'), 'should include workbuddy');
assert(VALID_ASSIGNEES.includes('deepseek'), 'should include deepseek');
assert(VALID_ASSIGNEES.includes('doubao'), 'should include doubao');

// ── Test 2: ASSIGNEE_CONFIG ──
console.log('\n── Test 2: ASSIGNEE_CONFIG ──');
for (const key of VALID_ASSIGNEES) {
  const cfg = ASSIGNEE_CONFIG[key];
  assert(cfg && cfg.name && cfg.provider && cfg.model, key + ' should have full config');
  assert(Array.isArray(cfg.capabilities) && cfg.capabilities.length > 0, key + ' should have capabilities');
}

// ── Test 3: generateDispatchPayload — codex ──
console.log('\n── Test 3: generateDispatchPayload — codex ──');
const codexTask = {
  taskId: 'task-codex-001',
  assignee: 'codex',
  userRequest: '修复 ROI 计算 bug',
  branch: 'feature/fix-roi',
  patchFile: 'fix-roi.patch',
  forbidden: ['nginx', '.env'],
  acceptance: 'ROI 计算正确',
};
const codexResult = generateDispatchPayload(codexTask);
assert(codexResult.error === undefined, 'codex should not have error');
assert(codexResult.assignee === 'codex', 'assignee should be codex');
assert(codexResult.assigneeName === 'Codex', 'assigneeName should be Codex');
assert(codexResult.payload.provider === 'OpenAI', 'provider should be OpenAI');
assert(codexResult.payload.model === 'gpt-4o', 'model should be gpt-4o');
assert(codexResult.payload.taskId === 'task-codex-001', 'taskId should be preserved');
assert(codexResult.payload.status === 'pending', 'status should be pending');
assert(codexResult.payload.instruction.includes('ROI 计算 bug'), 'instruction should include user request');
assert(codexResult.payload.instruction.includes('## Forbidden'), 'instruction should include forbidden');
assert(codexResult.payload.instruction.includes('nginx'), 'instruction should include nginx');
assert(codexResult.payload.instruction.includes('## Branch'), 'instruction should include branch');
assert(codexResult.payload.instruction.includes('## Acceptance Criteria'), 'instruction should include acceptance');

// ── Test 4: generateDispatchPayload — workbuddy ──
console.log('\n── Test 4: generateDispatchPayload — workbuddy ──');
const wbTask = { taskId: 'task-wb-001', assignee: 'workbuddy', userRequest: '生成运营分析' };
const wbResult = generateDispatchPayload(wbTask);
assert(wbResult.assignee === 'workbuddy', 'assignee should be workbuddy');
assert(wbResult.assigneeName === 'WorkBuddy', 'assigneeName should be WorkBuddy');
assert(wbResult.payload.model === 'claude-sonnet', 'model should be claude-sonnet');
assert(wbResult.payload.instruction.includes('To: WorkBuddy'), 'instruction should mention WorkBuddy');

// ── Test 5: generateDispatchPayload — deepseek ──
console.log('\n── Test 5: generateDispatchPayload — deepseek ──');
const dsTask = { taskId: 'task-ds-001', assignee: 'deepseek', userRequest: '分析风险趋势' };
const dsResult = generateDispatchPayload(dsTask);
assert(dsResult.assignee === 'deepseek', 'assignee should be deepseek');
assert(dsResult.payload.model === 'deepseek-chat', 'model should be deepseek-chat');

// ── Test 6: generateDispatchPayload — doubao ──
console.log('\n── Test 6: generateDispatchPayload — doubao ──');
const dbTask = { taskId: 'task-db-001', assignee: 'doubao', userRequest: '写视频脚本' };
const dbResult = generateDispatchPayload(dbTask);
assert(dbResult.assignee === 'doubao', 'assignee should be doubao');
assert(dbResult.assigneeName === '豆包', 'assigneeName should be 豆包');
assert(dbResult.payload.provider === 'ByteDance', 'provider should be ByteDance');

// ── Test 7: generateDispatchPayload — unknown assignee ──
console.log('\n── Test 7: generateDispatchPayload — unknown ──');
const unknownTask = { taskId: 'task-xx-001', assignee: 'openai', userRequest: 'test' };
const unknownResult = generateDispatchPayload(unknownTask);
assert(unknownResult.error !== undefined, 'unknown should have error');
assert(unknownResult.payload === null, 'unknown payload should be null');
assert(unknownResult.error.includes('Unknown assignee'), 'error should mention unknown assignee');

// ── Test 8: generateDispatchPayload — default assignee ──
console.log('\n── Test 8: generateDispatchPayload — default ──');
const defaultTask = { taskId: 'task-default', userRequest: 'test' };
const defaultResult = generateDispatchPayload(defaultTask);
assert(defaultResult.assignee === 'workbuddy', 'default assignee should be workbuddy');

// ── Test 9: generateDispatchPayload — v0.5 note ──
console.log('\n── Test 9: generateDispatchPayload — v0.5 note ──');
assert(codexResult.payload._note.includes('v0.5'), 'payload should have v0.5 note');
assert(codexResult.payload._note.includes('real AI API call'), 'should note real AI API call');

// ── Test 10: listAssignees ──
console.log('\n── Test 10: listAssignees ──');
const assignees = listAssignees();
assert(assignees.length === 4, 'should list 4 assignees');
assignees.forEach(function(a) {
  assert(a.key && a.name && a.provider && a.model && a.capabilities, 'each assignee should be complete');
});

// ── Test 11: getAssigneeConfig ──
console.log('\n── Test 11: getAssigneeConfig ──');
const codexCfg = getAssigneeConfig('codex');
assert(codexCfg && codexCfg.name === 'Codex', 'should get Codex config');
const doubaoCfg = getAssigneeConfig('DOUBAO');
assert(doubaoCfg && doubaoCfg.name === '豆包', 'should get 豆包 config (case insensitive)');
const missingCfg = getAssigneeConfig('nonexistent');
assert(missingCfg === null, 'should return null for unknown');

// ── Report ──
console.log('\n' + '='.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
