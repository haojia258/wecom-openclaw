'use strict';

/**
 * test-chatgpt-bridge.cjs - ChatGPT Bridge 专项测试 (P8.0)
 *
 * 覆盖:
 *   A. command-ingress: Token 提取与验证
 *   B. command-ingress: 请求体解析
 *   C. command-ingress: 响应格式化
 *   D. external-task-api: task_id 生成
 *   E. external-task-api: 用户上下文映射
 *   F. external-task-api: RBAC 上下文构建
 *   G. chatgpt-bridge: 命令白名单
 *   H. chatgpt-bridge: 命令解析
 *   I. chatgpt-bridge: WeCom RBAC 检查
 *   J. chatgpt-bridge: AI Runtime RBAC 映射
 *   K. chatgpt-bridge: 完整执行链（plan-only）
 *   L. chatgpt-bridge: 企微消息格式化
 *   M. 安全: 禁止 query 参数 token
 *   N. 安全: 禁止匿名请求
 *   O. 安全: 禁止生产部署命令绕过
 */

var path = require('path');
var fs = require('fs');

// ─── 测试工具 ──────────────────────────────────────────────────

var passed = 0;
var failed = 0;
var failures = [];
var asyncTests = [];

function assert(condition, message) {
  if (condition) { passed++; }
  else { failed++; failures.push('FAIL: ' + message); }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) { passed++; }
  else {
    failed++;
    failures.push('FAIL: ' + message +
      ' | expected: ' + JSON.stringify(expected) +
      ' | actual: '   + JSON.stringify(actual));
  }
}

function assertContains(haystack, needle, message) {
  if (haystack && haystack.indexOf(needle) !== -1) { passed++; }
  else {
    failed++;
    failures.push('FAIL: ' + message + ' | expected to contain: "' + needle + '"');
  }
}

function assertNotNull(value, message) {
  if (value !== null && value !== undefined) { passed++; }
  else { failed++; failures.push('FAIL: ' + message + ' | expected non-null'); }
}

function assertNotEqual(actual, expected, message) {
  if (actual !== expected) { passed++; }
  else {
    failed++;
    failures.push('FAIL: ' + message + ' | values should not be equal: ' + JSON.stringify(actual));
  }
}

function section(name) {
  console.log('\n=== ' + name + ' ===');
}

// 注册异步测试
function asyncTest(name, fn) {
  asyncTests.push({ name: name, fn: fn });
}

// ─── 设置测试隔离环境 ────────────────────────────────────────────

var testLogDir = path.join(__dirname, '..', 'logs', 'bridge-test');
if (!fs.existsSync(testLogDir)) {
  fs.mkdirSync(testLogDir, { recursive: true });
}

process.env.TASK_LOG_DIR = testLogDir;
process.env.TASK_DB_PATH = path.join(testLogDir, 'test-bridge-tasks.db');
process.env.BRIDGE_TOKEN = 'test-bridge-token-2026';

// ─── 导入待测模块 ────────────────────────────────────────────────

var commandIngress = require('../src/runtime/command-ingress');
var externalTaskApi = require('../src/runtime/external-task-api');
var chatgptBridge = require('../src/commands/chatgpt-bridge');

// ================================================================
//  A. command-ingress: Token 提取与验证
// ================================================================

section('A. command-ingress: Token 提取与验证');

// A1: 有效 Bearer token
(function() {
  var req = { headers: { authorization: 'Bearer test-bridge-token-2026' }, query: {} };
  var result = commandIngress.extractToken(req);
  assert(result.valid, 'A1: Bearer token 提取有效');
  assertEqual(result.token, 'test-bridge-token-2026', 'A1: token 值正确');
})();

// A2: 直接 token（无 Bearer 前缀）
(function() {
  var req = { headers: { authorization: 'test-bridge-token-2026' }, query: {} };
  var result = commandIngress.extractToken(req);
  assert(result.valid, 'A2: 直接 token 提取有效');
})();

// A3: 缺少 Authorization header
(function() {
  var req = { headers: {}, query: {} };
  var result = commandIngress.extractToken(req);
  assert(!result.valid, 'A3: 缺少 Authorization header 应无效');
  assertContains(result.error, '缺少 Authorization header', 'A3: 错误消息正确');
})();

// A4: 空白 Authorization header
(function() {
  var req = { headers: { authorization: '' }, query: {} };
  var result = commandIngress.extractToken(req);
  assert(!result.valid, 'A4: 空白 header 应无效');
})();

// A5: 短 token
(function() {
  var req = { headers: { authorization: 'short' }, query: {} };
  var result = commandIngress.extractToken(req);
  assert(!result.valid, 'A5: 短 token 应无效');
  assertContains(result.error, '格式错误', 'A5: 错误消息包含格式提示');
})();

// A6: 有效 token 验证
(function() {
  var result = commandIngress.validateBridgeToken('test-bridge-token-2026');
  assert(result.valid, 'A6: 正确 token 验证通过');
})();

// A7: 无效 token 验证
(function() {
  var result = commandIngress.validateBridgeToken('wrong-token');
  assert(!result.valid, 'A7: 错误 token 验证失败');
  assertContains(result.error, '无效的 BRIDGE_TOKEN', 'A7: 错误消息正确');
})();

// A8: 空 token 验证
(function() {
  var result = commandIngress.validateBridgeToken('');
  assert(!result.valid, 'A8: 空 token 验证失败');
})();

// ================================================================
//  B. command-ingress: 请求体解析
// ================================================================

section('B. command-ingress: 请求体解析');

// B1: 完整有效请求体
(function() {
  var body = {
    source: 'chatgpt',
    user: 'HaoZhongLiang',
    command: '/总控 提升GMV',
    mode: 'plan-only',
    confirm: false
  };
  var result = commandIngress.parseRequestBody(body);
  assert(result.valid, 'B1: 有效请求体解析成功');
  assertEqual(result.params.source, 'chatgpt', 'B1: source 正确');
  assertEqual(result.params.user, 'HaoZhongLiang', 'B1: user 正确');
  assertEqual(result.params.command, '/总控 提升GMV', 'B1: command 正确');
  assertEqual(result.params.mode, 'plan-only', 'B1: mode 正确');
  assert(!result.params.confirm, 'B1: confirm=false');
})();

// B2: 缺少 source
(function() {
  var body = { user: 'test', command: '/总控' };
  var result = commandIngress.parseRequestBody(body);
  assert(!result.valid, 'B2: 缺少 source 应失败');
  assertContains(result.error, 'source', 'B2: 错误消息包含 source');
})();

// B3: 缺少 user
(function() {
  var body = { source: 'chatgpt', command: '/总控' };
  var result = commandIngress.parseRequestBody(body);
  assert(!result.valid, 'B3: 缺少 user 应失败');
  assertContains(result.error, 'user', 'B3: 错误消息包含 user');
})();

// B4: 缺少 command
(function() {
  var body = { source: 'chatgpt', user: 'test' };
  var result = commandIngress.parseRequestBody(body);
  assert(!result.valid, 'B4: 缺少 command 应失败');
  assertContains(result.error, 'command', 'B4: 错误消息包含 command');
})();

// B5: 不支持的 source
(function() {
  var body = { source: 'slack', user: 'test', command: '/总控' };
  var result = commandIngress.parseRequestBody(body);
  assert(!result.valid, 'B5: 不支持的 source 应失败');
  assertContains(result.error, '不支持的 source', 'B5: 错误消息正确');
})();

// B6: 不支持的 mode
(function() {
  var body = { source: 'chatgpt', user: 'test', command: '/总控', mode: 'auto' };
  var result = commandIngress.parseRequestBody(body);
  assert(!result.valid, 'B6: 不支持的 mode 应失败');
  assertContains(result.error, '不支持', 'B6: 错误消息包含不支持');
})();

// B7: live 模式缺少 humanConfirmToken
(function() {
  var body = { source: 'chatgpt', user: 'test', command: '/总控', mode: 'live' };
  var result = commandIngress.parseRequestBody(body);
  assert(!result.valid, 'B7: live 模式缺少 humanConfirmToken 应失败');
  assertContains(result.error, 'humanConfirmToken', 'B7: 错误消息包含 humanConfirmToken');
})();

// B8: live 模式有 humanConfirmToken
(function() {
  var body = {
    source: 'chatgpt', user: 'test', command: '/总控',
    mode: 'live', humanConfirmToken: 'token-abc-123'
  };
  var result = commandIngress.parseRequestBody(body);
  assert(result.valid, 'B8: live+token 有效');
  assertEqual(result.params.mode, 'live', 'B8: mode=live');
  assertEqual(result.params.humanConfirmToken, 'token-abc-123', 'B8: token 保留');
})();

// B9: 非 object body
(function() {
  var result = commandIngress.parseRequestBody('string');
  assert(!result.valid, 'B9: 非 object body 应失败');
})();

// B10: null body
(function() {
  var result = commandIngress.parseRequestBody(null);
  assert(!result.valid, 'B10: null body 应失败');
})();

// B11: 默认 mode=plan-only
(function() {
  var body = { source: 'chatgpt', user: 'test', command: '/总控' };
  var result = commandIngress.parseRequestBody(body);
  assert(result.valid, 'B11: 默认参数');
  assertEqual(result.params.mode, 'plan-only', 'B11: 默认 mode=plan-only');
  assertEqual(result.params.callbackWeCom, true, 'B11: 默认 callbackWeCom=true');
})();

// ================================================================
//  C. command-ingress: 响应格式化
// ================================================================

section('C. command-ingress: 响应格式化');

// C1: 成功响应
(function() {
  var resp = commandIngress.formatJsonResponse({
    success: true,
    taskId: 'bridge_123_abc',
    mode: 'plan-only',
    result: 'Commander output here'
  }, 200);
  assertEqual(resp.status, 200, 'C1: 状态码 200');
  assert(resp.body.success, 'C1: success=true');
  assertEqual(resp.body.taskId, 'bridge_123_abc', 'C1: taskId 正确');
  assertEqual(resp.body.mode, 'plan-only', 'C1: mode 正确');
  assertNotNull(resp.body.timestamp, 'C1: timestamp 存在');
  assertEqual(resp.body.source, 'chatgpt-bridge', 'C1: source 标记');
})();

// C2: 错误响应
(function() {
  var resp = commandIngress.formatJsonResponse({
    success: false,
    error: 'TOKEN_INVALID'
  }, 401);
  assertEqual(resp.status, 401, 'C2: 状态码 401');
  assert(!resp.body.success, 'C2: success=false');
  assertEqual(resp.body.error, 'TOKEN_INVALID', 'C2: error 正确');
  assert(resp.body.result === null, 'C2: result=null');
})();

// ================================================================
//  D. external-task-api: task_id 生成
// ================================================================

section('D. external-task-api: task_id 生成');

// D1: 生成 bridge task_id
(function() {
  var id1 = externalTaskApi.generateBridgeTaskId();
  var id2 = externalTaskApi.generateBridgeTaskId();
  assert(id1.startsWith('bridge_'), 'D1: task_id 以 bridge_ 开头');
  assertNotEqual(id1, id2, 'D1: 每次生成唯一 ID');
})();

// D2: task_id 格式正确
(function() {
  var id = externalTaskApi.generateBridgeTaskId();
  var parts = id.split('_');
  assert(parts.length >= 3, 'D2: task_id 至少有 3 段');
  assertEqual(parts[0], 'bridge', 'D2: 第一段=bridge');
  assert(!isNaN(parseInt(parts[1], 10)), 'D2: 第二段为时间戳');
})();

// ================================================================
//  E. external-task-api: 用户上下文映射
// ================================================================

section('E. external-task-api: 用户上下文映射');

// E1: 标准映射
(function() {
  var ctx = externalTaskApi.mapUserContext('chatgpt_user_01', 'HaoZhongLiang');
  assertEqual(ctx.fromUser, 'HaoZhongLiang', 'E1: fromUser=wecomUserId');
  assertEqual(ctx.toUser, 'HaoZhongLiang', 'E1: toUser=wecomUserId');
  assertEqual(ctx.source, 'chatgpt', 'E1: source=chatgpt');
  assertEqual(ctx.chatgptUser, 'chatgpt_user_01', 'E1: chatgptUser 保留原值');
})();

// E2: 无 wecomUserId 时回退到 chatgptUser
(function() {
  var ctx = externalTaskApi.mapUserContext('user_abc', '');
  assertEqual(ctx.fromUser, 'user_abc', 'E2: 回退到 chatgptUser');
})();

// ================================================================
//  F. external-task-api: RBAC 上下文构建
// ================================================================

section('F. external-task-api: RBAC 上下文构建');

// F1: 构建 RBAC 上下文
(function() {
  var rbacCtx = externalTaskApi.buildRBACContext('HaoZhongLiang', '/总控');
  assertEqual(rbacCtx.userId, 'HaoZhongLiang', 'F1: userId 正确');
  assertEqual(rbacCtx.command, '/总控', 'F1: command 正确');
  assertEqual(rbacCtx.source, 'chatgpt-bridge', 'F1: source 标记');
  assertNotNull(rbacCtx.timestamp, 'F1: timestamp 存在');
})();

// ================================================================
//  G. chatgpt-bridge: 命令白名单
// ================================================================

section('G. chatgpt-bridge: 命令白名单');

assert(chatgptBridge.isBridgeAllowed('/总控'), 'G1: /总控 在白名单');
assert(chatgptBridge.isBridgeAllowed('/总控 提升GMV'), 'G1b: /总控 提升GMV 在白名单');
assert(chatgptBridge.isBridgeAllowed('/总控 状态'), 'G1c: /总控 状态 在白名单');
assert(chatgptBridge.isBridgeAllowed('/总控 列表'), 'G1d: /总控 列表 在白名单');
assert(chatgptBridge.isBridgeAllowed('/commander'), 'G2: /commander 在白名单');
assert(chatgptBridge.isBridgeAllowed('/commander status'), 'G2b: 带参数');
assert(chatgptBridge.isBridgeAllowed('/总控台'), 'G3: /总控台 在白名单');
assert(chatgptBridge.isBridgeAllowed('/目标'), 'G4: /目标 在白名单');
assert(chatgptBridge.isBridgeAllowed('/goal'), 'G4b: /goal 在白名单');
assert(chatgptBridge.isBridgeAllowed('/状态'), 'G5: /状态 在白名单');
assert(chatgptBridge.isBridgeAllowed('/status'), 'G5b: /status 在白名单');
assert(chatgptBridge.isBridgeAllowed('/进度'), 'G6: /进度 在白名单');
assert(chatgptBridge.isBridgeAllowed('/progress'), 'G6b: /progress 在白名单');
assert(!chatgptBridge.isBridgeAllowed('/profit'), 'G7: /profit 不在白名单');
assert(!chatgptBridge.isBridgeAllowed('/gmv'), 'G7b: /gmv 不在白名单');
assert(!chatgptBridge.isBridgeAllowed('/ai调度'), 'G7c: /ai调度 不在白名单');
assert(!chatgptBridge.isBridgeAllowed('random text'), 'G7d: 随机文本不在白名单');
assert(!chatgptBridge.isBridgeAllowed(''), 'G8: 空命令不在白名单');
assert(!chatgptBridge.isBridgeAllowed(null), 'G8b: null 不在白名单');

// ================================================================
//  H. chatgpt-bridge: 命令解析
// ================================================================

section('H. chatgpt-bridge: 命令解析');

(function() {
  var p = chatgptBridge.parseCommand('/总控 提升GMV');
  assertEqual(p.cmdName, '/总控', 'H1: cmdName=/总控');
  assertEqual(p.args, '提升GMV', 'H1: args=提升GMV');

  var p2 = chatgptBridge.parseCommand('/总控');
  assertEqual(p2.cmdName, '/总控', 'H2: cmdName=/总控 无参数');
  assertEqual(p2.args, '', 'H2: args 为空');

  var p3 = chatgptBridge.parseCommand('/commander 状态');
  assertEqual(p3.cmdName, '/commander', 'H3: cmdName=/commander');
  assertEqual(p3.args, '状态', 'H3: args=状态');

  var p4 = chatgptBridge.parseCommand('/总控台 能力');
  assertEqual(p4.cmdName, '/总控台', 'H4: cmdName=/总控台');
  assertEqual(p4.args, '能力', 'H4: args=能力');

  var p5 = chatgptBridge.parseCommand('/总控台');
  assertEqual(p5.cmdName, '/总控台', 'H4b: cmdName=/总控台 无参数');
  assertEqual(p5.args, '', 'H4b: args 为空');

  var p6 = chatgptBridge.parseCommand('/目标');
  assertEqual(p6.cmdName, '/目标', 'H5: cmdName=/目标');

  var p7 = chatgptBridge.parseCommand('/状态');
  assertEqual(p7.cmdName, '/状态', 'H6: cmdName=/状态');

  var p8 = chatgptBridge.parseCommand('/进度');
  assertEqual(p8.cmdName, '/进度', 'H7: cmdName=/进度');

  var p9 = chatgptBridge.parseCommand('hello world');
  assertEqual(p9.cmdName, 'hello world', 'H8: 未知命令保持原样');
  assertEqual(p9.args, '', 'H8: args 为空');
})();

// ================================================================
//  I. chatgpt-bridge: WeCom RBAC 检查
// ================================================================

section('I. chatgpt-bridge: WeCom RBAC 检查');

(function() {
  var result = chatgptBridge.checkWeComRBAC('testuser', '/总控');
  assert(result.allowed, 'I1: viewer 可访问 /总控（白名单命令）');

  var result2 = chatgptBridge.checkWeComRBAC('testuser', '/目标');
  assert(result2.allowed, 'I2: viewer 可访问 /目标');

  var result3 = chatgptBridge.checkWeComRBAC('HaoZhongLiang', '/总控');
  assert(result3.allowed, 'I3: admin 可访问 /总控');
})();

// ================================================================
//  J. chatgpt-bridge: AI Runtime RBAC 映射
// ================================================================

section('J. chatgpt-bridge: AI Runtime RBAC 映射');

(function() {
  var result1 = chatgptBridge.checkAIRuntimeRBAC('/总控 提升GMV');
  assert(result1.allowed, 'J1: /总控 AI RBAC 通过');

  var result2 = chatgptBridge.checkAIRuntimeRBAC('/目标');
  assert(result2.allowed, 'J2: /目标 AI RBAC 通过');

  var result3 = chatgptBridge.checkAIRuntimeRBAC('/状态');
  assert(result3.allowed, 'J3: /状态 AI RBAC 通过');

  var result4 = chatgptBridge.checkAIRuntimeRBAC('/help');
  assert(result4.allowed, 'J4: 非 Agent 命令直接放行');
  assertEqual(result4.reason, 'no-agent-action', 'J4: reason=no-agent-action');
})();

// ================================================================
//  K. chatgpt-bridge: 完整执行链（plan-only）— 异步
// ================================================================

asyncTest('K', async function() {
  section('K. chatgpt-bridge: 完整执行链（plan-only）');

  // K1: plan-only 执行 /总控 列表
  var r1 = await chatgptBridge.execute({
    source: 'chatgpt',
    user: 'HaoZhongLiang',
    command: '/总控 列表',
    mode: 'plan-only',
    confirm: false,
    wecomUserId: 'HaoZhongLiang'
  });
  assert(r1.success, 'K1: /总控 列表 执行成功');
  assertNotNull(r1.taskId, 'K1: taskId 存在');
  assert(r1.taskId.startsWith('bridge_'), 'K1: taskId 格式正确');
  assertEqual(r1.mode, 'plan-only', 'K1: mode=plan-only');
  assertNotNull(r1.output, 'K1: output 存在');
  assert(r1.steps.length >= 3, 'K1: 至少有 3 个步骤');

  // K2: /总控 状态
  var r2 = await chatgptBridge.execute({
    source: 'chatgpt',
    user: 'HaoZhongLiang',
    command: '/总控 状态',
    mode: 'plan-only',
    confirm: false,
    wecomUserId: 'HaoZhongLiang'
  });
  assert(r2.success, 'K2: /总控 状态 执行成功');

  // K3: /总控 能力
  var r3 = await chatgptBridge.execute({
    source: 'chatgpt',
    user: 'HaoZhongLiang',
    command: '/总控 能力',
    mode: 'plan-only',
    confirm: false,
    wecomUserId: 'HaoZhongLiang'
  });
  assert(r3.success, 'K3: /总控 能力 执行成功');

  // K4: 不在白名单的命令被拒绝
  var r4 = await chatgptBridge.execute({
    source: 'chatgpt',
    user: 'HaoZhongLiang',
    command: '/profit',
    mode: 'plan-only',
    confirm: false,
    wecomUserId: 'HaoZhongLiang'
  });
  assert(!r4.success, 'K4: /profit 被拒绝');
  assertEqual(r4.error, 'NOT_IN_WHITELIST', 'K4: error=NOT_IN_WHITELIST');

  // K5: 空命令被拒绝
  var r5 = await chatgptBridge.execute({
    source: 'chatgpt',
    user: 'HaoZhongLiang',
    command: '',
    mode: 'plan-only',
    confirm: false,
    wecomUserId: 'HaoZhongLiang'
  });
  assert(!r5.success, 'K5: 空命令被拒绝');

  // K6: WeCom 命令入口 test
  var r6 = await chatgptBridge.executeWeComCommand(
    { fromUser: 'HaoZhongLiang', agentId: '1000006' },
    ''
  );
  assert(typeof r6 === 'string', 'K6: 返回 string');
  assert(r6.indexOf('用法') !== -1 || r6.indexOf('Bridge') !== -1, 'K6: 包含帮助信息');
});

// ================================================================
//  L. chatgpt-bridge: 企微消息格式化
// ================================================================

section('L. chatgpt-bridge: 企微消息格式化');

(function() {
  var msg1 = chatgptBridge.formatWeComMessage({
    success: true,
    output: 'Test Commander output'
  });
  assertContains(msg1, 'Test Commander output', 'L1: 包含 original output');

  var msg2 = chatgptBridge.formatWeComMessage({
    success: false,
    error: 'RBAC_DENIED'
  });
  assertContains(msg2, '失败', 'L2: 包含失败标记');
  assertContains(msg2, 'RBAC_DENIED', 'L2: 包含错误码');
})();

// ================================================================
//  M. 安全: 禁止 query 参数 token
// ================================================================

section('M. 安全: 禁止 query 参数 token');

(function() {
  var r1 = commandIngress.extractToken({
    headers: { authorization: 'Bearer test-bridge-token-2026' },
    query: { token: 'leaked-token' }
  });
  assert(!r1.valid, 'M1: query token 被拒绝');
  assertContains(r1.error, '禁止通过 query 参数传递 token', 'M1: 错误消息正确');

  var r2 = commandIngress.extractToken({
    headers: {},
    query: { bridge_token: 'leaked-token' }
  });
  assert(!r2.valid, 'M2: query bridge_token 被拒绝');

  var r3 = commandIngress.extractToken({
    headers: {},
    query: { BRIDGE_TOKEN: 'leaked-token' }
  });
  assert(!r3.valid, 'M3: query BRIDGE_TOKEN 被拒绝');
})();

// ================================================================
//  N. 安全: 禁止匿名请求
// ================================================================

section('N. 安全: 禁止匿名请求');

(function() {
  var result = commandIngress.extractToken({ headers: {}, query: {} });
  assert(!result.valid, 'N1: 无 Authorization header 被拒绝');
  assertContains(result.error, '缺少 Authorization header', 'N1: 错误消息正确');
})();

// ================================================================
//  O. 安全: 禁止生产部署命令绕过
// ================================================================

section('O. 安全: 禁止生产部署命令绕过');

assert(!chatgptBridge.isBridgeAllowed('pm2 restart wecom-adapter'), 'O1: pm2 restart 不在白名单');
assert(!chatgptBridge.isBridgeAllowed('rm -rf /'), 'O2: rm -rf 不在白名单');
assert(!chatgptBridge.isBridgeAllowed('sudo reboot'), 'O3: sudo 不在白名单');
assert(!chatgptBridge.isBridgeAllowed('nginx -s reload'), 'O4: nginx 不在白名单');
assert(!chatgptBridge.isBridgeAllowed('/监控'), 'O5: /监控 不在白名单');
assert(!chatgptBridge.isBridgeAllowed('/风险'), 'O6: /风险 不在白名单');

// ================================================================
//  异步测试运行 & 汇总
// ================================================================

async function runAll() {
  // 运行所有异步测试
  for (var i = 0; i < asyncTests.length; i++) {
    var t = asyncTests[i];
    try {
      await t.fn();
      console.log('  [async] ' + t.name + ' completed');
    } catch (e) {
      failed++;
      failures.push('FAIL: async [' + t.name + '] threw: ' + e.message);
      console.error('  [async] ' + t.name + ' ERROR: ' + e.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('ChatGPT Bridge 测试结果汇总');
  console.log('='.repeat(60));

  if (failures.length > 0) {
    console.log('\n失败项:');
    for (var j = 0; j < failures.length; j++) {
      console.log('  ' + (j + 1) + '. ' + failures[j]);
    }
  }

  console.log('\n通过: ' + passed);
  console.log('失败: ' + failed);
  console.log('总计: ' + (passed + failed));

  // 清理测试文件
  try {
    var testDb = path.join(testLogDir, 'test-bridge-tasks.db');
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
  } catch (_) {}

  if (failed > 0) {
    console.log('\n❌ 测试失败！');
    process.exit(1);
  } else {
    console.log('\n✅ 全部测试通过！');
  }
}

runAll();
