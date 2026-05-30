'use strict';

var fs = require('fs');

var passed = 0, failed = 0, errors = [];

function assert(condition, msg) {
  if (condition) passed++; else { failed++; var e = 'FAIL: ' + (msg || ''); errors.push(e); console.log('  ✗ ' + e); }
}

function test(name, fn) {
  process.stdout.write('  ' + name + ' ... ');
  try { fn(); console.log('✓'); } catch (e) { failed++; errors.push('FAIL: ' + name + ' - ' + e.message); console.log('✗ ' + e.message); }
}

function summary() {
  console.log('\n' + '='.repeat(60));
  console.log('Asset Sync Agent 测试: ' + passed + ' 通过, ' + failed + ' 失败');
  if (errors.length) errors.forEach(function(e, i) { console.log('  ' + (i+1) + '. ' + e); });
  console.log('='.repeat(60));
  return failed === 0;
}

var agent = require('./asset-sync-agent');

// ─── A. 配置加载 ───────────────────────────────────────────

console.log('\n--- A. 配置 ---');

test('配置文件存在', function () {
  assert(fs.existsSync(agent.AGENT_CONFIG_PATH), '配置文件应存在');
});

test('loadAgentConfig 成功', function () {
  var config = agent.loadAgentConfig();
  assert(config !== null, '配置不应为空');
  assert(config.agent.id === 'google_drive_asset_agent', 'ID 正确');
  assert(config.agent.review_mode === 'REVIEW_ONLY', '模式 REVIEW_ONLY');
  assert(config.google_drive.folder_url.indexOf('drive.google.com') !== -1, '含 Drive URL');
});

// ─── B. 同步执行 ───────────────────────────────────────────

console.log('\n--- B. 同步 ---');

test('runSync 返回成功', function () {
  var result = agent.runSync();
  assert(result.success === true, '应成功');
  assert(typeof result.report === 'string', '应有报告');
  assert(result.results !== undefined, '应有结果');
});

test('同步报告含摘要', function () {
  var result = agent.runSync();
  assert(result.report.indexOf('同步报告') !== -1 || result.report.indexOf('素材') !== -1, '含标题');
  assert(result.report.indexOf('REVIEW_ONLY') !== -1, '含安全声明');
});

test('同步结果含文件列表', function () {
  var result = agent.runSync();
  assert(result.results.files.length >= 5, '应至少有5个文件');
  assert(result.results.summary.downloaded >= 5, '下载量≥5');
  assert(result.results.summary.skipped >= 1, '应跳过trashed文件');
});

// ─── C. 安全约束 ───────────────────────────────────────────

console.log('\n--- C. 安全 ---');

test('配置不含 .env', function () {
  var raw = fs.readFileSync(agent.AGENT_CONFIG_PATH, 'utf-8');
  assert(raw.indexOf('.env') === -1, '不含 .env');
});

test('配置不含 nginx', function () {
  var raw = fs.readFileSync(agent.AGENT_CONFIG_PATH, 'utf-8');
  assert(raw.indexOf('nginx') === -1, '不含 nginx');
});

test('Agent 为 REVIEW_ONLY 模式', function () {
  var config = agent.loadAgentConfig();
  assert(config.agent.review_mode === 'REVIEW_ONLY', 'REVIEW_ONLY');
  assert(config.agent.requires_human_approval === false, '素材同步不需人工审批');
});

test('Drive scope 为只读', function () {
  var config = agent.loadAgentConfig();
  assert(config.google_drive.scopes[0] === 'https://www.googleapis.com/auth/drive.readonly', '只读 scope');
});

// ─── D. 审计日志 ───────────────────────────────────────────

console.log('\n--- D. 审计 ---');

test('审计日志有事件', function () {
  agent.runSync();
  var log = agent.getAuditLog(20);
  assert(log.length > 0, '应有审计日志');
  var hasTriggered = log.some(function(e) { return e.event === 'agent_triggered'; });
  assert(hasTriggered, '含 agent_triggered');
  var hasDone = log.some(function(e) { return e.event === 'agent_completed'; });
  assert(hasDone, '含 agent_completed');
});

// ─── E. 命令路由 ───────────────────────────────────────────

console.log('\n--- E. 路由 ---');

test('/同步素材 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var r = resolve('/同步素材');
  assert(r !== null, '应匹配');
  assert(r.cmd === '/同步素材', 'cmd 正确');
});

test('/更新素材 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  assert(resolve('/更新素材') !== null, '别名应匹配');
});

test('/拉取素材 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  assert(resolve('/拉取素材') !== null, '别名应匹配');
});

// ─── F. DAG 集成 ───────────────────────────────────────────

console.log('\n--- F. DAG ---');

test('Mission DAG 含 fetch_google_drive_assets', function () {
  var missionPath = 'c:/Users/haoji/WorkBuddy/wecom-openclaw/apps/wecom-adapter/config/missions/doudian-daily-5-videos.mission.json';
  var raw = fs.readFileSync(missionPath, 'utf-8');
  var mission = JSON.parse(raw);
  var node = mission.dag.nodes.find(function(n) { return n.id === 'fetch_google_drive_assets'; });
  assert(node !== undefined, '节点应存在');
  assert(node.depends_on[0] === 'load_knowledge', '依赖 load_knowledge');
});

test('generate_5_scripts 依赖含 fetch_google_drive_assets', function () {
  var missionPath = 'c:/Users/haoji/WorkBuddy/wecom-openclaw/apps/wecom-adapter/config/missions/doudian-daily-5-videos.mission.json';
  var raw = fs.readFileSync(missionPath, 'utf-8');
  var mission = JSON.parse(raw);
  var node = mission.dag.nodes.find(function(n) { return n.id === 'generate_5_scripts'; });
  assert(node.depends_on.indexOf('fetch_google_drive_assets') !== -1, '依赖含新节点');
});

// ─── 输出示例 ──────────────────────────────────────────────

console.log('\n--- 输出 ---');
var result = agent.runSync();
console.log('  报告长度: ' + result.report.length + ' 字符');
console.log('  文件数: ' + result.results.files.length);

console.log('');
var ok = summary();
process.exit(ok ? 0 : 1);
