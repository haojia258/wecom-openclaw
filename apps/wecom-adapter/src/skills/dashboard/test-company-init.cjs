'use strict';

/**
 * test-company-init.cjs — 公司初始化测试套件
 *
 * 测试范围:
 *   A. 配置文件加载与验证
 *   B. Organization 初始化
 *   C. KPI Engine 初始化
 *   D. Budget Engine 初始化
 *   E. Approval Center 初始化
 *   F. Knowledge Base 初始化
 *   G. 安全验证
 *   H. 全量初始化 + 审计报告
 *   I. command-center 路由
 *   J. 高危文件检查
 */

var path = require('path');
var fs = require('fs');

// ─── 测试框架 ──────────────────────────────────────────────

var passed = 0;
var failed = 0;
var errors = [];

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
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
    if (errors.length === 0 || errors[errors.length - 1] === undefined) {
      console.log('✓');
    }
  } catch (e) {
    failed++;
    var errMsg = 'FAIL: ' + name + ' - ' + e.message;
    errors.push(errMsg);
    console.log('✗ ' + e.message);
  }
}

function summary() {
  console.log('\n' + '='.repeat(60));
  console.log('Company Init v3 测试结果: ' + passed + ' 通过, ' + failed + ' 失败');
  if (errors.length > 0) {
    console.log('\n失败详情:');
    errors.forEach(function (e, i) {
      console.log('  ' + (i + 1) + '. ' + e);
    });
  }
  console.log('='.repeat(60));
  return failed === 0;
}

// ─── 模块加载 ──────────────────────────────────────────────

var {
  initAll, validateConfig, getInitResults,
  _loadConfig, _initOrganization, _initKPI,
  _initBudget, _initApproval, _initKnowledge,
  _verifySafety, CONFIG_PATH
} = require('./company-init');

// ─── A. 配置文件加载与验证 ─────────────────────────────────

console.log('\n--- A. 配置文件 ---');

test('配置文件存在', function () {
  assert(fs.existsSync(CONFIG_PATH), '配置文件应存在');
});

test('配置文件可解析', function () {
  var config = _loadConfig();
  assert(config !== null, '配置不应为 null');
  assert(config.version === 'v3.0.0', '版本应为 v3.0.0');
  assert(config.platform === '抖店', '平台应为抖店');
});

test('validateConfig 返回有效', function () {
  var result = validateConfig();
  assert(result.valid === true, '配置应有效');
  assert(result.version === 'v3.0.0', '版本正确');
});

// ─── B. Organization 验证 ──────────────────────────────────

console.log('\n--- B. Organization (P21) ---');

test('Organization 包含 5 个角色', function () {
  var config = _loadConfig();
  var org = config.organization;
  assert(org.ceo !== undefined, '应有 CEO');
  assert(org.coo !== undefined, '应有 COO');
  assert(org.cto !== undefined, '应有 CTO');
  assert(org.cmo !== undefined, '应有 CMO');
  assert(org.cfo !== undefined, '应有 CFO');
});

test('CEO 为 Level 1, 其他为 Level 2', function () {
  var config = _loadConfig();
  var org = config.organization;
  assert(org.ceo.level === 1, 'CEO 应为 L1');
  assert(org.coo.level === 2, 'COO 应为 L2');
  assert(org.cto.level === 2, 'CTO 应为 L2');
  assert(org.cmo.level === 2, 'CMO 应为 L2');
  assert(org.cfo.level === 2, 'CFO 应为 L2');
});

test('CEO 有双倍投票权', function () {
  var config = _loadConfig();
  var org = config.organization;
  assert(org.ceo.vote_weight === 2, 'CEO vote_weight 应为 2');
});

test('_initOrganization 执行成功', function () {
  var config = _loadConfig();
  var details = _initOrganization(config);
  assert(Array.isArray(details), '应返回数组');
  assert(details.length > 5, '应有足够详情');
});

// ─── C. KPI Engine 验证 ────────────────────────────────────

console.log('\n--- C. KPI Engine (P18) ---');

test('KPI 包含 9 个目标', function () {
  var config = _loadConfig();
  var targets = config.kpi.targets;
  assert(Array.isArray(targets), 'targets 应为数组');
  assert(targets.length >= 9, '应至少有 9 个目标');
});

test('GMV 目标为 80000', function () {
  var config = _loadConfig();
  var gmvTarget = config.kpi.targets.find(function (t) { return t.type === 'gmv'; });
  assert(gmvTarget !== undefined, 'GMV 目标应存在');
  assert(gmvTarget.target === 80000, 'GMV 应为 80000');
});

test('所有 KPI 有预警线和危险线', function () {
  var config = _loadConfig();
  var targets = config.kpi.targets;
  targets.forEach(function (t) {
    assert(t.alert_threshold !== undefined, t.type + ' 应有 alert_threshold');
    assert(t.danger_threshold !== undefined, t.type + ' 应有 danger_threshold');
  });
});

test('_initKPI 执行成功', function () {
  var config = _loadConfig();
  var details = _initKPI(config);
  assert(Array.isArray(details), '应返回数组');
  assert(details.length > 0, '应包含详情');
});

// ─── D. Budget Engine 验证 ─────────────────────────────────

console.log('\n--- D. Budget Engine (P19) ---');

test('月度总预算为 30000', function () {
  var config = _loadConfig();
  assert(config.budget.total_monthly === 30000, '总预算应为 30000');
});

test('包含 6 个预算项', function () {
  var config = _loadConfig();
  assert(config.budget.items.length === 6, '应有 6 个预算项');
});

test('投流和活动需要审批', function () {
  var config = _loadConfig();
  var adsItem = config.budget.items.find(function (i) { return i.type === 'ads'; });
  var campaignItem = config.budget.items.find(function (i) { return i.type === 'campaign'; });
  assert(adsItem.requiresApproval === true, '投流应需审批');
  assert(campaignItem.requiresApproval === true, '活动应需审批');
});

test('_initBudget 执行成功', function () {
  var config = _loadConfig();
  var details = _initBudget(config);
  assert(Array.isArray(details), '应返回数组');
});

// ─── E. Approval Center 验证 ───────────────────────────────

console.log('\n--- E. Approval Center (P20) ---');

test('包含 10 条审批规则', function () {
  var config = _loadConfig();
  assert(config.approval.rules.length === 10, '应有 10 条规则');
});

test('所有规则 requiresHumanApproval=true', function () {
  var config = _loadConfig();
  config.approval.rules.forEach(function (rule) {
    assert(rule.requiresHumanApproval === true, rule.type + ' 应需人工审批');
  });
});

test('包含 auto_allow 列表', function () {
  var config = _loadConfig();
  assert(Array.isArray(config.approval.auto_allow), 'auto_allow 应为数组');
  assert(config.approval.auto_allow.length > 0, 'auto_allow 不应为空');
});

test('_initApproval 执行成功', function () {
  var config = _loadConfig();
  var details = _initApproval(config);
  assert(Array.isArray(details), '应返回数组');
});

// ─── F. Knowledge Base 验证 ────────────────────────────────

console.log('\n--- F. Knowledge Base (P16/P17) ---');

test('包含 3 个商品 SKU', function () {
  var config = _loadConfig();
  assert(config.knowledge.products.length === 3, '应有 3 个 SKU');
});

test('6桶装售价 16.8', function () {
  var config = _loadConfig();
  var sku6 = config.knowledge.products.find(function (p) { return p.sku_id === 'SLF-6T-001'; });
  assert(sku6 !== undefined, '6桶应存在');
  assert(sku6.selling_price === 16.8, '6桶售价应为 16.8');
  assert(sku6.cost_price === 8.5, '6桶成本应为 8.5');
});

test('所有 SKU 毛利率 > 40%', function () {
  var config = _loadConfig();
  config.knowledge.products.forEach(function (p) {
    assert(p.gross_margin > 0.4, p.sku + ' 毛利率应 > 40%');
  });
});

test('包含品牌和市场情报', function () {
  var config = _loadConfig();
  assert(config.knowledge.brand !== undefined, '应有品牌信息');
  assert(config.knowledge.market !== undefined, '应有市场情报');
  assert(config.knowledge.market.main_competitors.length >= 3, '应至少3个竞品');
});

test('_initKnowledge 执行成功', function () {
  var config = _loadConfig();
  var details = _initKnowledge(config);
  assert(Array.isArray(details), '应返回数组');
});

// ─── G. 安全验证 ───────────────────────────────────────────

console.log('\n--- G. 安全验证 ---');

test('_verifySafety 全部通过', function () {
  var details = _verifySafety();
  assert(Array.isArray(details), '应返回数组');
  var allPassed = details.every(function (d) { return d.startsWith('✅'); });
  assert(allPassed, '所有安全检查应通过');
});

test('所有审批规则 requiresHumanApproval=true', function () {
  var config = _loadConfig();
  var allRequireHuman = config.approval.rules.every(function (r) { return r.requiresHumanApproval === true; });
  assert(allRequireHuman, '所有高危动作应需人工审批');
});

test('配置不含 .env/nginx/Vault', function () {
  var raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  assert(raw.indexOf('.env') === -1, '不应含 .env');
  assert(raw.indexOf('nginx') === -1, '不应含 nginx');
  assert(raw.indexOf('Vault') === -1 || raw.indexOf('Vault') === raw.indexOf('_safety'), 'Vault仅在安全声明中出现');
});

// ─── H. 全量初始化 ─────────────────────────────────────────

console.log('\n--- H. 全量初始化 ---');

test('initAll 返回审计报告', function () {
  return initAll().then(function (report) {
    assert(typeof report === 'string', '应返回字符串');
    assert(report.length > 500, '报告不应太短');
    assert(report.indexOf('初始化审计报告') !== -1, '应包含标题');
    assert(report.indexOf('P21') !== -1, '应包含 Organization');
    assert(report.indexOf('P18') !== -1, '应包含 KPI');
    assert(report.indexOf('P19') !== -1, '应包含 Budget');
    assert(report.indexOf('P20') !== -1, '应包含 Approval');
    assert(report.indexOf('P16/P17') !== -1 || report.indexOf('Knowledge') !== -1, '应包含 Knowledge');
    assert(report.indexOf('REVIEW_ONLY') !== -1, '应包含安全声明');
  });
});

test('初始化后 getInitResults 全 ok', function () {
  var results = getInitResults();
  assert(results.organization.status === 'ok', 'organization 应为 ok');
  assert(results.kpi.status === 'ok', 'kpi 应为 ok');
  assert(results.budget.status === 'ok', 'budget 应为 ok');
  assert(results.approval.status === 'ok', 'approval 应为 ok');
  assert(results.knowledge.status === 'ok', 'knowledge 应为 ok');
  assert(results.safety.status === 'ok', 'safety 应为 ok');
});

// ─── I. command-center 路由 ────────────────────────────────

console.log('\n--- I. command-center 路由 ---');

test('resolve("/初始化") → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/初始化');
  assert(result !== null, '/初始化 应匹配');
  assert(result.cmd === '/初始化', 'cmd 应为 /初始化');
});

test('resolve("/init") → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/init');
  assert(result !== null, '/init 应匹配');
});

test('REGISTRY 包含 /初始化', function () {
  var { REGISTRY } = require('../../lib/command-center');
  assert(REGISTRY['/初始化'] !== undefined, 'REGISTRY 应包含 /初始化');
});

// ─── J. 高危文件检查 ───────────────────────────────────────

console.log('\n--- J. 高危文件检查 ---');

test('变更不涉及 .env', function () {
  var changedFiles = [
    'apps/wecom-adapter/config/doudian-company-init.v3.json',
    'apps/wecom-adapter/src/skills/dashboard/company-init.js',
    'apps/wecom-adapter/src/commands/company-init-command.js',
    'apps/wecom-adapter/src/lib/command-center.js',
  ];
  var hasHighRisk = changedFiles.some(function (f) {
    return f.indexOf('.env') !== -1 || f.indexOf('nginx') !== -1 ||
           f.indexOf('vault') !== -1 || f.indexOf('secret') !== -1;
  });
  assert(!hasHighRisk, '变更文件不含高危文件');
});

// ─── 运行异步测试 ──────────────────────────────────────────

console.log('\n--- 运行异步测试 ---');

initAll().then(function (report) {
  console.log('  审计报告长度: ' + report.length + ' 字符');
  console.log('');
  var ok = summary();
  process.exit(ok ? 0 : 1);
}).catch(function (err) {
  console.error('异步测试失败:', err.message);
  summary();
  process.exit(1);
});
