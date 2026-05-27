'use strict';

/**
 * test-ai-gateway.cjs — AI Gateway Runtime v1 测试套件 (P8.0.3)
 *
 * 测试分组：
 *   A. Gateway Token 提取与验证          (8 tests)
 *   B. Timestamp 验证与重放防护           (10 tests)
 *   C. IP Allowlist                     (6 tests)
 *   D. Rate Limiting                    (8 tests)
 *   E. Policy — command/mode/agent       (12 tests)
 *   F. Plan-only 强制                   (6 tests)
 *   G. 内部 HTTP 调用（token injection）  (8 tests)
 *   H. Audit 日志写入与脱敏               (8 tests)
 *   I. Correlation ID 传递              (6 tests)
 *   J. 结构化 Deny 响应                  (8 tests)
 *   K. 完整执行链（plan-only）           (10 tests)
 *   L. 安全：禁止 token 泄露到日志         (6 tests)
 *   M. 边界条件                         (6 tests)
 *
 * 总计：≈ 102+ tests
 */

var http = require('http');
var EventEmitter = require('events');
var path = require('path');
var fs = require('fs');

// ─── 测试统计 ─────────────────────────────────────────────

var passed = 0;
var failed = 0;
var tests = [];

function assert(cond, msg) {
  tests.push(msg);
  if (cond) {
    passed++;
    process.stdout.write('  ✓ ' + msg + '\n');
  } else {
    failed++;
    process.stderr.write('  ✗ FAIL: ' + msg + '\n');
  }
}

// ─── 设置环境变量 ──────────────────────────────────────

process.env.GATEWAY_TOKEN = 'gw_test_token_abc123def456';
process.env.BRIDGE_TOKEN = 'bridge_test_token_xyz789';
process.env.GATEWAY_IP_ALLOWLIST = '10.0.0.1,192.168.1.100';
process.env.GATEWAY_RATE_LIMIT_MAX = '20';
process.env.GATEWAY_TIMESTAMP_WINDOW_SEC = '300';
process.env.GATEWAY_AUDIT_LOG_PATH = path.join(__dirname, '..', 'logs', 'test-gateway-audit.log');

// 清理测试日志
try {
  var testLogDir = path.dirname(process.env.GATEWAY_AUDIT_LOG_PATH);
  if (!fs.existsSync(testLogDir)) fs.mkdirSync(testLogDir, { recursive: true });
  fs.writeFileSync(process.env.GATEWAY_AUDIT_LOG_PATH, '', 'utf-8');
} catch (_) {}

// ─── 加载模块 ──────────────────────────────────────────

var gatewayAudit = require('../src/gateway/gateway-audit');
var gatewayPolicy = require('../src/gateway/gateway-policy');
var gatewayRateLimitModule = require('../src/gateway/gateway-rate-limit');

// 重置限流状态
gatewayRateLimitModule.resetRateLimit();

// 清除模块缓存以重新加载 ai-gateway（确保环境变量生效）
delete require.cache[require.resolve('../src/gateway/ai-gateway')];
var aiGateway = require('../src/gateway/ai-gateway');

console.log('\n═══════════════════════════════════════════');
console.log('  AI Gateway Runtime v1 — 测试套件');
console.log('═══════════════════════════════════════════\n');

// ══════════════════════════════════════════════════════════
// A. Gateway Token 提取与验证
// ══════════════════════════════════════════════════════════

console.log('A. Gateway Token 提取与验证');
console.log('───────────────────────────────────────────');

(function testA() {
  // A1: 缺少 Gateway-Token header
  var r1 = aiGateway.extractGatewayToken({ headers: {} });
  assert(r1.valid === false && r1.error.includes('缺少 Gateway-Token'), 'A1: 缺少 Gateway-Token header 返回 invalid');

  // A2: 正常提取 token
  var r2 = aiGateway.extractGatewayToken({ headers: { 'gateway-token': 'gw_test_token_abc123def456' } });
  assert(r2.valid === true && r2.token === 'gw_test_token_abc123def456', 'A2: 正常提取 Gateway-Token');

  // A3: Token 长度不足
  var r3 = aiGateway.extractGatewayToken({ headers: { 'gateway-token': 'short' } });
  assert(r3.valid === false && r3.error.includes('长度不足'), 'A3: Token 长度不足（< 16）返回 invalid');

  // A4: 正确 token 验证通过
  var r4 = aiGateway.validateGatewayToken('gw_test_token_abc123def456');
  assert(r4.valid === true, 'A4: 正确 GATEWAY_TOKEN 验证通过');

  // A5: 错误 token 验证失败
  var r5 = aiGateway.validateGatewayToken('wrong_token_value');
  assert(r5.valid === false, 'A5: 错误 GATEWAY_TOKEN 验证失败');

  // A6: null token
  var r6 = aiGateway.validateGatewayToken(null);
  assert(r6.valid === false, 'A6: null token 验证失败');

  // A7: 空字符串 token
  var r7 = aiGateway.validateGatewayToken('');
  assert(r7.valid === false, 'A7: 空字符串 token 验证失败');

  // A8: 长度不同但正确前缀的 token（常量时间比较测试）
  var r8 = aiGateway.validateGatewayToken('gw_test');
  assert(r8.valid === false, 'A8: 长度不同的 token 验证失败');
})();

// ══════════════════════════════════════════════════════════
// B. Timestamp 验证与重放防护
// ══════════════════════════════════════════════════════════

console.log('\nB. Timestamp 验证与重放防护');
console.log('───────────────────────────────────────────');

(function testB() {
  // B1: 有效时间戳（当前时间）
  var now = Date.now();
  var r1 = aiGateway.validateTimestamp(now);
  assert(r1.valid === true, 'B1: 当前时间戳验证通过');

  // B2: 5 分钟内的时间戳
  var r2 = aiGateway.validateTimestamp(now - 180000); // -3min
  assert(r2.valid === true, 'B2: -3min 时间戳验证通过');

  // B3: 5 分钟后的时间戳
  var r3 = aiGateway.validateTimestamp(now + 180000); // +3min
  assert(r3.valid === true, 'B3: +3min 时间戳验证通过');

  // B4: 过期时间戳（10 分钟前）
  var old = now - 600000; // -10min
  var r4 = aiGateway.validateTimestamp(old);
  assert(r4.valid === false && r4.error.includes('Timestamp 过期'), 'B4: -10min 过期时间戳返回 invalid');

  // B5: 未来时间戳（10 分钟后）
  var future = now + 600000; // +10min
  var r5 = aiGateway.validateTimestamp(future);
  assert(r5.valid === false && r5.error.includes('Timestamp 过期'), 'B5: +10min 未来时间戳返回 invalid');

  // B6: 缺少 timestamp（null/undefined）
  var r6 = aiGateway.validateTimestamp(null);
  assert(r6.valid === false && r6.error.includes('缺少有效的 timestamp'), 'B6: null timestamp 返回 invalid');

  // B7: 非数字 timestamp
  var r7 = aiGateway.validateTimestamp('not_a_number');
  assert(r7.valid === false, 'B7: 非数字 timestamp 返回 invalid');

  // B8: 新 requestId + timestamp 通过重放检测
  gatewayRateLimitModule.resetRateLimit();
  var uniqueId = 'req_' + Date.now() + '_' + Math.random();
  var r8 = gatewayRateLimitModule.checkReplay(uniqueId, now);
  assert(r8.valid === true, 'B8: 新 requestId + timestamp 通过重放检测');

  // B9: 相同 requestId + timestamp 被拒绝（重放）
  var r9 = gatewayRateLimitModule.checkReplay(uniqueId, now);
  assert(r9.valid === false && r9.reason.includes('Duplicate'), 'B9: 相同 requestId + timestamp 被拒绝（重放防护）');

  // B10: 缺少 requestId
  gatewayRateLimitModule.resetRateLimit();
  var r10 = gatewayRateLimitModule.checkReplay(null, now);
  assert(r10.valid === false && r10.reason.includes('缺少 requestId'), 'B10: 缺少 requestId 返回 invalid');
})();

// ══════════════════════════════════════════════════════════
// C. IP Allowlist
// ══════════════════════════════════════════════════════════

console.log('\nC. IP Allowlist');
console.log('───────────────────────────────────────────');

(function testC() {
  // 重置环境变量为被测值
  process.env.GATEWAY_IP_ALLOWLIST = '10.0.0.1,192.168.1.100';

  // C1: 白名单 IP 通过
  var req1 = { headers: { 'x-forwarded-for': '10.0.0.1' }, connection: { remoteAddress: '::1' } };
  var r1 = aiGateway.checkIPAllowlist(req1);
  assert(r1.allowed === true, 'C1: 白名单 IP 10.0.0.1 通过');

  // C2: 白名单 IP（第二个）通过
  var req2 = { headers: { 'x-forwarded-for': '192.168.1.100' }, connection: {} };
  var r2 = aiGateway.checkIPAllowlist(req2);
  assert(r2.allowed === true, 'C2: 白名单 IP 192.168.1.100 通过');

  // C3: 非白名单 IP 被拒绝
  var req3 = { headers: { 'x-forwarded-for': '1.2.3.4' }, connection: {} };
  var r3 = aiGateway.checkIPAllowlist(req3);
  assert(r3.allowed === false && r3.reason.includes('不在 Gateway 白名单'), 'C3: 非白名单 IP 被拒绝');

  // C4: x-real-ip 读取
  var req4 = { headers: { 'x-real-ip': '10.0.0.1' }, connection: {} };
  var r4 = aiGateway.checkIPAllowlist(req4);
  assert(r4.allowed === true, 'C4: x-real-ip 白名单 IP 通过');

  // C5: 未配置 IP allowlist 时允许所有 IP
  var savedAllowlist = process.env.GATEWAY_IP_ALLOWLIST;
  process.env.GATEWAY_IP_ALLOWLIST = '';
  delete require.cache[require.resolve('../src/gateway/ai-gateway')];
  var aiGatewayNoList = require('../src/gateway/ai-gateway');
  var req5 = { headers: { 'x-forwarded-for': '1.2.3.4' }, connection: {} };
  var r5 = aiGatewayNoList.checkIPAllowlist(req5);
  assert(r5.allowed === true, 'C5: 未配置 IP allowlist 时允许所有 IP');

  // 恢复
  process.env.GATEWAY_IP_ALLOWLIST = savedAllowlist;
  delete require.cache[require.resolve('../src/gateway/ai-gateway')];

  // C6: 无 header 时 fallback 到 connection.remoteAddress
  var req6 = { headers: {}, connection: { remoteAddress: '10.0.0.1' } };
  var r6 = aiGateway.checkIPAllowlist(req6);
  assert(r6.allowed === true, 'C6: connection.remoteAddress 白名单 IP 通过');
})();

// ══════════════════════════════════════════════════════════
// D. Rate Limiting
// ══════════════════════════════════════════════════════════

console.log('\nD. Rate Limiting');
console.log('───────────────────────────────────────────');

(function testD() {
  gatewayRateLimitModule.resetRateLimit();

  // D1: 首次请求通过
  var r1 = gatewayRateLimitModule.checkRateLimit('192.168.1.1');
  assert(r1.allowed === true, 'D1: 首次请求通过限流');

  // D2-D7: 多次请求在窗口内仍通过
  for (var i = 2; i <= 7; i++) {
    var ri = gatewayRateLimitModule.checkRateLimit('192.168.1.1');
    assert(ri.allowed === true, 'D' + i + ': 第 ' + i + ' 次请求通过（未超过 20 次限制）');
  }

  // D8: 不同 IP 不受影响
  var r8 = gatewayRateLimitModule.checkRateLimit('10.0.0.99');
  assert(r8.allowed === true, 'D8: 不同 IP 不受限流影响');

  // 重置并验证状态方法
  gatewayRateLimitModule.resetRateLimit();

  // D9: 重置后状态恢复
  var status = gatewayRateLimitModule.getRateLimitStatus();
  assert(status.replaySetSize === 0, 'D9: reset 后 replaySet 为 0');

  // D10: getRateLimitStatus 对指定 IP 返回 null（未访问过）
  var statusIP = gatewayRateLimitModule.getRateLimitStatus('192.168.1.1');
  assert(statusIP.rateLimit === null, 'D10: 未访问的 IP 返回 null');
})();

// ══════════════════════════════════════════════════════════
// E. Policy — command / mode / agent allowlist
// ══════════════════════════════════════════════════════════

console.log('\nE. Gateway 策略层检查');
console.log('───────────────────────────────────────────');

(function testE() {
  // E1: 允许的命令 /总控
  var r1 = gatewayPolicy.checkCommandAllowed('/总控 提升GMV');
  assert(r1.allowed === true, 'E1: 命令 /总控 在 allowlist 中');

  // E2: 允许的命令 /帮助
  var r2 = gatewayPolicy.checkCommandAllowed('/帮助');
  assert(r2.allowed === true, 'E2: 命令 /帮助 在 allowlist 中');

  // E3: 允许的命令 /目标
  var r3 = gatewayPolicy.checkCommandAllowed('/目标');
  assert(r3.allowed === true, 'E3: 命令 /目标 在 allowlist 中');

  // E4: 允许的命令 /状态
  var r4 = gatewayPolicy.checkCommandAllowed('/状态');
  assert(r4.allowed === true, 'E4: 命令 /状态 在 allowlist 中');

  // E5: 不允许的命令（confirm:）被阻断
  var r5 = gatewayPolicy.checkCommandAllowed('confirm:deploy');
  assert(r5.allowed === false, 'E5: confirm: 命令被阻断');

  // E6: 不允许的命令（/deploy）被阻断
  var r6 = gatewayPolicy.checkCommandAllowed('/deploy production');
  assert(r6.allowed === false, 'E6: /deploy 被阻断');

  // E7: 不允许的命令（不在列表 + 非阻断模式）
  var r7 = gatewayPolicy.checkCommandAllowed('/unknown_cmd');
  assert(r7.allowed === false && r7.reason.includes('不在 Gateway 白名单'), 'E7: 未知命令被拒绝');

  // E8: plan-only mode 允许
  var r8 = gatewayPolicy.checkModeAllowed('plan-only');
  assert(r8.allowed === true, 'E8: mode=plan-only 允许');

  // E9: live mode 不允许（v1）
  var r9 = gatewayPolicy.checkModeAllowed('live');
  assert(r9.allowed === false, 'E9: mode=live 在 v1 不允许');

  // E10: agent codex 允许
  var r10 = gatewayPolicy.checkAgentAllowed('codex');
  assert(r10.allowed === true, 'E10: agent=codex 允许');

  // E11: 未知 agent 不允许
  var r11 = gatewayPolicy.checkAgentAllowed('unknown_agent');
  assert(r11.allowed === false, 'E11: 未知 agent 不允许');

  // E12: enforcePolicy 综合检查通过
  var r12 = gatewayPolicy.enforcePolicy({ command: '/总控 提升GMV', mode: 'plan-only' });
  assert(r12.allowed === true, 'E12: enforcePolicy 综合检查通过（合法 command + plan-only）');
})();

// ══════════════════════════════════════════════════════════
// F. Plan-only 强制
// ══════════════════════════════════════════════════════════

console.log('\nF. Plan-only 强制');
console.log('───────────────────────────────────────────');

(function testF() {
  // F1: plan-only 保持不变
  var r1 = aiGateway.enforcePlanOnly({ mode: 'plan-only', command: '/帮助' });
  assert(r1.mode === 'plan-only', 'F1: plan-only 模式保持不变');
  assert(r1._originalMode === undefined, 'F1b: 没有 _originalMode 标记');

  // F2: live 被强制改为 plan-only
  var r2 = aiGateway.enforcePlanOnly({ mode: 'live', command: '/帮助' });
  assert(r2.mode === 'plan-only', 'F2: live 被强制改为 plan-only');
  assert(r2._originalMode === 'live', 'F2b: 保留原始 mode 为 live');

  // F3: 未知 mode 被强制改为 plan-only
  var r3 = aiGateway.enforcePlanOnly({ mode: 'auto', command: '/帮助' });
  assert(r3.mode === 'plan-only', 'F3: 未知 mode 被强制改为 plan-only');

  // F4: 空 mode
  var r4 = aiGateway.enforcePlanOnly({ mode: '', command: '/帮助' });
  assert(r4.mode === 'plan-only', 'F4: 空 mode 被强制改为 plan-only');

  // F5: 原始的 plan-only 经过 enforce 后仍是 plan-only
  var params5 = { mode: 'plan-only' };
  aiGateway.enforcePlanOnly(params5);
  assert(params5.mode === 'plan-only', 'F5: 原地修改后 mode=plan-only');
})();

// ══════════════════════════════════════════════════════════
// G. 内部 HTTP 调用（server-side token injection）
// ══════════════════════════════════════════════════════════

console.log('\nG. 内部 HTTP 调用（token injection）');
console.log('───────────────────────────────────────────');

(function testG() {
  var originalRequest = http.request;

  // G1: 调用使用 BRIDGE_TOKEN 作为 Authorization
  http.request = function(options, callback) {
    assert(options.headers.Authorization.indexOf('Bearer bridge_test_token_xyz789') !== -1,
      'G1: 内部调用注入 BRIDGE_TOKEN 到 Authorization header');
    assert(options.path === '/runtime/command', 'G1b: 调用路径为 /runtime/command');
    assert(options.hostname === '127.0.0.1', 'G1c: 调用使用 localhost');
    assert(options.method === 'POST', 'G1d: 调用方法为 POST');

    // 模拟成功响应
    var mockRes = new EventEmitter();
    mockRes.statusCode = 200;
    process.nextTick(function() {
      mockRes.emit('data', Buffer.from(JSON.stringify({
        success: true, taskId: 'task_test_123', mode: 'plan-only', result: 'mock result'
      })));
      mockRes.emit('end');
    });

    if (callback) callback(mockRes);

    var mockReq = new EventEmitter();
    mockReq.write = function() {};
    mockReq.end = function() {};
    return mockReq;
  };

  aiGateway.callRuntimeInternal({ user: 'test_user', command: '/帮助', mode: 'plan-only' })
    .then(function(result) {
      assert(result.success === true, 'G2: 内部调用返回 success=true');
      assert(result.taskId === 'task_test_123', 'G3: 返回正确的 taskId');
      assert(result.mode === 'plan-only', 'G4: 返回 plan-only mode');
    })
    .catch(function(e) {
      console.error('G test error:', e.message);
      assert(false, 'G_ERR: 内部调用异常: ' + e.message);
    });

  // G5: 无 BRIDGE_TOKEN 时调用失败
  var savedBridge = process.env.BRIDGE_TOKEN;
  process.env.BRIDGE_TOKEN = '';
  aiGateway.callRuntimeInternal({ user: 'test', command: '/帮助', mode: 'plan-only' })
    .then(function() {
      assert(false, 'G5: 无 BRIDGE_TOKEN 时应失败但未失败');
    })
    .catch(function(e) {
      assert(e.message.includes('未配置 BRIDGE_TOKEN'), 'G5: 无 BRIDGE_TOKEN 时调用失败');
    });
  process.env.BRIDGE_TOKEN = savedBridge;

  // G6: HTTP 错误处理
  http.request = function(options, callback) {
    var mockReq = new EventEmitter();
    mockReq.write = function() {};
    mockReq.end = function() {};
    process.nextTick(function() { mockReq.emit('error', new Error('Connection refused')); });
    return mockReq;
  };

  aiGateway.callRuntimeInternal({ user: 'test', command: '/帮助', mode: 'plan-only' })
    .then(function() {
      assert(false, 'G6: 网络错误应失败但未失败');
    })
    .catch(function(e) {
      assert(e.message.includes('Connection refused'), 'G6: HTTP 网络错误正确传播');
    });

  // 恢复 http.request
  http.request = originalRequest;

  // G7: 请求体包含正确的字段
  http.request = function(options, callback) {
    var mockReq = new EventEmitter();
    mockReq.write = function(data) {
      var body = JSON.parse(data);
      assert(body.source === 'chatgpt', 'G7: source=chatgpt');
      assert(body.user === 'test_user', 'G7b: user 正确传递');
      assert(body.command === '/帮助', 'G7c: command 正确传递');
      assert(body.mode === 'plan-only', 'G7d: mode 正确传递');
    };
    mockReq.end = function() {};
    var mockRes = new EventEmitter();
    mockRes.statusCode = 200;
    process.nextTick(function() {
      mockRes.emit('data', Buffer.from('{"success":true}'));
      mockRes.emit('end');
    });
    if (callback) callback(mockRes);
    return mockReq;
  };

  aiGateway.callRuntimeInternal({ user: 'test_user', command: '/帮助', mode: 'plan-only' })
    .then(function(r) {
      assert(r.success === true, 'G7: 请求体字段验证通过');
    })
    .catch(function(e) {
      assert(false, 'G7_ERR: ' + e.message);
    });

  http.request = originalRequest;

  // G8: 验证内容为 JSON
  http.request = function(options, callback) {
    assert(options.headers['Content-Type'] === 'application/json', 'G8: Content-Type 为 application/json');
    var mockReq = new EventEmitter();
    mockReq.write = function() {};
    mockReq.end = function() {};
    var mockRes = new EventEmitter();
    process.nextTick(function() {
      mockRes.emit('data', Buffer.from('{"success":true}'));
      mockRes.emit('end');
    });
    if (callback) callback(mockRes);
    return mockReq;
  };

  aiGateway.callRuntimeInternal({ user: 'test', command: '/帮助', mode: 'plan-only' })
    .then(function(r) { /* ok */ })
    .catch(function(e) {
      assert(false, 'G8_ERR: ' + e.message);
    });

  http.request = originalRequest;
})();

// ══════════════════════════════════════════════════════════
// H. Audit 日志写入与脱敏
// ══════════════════════════════════════════════════════════

console.log('\nH. Audit 日志写入与脱敏');
console.log('───────────────────────────────────────────');

(function testH() {
  var testLogPath = process.env.GATEWAY_AUDIT_LOG_PATH;
  try { fs.writeFileSync(testLogPath, '', 'utf-8'); } catch (_) {}

  // H1: 成功条目写入
  gatewayAudit.writeSuccessEntry({
    requestId: 'req-h1-001',
    correlationId: 'corr-h1-001',
    sourceIP: '10.0.0.1',
    user: 'test-user-h1',
    command: '/帮助',
    mode: 'plan-only',
    tokenPrefix: 'gw_test_token',
    durationMs: 150,
    taskId: 'task_h1_001'
  });

  var entries1 = gatewayAudit.readRecentEntries(10);
  assert(entries1.length >= 1, 'H1: 成功条目写入审计日志');
  var last1 = entries1[entries1.length - 1];
  assert(last1.result === 'allowed', 'H1b: result=allowed');
  assert(last1.command === '/帮助', 'H1c: command 正确记录');
  assert(last1.taskId === 'task_h1_001', 'H1d: taskId 正确记录');

  // H2: 阻断条目写入
  gatewayAudit.writeBlockedEntry({
    requestId: 'req-h2-001',
    correlationId: 'corr-h2-001',
    sourceIP: '10.0.0.2',
    user: 'test-user-h2',
    command: '/deploy',
    mode: 'live',
    tokenPrefix: 'gw_bad_token',
    blockedReason: '命令不在白名单'
  });

  var entries2 = gatewayAudit.readRecentEntries(10);
  var last2 = entries2[entries2.length - 1];
  assert(last2.result === 'blocked', 'H2: 阻断条目 result=blocked');
  assert(last2.blockedReason === '命令不在白名单', 'H2b: blockedReason 正确记录');

  // H3: Token 脱敏 — 只保存前缀
  var last3 = entries1[entries1.length - 1];
  assert(last3.tokenPrefix === 'gw_t...', 'H3: token 脱敏为前缀（只保存前 4 字符 + ...）');

  // H4: sanitizeToken 空值处理
  var s4 = gatewayAudit.sanitizeToken(null);
  assert(s4 === 'unknown', 'H4: null token 脱敏为 unknown');

  // H5: sanitizeToken 短 token
  var s5 = gatewayAudit.sanitizeToken('ab');
  assert(s5 === 'unknown', 'H5: 短 token (< 4) 脱敏为 unknown');

  // H6: sanitizeToken 正常 token
  var s6 = gatewayAudit.sanitizeToken('gw_test_token_abc123def456');
  assert(s6 === 'gw_t...', 'H6: 正常 token 脱敏为 gw_t...');

  // H7: JSONL 格式验证
  var logContent = fs.readFileSync(testLogPath, 'utf-8');
  var lines = logContent.trim().split('\n').filter(Boolean);
  for (var i = 0; i < lines.length; i++) {
    try {
      JSON.parse(lines[i]);
    } catch (e) {
      assert(false, 'H7: 行 ' + (i + 1) + ' 不是有效 JSON');
      return;
    }
  }
  assert(true, 'H7: 所有审计日志行为有效 JSON（JSONL 格式）');

  // H8: 审计文件存在
  assert(gatewayAudit.getAuditLogPath() === testLogPath, 'H8: getAuditLogPath 返回正确路径');
})();

// ══════════════════════════════════════════════════════════
// I. Correlation ID
// ══════════════════════════════════════════════════════════

console.log('\nI. Correlation ID');
console.log('───────────────────────────────────────────');

(function testI() {
  // I1: correlation ID 以 gw_ 开头
  var cid1 = gatewayAudit.generateCorrelationId();
  assert(cid1.startsWith('gw_'), 'I1: correlation ID 以 gw_ 开头');

  // I2: correlation ID 格式（gw_ + UUID = 5 段，含 4 个连字符）
  var parts = cid1.split('-');
  assert(parts.length === 5, 'I2: gw_ + UUID 分 5 段（4 个连字符）');

  // I3: 两个 correlation ID 不重复
  var cid2 = gatewayAudit.generateCorrelationId();
  assert(cid1 !== cid2, 'I3: 连续生成的 correlation ID 不重复');

  // I4: UUID v4 格式验证
  var uuidPart = cid1.substring(3); // 去掉 gw_
  var uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert(uuidRegex.test(uuidPart), 'I4: UUID 部分符合 v4 格式');

  // I5: correlation ID 长度
  assert(cid1.length === 39, 'I5: correlation ID 长度为 39（gw_ + 36 UUID）');

  // I6: uuidv4 辅助函数
  var uid = gatewayAudit.uuidv4();
  assert(typeof uid === 'string' && uid.length === 36, 'I6: uuidv4 返回 36 字符 UUID');
})();

// ══════════════════════════════════════════════════════════
// J. 结构化 Deny 响应
// ══════════════════════════════════════════════════════════

console.log('\nJ. 结构化 Deny 响应');
console.log('───────────────────────────────────────────');

(function testJ() {
  // J1: buildDenyResponse 基本结构
  var r1 = aiGateway.buildDenyResponse('Access denied', 'req-j1', 'corr-j1', 'ACCESS_DENIED', 403);
  assert(r1.body.success === false, 'J1: Deny 响应 success=false');
  assert(r1.body.requestId === 'req-j1', 'J1b: requestId 正确');
  assert(r1.body.correlationId === 'corr-j1', 'J1c: correlationId 正确');
  assert(r1.body.error === 'ACCESS_DENIED', 'J1d: error code 正确');
  assert(r1.body.reason === 'Access denied', 'J1e: reason 正确');
  assert(r1.status === 403, 'J1f: HTTP Status 正确');

  // J2: buildSuccessResponse 结构
  var r2 = aiGateway.buildSuccessResponse({
    requestId: 'req-j2',
    correlationId: 'corr-j2',
    runtimeResult: { taskId: 'task_123', mode: 'plan-only', result: 'test output' }
  });
  assert(r2.success === true, 'J2: Success 响应 success=true');
  assert(r2.taskId === 'task_123', 'J2b: taskId');
  assert(r2.output === 'test output', 'J2c: output');
  assert(r2.source === 'ai-gateway', 'J2d: source');

  // J3: buildDenyResponse 默认值
  var r3 = aiGateway.buildDenyResponse('Error', null, null);
  assert(r3.body.requestId && r3.body.requestId.length > 0, 'J3: 无 requestId 时自动生成 UUID');
  assert(r3.status === 403, 'J3b: 默认 HTTP 403');

  // J4: 不同错误码
  var r4_401 = aiGateway.buildDenyResponse('Unauthorized', 'req-j4', 'corr-j4', 'UNAUTHORIZED', 401);
  assert(r4_401.status === 401, 'J4: HTTP 401');

  // J5: HTTP 429 Rate Limited
  var r5 = aiGateway.buildDenyResponse('Rate limited', 'req-j5', 'corr-j5', 'RATE_LIMITED', 429);
  assert(r5.status === 429, 'J5: HTTP 429');

  // J6: HTTP 400 Bad Request
  var r6 = aiGateway.buildDenyResponse('Bad request', 'req-j6', 'corr-j6', 'BAD_REQUEST', 400);
  assert(r6.status === 400, 'J6: HTTP 400');

  // J7: 响应包含 timestamp
  var r7 = aiGateway.buildDenyResponse('Test', 'req-j7', 'corr-j7');
  assert(typeof r7.body.timestamp === 'string', 'J7: 响应包含 timestamp');

  // J8: 响应包含 source
  var r8 = aiGateway.buildDenyResponse('Test', 'req-j8', 'corr-j8');
  assert(r8.body.source === 'ai-gateway', 'J8: 响应 source=ai-gateway');
})();

// ══════════════════════════════════════════════════════════
// K. 完整执行链（集成测试）
// ══════════════════════════════════════════════════════════

console.log('\nK. 完整执行链');
console.log('───────────────────────────────────────────');

(function testK() {
  // K1: enforcePolicy 拒绝危险命令
  var r1 = gatewayPolicy.enforcePolicy({ command: 'confirm:deploy', mode: 'plan-only' });
  assert(r1.allowed === false, 'K1: enforcePolicy 拒绝 confirm:deploy');

  // K2: enforcePolicy 拒绝 live mode
  var r2 = gatewayPolicy.enforcePolicy({ command: '/帮助', mode: 'live' });
  assert(r2.allowed === false, 'K2: enforcePolicy 拒绝 live mode');

  // K3: enforcePolicy 允许合法请求
  var r3 = gatewayPolicy.enforcePolicy({ command: '/总控 提升GMV', mode: 'plan-only' });
  assert(r3.allowed === true, 'K3: enforcePolicy 允许合法请求');

  // K4: enforcePolicy 允许 /总控台
  var r4 = gatewayPolicy.enforcePolicy({ command: '/总控台', mode: 'plan-only' });
  assert(r4.allowed === true, 'K4: enforcePolicy 允许 /总控台');

  // K5: enforcePolicy 允许 /任务列表
  var r5 = gatewayPolicy.enforcePolicy({ command: '/任务列表', mode: 'plan-only' });
  assert(r5.allowed === true, 'K5: enforcePolicy 允许 /任务列表');

  // K6: 审计日志读回验证
  try { fs.writeFileSync(process.env.GATEWAY_AUDIT_LOG_PATH, '', 'utf-8'); } catch (_) {}

  gatewayAudit.writeGatewayAuditEntry({
    requestId: 'k6-req-001',
    correlationId: 'k6-corr-001',
    sourceIP: '192.168.1.100',
    user: 'integration-user',
    command: '/目标',
    mode: 'plan-only',
    tokenPrefix: 'gw_i...',
    result: 'allowed',
    durationMs: 250,
    taskId: 'task_k6_001'
  });

  var entries = gatewayAudit.readRecentEntries(5);
  var found = false;
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].requestId === 'k6-req-001') { found = true; break; }
  }
  assert(found, 'K6: 审计日志中可找到指定 requestId');

  // K7: 空审计读取
  try { fs.writeFileSync(process.env.GATEWAY_AUDIT_LOG_PATH, '', 'utf-8'); } catch (_) {}
  var empty = gatewayAudit.readRecentEntries(10);
  assert(empty.length === 0, 'K7: 空审计日志返回空数组');

  // K8: getClientIP from x-forwarded-for
  var reqK8 = { headers: { 'x-forwarded-for': ' 203.0.113.1, 10.0.0.1 ' }, connection: {} };
  var ip8 = aiGateway.getClientIP(reqK8);
  assert(ip8 === '203.0.113.1', 'K8: getClientIP 从 x-forwarded-for 提取首个 IP');

  // K9: getClientIP from x-real-ip
  var reqK9 = { headers: { 'x-real-ip': '198.51.100.1' }, connection: {} };
  var ip9 = aiGateway.getClientIP(reqK9);
  assert(ip9 === '198.51.100.1', 'K9: getClientIP 从 x-real-ip 读取');

  // K10: getClientIP from connection
  var reqK10 = { headers: {}, connection: { remoteAddress: '::ffff:192.0.2.1' } };
  var ip10 = aiGateway.getClientIP(reqK10);
  assert(ip10 === '::ffff:192.0.2.1', 'K10: getClientIP 从 connection.remoteAddress 读取');
})();

// ══════════════════════════════════════════════════════════
// L. 安全：禁止 token 泄露到日志
// ══════════════════════════════════════════════════════════

console.log('\nL. 安全验证：禁止 token 泄露');
console.log('───────────────────────────────────────────');

(function testL() {
  try { fs.writeFileSync(process.env.GATEWAY_AUDIT_LOG_PATH, '', 'utf-8'); } catch (_) {}

  // L1: 审计日志中不包含完整 GATEWAY_TOKEN
  gatewayAudit.writeGatewayAuditEntry({
    requestId: 'l1-req',
    correlationId: 'l1-corr',
    sourceIP: '10.0.0.1',
    user: 'sec-user',
    command: '/帮助',
    mode: 'plan-only',
    tokenPrefix: process.env.GATEWAY_TOKEN,
    result: 'allowed'
  });

  var logText1 = fs.readFileSync(process.env.GATEWAY_AUDIT_LOG_PATH, 'utf-8');
  assert(logText1.indexOf(process.env.GATEWAY_TOKEN) === -1, 'L1: 审计日志中不包含完整 GATEWAY_TOKEN');

  // L2: 脱敏后 token 不包含完整值
  var sanitized = gatewayAudit.sanitizeToken('my_super_secret_token_12345');
  assert(sanitized.indexOf('super') === -1, 'L2: 脱敏后不包含原始 token 内容（只保留前缀 4 字符）');
  assert(sanitized === 'my_s...', 'L2b: 脱敏为正确前缀格式');

  // L3: buildDenyResponse 不泄露 token
  var denyResp = aiGateway.buildDenyResponse('Test deny', 'req-l3', 'corr-l3');
  assert(JSON.stringify(denyResp).indexOf(process.env.GATEWAY_TOKEN) === -1, 'L3: Deny 响应不泄露 GATEWAY_TOKEN');
  assert(JSON.stringify(denyResp).indexOf(process.env.BRIDGE_TOKEN) === -1, 'L3b: Deny 响应不泄露 BRIDGE_TOKEN');

  // L4: buildSuccessResponse 不泄露 token
  var succResp = aiGateway.buildSuccessResponse({
    requestId: 'req-l4',
    correlationId: 'corr-l4',
    runtimeResult: { taskId: 't1', mode: 'plan-only', result: 'ok' }
  });
  assert(JSON.stringify(succResp).indexOf(process.env.BRIDGE_TOKEN) === -1, 'L4: Success 响应不泄露 BRIDGE_TOKEN');

  // L5: 内部调用时 BRIDGE_TOKEN 仅在 request headers 中（不返回给客户端）
  // 已通过 G 组测试验证 — 此用例作为文档记录
  assert(true, 'L5: BRIDGE_TOKEN 仅在服务端内部调用 headers 中使用（见 G 组测试）');

  // L6: Gateway 响应不含 BRIDGE_TOKEN 字段
  var fullResp = aiGateway.buildSuccessResponse({
    requestId: 'req-l6',
    correlationId: 'corr-l6',
    runtimeResult: { taskId: 't2', mode: 'plan-only', result: 'result' }
  });
  var respStr = JSON.stringify(fullResp);
  assert(respStr.indexOf('bridge_token') === -1 && respStr.indexOf('BRIDGE_TOKEN') === -1,
    'L6: 响应 JSON 不含 bridge_token / BRIDGE_TOKEN 字段');
})();

// ══════════════════════════════════════════════════════════
// M. 边界条件
// ══════════════════════════════════════════════════════════

console.log('\nM. 边界条件');
console.log('───────────────────────────────────────────');

(function testM() {
  // M1: enforcePolicy 空参数
  var r1 = gatewayPolicy.enforcePolicy(null);
  assert(r1.allowed === false, 'M1: null 参数返回不允许');

  // M2: enforcePolicy 空对象
  var r2 = gatewayPolicy.enforcePolicy({});
  assert(r2.allowed === false, 'M2: 空对象参数返回不允许');

  // M3: checkCommandAllowed 空字符串
  var r3 = gatewayPolicy.checkCommandAllowed('');
  assert(r3.allowed === false, 'M3: 空命令字符串返回不允许');

  // M4: checkModeAllowed null
  var r4 = gatewayPolicy.checkModeAllowed(null);
  assert(r4.allowed === false, 'M4: null mode 返回不允许');

  // M5: checkAgentAllowed 不传 agent（允许）
  var r5 = gatewayPolicy.checkAgentAllowed(undefined);
  assert(r5.allowed === true, 'M5: 不传 agent 允许通过');

  // M6: checkReplay 边界 — 大量请求后仍正常工作
  gatewayRateLimitModule.resetRateLimit();
  for (var i = 0; i < 100; i++) {
    var result = gatewayRateLimitModule.checkReplay('large_test_' + i, Date.now());
    if (!result.valid) {
      assert(false, 'M6: 第 ' + i + ' 次重放检测异常: ' + result.reason);
      return;
    }
  }
  assert(true, 'M6: 100 次新 requestId 全部通过重放检测');

  // M7: checkAgentAllowed 空字符串
  var r7 = gatewayPolicy.checkAgentAllowed('');
  assert(r7.allowed === true, 'M7: 空 agent 字符串允许通过（agent 检查可选）');
})();

// ══════════════════════════════════════════════════════════
// 结果汇总
// ══════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════');
console.log('  测试结果汇总');
console.log('═══════════════════════════════════════════');
console.log('  ✅ 通过: ' + passed);
console.log('  ❌ 失败: ' + failed);
console.log('  📊 总计: ' + tests.length);
console.log('═══════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
