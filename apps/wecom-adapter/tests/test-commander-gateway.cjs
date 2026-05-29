'use strict';

/**
 * test-commander-gateway.cjs - P11.0 Commander Gateway Tests
 *
 * 测试覆盖:
 *   1. 创建 mission
 *   2. text → route
 *   3. route → graph
 *   4. capability check
 *   5. heartbeat check
 *   6. artifact 写入
 *   7. approval approve
 *   8. approval reject
 *   9. mission status 查询
 *  10. artifacts 查询
 */

var path = require('path');
var fs = require('fs');

// 设置测试环境
process.env.ARTIFACT_WORKSPACE_ROOT = path.resolve(__dirname, '..', 'logs', 'test-commander-workspace');
process.env.NODE_ENV = 'test';

var testWorkspace = process.env.ARTIFACT_WORKSPACE_ROOT;

// 清理测试 workspace
if (fs.existsSync(testWorkspace)) {
  fs.rmSync(testWorkspace, { recursive: true, force: true });
}
fs.mkdirSync(testWorkspace, { recursive: true });

// 加载模块
var missionRouter = require('../src/commander/mission-router');
var commanderReport = require('../src/commander/commander-report');
var commanderGateway = require('../src/commander/commander-gateway');

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

function assertNotEqual(actual, expected, label) {
  if (actual !== expected) {
    passed++;
  } else {
    failed++;
    var err = 'FAIL: ' + label + ' (expected not: ' + JSON.stringify(expected) + ')';
    errors.push(err);
    console.error('  ✗ ' + err);
  }
}

function assertContains(haystack, needle, label) {
  if (haystack && haystack.indexOf(needle) !== -1) {
    passed++;
  } else {
    failed++;
    var err = 'FAIL: ' + label + ' (string does not contain "' + needle + '")';
    errors.push(err);
    console.error('  ✗ ' + err);
  }
}

// ─── Mock HTTP 请求/响应 ───────────────────────────────────

function mockReq(method, path, body, params) {
  return {
    method: method || 'GET',
    path: path || '/',
    params: params || {},
    query: {},
    _commanderBody: body || null
  };
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

console.log('=== P11.0 Commander Gateway Tests ===\n');

// ═══════════════════════════════════════════════════════════
// Group A: Mission Router
// ═══════════════════════════════════════════════════════════

console.log('--- Group A: Mission Router ---');

// A1: 路由 autonomous
var r1 = missionRouter.route('开始 P10.8 自治闭环测试', { source: 'test', operator: 'laohao' });
assert(r1.success, 'A1: route autonomous success');
assertEqual(r1.mission.mission_type, 'autonomous-loop', 'A1: mission_type = autonomous-loop');

// A2: 路由 commerce
var r2 = missionRouter.route('电商商品管理', { source: 'test', operator: 'laohao' });
assert(r2.success, 'A2: route commerce success');
assertEqual(r2.mission.mission_type, 'commerce', 'A2: mission_type = commerce');

// A3: 路由 devops (requires approval)
var r3 = missionRouter.route('执行 PM2 部署重启', { source: 'test', operator: 'laohao' });
assert(r3.success, 'A3: route devops success');
assertEqual(r3.mission.mission_type, 'devops', 'A3: mission_type = devops');
assert(r3.approval_requirements.requires_approval, 'A3: devops requires approval');

// A4: 路由 trading
var r4 = missionRouter.route('分析可转债行情', { source: 'test', operator: 'laohao' });
assert(r4.success, 'A4: route trading success');
assertEqual(r4.mission.mission_type, 'trading', 'A4: mission_type = trading');

// A5: 路由 marketing
var r5 = missionRouter.route('ROI 广告投放分析', { source: 'test', operator: 'laohao' });
assert(r5.success, 'A5: route marketing success');
assertEqual(r5.mission.mission_type, 'marketing', 'A5: mission_type = marketing');

// A6: 路由 customer
var r6 = missionRouter.route('处理客服售后工单', { source: 'test', operator: 'laohao' });
assert(r6.success, 'A6: route customer success');
assertEqual(r6.mission.mission_type, 'customer', 'A6: mission_type = customer');

// A7: 路由 testing
var r7 = missionRouter.route('执行回归测试验证', { source: 'test', operator: 'laohao' });
assert(r7.success, 'A7: route testing success');
assertEqual(r7.mission.mission_type, 'testing', 'A7: mission_type = testing');

// A8: 默认路由 (general)
var r8 = missionRouter.route('帮我看一下这个文件', { source: 'test', operator: 'laohao' });
assert(r8.success, 'A8: route general success');
assertEqual(r8.mission.mission_type, 'general', 'A8: mission_type = general');

// A9: 空文本
var r9 = missionRouter.route('', { source: 'test', operator: 'laohao' });
assert(!r9.success, 'A9: empty text returns error');

// A10: 超长文本
var longText = 'x'.repeat(2001);
var r10 = missionRouter.route(longText, { source: 'test', operator: 'laohao' });
assert(!r10.success, 'A10: over-length text returns error');

// A11: 关键词大小写不敏感
var r11 = missionRouter.route('AUTONOMOUS LOOP EXECUTION', { source: 'test', operator: 'laohao' });
assert(r11.success, 'A11: case-insensitive routing');
assertEqual(r11.mission.mission_type, 'autonomous-loop', 'A11: case-insensitive autonomous');

// A12: agent requirements 包含 agent
assert(r1.agent_requirements.agents.length > 0, 'A12: agent requirements has agents');

// A13: task graph nodes 包含依赖
var nodes = r1.task_graph.nodes;
assert(nodes.length > 0, 'A13: task graph has nodes');

// A14: 审批确认 - git merge 需要审批
var r14 = missionRouter.route('合并 PR 代码 merge', { source: 'test', operator: 'laohao' });
assert(r14.success, 'A14: git merge route success');
assert(r14.approval_requirements.requires_approval, 'A14: git merge requires approval');

// A15: 不需要审批的普通任务
var r15 = missionRouter.route('测试一下功能', { source: 'test', operator: 'laohao' });
assert(r15.success, 'A15: general task route success');
assert(!r15.approval_requirements.requires_approval, 'A15: general task does not require approval');

// ═══════════════════════════════════════════════════════════
// Group B: Commander Report
// ═══════════════════════════════════════════════════════════

console.log('\n--- Group B: Commander Report ---');

var testMissionId = 'cmd_test_report';

// B1: 写入 dispatch report
var dr1 = commanderReport.writeDispatchReport(testMissionId, [
  { agent: 'workbuddy', capability: 'general.execute', allowed: true }
]);
assert(dr1.success, 'B1: write dispatch report success');

// B2: 写入 approval log
var ar1 = commanderReport.writeApprovalLog(testMissionId, 'approve', {
  operator: 'laohao', reason: '批准测试'
});
assert(ar1.success, 'B2: write approval log success');

// B3: 追加审批日志
var ar2 = commanderReport.appendApprovalLog(testMissionId, 'reject', {
  operator: 'laohao', reason: '拒绝测试'
});
assert(ar2.success, 'B3: append approval log success');

// B4: 写入 commander report
var cr1 = commanderReport.writeCommanderReport(testMissionId,
  { source: 'test', operator: 'laohao', text: '测试任务', mission_type: 'testing' },
  { graph_id: 'graph_test', status: 'running', nodes: [] },
  { status: 'running', total_steps: 5 }
);
assert(cr1.success, 'B4: write commander report success');

// B5: generate status summary
var summary = commanderReport.generateStatusSummary(testMissionId,
  { source: 'test', operator: 'laohao', mission_type: 'testing' },
  { status: 'completed', nodes: [
    { status: 'completed' }, { status: 'completed' }, { status: 'running' }, { status: 'pending' }
  ]},
  { last_action: 'approve' }
);
assertEqual(summary.stage, 'completed', 'B5: stage = completed');
assertEqual(summary.progress, 50, 'B5: progress = 50%');
assertEqual(summary.approval_status, 'approved', 'B5: approval_status = approved');

// B6: summary for no approval
var summary2 = commanderReport.generateStatusSummary(testMissionId + '_2',
  { source: 'test', operator: 'laohao', mission_type: 'general' },
  null, null
);
assertEqual(summary2.stage, 'created', 'B6: no graph → stage = created');
assertEqual(summary2.approval_status, 'not_required', 'B6: no approval → not_required');

// ═══════════════════════════════════════════════════════════
// Group C: Commander Gateway API
// ═══════════════════════════════════════════════════════════

console.log('\n--- Group C: Commander Gateway API ---');

// C1: 创建 mission
var req1 = mockReq('POST', '/commander/mission', {
  source: 'wecom',
  text: '执行 P10.8 自治闭环测试',
  operator: 'laohao',
  room: 'AI指挥中心',
  autoRun: false
});
var res1 = mockRes();
commanderGateway._handleCreateMission(req1, res1);
assert(res1._status === 201, 'C1: create mission returns 201');
assert(res1._json !== null, 'C1: create mission returns json');
assert(res1._json.success, 'C1: create mission success');
assertContains(res1._json.mission_id, 'cmd_', 'C1: mission_id starts with cmd_');

var createdMissionId = res1._json.mission_id;

// C2: 创建 mission - 缺少 text
var req2 = mockReq('POST', '/commander/mission', { operator: 'laohao' });
var res2 = mockRes();
commanderGateway._handleCreateMission(req2, res2);
assert(res2._status === 400, 'C2: missing text returns 400');

// C3: 创建 mission - 非法 operator
var req3 = mockReq('POST', '/commander/mission', { text: 'test', operator: '<script>alert(1)</script>' });
var res3 = mockRes();
commanderGateway._handleCreateMission(req3, res3);
assert(res3._status === 400, 'C3: invalid operator returns 400');

// C4: 创建 commerce mission
var req4 = mockReq('POST', '/commander/mission', {
  source: 'wecom',
  text: '抖店商品管理',
  operator: 'laohao',
  autoRun: false
});
var res4 = mockRes();
commanderGateway._handleCreateMission(req4, res4);
assert(res4._status === 201, 'C4: create commerce mission returns 201');
assertEqual(res4._json.mission_type, 'commerce', 'C4: mission_type is commerce');

// C5: 创建 devops mission (需要审批)
var req5 = mockReq('POST', '/commander/mission', {
  source: 'wecom',
  text: 'PM2 部署重启',
  operator: 'laohao',
  autoRun: false
});
var res5 = mockRes();
commanderGateway._handleCreateMission(req5, res5);
assert(res5._status === 201, 'C5: create devops mission returns 201');
assertEqual(res5._json.mission_type, 'devops', 'C5: mission_type is devops');
assert(res5._json.capabilities.requires_approval, 'C5: devops requires approval');

var devopsMissionId = res5._json.mission_id;

// C6: 查询 mission status
var req6 = mockReq('GET', '/commander/mission/' + createdMissionId + '/status', null, { mission_id: createdMissionId });
var res6 = mockRes();
commanderGateway._handleMissionStatus(req6, res6);
assert(res6._status === 200, 'C6: status query returns 200');
assert(res6._json.success, 'C6: status query success');

// C7: 查询无效 mission_id
var req7 = mockReq('GET', '/commander/mission/invalid@#$%/status', null, { mission_id: 'invalid@#$%' });
var res7 = mockRes();
commanderGateway._handleMissionStatus(req7, res7);
assert(res7._status === 400, 'C7: invalid mission_id returns 400');

// C8: 审批 approve
var req8 = mockReq('POST', '/commander/mission/' + devopsMissionId + '/approve', {
  action: 'approve',
  operator: 'laohao',
  reason: '批准部署'
}, { mission_id: devopsMissionId });
var res8 = mockRes();
commanderGateway._handleApprove(req8, res8);
assert(res8._status === 200, 'C8: approve returns 200');
assert(res8._json.success, 'C8: approve success');

// C9: 审批 reject
var req9 = mockReq('POST', '/commander/mission/' + devopsMissionId + '/approve', {
  action: 'reject',
  operator: 'laohao',
  reason: '拒绝部署'
}, { mission_id: devopsMissionId });
var res9 = mockRes();
commanderGateway._handleApprove(req9, res9);
assert(res9._status === 200, 'C9: reject returns 200');
assert(res9._json.success, 'C9: reject success');

// C10: 审批非法 action
var req10 = mockReq('POST', '/commander/mission/' + devopsMissionId + '/approve', {
  action: 'invalid',
  operator: 'laohao'
}, { mission_id: devopsMissionId });
var res10 = mockRes();
commanderGateway._handleApprove(req10, res10);
assert(res10._status === 400, 'C10: invalid action returns 400');

// C11: 审批无效 mission_id
var req11 = mockReq('POST', '/commander/mission/invalid@#$%/approve', {
  action: 'approve',
  operator: 'laohao'
}, { mission_id: 'invalid@#$%' });
var res11 = mockRes();
commanderGateway._handleApprove(req11, res11);
assert(res11._status === 400, 'C11: invalid mission_id for approve returns 400');

// C12: 查询 artifacts
var req12 = mockReq('GET', '/commander/mission/' + createdMissionId + '/artifacts', null, { mission_id: createdMissionId });
var res12 = mockRes();
commanderGateway._handleMissionArtifacts(req12, res12);
assert(res12._status === 200, 'C12: artifacts query returns 200');
assert(res12._json.success, 'C12: artifacts query success');

// C13: 查询无效 mission artifacts
var req13 = mockReq('GET', '/commander/mission/invalid@#$%/artifacts', null, { mission_id: 'invalid@#$%' });
var res13 = mockRes();
commanderGateway._handleMissionArtifacts(req13, res13);
assert(res13._status === 400, 'C13: invalid mission_id artifacts returns 400');

// C14: 创建 mission 后 artifact 写入
// 检查 dispatch.json 是否存在
var fs2 = require('fs');
var dispatchPath = path.join(testWorkspace, 'missions', createdMissionId, 'dispatch.json');
var dispatchExists = fs2.existsSync(dispatchPath);
assert(dispatchExists, 'C14: dispatch.json artifact written');

// C15: 审批后 approval-log.json 更新
var approvalPath = path.join(testWorkspace, 'missions', devopsMissionId, 'approval-log.json');
var approvalExists = fs2.existsSync(approvalPath);
assert(approvalExists, 'C15: approval-log.json artifact written');

// ═══════════════════════════════════════════════════════════
// Group D: Edge Cases
// ═══════════════════════════════════════════════════════════

console.log('\n--- Group D: Edge Cases ---');

// D1: 创建 mission 无 source 默认
var reqD1 = mockReq('POST', '/commander/mission', {
  text: '普通任务',
  operator: 'laohao',
  autoRun: false
});
var resD1 = mockRes();
commanderGateway._handleCreateMission(reqD1, resD1);
assert(resD1._status === 201, 'D1: create without source succeeds');

// D2: 中英文混合路由
var rD2 = missionRouter.route('执行 电商 ecommerce 测试', { source: 'test', operator: 'laohao' });
assertEqual(rD2.mission.mission_type, 'commerce', 'D2: mixed zh-en routes to commerce');

// D3: 审批后 mission status 变更
var reqD3 = mockReq('GET', '/commander/mission/' + devopsMissionId + '/status', null, { mission_id: devopsMissionId });
var resD3 = mockRes();
commanderGateway._handleMissionStatus(reqD3, resD3);
assert(resD3._json.success, 'D3: status after approval succeeds');

// D4: 多个关键词命中 → 第一个优先
var rD4 = missionRouter.route('测试 autonomous 系统', { source: 'test', operator: 'laohao' });
assertEqual(rD4.mission.mission_type, 'autonomous-loop', 'D4: first keyword match wins');

// ═══════════════════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════════════════

console.log('\n=== P11.0 Results ===');
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
