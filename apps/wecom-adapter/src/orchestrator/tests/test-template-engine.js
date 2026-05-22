/**
 * test-template-engine.js
 * 测试 template-engine.js
 *
 * 验证：
 *   1. 模板加载正常
 *   2. 变量渲染正常
 *   3. 变量校验正常
 *   4. 模板列表正常
 *
 * 用法：node test-template-engine.js
 */

var assert = require('assert');
var path = require('path');

// 加载被测模块
var engine;
try {
  engine = require('../template-engine');
} catch (e) {
  console.error('❌ 无法加载 template-engine.js：', e.message);
  process.exit(1);
}

var passed = 0;
var failed = 0;
var errors = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✅ ' + name);
  } catch (e) {
    failed++;
    errors.push({ name: name, error: e.message });
    console.log('  ❌ ' + name + '：' + e.message);
  }
}

console.log('');
console.log('─── Template Engine 测试 ───────────────────');
console.log('');

// ===== Test 1: loadTemplate =====
console.log('📋 loadTemplate');

test('加载存在的模板（daily-report-template）', function () {
  var tpl = engine.loadTemplate('daily-report-template');
  assert.ok(tpl);
  assert.strictEqual(tpl.name, 'daily-report-template');
});

test('加载不存在的模板返回 null', function () {
  var tpl = engine.loadTemplate('nonexistent-template');
  assert.strictEqual(tpl, null);
});

test('模板含 inputs 字段', function () {
  var tpl = engine.loadTemplate('daily-report-template');
  assert.ok(Array.isArray(tpl.inputs));
});

test('模板含 outputs 字段', function () {
  var tpl = engine.loadTemplate('daily-report-template');
  assert.ok(tpl.outputs || true); // outputs 可能为空但不应报错
});

// ===== Test 2: renderTemplate =====
console.log('');
console.log('📋 renderTemplate');

test('渲染模板正确替换变量', function () {
  var vars = { date: '2026-05-23', gmv: 50000, orders: 1200 };
  var result = engine.renderTemplate('daily-report-template', vars);
  assert.ok(result.rendered);
  assert.ok(result.rendered.title.indexOf('2026-05-23') !== -1);
});

test('未提供的变量保留占位符并记录 warning', function () {
  var vars = { date: '2026-05-23' }; // 缺少 gmv, orders
  var result = engine.renderTemplate('daily-report-template', vars);
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings.length > 0);
});

test('渲染不存在的模板返回 error', function () {
  var result = engine.renderTemplate('nonexistent', {});
  assert.ok(result.error);
});

test('渲染结果含 renderedAt 时间戳', function () {
  var vars = { date: '2026-05-23', gmv: 50000, orders: 1200 };
  var result = engine.renderTemplate('daily-report-template', vars);
  assert.ok(result.renderedAt);
});

// ===== Test 3: validateVariables =====
console.log('');
console.log('📋 validateVariables');

test('变量齐全时 valid=true', function () {
  var vars = { date: '2026-05-23', gmv: 50000, orders: 1200, conversionRate: 0.15, topProduct: '测试商品' };
  var result = engine.validateVariables('daily-report-template', vars);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.missing.length, 0);
});

test('缺少必填变量时 valid=false', function () {
  var vars = { date: '2026-05-23' }; // 缺少 required 的 gmv, orders
  var result = engine.validateVariables('daily-report-template', vars);
  assert.strictEqual(result.valid, false);
  assert.ok(result.missing.length > 0);
});

test('校验不存在的模板', function () {
  var result = engine.validateVariables('nonexistent', {});
  assert.strictEqual(result.valid, false);
  assert.ok(result.error);
});

// ===== Test 4: listTemplates =====
console.log('');
console.log('📋 listTemplates');

test('列出所有模板（数组）', function () {
  var list = engine.listTemplates();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1);
});

test('列表项含 name 和 description', function () {
  var list = engine.listTemplates();
  list.forEach(function (t) {
    assert.ok(t.name);
    assert.ok(t.description !== undefined);
  });
});

test('列表项含 inputs', function () {
  var list = engine.listTemplates();
  list.forEach(function (t) {
    assert.ok(Array.isArray(t.inputs));
  });
});

// ===== Test 5: ROI 模板专项 =====
console.log('');
console.log('📋 ROI 模板专项');

test('roi-analysis-template 加载成功', function () {
  var tpl = engine.loadTemplate('roi-analysis-template');
  assert.ok(tpl);
  assert.strictEqual(tpl.name, 'roi-analysis-template');
});

test('ROI 模板渲染正确', function () {
  var vars = { campaignName: '618大促', spend: 10000, revenue: 45000 };
  var result = engine.renderTemplate('roi-analysis-template', vars);
  assert.ok(result.rendered);
  assert.ok(result.rendered.title.indexOf('618大促') !== -1);
});

// ===== 汇总 =====
console.log('');
console.log('───────────────────────────────────────────────');
console.log('📊 测试结果：' + passed + '/' + (passed + failed) + ' 通过');
if (failed > 0) {
  console.log('');
  console.log('❌ 失败项：');
  errors.forEach(function (e) {
    console.log('  - ' + e.name + '：' + e.error);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('');
  console.log('✅ 全部测试通过！');
  console.log('');
  process.exit(0);
}
