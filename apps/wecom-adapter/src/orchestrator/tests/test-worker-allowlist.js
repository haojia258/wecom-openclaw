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

// Test 19: 中文危险词绕过 - review 部署到生产环境 → blocked
console.log('\nTest 19: Chinese bypass - review 部署到生产环境 → blocked');
var r19 = allowlist.check({ userRequest: 'review 部署到生产环境' });
assert(r19.allowed === false, 'review + 部署到生产环境 should be blocked by Chinese keyword');
assert(r19.reason.indexOf('BLOCKED_KEYWORD') !== -1, 'reason should be BLOCKED_KEYWORD');

// Test 20: 中文危险词绕过 - analysis 回滚方案 → blocked
console.log('\nTest 20: Chinese bypass - analysis 回滚方案 → blocked');
var r20 = allowlist.check({ userRequest: 'analysis 回滚方案' });
assert(r20.allowed === false, 'analysis + 回滚方案 should be blocked by Chinese keyword');
assert(r20.matchedKeyword !== 'analysis', 'matchedKeyword should NOT be analysis');

// Test 21: 中文危险词绕过 - summary 应用补丁 → blocked
console.log('\nTest 21: Chinese bypass - summary 应用补丁 → blocked');
var r21 = allowlist.check({ userRequest: 'summary 应用补丁' });
assert(r21.allowed === false, 'summary + 应用补丁 should be blocked by Chinese keyword');

// Test 22: 中文危险词绕过 - planner 修改环境变量 → blocked
console.log('\nTest 22: Chinese bypass - planner 修改环境变量 → blocked');
var r22 = allowlist.check({ userRequest: 'planner 修改环境变量' });
assert(r22.allowed === false, 'planner + 修改环境变量 should be blocked by Chinese keyword');

// Test 23: 中文危险词绕过 - review nginx配置修改 → blocked
console.log('\nTest 23: Chinese bypass - review nginx配置修改 → blocked');
var r23 = allowlist.check({ userRequest: 'review nginx配置修改' });
assert(r23.allowed === false, 'review + nginx配置 should be blocked by Chinese keyword');

// Test 24: 混合绕过 - analysis deploy方案 → blocked
console.log('\nTest 24: Mixed bypass - analysis deploy方案 → blocked');
var r24 = allowlist.check({ userRequest: 'analysis deploy方案' });
assert(r24.allowed === false, 'analysis + deploy should be blocked');

// Test 25: 纯中文危险词 → blocked
console.log('\nTest 25: Pure Chinese dangerous keywords → blocked');
var r25 = allowlist.check({ userRequest: '部署到生产环境' });
assert(r25.allowed === false, 'pure Chinese 部署 should be blocked');

// Test 26: 企业微信主链路 → blocked
console.log('\nTest 26: 企业微信主链路 → blocked');
var r26 = allowlist.check({ userRequest: 'review 企业微信主链路 优化' });
assert(r26.allowed === false, '企业微信主链路 should be blocked');

// Test 27: 加密解密 → blocked
console.log('\nTest 27: 加密解密 → blocked');
var r27 = allowlist.check({ userRequest: 'analysis 加密解密 方案' });
assert(r27.allowed === false, '加密解密 should be blocked');

// Test 28: 配置文件 → blocked
console.log('\nTest 28: 配置文件 → blocked');
var r28 = allowlist.check({ userRequest: 'planner 修改配置文件' });
assert(r28.allowed === false, '配置文件 should be blocked');

// Test 29: isAllowedText 中文绕过防护
console.log('\nTest 29: isAllowedText() Chinese bypass protection');
assert(allowlist.isAllowedText('review 部署到生产环境') === false, 'isAllowedText should block Chinese 部署');
assert(allowlist.isAllowedText('analysis 回滚方案') === false, 'isAllowedText should block Chinese 回滚');
assert(allowlist.isAllowedText('summary 应用补丁') === false, 'isAllowedText should block Chinese 应用补丁');
assert(allowlist.isAllowedText('planner 修改环境变量') === false, 'isAllowedText should block Chinese 修改环境变量');

// Test 30: getKeywordLists 包含中文关键词
console.log('\nTest 30: getKeywordLists() includes Chinese keywords');
var lists2 = allowlist.getKeywordLists();
assert(lists2.blocked.indexOf('部署') !== -1, 'blocked should include 部署');
assert(lists2.blocked.indexOf('回滚') !== -1, 'blocked should include 回滚');
assert(lists2.blocked.indexOf('应用补丁') !== -1, 'blocked should include 应用补丁');
assert(lists2.blocked.indexOf('修改环境变量') !== -1, 'blocked should include 修改环境变量');
assert(lists2.blocked.indexOf('nginx配置') !== -1, 'blocked should include nginx配置');
assert(lists2.blocked.indexOf('.env') !== -1, 'blocked should include .env');

// Summary
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
process.exit(failed > 0 ? 1 : 0);
