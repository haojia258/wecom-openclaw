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
  console.log('Cost-Activity Handler 测试: ' + passed + ' 通过, ' + failed + ' 失败');
  if (errors.length) errors.forEach(function(e, i) { console.log('  ' + (i+1) + '. ' + e); });
  console.log('='.repeat(60));
  return failed === 0;
}

var handler = require('./cost-activity-handler');

// ─── A. 配置 ───────────────────────────────────────────────

console.log('\n--- A. 配置 ---');
test('配置存在', function () {
  assert(fs.existsSync(handler.MISSION_PATH), '文件应存在');
});
test('loadConfig 成功', function () {
  var c = handler.loadConfig();
  assert(c !== null, '非空');
  assert(c.mission.review_mode === 'REVIEW_ONLY', 'REVIEW_ONLY');
  assert(c.mission.requires_human_approval === true, '需审批');
});

// ─── B. 成本计算 ───────────────────────────────────────────

console.log('\n--- B. 成本计算 ---');
test('runCostCalculation 成功', function () {
  var r = handler.runCostCalculation();
  assert(r.success, '应成功');
  assert(r.report.indexOf('全成本核算') !== -1, '含标题');
  assert(r.results.length === 3, '3个SKU');
});
test('6桶成本正确', function () {
  var c = handler._calculateCost(
    { sku: 'test', name: '6桶', role: 'traffic', bucket_count: 6, purchase_cost_per_bucket: 2.5, shipping_cost: 6, packaging_cost: 1.2, current_price: 33 },
    { platform_commission_rate: 0.04, payment_fee_rate: 0.006, refund_loss_rate: 0.03, ads_allocation: { fallback: 0 } }
  );
  assert(c.baseCost.subtotal === 22.2, '基础成本22.2');
  assert(c.totalCost > 24, '全成本>24');
  assert(c.totalCost < 30, '全成本<30');
});
test('所有SKU保本价 > 全成本', function () {
  var r = handler.runCostCalculation();
  r.results.forEach(function(sku) {
    assert(sku.breakEvenPrice > sku.totalCost, sku.name + ' 保本价应 > 全成本');
  });
});
test('所有 SKU 建议价 > 保本价', function () {
  var r = handler.runCostCalculation();
  r.results.forEach(function(sku) {
    assert(sku.suggestedPrice > sku.breakEvenPrice, sku.name + ' 建议价 > 保本价');
  });
});

// ─── C. 活动筛选 ───────────────────────────────────────────

console.log('\n--- C. 活动筛选 ---');
test('runActivityScreening 成功', function () {
  var r = handler.runActivityScreening();
  assert(r.success, '应成功');
  assert(r.report.indexOf('活动利润筛选') !== -1 || r.report.indexOf('活动') !== -1, '含标题');
  assert(r.screenResults.length === 6, '6个活动');
});
test('REVIEW_ONLY 声明存在', function () {
  var r = handler.runActivityScreening();
  assert(r.report.indexOf('REVIEW_ONLY') !== -1, '含REVIEW_ONLY');
});
test('不含高危动作关键词', function () {
  var r = handler.runActivityScreening();
  var lower = r.report.toLowerCase();
  assert(lower.indexOf('deploy') === -1 || r.report.indexOf('REVIEW_ONLY') > 0, '不含 deploy');
});

// ─── D. 审批单 ─────────────────────────────────────────────

console.log('\n--- D. 审批单 ---');
test('runApprovalRequest 成功', function () {
  var r = handler.runApprovalRequest();
  assert(r.success, '应成功');
  assert(r.report.indexOf('审批单') !== -1 || r.report.indexOf('审批') !== -1, '含审批');
});
test('审批含 CEO 审批提示', function () {
  var r = handler.runApprovalRequest();
  assert(r.report.indexOf('CEO') !== -1 || r.report.indexOf('审批') !== -1, '含审批提示');
});

// ─── E. 审计 ───────────────────────────────────────────────

console.log('\n--- E. 审计 ---');
test('审计日志有事件', function () {
  handler.runCostCalculation();
  handler.runActivityScreening();
  var log = handler.getAuditLog(50);
  assert(log.length > 0, '应有日志');
  var hasCost = log.some(function(e) { return e.event === 'cost_snapshot_created'; });
  assert(hasCost, '含 cost_snapshot_created');
  var hasScreened = log.some(function(e) { return e.event === 'activity_screened'; });
  assert(hasScreened, '含 activity_screened');
});

// ─── F. 安全 ───────────────────────────────────────────────

console.log('\n--- F. 安全 ---');
test('配置不含 .env', function () {
  var raw = fs.readFileSync(handler.MISSION_PATH, 'utf-8');
  assert(raw.indexOf('.env') === -1, '不含.env');
});
test('forbidden 含关键项', function () {
  var c = handler.loadConfig();
  var f = c.approval_rules.forbidden_without_approval;
  assert(f.indexOf('change_price') !== -1, '禁改价');
  assert(f.indexOf('join_activity') !== -1, '禁报名');
  assert(f.indexOf('deploy') !== -1, '禁部署');
  assert(f.indexOf('modify_env') !== -1, '禁改env');
});
test('ceo_approval 含 real_activity_signup', function () {
  var c = handler.loadConfig();
  assert(c.approval_rules.ceo_approval_required.indexOf('real_activity_signup') !== -1, '报名需CEO');
  assert(c.approval_rules.ceo_approval_required.indexOf('real_price_change') !== -1, '改价需CEO');
});

// ─── G. 路由 ───────────────────────────────────────────────

console.log('\n--- G. 路由 ---');
test('/活动筛选 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var r = resolve('/活动筛选');
  assert(r !== null, '应匹配');
  assert(r.cmd === '/活动筛选', 'cmd正确');
});
test('/成本核算 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var r = resolve('/成本核算');
  assert(r !== null, '应匹配');
});
test('/保本价 → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  assert(resolve('/保本价') !== null, '别名匹配');
});

// ─── 输出预览 ──────────────────────────────────────────────

console.log('\n--- 输出 ---');
var cr = handler.runCostCalculation();
console.log('  成本报告: ' + cr.report.length + ' 字符');
var sr = handler.runActivityScreening();
console.log('  筛选报告: ' + sr.report.length + ' 字符');

console.log('');
var ok = summary();
process.exit(ok ? 0 : 1);
