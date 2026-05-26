'use strict';

/**
 * test-rbac.cjs - RBAC 权限系统测试套件 (P6.7.1)
 *
 * 测试覆盖:
 * - user-role-store: getRole 映射, 通配, 未知用户
 * - rbac: canAccessCommand, canUseConfirm
 * - 集成: viewer/operator/admin 权限边界
 */

const path = require('path');
const fs = require('fs');

// ─── 测试工具 ─────────────────────────────────────────────────

var passed = 0;
var failed = 0;
var failures = [];

function assert(condition, message) {
  if (condition) { passed++; }
  else { failed++; failures.push('FAIL: ' + message); }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) { passed++; }
  else { failed++; failures.push('FAIL: ' + message + ' | expected: ' + JSON.stringify(expected) + ' | actual: ' + JSON.stringify(actual)); }
}

function section(name) {
  console.log('\n=== ' + name + ' ===');
}

// ─── 设置测试数据 ──────────────────────────────────────────────

// 创建临时角色文件
const testRolePath = path.join(__dirname, '..', 'data', 'test-user-roles.json');
const testRoleData = {
  admin: ['wecom_admin_1', 'wecom_admin_2'],
  operator: ['wecom_ops_1', 'wecom_ops_2'],
  viewer: ['*']
};
fs.writeFileSync(testRolePath, JSON.stringify(testRoleData, null, 2), 'utf-8');

// 设置 user-role-store 使用测试文件
const userRoleStore = require('../src/auth/user-role-store');
userRoleStore.setRoleFilePath(testRolePath);
userRoleStore.reload();

const rbac = require('../src/auth/rbac');

// ─── 测试 1: user-role-store - getRole 基本映射 ──────────────

section('TEST 1: user-role-store - getRole 基本映射');

assertEqual(userRoleStore.getRole('wecom_admin_1'), 'admin', 'wecom_admin_1 → admin');
assertEqual(userRoleStore.getRole('wecom_admin_2'), 'admin', 'wecom_admin_2 → admin');
assertEqual(userRoleStore.getRole('wecom_ops_1'), 'operator', 'wecom_ops_1 → operator');
assertEqual(userRoleStore.getRole('wecom_ops_2'), 'operator', 'wecom_ops_2 → operator');

// ─── 测试 2: user-role-store - 未知用户默认 viewer ──────────

section('TEST 2: user-role-store - 未知用户默认 viewer');

assertEqual(userRoleStore.getRole('random_user_123'), 'viewer', 'random_user_123 → viewer');
assertEqual(userRoleStore.getRole(''), 'viewer', 'empty string → viewer');
assertEqual(userRoleStore.getRole('unknown'), 'viewer', 'unknown → viewer');

// ─── 测试 3: user-role-store - hasMinRole ────────────────────

section('TEST 3: user-role-store - hasMinRole 层级');

assert(userRoleStore.hasMinRole('admin', 'admin'), 'admin >= admin');
assert(userRoleStore.hasMinRole('admin', 'operator'), 'admin >= operator');
assert(userRoleStore.hasMinRole('admin', 'viewer'), 'admin >= viewer');
assert(userRoleStore.hasMinRole('operator', 'operator'), 'operator >= operator');
assert(userRoleStore.hasMinRole('operator', 'viewer'), 'operator >= viewer');
assert(userRoleStore.hasMinRole('viewer', 'viewer'), 'viewer >= viewer');
assert(!userRoleStore.hasMinRole('viewer', 'operator'), 'viewer < operator');
assert(!userRoleStore.hasMinRole('viewer', 'admin'), 'viewer < admin');
assert(!userRoleStore.hasMinRole('operator', 'admin'), 'operator < admin');

// ─── 测试 4: rbac - viewer 可访问白名单命令 ──────────────────

section('TEST 4: rbac - viewer 可访问白名单命令');

var viewerCmds = ['/目标', '/帮助', '/状态', '/进度', '/任务列表'];
viewerCmds.forEach(function(cmd) {
  var result = rbac.canAccessCommand('random_viewer', cmd);
  assert(result.allowed, 'viewer 可访问 ' + cmd);
});

// ─── 测试 5: rbac - viewer 拒绝非白名单命令 ──────────────────

section('TEST 5: rbac - viewer 拒绝非白名单命令');

var restrictedCmds = ['/任务', '/今日GMV', '/订单', '/利润', '/ping', '/ai调度', '/审查', '/监控', '/ai审计'];
restrictedCmds.forEach(function(cmd) {
  var result = rbac.canAccessCommand('random_viewer', cmd);
  assert(!result.allowed, 'viewer 被拒绝 ' + cmd);
  assert(result.error.indexOf('权限不足') !== -1, cmd + ' 错误信息包含 "权限不足"');
});

// ─── 测试 6: rbac - viewer 无法 confirm:audit ────────────────

section('TEST 6: rbac - viewer 无法 confirm:audit');

var auditCheck = rbac.canUseConfirm('random_viewer', 'confirm:audit');
assert(!auditCheck.allowed, 'viewer 无法 confirm:audit');
assert(auditCheck.error.indexOf('operator') !== -1, '提示需要 operator+ 权限');

// ─── 测试 7: rbac - viewer 无法 confirm:create-pr ────────────

section('TEST 7: rbac - viewer 无法 confirm:create-pr');

var prCheck = rbac.canUseConfirm('random_viewer', 'confirm:create-pr');
assert(!prCheck.allowed, 'viewer 无法 confirm:create-pr');
assert(prCheck.error.indexOf('operator') !== -1, '提示需要 operator+ 权限');

// ─── 测试 8: rbac - operator 可 confirm:audit ────────────────

section('TEST 8: rbac - operator 可 confirm:audit');

var opsAudit = rbac.canUseConfirm('wecom_ops_1', 'confirm:audit');
assert(opsAudit.allowed, 'operator 可 confirm:audit');

// ─── 测试 9: rbac - operator 可 confirm:review ───────────────

section('TEST 9: rbac - operator 可 confirm:review');

var opsReview = rbac.canUseConfirm('wecom_ops_1', 'confirm:review');
assert(opsReview.allowed, 'operator 可 confirm:review');

// ─── 测试 10: rbac - operator 无法 confirm:create-pr ─────────

section('TEST 10: rbac - operator 无法 confirm:create-pr');

var opsPr = rbac.canUseConfirm('wecom_ops_1', 'confirm:create-pr');
assert(!opsPr.allowed, 'operator 无法 confirm:create-pr');
assert(opsPr.error.indexOf('admin') !== -1, '提示需要 admin 权限');

// ─── 测试 11: rbac - admin 全权限 ────────────────────────────

section('TEST 11: rbac - admin 全权限');

// admin 可访问所有命令
restrictedCmds.forEach(function(cmd) {
  var result = rbac.canAccessCommand('wecom_admin_1', cmd);
  assert(result.allowed, 'admin 可访问 ' + cmd);
});

// admin 可使用所有 confirm
assert(rbac.canUseConfirm('wecom_admin_1', 'confirm:audit').allowed, 'admin 可 confirm:audit');
assert(rbac.canUseConfirm('wecom_admin_1', 'confirm:review').allowed, 'admin 可 confirm:review');
assert(rbac.canUseConfirm('wecom_admin_1', 'confirm:create-pr').allowed, 'admin 可 confirm:create-pr');

// ─── 测试 12: rbac - 别名命令权限一致 ────────────────────────

section('TEST 12: rbac - 别名命令权限一致');

// viewer 可通过别名访问白名单命令
assert(rbac.canAccessCommand('random_viewer', '/help').allowed, 'viewer 可访问 /help 别名');
assert(rbac.canAccessCommand('random_viewer', '/status').allowed, 'viewer 可访问 /status 别名');
assert(rbac.canAccessCommand('random_viewer', '/goal').allowed, 'viewer 可访问 /goal 别名');
assert(rbac.canAccessCommand('random_viewer', '/tasklist').allowed, 'viewer 可访问 /tasklist 别名');

// viewer 不能通过别名访问受限命令
assert(!rbac.canAccessCommand('random_viewer', '/task').allowed, 'viewer 被拒绝 /task 别名');
assert(!rbac.canAccessCommand('random_viewer', '/gmv').allowed, 'viewer 被拒绝 /gmv 别名');

// ─── 测试 13: rbac - operator 命令级访问同 viewer ────────────

section('TEST 13: rbac - operator 命令级访问同 viewer');

assert(rbac.canAccessCommand('wecom_ops_1', '/目标').allowed, 'operator 可访问 /目标');
assert(rbac.canAccessCommand('wecom_ops_1', '/帮助').allowed, 'operator 可访问 /帮助');
assert(!rbac.canAccessCommand('wecom_ops_1', '/今日GMV').allowed, 'operator 被拒绝 /今日GMV');

// ─── 测试 14: rbac - getUserRole ─────────────────────────────

section('TEST 14: rbac - getUserRole');

assertEqual(rbac.getUserRole('wecom_admin_1'), 'admin', 'getUserRole → admin');
assertEqual(rbac.getUserRole('wecom_ops_1'), 'operator', 'getUserRole → operator');
assertEqual(rbac.getUserRole('unknown'), 'viewer', 'getUserRole → viewer');

// ─── 测试 15: rbac - hasMinRoleForUser ───────────────────────

section('TEST 15: rbac - hasMinRoleForUser');

assert(rbac.hasMinRoleForUser('wecom_admin_1', 'admin'), 'admin has admin');
assert(rbac.hasMinRoleForUser('wecom_admin_1', 'operator'), 'admin has operator');
assert(rbac.hasMinRoleForUser('wecom_ops_1', 'operator'), 'operator has operator');
assert(!rbac.hasMinRoleForUser('wecom_ops_1', 'admin'), 'operator lacks admin');
assert(!rbac.hasMinRoleForUser('random_viewer', 'operator'), 'viewer lacks operator');

// ─── 测试 16: commander-policy - checkRolePermission ─────────

section('TEST 16: commander-policy - checkRolePermission');

// mock user-role-store 避免循环依赖
var cpResult = require('../src/orchestrator/v2/commander-policy');
assert(cpResult.ROLES !== undefined, 'ROLES 常量已导出');
assert(typeof cpResult.checkRolePermission === 'function', 'checkRolePermission 已导出');

var cpAdminCheck = cpResult.checkRolePermission('admin', 'admin');
assert(cpAdminCheck.allowed, 'policy: admin >= admin');

var cpViewerCheck = cpResult.checkRolePermission('viewer', 'operator');
assert(!cpViewerCheck.allowed, 'policy: viewer < operator');
assert(cpViewerCheck.error.indexOf('operator') !== -1, 'policy: 错误提示包含 operator');

// ─── 测试 17: 边界条件 - 空 userId/nil ───────────────────────

section('TEST 17: 边界条件 - 空 userId/nil');

assertEqual(userRoleStore.getRole(null), 'viewer', 'null userId → viewer');
assertEqual(userRoleStore.getRole(undefined), 'viewer', 'undefined userId → viewer');

// ─── 测试 18: 文件不存在降级 ─────────────────────────────────

section('TEST 18: 文件不存在降级');

// 保存当前路径
var originalPath = null;
try {
  // 设置不存在的文件路径
  userRoleStore.setRoleFilePath(path.join(__dirname, '..', 'data', 'nonexistent.json'));
  userRoleStore.reload();
  assertEqual(userRoleStore.getRole('wecom_admin_1'), 'viewer', '文件不存在 → 降级到 viewer');
} finally {
  // 恢复原始路径
  userRoleStore.setRoleFilePath(testRolePath);
  userRoleStore.reload();
}

// ─── 测试结果 ─────────────────────────────────────────────────

console.log('\n====================================');
console.log('  测试结果');
console.log('====================================');
console.log('  通过: ' + passed);
console.log('  失败: ' + failed);
console.log('  总计: ' + (passed + failed));
console.log('====================================');

if (failures.length > 0) {
  console.log('\n失败详情:');
  failures.forEach(function(f) { console.log('  ' + f); });
}

// ─── 清理 ─────────────────────────────────────────────────────

try { fs.unlinkSync(testRolePath); } catch (_) {}
// 恢复默认路径
userRoleStore.setRoleFilePath(null);
userRoleStore.reload();

if (failed > 0) {
  process.exit(1);
}

console.log('\n✓ 所有测试通过');
