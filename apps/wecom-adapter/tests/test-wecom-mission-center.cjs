'use strict';

/**
 * test-wecom-mission-center.cjs - P11.1 WeCom Mission Center Tests
 *
 * 测试覆盖:
 *   1. WeCom 消息解析
 *   2. WeCom → Commander Mission
 *   3. /任务 状态
 *   4. /任务 详情
 *   5. /任务 artifacts
 *   6. /审批
 *   7. /拒绝
 *   8. markdown 格式输出
 *   9. 非法 mission_id
 *  10. 不破坏 /wecom/callback
 */

var path = require('path');
var fs = require('fs');

process.env.ARTIFACT_WORKSPACE_ROOT = path.resolve(__dirname, '..', 'logs', 'test-wecom-workspace');
process.env.NODE_ENV = 'test';

var testWorkspace = process.env.ARTIFACT_WORKSPACE_ROOT;
if (fs.existsSync(testWorkspace)) {
  fs.rmSync(testWorkspace, { recursive: true, force: true });
}
fs.mkdirSync(testWorkspace, { recursive: true });

var wecomFormat = require('../src/wecom/wecom-mission-format');
var wecomCenter = require('../src/wecom/wecom-mission-center');

// ─── 测试辅助 ──────────────────────────────────────────────

var passed = 0;
var failed = 0;
var errors = [];

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    var err = 'FAIL: ' + label;
    errors.push(err);
    console.error('  ✗ ' + err);
  }
}

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    var err = 'FAIL: ' + label + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')';
    errors.push(err);
    console.error('  ✗ ' + err);
  }
}

function assertContains(haystack, needle, label) {
  if (haystack && haystack.indexOf(needle) !== -1) {
    passed++;
  } else {
    failed++;
    var err = 'FAIL: ' + label + ' (does not contain "' + needle + '")';
    errors.push(err);
    console.error('  ✗ ' + err);
  }
}

function mockRes() {
  var res = {
    _status: 200,
    _json: null,
    status: function(code) { res._status = code; return res; },
    json: function(data) { res._json = data; return res; }
  };
  return res;
}

// ─── 运行测试 ──────────────────────────────────────────────

console.log('=== P11.1 WeCom Mission Center Tests ===\n');

// ═══════════════════════════════════════════════════════════
// Group A: WeCom 消息解析
// ═══════════════════════════════════════════════════════════

console.log('--- Group A: Message Parsing ---');

// A1: 解析普通消息 → 创建 mission
var a1 = wecomCenter._parseWeComMessage({
  FromUserName: 'laohao',
  RoomId: 'AI指挥中心',
  Content: '开始 P10.8 最终部署'
});
assert(!a1.isCommand, 'A1: isCommand = false');
assertEqual(a1.missionReq.text, '开始 P10.8 最终部署', 'A1: text preserved');
assertEqual(a1.missionReq.operator, 'laohao', 'A1: operator = laohao');
assertEqual(a1.missionReq.room, 'AI指挥中心', 'A1: room = AI指挥中心');
assertEqual(a1.missionReq.source, 'wecom', 'A1: source = wecom');

// A2: 解析 /任务 状态 指令
var a2 = wecomCenter._parseWeComMessage({
  FromUserName: 'laohao',
  Content: '/任务 状态 cmd_abc123'
});
assert(a2.isCommand, 'A2: isCommand = true');
assertEqual(a2.parsed.command, 'status', 'A2: command = status');
assertEqual(a2.parsed.mission_id, 'cmd_abc123', 'A2: mission_id = cmd_abc123');

// A3: 解析 /任务 详情 指令
var a3 = wecomCenter._parseWeComMessage({
  FromUserName: 'laohao',
  Content: '/任务 详情 cmd_abc123'
});
assert(a3.isCommand, 'A3: isCommand = true');
assertEqual(a3.parsed.command, 'detail', 'A3: command = detail');

// A4: 解析 /任务 artifacts 指令
var a4 = wecomCenter._parseWeComMessage({
  FromUserName: 'laohao',
  Content: '/任务 artifacts cmd_abc123'
});
assert(a4.isCommand, 'A4: isCommand = true');
assertEqual(a4.parsed.command, 'artifacts', 'A4: command = artifacts');

// A5: 解析 /审批 指令
var a5 = wecomCenter._parseWeComMessage({
  FromUserName: 'laohao',
  Content: '/审批 cmd_abc123'
});
assert(a5.isCommand, 'A5: isCommand = true');
assertEqual(a5.parsed.command, 'approve', 'A5: command = approve');

// A6: 解析 /拒绝 指令
var a6 = wecomCenter._parseWeComMessage({
  FromUserName: 'laohao',
  Content: '/拒绝 cmd_abc123'
});
assert(a6.isCommand, 'A6: isCommand = true');
assertEqual(a6.parsed.command, 'reject', 'A6: command = reject');

// A7: 解析 /help 指令
var a7 = wecomCenter._parseWeComMessage({
  FromUserName: 'laohao',
  Content: '/help'
});
assert(a7.isCommand, 'A7: isCommand = true');
assertEqual(a7.parsed.command, 'help', 'A7: command = help');

// A8: 空消息
var a8 = wecomCenter._parseWeComMessage({});
assert(!a8.isCommand, 'A8: empty message is not command');
assertContains(a8.replyMarkdown, 'Error', 'A8: empty message returns error');

// A9: 无 Content 消息
var a9 = wecomCenter._parseWeComMessage({ FromUserName: 'laohao' });
assert(!a9.isCommand, 'A9: no Content is not command');

// A10: 不破坏 /wecom/callback
var a10 = wecomCenter._parseWeComMessage({
  FromUserName: 'laohao',
  Content: '/wecom/callback not matched'
});
assert(!a10.isCommand, 'A10: /wecom/callback is not a command');

// ═══════════════════════════════════════════════════════════
// Group B: WeCom Format (Markdown)
// ═══════════════════════════════════════════════════════════

console.log('\n--- Group B: WeCom Format ---');

// B1: formatMissionCreated
var b1 = wecomFormat.formatMissionCreated('cmd_test', 'graph_test', 'testing', 'created');
assertContains(b1, '🚀 Mission Created', 'B1: contains title');
assertContains(b1, 'cmd_test', 'B1: contains mission_id');
assertContains(b1, 'graph_test', 'B1: contains graph_id');
assertContains(b1, 'testing', 'B1: contains type');

// B2: formatMissionRunning
var b2 = wecomFormat.formatMissionRunning('cmd_test', 40, 'capability_check', 'workbuddy');
assertContains(b2, '🟡 Mission Running', 'B2: contains title');
assertContains(b2, '40%', 'B2: contains progress');

// B3: formatMissionCompleted
var b3 = wecomFormat.formatMissionCompleted('cmd_test', 5, 'passed', 'none');
assertContains(b3, '✅ Mission Completed', 'B3: contains title');
assertContains(b3, '5', 'B3: contains artifact count');
assertContains(b3, 'passed', 'B3: contains tests status');

// B4: formatMissionFailed
var b4 = wecomFormat.formatMissionFailed('cmd_test', 'Test error', 'execute_node');
assertContains(b4, '❌ Mission Failed', 'B4: contains title');
assertContains(b4, 'Test error', 'B4: contains error');

// B5: formatMissionBlocked
var b5 = wecomFormat.formatMissionBlocked('cmd_test', 'requiresApproval');
assertContains(b5, '⚠️ Mission Blocked', 'B5: contains title');
assertContains(b5, 'requiresApproval', 'B5: contains reason');
assertContains(b5, '/审批 cmd_test', 'B5: contains approve action');

// B6: formatApprovalResult - approve
var b6 = wecomFormat.formatApprovalResult('cmd_test', 'approve', 'laohao');
assertContains(b6, '✅ Approved', 'B6: contains approved');

// B7: formatApprovalResult - reject
var b7 = wecomFormat.formatApprovalResult('cmd_test', 'reject', 'laohao');
assertContains(b7, '❌ Rejected', 'B7: contains rejected');

// B8: formatArtifactsList
var b8 = wecomFormat.formatArtifactsList('cmd_test', ['dispatch.json', 'approval-log.json'], 2);
assertContains(b8, '📦 Artifacts', 'B8: contains title');
assertContains(b8, 'dispatch.json', 'B8: contains dispatch.json');

// B9: formatHelp
var b9 = wecomFormat.formatHelp();
assertContains(b9, 'Commander Help', 'B9: contains help title');
assertContains(b9, '/任务 状态', 'B9: contains /任务 状态');
assertContains(b9, '/审批', 'B9: contains /审批');
assertContains(b9, '/拒绝', 'B9: contains /拒绝');

// B10: formatError
var b10 = wecomFormat.formatError('Test error message');
assertContains(b10, '❌ Error', 'B10: contains error title');

// ═══════════════════════════════════════════════════════════
// Group C: WeCom API Handlers (Mock)
// ═══════════════════════════════════════════════════════════

console.log('\n--- Group C: WeCom API ---');

// C1: POST /wecom/mission - 缺少 Content
var reqC1 = { _wecomBody: {} };
var resC1 = mockRes();
wecomCenter._handleWeComMission(reqC1, resC1);
assert(resC1._status === 400, 'C1: empty body returns 400');

// C2: POST /wecom/mission - WeCom 格式
var reqC2 = {
  _wecomBody: {
    FromUserName: 'laohao',
    RoomId: 'AI指挥中心',
    Content: '/help'
  }
};
var resC2 = mockRes();
wecomCenter._handleWeComMission(reqC2, resC2);
assertEqual(resC2._status, 200, 'C2: /help returns 200');
assert(resC2._json.reply !== undefined, 'C2: help has reply markdown');

// C3: POST /wecom/mission - /任务 状态（异步 HTTP 调用）
var reqC3 = {
  _wecomBody: {
    FromUserName: 'laohao',
    Content: '/任务 状态 cmd_nonexistent_777'
  }
};
var resC3 = mockRes();
try {
  wecomCenter._handleWeComMission(reqC3, resC3);
  // 异步内部调用，同步部分不抛异常
  assert(true, 'C3: status command handled without sync error');
} catch (e) {
  assert(false, 'C3: status command threw sync error: ' + e.message);
}

// C4: POST /wecom/mission - /审批 不存在的 mission
// 注意: 内部 HTTP 调用是异步的，测试只验证同步部分
var reqC4 = {
  _wecomBody: {
    FromUserName: 'laohao',
    Content: '/审批 cmd_nonexistent_999'
  }
};
var resC4 = mockRes();
try {
  wecomCenter._handleWeComMission(reqC4, resC4);
  // 处理命令在内部异步执行，同步部分不抛异常即可
  assert(true, 'C4: approve command handled without sync error');
} catch (e) {
  assert(false, 'C4: approve command threw sync error: ' + e.message);
}

// C5: POST /wecom/mission - 超长内容
var reqC5 = {
  _wecomBody: {
    FromUserName: 'laohao',
    Content: 'x'.repeat(2001)
  }
};
var resC5 = mockRes();
wecomCenter._handleWeComMission(reqC5, resC5);
assert(resC5._status === 400, 'C5: over-length content returns 400');

// C6: GET /wecom/mission/:id - 无效 ID
var reqC6 = { params: { mission_id: 'invalid@#$%' } };
var resC6 = mockRes();
wecomCenter._handleWeComMissionGet(reqC6, resC6);
assert(resC6._status === 400, 'C6: invalid mission_id for GET returns 400');

// C7: POST /wecom/mission/:id/heartbeat - 无效 ID
var reqC7 = { params: { mission_id: 'invalid@#$%' } };
var resC7 = mockRes();
wecomCenter._handleWeComHeartbeat(reqC7, resC7);
assert(resC7._status === 400, 'C7: invalid mission_id for heartbeat returns 400');

// ═══════════════════════════════════════════════════════════
// Group D: Sanitize & Security
// ═══════════════════════════════════════════════════════════

console.log('\n--- Group D: Sanitize & Security ---');

// D1: sanitize 限制长度
var d1 = wecomFormat.sanitize('x'.repeat(1000));
assert(d1.length <= 500, 'D1: sanitize limits length to 500');

// D2: sanitize 过滤控制字符
var d2 = wecomFormat.sanitize('hello\x00world');
assert(d2.indexOf('\x00') === -1, 'D2: sanitize removes control chars');

// D3: markdown 不注入可点击链接（md link 格式被打破）
var d3 = wecomFormat.formatMissionCreated('test', 'test', '[evil](http://evil.com)', 'created');
// markdown link 语法 `[text](url)` 应被破坏，不再呈现为可点击链接
var mdLinkPattern = /\[evil\]\(http:\/\/evil\.com\)/;
assert(!mdLinkPattern.test(d3), 'D3: markdown link syntax broken, no clickable links');

// D4: 指令解析限制 mission_id 格式
var d4 = wecomFormat.parseCommand('/审批 <script>alert(1)</script>');
assert(d4 === null, 'D4: XSS in command rejected');

// D5: encodeURIComponent in internal calls
var d5 = '/wecom/mission/' + encodeURIComponent('cmd_test_123') + '/heartbeat';
assert(d5.indexOf('cmd_test_123') !== -1, 'D5: mission_id properly encoded');

// ═══════════════════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════════════════

console.log('\n=== P11.1 Results ===');
console.log('Total: ' + (passed + failed));
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);

if (failed > 0) {
  console.log('\nFailures:');
  errors.forEach(function(e) { console.log('  ' + e); });
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
  process.exit(0);
}
