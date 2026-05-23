/**
 * test-worker-allowlist.js — 白名单任务限制测试
 *
 * 测试 worker-allowlist.js:
 *   - 允许 review/summary/analysis/planner
 *   - 禁止 patch/apply/deploy/rollback/nginx/env
 *   - 无匹配 → 拒绝
 *   - isAllowedText() 宽松模式
 *   - getKeywordLists() 返回正确
 */
'use strict';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { console.error('  FAIL: ' + msg); failed++; }
}

console.log('\n=== Worker Allowlist Tests ===\n');

// Test 1: 模块加载
console.log('Test 1: Module loads');
const allowlist = require('../worker-allowlist');
assert(typeof allowlist === 'object', 'allowlist should be an object');
assert(typeof allowlist.check === 'function', 'check should be a function');
assert(typeof allowlist.isAllowedText === 'function', 'isAllowedText should be a function');
assert(typeof allowlist.getKeywordLists === 'function', 'getKeywordLists should be a function');

// Test 2: 允许关键词 - review
console.log('\nTest 2: Allowed keyword - review');
var r = allowlist.check({ userRequest: '代码 review 任务' });
assert(r.allowed === true, 'review should be allowed');
assert(r.matchedKeyword === 'review', 'matchedKeyword should be review');

// Test 3: 允许关键词 - summary
console.log('\nTest 3: Allowed keyword - summary');
var r2 = allowlist.check({ userRequest: '生成运营 summary' });
assert(r2.allowed === true, 'summary should be allowed');

// Test 4: 允许关键词 - analysis
console.log('\nTest 4: Allowed keyword - analysis');
var r3 = allowlist.check({ userRequest: '数据分析 analysis 报告' });
assert(r3.allowed === true, 'analysis should be allowed');

// Test 5: 允许关键词 - planner
console.log('\nTest 5: Allowed keyword - planner');
var r4 = allowlist.check({ userRequest: '开发 AI planner' });
assert(r4.allowed === true, 'planner should be allowed');

// Test 6: 禁止关键词 - patch
console.log('\nTest 6: Blocked keyword - patch');
var r5 = allowlist.check({ userRequest: '生成 patch 文件' });
assert(r5.allowed === false, 'patch should be blocked');
assert(r5.reason.indexOf('BLOCKED_KEYWORD') !== -1, 'reason should contain BLOCKED_KEYWORD');

// Test 7: 禁止关键词 - apply
console.log('\nTest 7: Blocked keyword - apply');
var r6 = allowlist.check({ userRequest: 'apply 补丁' });
assert(r6.allowed === false, 'apply should be blocked');

// Test 8: 禁止关键词 - deploy
console.log('\nTest 8: Blocked keyword - deploy');
var r7 = allowlist.check({ userRequest: 'deploy 到生产环境' });
assert(r7.allowed === false, 'deploy should be blocked');

// Test 9: 禁止关键词 - rollback
console.log('\nTest 9: Blocked keyword - rollback');
var r8 = allowlist.check({ userRequest: '执行 rollback 操作' });
assert(r8.allowed === false, 'rollback should be blocked');

// Test 10: 禁止关键词 - nginx
console.log('\nTest 10: Blocked keyword - nginx');
var r9 = allowlist.check({ userRequest: '修改 nginx 配置' });
assert(r9.allowed === false, 'nginx should be blocked');

// Test 11: 禁止关键词 - env
console.log('\nTest 11: Blocked keyword - env');
var r10 = allowlist.check({ userRequest: '修改 .env 文件' });
assert(r10.allowed === false, 'env should be blocked');

// Test 12: 无匹配关键词 → 拒绝
console.log('\nTest 12: No match → rejected');
var r11 = allowlist.check({ userRequest: '随便写点什么' });
assert(r11.allowed === false, 'no match should be rejected');
assert(r11.reason.indexOf('NOT_IN_ALLOWLIST') !== -1, 'reason should contain NOT_IN_ALLOWLIST');

// Test 13: 空任务 → 拒绝
console.log('\nTest 13: Empty task → rejected');
var r12 = allowlist.check({});
assert(r12.allowed === false, 'empty task should be rejected');

// Test 14: 禁止词优先于允许词
console.log('\nTest 14: Blocked takes priority over allowed');
var r13 = allowlist.check({ userRequest: 'deploy review analysis' });
assert(r13.allowed === false, 'blocked keyword should have priority');
assert(r13.matchedKeyword === 'deploy', 'matchedKeyword should be deploy');

// Test 15: 大小写不敏感
console.log('\nTest 15: Case insensitive');
var r14 = allowlist.check({ userRequest: 'PATCH Review' });
assert(r14.allowed === false, 'PATCH should be blocked regardless of case');

// Test 16: patchFile 也被检查
console.log('\nTest 16: patchFile is also checked');
var r15 = allowlist.check({ userRequest: 'review code', patchFile: 'dangerous-apply.js' });
assert(r15.allowed === false, 'apply in patchFile should be blocked');

// Test 17: isAllowedText() 宽松模式
console.log('\nTest 17: isAllowedText() relaxed mode');
assert(allowlist.isAllowedText('代码 review') === true, 'review text should pass');
assert(allowlist.isAllowedText('deploy production') === false, 'deploy text should fail');
assert(allowlist.isAllowedText('') === false, 'empty text should fail');
assert(allowlist.isAllowedText(null) === false, 'null should fail');

// Test 18: getKeywordLists()
console.log('\nTest 18: getKeywordLists()');
var lists = allowlist.getKeywordLists();
assert(Array.isArray(lists.allowed), 'allowed should be array');
assert(Array.isArray(lists.blocked), 'blocked should be array');
assert(lists.allowed.indexOf('review') !== -1, 'allowed should include review');
assert(lists.blocked.indexOf('patch') !== -1, 'blocked should include patch');

// Summary
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
process.exit(failed > 0 ? 1 : 0);
