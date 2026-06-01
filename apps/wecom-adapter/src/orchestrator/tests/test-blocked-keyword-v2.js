'use strict';

/**
 * test-blocked-keyword-v2.js — BLOCKED_KEYWORD v2 升级测试
 */

var passed = 0; var failed = 0;
function assert(name, condition, detail) {
  if (condition) passed++;
  else { failed++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
}
function summary() {
  console.log('\n═══ BLOCKED_KEYWORD v2 Test Results ═══');
  console.log('Passed: ' + passed + ' / ' + (passed + failed));
  if (failed > 0) { console.log('Failed: ' + failed); process.exit(1); }
  else console.log('✅ All tests passed!');
}

var wl = require('../worker-allowlist.js');

// ═══════════════════════════════════════════
// Test 1: 危险命令拦截
// ═══════════════════════════════════════════
console.log('── Test 1: 危险命令拦截 ──');

var blocked = [
  { text: 'deploy production now', desc: 'deploy production' },
  { text: 'pm2 restart wecom-adapter', desc: 'pm2 restart' },
  { text: 'nginx -s reload', desc: 'nginx reload' },
  { text: 'sudo rm -rf /tmp', desc: 'sudo rm' },
  { text: 'systemctl restart nginx', desc: 'systemctl restart' },
  { text: '修改 .env 文件', desc: '修改 .env' },
  { text: 'apply patch to fix', desc: 'apply patch' },
  { text: 'git push --force origin', desc: 'git push --force' },
  { text: 'rollback to previous', desc: 'rollback' },
  { text: '部署到生产环境', desc: '部署到生产' },
];

blocked.forEach(function (tc) {
  var r = wl.check({ userRequest: tc.desc + ' ' + tc.text });
  assert('BLOCKED: ' + tc.desc, r.allowed === false, JSON.stringify(r));
});

// ═══════════════════════════════════════════
// Test 2: 安全上下文放行
// ═══════════════════════════════════════════
console.log('── Test 2: 安全上下文放行 ──');

var allowed = [
  '禁止 deploy purpose',
  '不要 deploy',
  '不允许 deploy',
  '严禁 deploy 到生产',
  'REVIEW_ONLY=true prohibit deploy',
  '禁止自动部署',
  '禁止 merge',
  '不要修改 .env',
  '审计 deploy 配置',
  'review 部署流程',
  '禁止 pm2 restart',
  '不能修改 nginx',
  '审查 deploy 方案',
];

// Note: allowed check uses isAllowedText which internally calls check()
// But we need to also verify check() doesn't falsely block
allowed.forEach(function (text) {
  var r = wl.check({ userRequest: text });
  // For allowed test, we check it's not blocked by DANGER_PATTERNS
  var blockedByV2 = r.allowed === false && r.reason && r.reason.indexOf('BLOCKED_KEYWORD v2') >= 0;
  assert('SAFE: ' + text, blockedByV2 === false,
    blockedByV2 ? 'BLOCKED: ' + r.reason : 'OK');
});

// ═══════════════════════════════════════════
// Test 3: 无上下文时的正常行为
// ═══════════════════════════════════════════
console.log('── Test 3: 正常任务文本 ──');

var normal = [
  'create a review for PR',
  'summary of today analysis',
  'planner for next week',
  'REVIEW_ONLY task',
  'analysis of data report',
];

normal.forEach(function (text) {
  var r = wl.isAllowedText(text);
  assert('NORMAL: ' + text, r === true, 'Got: ' + r);
});

// ═══════════════════════════════════════════
// Test 4: 边缘情况
// ═══════════════════════════════════════════
console.log('── Test 4: 边缘情况 ──');

// 混合文本: "禁止 deploy" 出现在 "deploy production" 前面 → 安全
var r1 = wl.check({ userRequest: '我们禁止 deploy 到生产环境。请做 analysis。' });
assert('mixed safe: 禁止前缀在前', r1.allowed === true, JSON.stringify(r1));

// 混合文本: "deploy production" 单独出现，无安全前缀
var r2 = wl.check({ userRequest: 'deploy production now' });
assert('mixed unsafe: 纯命令', r2.allowed === false, JSON.stringify(r2));

// 空文本
var r3 = wl.check({ userRequest: '' });
assert('empty text', r3.allowed === false);

// 只有安全标记
var r4 = wl.isSafeContext('REVIEW_ONLY=true');
assert('REVIEW_ONLY is safe context', r4 === true);

var r5 = wl.isSafeContext('deploy production');
assert('deploy production NOT safe context', r5 === false);

// v2 匹配器
var m1 = wl.findDangerPattern('deploy production now');
assert('findDangerPattern finds deploy', m1 !== null);

var m2 = wl.findDangerPattern('just an analysis report');
assert('findDangerPattern ignores safe text', m2 === null);

summary();
