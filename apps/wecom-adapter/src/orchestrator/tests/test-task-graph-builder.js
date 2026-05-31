/**
 * test-task-graph-builder.js
 * 测试 task-graph-builder.js
 *
 * 验证：
 *   1. DAG 构建正常
 *   2. DAG 校验正常
 *   3. 策略自动选择正常
 *   4. WeCom 格式化正常
 *
 * 用法：node test-task-graph-builder.js
 */

var assert = require('assert');
var path = require('path');

// 加载被测模块
var builder;
try {
  builder = require('../task-graph-builder');
} catch (e) {
  console.error('❌ 无法加载 task-graph-builder.js：', e.message);
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
console.log('─── Task Graph Builder 测试 ───────────────────');
console.log('');

// 准备测试数据
var sampleTask = {
  taskId: 'test-task-001',
  userRequest: '分析今日 GMV 趋势',
  intent: 'ops_analysis',
  assignee: 'workbuddy',
};

// ===== Test 1: buildGraph - data-analysis =====
console.log('📋 buildGraph - data-analysis 策略');
test('buildGraph 返回 taskId', function () {
  var result = builder.buildGraph(sampleTask, 'data-analysis');
  assert.strictEqual(result.error, undefined);
  assert.strictEqual(result.taskId, 'test-task-001');
});

test('buildGraph 返回 dag 对象', function () {
  var result = builder.buildGraph(sampleTask, 'data-analysis');
  assert.ok(result.dag);
  assert.ok(Array.isArray(result.dag.nodes));
  assert.ok(Array.isArray(result.dag.edges));
});

test('DAG 有 4 个节点', function () {
  var result = builder.buildGraph(sampleTask, 'data-analysis');
  assert.strictEqual(result.dag.nodes.length, 4);
});

test('DAG 有 3 条边', function () {
  var result = builder.buildGraph(sampleTask, 'data-analysis');
  assert.strictEqual(result.dag.edges.length, 3);
});

test('dependencies 结构正确', function () {
  var result = builder.buildGraph(sampleTask, 'data-analysis');
  assert.ok(result.dag.dependencies);
  assert.ok(Array.isArray(result.dag.dependencies['analyze']));
  assert.ok(Array.isArray(result.dag.dependencies['review']));
  assert.ok(Array.isArray(result.dag.dependencies['publish']));
});

// ===== Test 2: buildGraph - code-change =====
console.log('');
console.log('📋 buildGraph - code-change 策略');

test('code-change 策略返回正确 DAG', function () {
  var task = Object.assign({}, sampleTask, { intent: 'code_change', userRequest: '修复登录 bug' });
  var result = builder.buildGraph(task, 'code-change');
  assert.strictEqual(result.error, undefined);
  assert.strictEqual(result.dag.nodes.length, 4);
});

test('code-change DAG 含 approve 节点', function () {
  var task = Object.assign({}, sampleTask, { intent: 'code_change' });
  var result = builder.buildGraph(task, 'code-change');
  var nodeIds = result.dag.nodes.map(function (n) { return n.id; });
  assert.ok(nodeIds.indexOf('approve') !== -1);
});

// ===== Test 3: buildGraph - auto 策略选择 =====
console.log('');
console.log('📋 buildGraph - auto 策略选择');

test('auto 策略对 ops_analysis 选 data-analysis', function () {
  var task = Object.assign({}, sampleTask, { intent: 'ops_analysis' });
  var result = builder.buildGraph(task, 'auto');
  assert.strictEqual(result.strategy, 'data-analysis');
});

test('auto 策略对 code_change 选 code-change', function () {
  var task = Object.assign({}, sampleTask, { intent: 'code_change', userRequest: '修改 patch' });
  var result = builder.buildGraph(task, 'auto');
  assert.strictEqual(result.strategy, 'code-change');
});

// ===== Test 4: validateGraph =====
console.log('');
console.log('📋 validateGraph');

test('有效 DAG 通过校验', function () {
  var dag = {
    nodes: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
    edges: [{ from: 'a', to: 'b' }],
    dependencies: { 'b': ['a'] },
  };
  var result = builder.validateGraph(dag);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.issues.length, 0);
});

test('空 DAG 不通过校验', function () {
  var result = builder.validateGraph(null);
  assert.strictEqual(result.valid, false);
});

test('缺少节点 id 不通过校验', function () {
  var dag = {
    nodes: [{ label: 'No ID' }],
    edges: [],
    dependencies: {},
  };
  var result = builder.validateGraph(dag);
  assert.strictEqual(result.valid, false);
});

test('自依赖不通过校验', function () {
  var dag = {
    nodes: [{ id: 'x', label: 'X' }],
    edges: [],
    dependencies: { 'x': ['x'] },
  };
  var result = builder.validateGraph(dag);
  assert.strictEqual(result.valid, false);
});

// ===== Test 5: formatGraphForWecom =====
console.log('');
console.log('📋 formatGraphForWecom');

test('格式化输出包含任务 ID', function () {
  var result = builder.buildGraph(sampleTask, 'data-analysis');
  var text = builder.formatGraphForWecom(result);
  assert.ok(text.indexOf('test-task-001') !== -1);
});

test('格式化输出包含节点标签', function () {
  var result = builder.buildGraph(sampleTask, 'data-analysis');
  var text = builder.formatGraphForWecom(result);
  assert.ok(text.indexOf('采集数据') !== -1);
});

test('格式化出错时返回错误信息', function () {
  var text = builder.formatGraphForWecom({ error: 'test error' });
  assert.ok(text.indexOf('❌') !== -1);
});

// ===== Test 6: listDAGTemplates =====
console.log('');
console.log('📋 listDAGTemplates');

test('列出所有 DAG 模板', function () {
  var list = builder.listDAGTemplates();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 2); // 至少有 data-analysis 和 code-change
});

test('模板列表包含 name 和 description', function () {
  var list = builder.listDAGTemplates();
  list.forEach(function (t) {
    assert.ok(t.name);
    assert.ok(t.description);
  });
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
