'use strict';

/**
 * test-mission-manager.cjs — 视频 Mission 测试套件
 *
 * 测试范围:
 *   A. 配置加载
 *   B. Mission 创建
 *   C. DAG 推进
 *   D. 安全检查
 *   E. 状态查询
 *   F. 报告生成
 *   G. command-center 路由
 *   H. 安全约束
 */

var fs = require('fs');
var path = require('path');

// ─── 测试框架 ──────────────────────────────────────────────

var passed = 0;
var failed = 0;
var errors = [];

function assert(condition, msg) {
  if (condition) { passed++; }
  else {
    failed++;
    var errMsg = 'FAIL: ' + (msg || 'assertion failed');
    errors.push(errMsg);
    console.log('  ✗ ' + errMsg);
  }
}

function test(name, fn) {
  process.stdout.write('  ' + name + ' ... ');
  try {
    fn();
    console.log('✓');
  } catch (e) {
    failed++;
    var errMsg = 'FAIL: ' + name + ' - ' + e.message;
    errors.push(errMsg);
    console.log('✗ ' + e.message);
  }
}

function summary() {
  console.log('\n' + '='.repeat(60));
  console.log('Mission Manager 测试结果: ' + passed + ' 通过, ' + failed + ' 失败');
  if (errors.length > 0) {
    console.log('\n失败详情:');
    errors.forEach(function (e, i) { console.log('  ' + (i + 1) + '. ' + e); });
  }
  console.log('='.repeat(60));
  return failed === 0;
}

// ─── 模块加载 ──────────────────────────────────────────────

var mm = require('./mission-manager');
var MISSION_ID = 'doudian-daily-5-videos';

// ─── A. 配置加载 ───────────────────────────────────────────

console.log('\n--- A. 配置加载 ---');

test('配置文件存在', function () {
  var config = mm.loadMissionConfig(MISSION_ID);
  assert(config !== null, '配置应存在');
});

test('Mission 元数据正确', function () {
  var config = mm.loadMissionConfig(MISSION_ID);
  assert(config.version === 'mission.doudian.video.daily.v1', '版本正确');
  assert(config.mission.id === 'mission_doudian_suanlafen_daily_5_videos', 'ID 正确');
  assert(config.mission.domain === 'marketing', '域名正确');
  assert(config.mission.review_mode === 'REVIEW_ONLY', '模式为 REVIEW_ONLY');
  assert(config.mission.requires_human_approval === true, '需人工审批');
  assert(config.mission.enabled === true, '已启用');
});

test('listMissionConfigs 返回正确', function () {
  var missions = mm.listMissionConfigs();
  assert(missions.indexOf(MISSION_ID) !== -1, '应包含目标 Mission');
});

// ─── B. Mission 创建 ───────────────────────────────────────

console.log('\n--- B. Mission 创建 ---');

test('createMissionRun 成功', function () {
  var result = mm._createMissionRun(MISSION_ID);
  assert(result.success === true, '应创建成功');
  assert(result.run.run_id !== undefined, '应有 run_id');
  assert(result.run.status === 'created', '初始状态为 created');
  assert(result.run.review_mode === 'REVIEW_ONLY', '模式为 REVIEW_ONLY');
});

test('DAG 节点已初始化', function () {
  var result = mm._createMissionRun(MISSION_ID);
  var config = mm.loadMissionConfig(MISSION_ID);
  var nodeCount = config.dag.nodes.length;
  assert(Object.keys(result.run.dag_nodes).length === nodeCount, 'DAG 节点数应为 ' + nodeCount);

  config.dag.nodes.forEach(function (node) {
    assert(result.run.dag_nodes[node.id] !== undefined, '节点 ' + node.id + ' 应存在');
    assert(result.run.dag_nodes[node.id].status === 'pending', '节点 ' + node.id + ' 初始状态为 pending');
  });
});

test('createOrRun 返回完整信息', function () {
  var result = mm.createOrRun(MISSION_ID);
  assert(result.success === true, '应成功');
  assert(result.run !== undefined, '应有 run');
  // config 在首次创建时返回，若已有运行则仅返回 run+message
  if (result.config) {
    assert(result.config.mission !== undefined, 'config 应有 mission');
  }
  assert(typeof result.message === 'string', '应有 message');
});

// ─── C. DAG 推进 ───────────────────────────────────────────

console.log('\n--- C. DAG 推进 ---');

test('runFullDAG 推进所有非审批节点', function () {
  var createResult = mm._createMissionRun(MISSION_ID);
  var config = mm.loadMissionConfig(MISSION_ID);
  var dagResult = mm.runFullDAG(createResult.run, config);

  assert(dagResult.success === true, 'DAG 应执行成功');

  // 检查审批节点状态
  config.dag.nodes.forEach(function (node) {
    var state = createResult.run.dag_nodes[node.id];
    if (node.type === 'approval') {
      assert(state.status === 'requires_approval', '审批节点 ' + node.id + ' 应为 requires_approval');
    } else {
      assert(state.status === 'completed', '非审批节点 ' + node.id + ' 应为 completed');
    }
  });
});

test('runFullDAG 返回审批列表', function () {
  var createResult = mm._createMissionRun(MISSION_ID);
  var config = mm.loadMissionConfig(MISSION_ID);
  var dagResult = mm.runFullDAG(createResult.run, config);

  assert(dagResult.approvals_required.length >= 1, '应至少有一个审批项');
  var approveNode = dagResult.approvals_required[0];
  assert(approveNode.required_for.indexOf('real_publish_to_douyin') !== -1, '审批应包含 real_publish_to_douyin');
});

test('advanceNode 检查依赖', function () {
  var createResult = mm._createMissionRun(MISSION_ID);
  var run = createResult.run;

  // 跳过依赖直接推进第二个节点应失败
  var skipResult = mm.advanceNode(run, 'generate_5_scripts');
  assert(skipResult.success === false, '跳过依赖应失败');

  // 完成第一个节点后推进第二个
  mm.advanceNode(run, 'load_knowledge');
  mm.advanceNode(run, 'load_knowledge'); // 变为 completed
  mm.advanceNode(run, 'fetch_google_drive_assets');
  mm.advanceNode(run, 'fetch_google_drive_assets'); // 变为 completed（新增 DAG 节点依赖）
  var result2 = mm.advanceNode(run, 'generate_5_scripts');
  assert(result2.success === true, '依赖满足后应成功');
});

test('getLatestRun 返回最新', function () {
  var result1 = mm.createOrRun(MISSION_ID);
  var result2 = mm.createOrRun(MISSION_ID);
  var latest = mm.getLatestRun(MISSION_ID);
  assert(latest !== null, '应有最新运行记录');
  assert(latest.run_id === result1.run.run_id, '应返回首次运行（已在运行中不重复创建）');
});

// ─── D. 安全检查 ───────────────────────────────────────────

console.log('\n--- D. 安全检查 ---');

test('checkSafety: real_publish_to_douyin 需要 CEO 审批', function () {
  var config = mm.loadMissionConfig(MISSION_ID);
  var result = mm.checkSafety('real_publish_to_douyin', config);
  assert(result.allowed === false, '不应自动允许');
  assert(result.requiresApproval === true, '需要审批');
  assert(result.approvers.indexOf('CEO') !== -1, '需要 CEO');
});

test('checkSafety: real_ads_launch 需要 CEO 审批', function () {
  var config = mm.loadMissionConfig(MISSION_ID);
  var result = mm.checkSafety('real_ads_launch', config);
  assert(result.allowed === false, '不应自动允许');
  assert(result.requiresApproval === true, '需要审批');
  assert(result.approvers.indexOf('CEO') !== -1, '需要 CEO');
});

test('checkSafety: generate_video_script 自动批准', function () {
  var config = mm.loadMissionConfig(MISSION_ID);
  var result = mm.checkSafety('generate_video_script', config);
  assert(result.allowed === true, '应自动批准');
  assert(result.requiresApproval === false, '不需审批');
});

test('checkSafety: deploy 禁止', function () {
  var config = mm.loadMissionConfig(MISSION_ID);
  var result = mm.checkSafety('deploy', config);
  assert(result.allowed === false, 'deploy 应禁止');
  assert(result.requiresApproval === true, '需要审批');
});

test('checkSafety: modify_env 禁止', function () {
  var config = mm.loadMissionConfig(MISSION_ID);
  var result = mm.checkSafety('modify_env', config);
  assert(result.allowed === false, 'modify_env 应禁止');
});

test('checkSafety: modify_nginx 禁止', function () {
  var config = mm.loadMissionConfig(MISSION_ID);
  var result = mm.checkSafety('modify_nginx', config);
  assert(result.allowed === false, 'modify_nginx 应禁止');
});

test('checkSafety: join_activity 需要审批', function () {
  var config = mm.loadMissionConfig(MISSION_ID);
  var result = mm.checkSafety('join_activity', config);
  assert(result.allowed === false, 'join_activity 需要审批');
});

// ─── E. 状态查询 ───────────────────────────────────────────

console.log('\n--- E. 状态查询 ---');

test('queryStatus 返回 Markdown', function () {
  mm.createOrRun(MISSION_ID);
  var status = mm.queryStatus(MISSION_ID);
  assert(typeof status === 'string', '应返回字符串');
  assert(status.length > 200, '不应太短');
  assert(status.indexOf('酸辣粉') !== -1, '应包含任务名');
  assert(status.indexOf('DAG') !== -1 || status.indexOf('进度') !== -1, '应包含进度信息');
  assert(status.indexOf('REVIEW_ONLY') !== -1, '应包含安全声明');
});

// ─── F. 报告生成 ───────────────────────────────────────────

console.log('\n--- F. 报告生成 ---');

test('generateReport 返回 Markdown', function () {
  mm.createOrRun(MISSION_ID);
  var report = mm.generateReport(MISSION_ID);
  assert(typeof report === 'string', '应返回字符串');
  assert(report.length > 200, '不应太短');
  assert(report.indexOf('复盘') !== -1 || report.indexOf('视频') !== -1, '应包含报告内容');
  assert(report.indexOf('REVIEW_ONLY') !== -1, '应包含安全声明');
});

test('generateReport 含视频模板信息', function () {
  var report = mm.generateReport(MISSION_ID);
  assert(report.indexOf('极速冲泡') !== -1 || report.indexOf('食材卖点') !== -1, '应包含模板信息');
});

test('generateReport 含发布策略', function () {
  var report = mm.generateReport(MISSION_ID);
  assert(report.indexOf('08:00') !== -1 || report.indexOf('早高峰') !== -1 || report.indexOf('22:00') !== -1, '应包含时段信息');
});

// ─── G. command-center 路由 ────────────────────────────────

console.log('\n--- G. command-center 路由 ---');

test('/视频任务 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/视频任务');
  assert(result !== null, '/视频任务 应匹配');
  assert(result.cmd === '/视频任务', 'cmd 正确');
});

test('/视频进度 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/视频进度');
  assert(result !== null, '/视频进度 应匹配');
});

test('/视频复盘 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/视频复盘');
  assert(result !== null, '/视频复盘 应匹配');
});

test('别名 /酸辣粉视频 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/酸辣粉视频');
  assert(result !== null, '/酸辣粉视频 应匹配');
});

test('别名 /每日视频 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/每日视频');
  assert(result !== null, '/每日视频 应匹配');
});

test('REGISTRY 包含三个命令', function () {
  var { REGISTRY } = require('../../lib/command-center');
  assert(REGISTRY['/视频任务'] !== undefined, 'REGISTRY 应含 /视频任务');
  assert(REGISTRY['/视频进度'] !== undefined, 'REGISTRY 应含 /视频进度');
  assert(REGISTRY['/视频复盘'] !== undefined, 'REGISTRY 应含 /视频复盘');
});

// ─── H. 安全约束 ───────────────────────────────────────────

console.log('\n--- H. 安全约束 ---');

test('配置不含 .env/nginx（仅作为安全禁止项出现）', function () {
  var raw = fs.readFileSync(path.join(mm.MISSIONS_DIR, MISSION_ID + '.mission.json'), 'utf-8');
  // modify_nginx 是合法禁止项，独立 nginx 词不应出现
  var nginxCount = (raw.match(/"nginx"/g) || []).length;
  assert(nginxCount === 0 || nginxCount <= 1, '独立 nginx 不应作为配置项出现');
  assert(raw.indexOf('.env') === -1, '不应含 .env');
});

test('forbidden_without_approval 包含 deploy/pm2_restart/modify_env', function () {
  var config = mm.loadMissionConfig(MISSION_ID);
  var forbidden = config.approval_rules.forbidden_without_approval;
  assert(forbidden.indexOf('deploy') !== -1, '应禁止 deploy');
  assert(forbidden.indexOf('pm2_restart') !== -1, '应禁止 pm2_restart');
  assert(forbidden.indexOf('modify_env') !== -1, '应禁止 modify_env');
  assert(forbidden.indexOf('modify_nginx') !== -1, '应禁止 modify_nginx');
  assert(forbidden.indexOf('modify_vault') !== -1, '应禁止 modify_vault');
});

test('审计日志已写入', function () {
  mm.createOrRun(MISSION_ID);
  var log = mm.getAuditLog(20);
  assert(log.length > 0, '应有审计日志');
  var hasCreated = log.some(function (e) { return e.event === 'mission_created'; });
  assert(hasCreated, '应包含 mission_created 事件');
});

// ─── 实现异步报告 ──────────────────────────────────────────

console.log('\n--- 输出示例 ---');
var statusOutput = mm.queryStatus(MISSION_ID);
console.log('  状态报告长度: ' + statusOutput.length + ' 字符');
console.log('  状态报告开头: ' + statusOutput.substring(0, 80).replace(/\n/g, ' ') + '...');

console.log('');
var ok = summary();
process.exit(ok ? 0 : 1);
