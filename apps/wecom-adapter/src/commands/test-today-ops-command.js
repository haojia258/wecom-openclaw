'use strict';
/**
 * test-today-ops-command.js
 * /今日运营 命令测试
 *
 * 测试 command-center 接入层 + 输出格式验证
 */

const { resolve } = require('../lib/command-center');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  OK: ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL: ${name}`);
    console.log(`       ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

console.log('/今日运营 命令测试：\n');

// ============================================================
// Test 1: command-center resolve
// ============================================================
let handler;

test('/今日运营 可被 command-center resolve', () => {
  const r = resolve('/今日运营');
  assert(r !== null, 'resolve should return non-null');
  assert(typeof r.handler === 'function', 'should return handler function');
  assert(r.args === '', 'args should be empty');
  handler = r.handler;
});

test('/todayops 别名可被 resolve', () => {
  const r = resolve('/todayops');
  assert(r !== null, 'resolve should return non-null');
  assert(typeof r.handler === 'function', 'should return handler function');
});

test('/运营日报 别名可被 resolve', () => {
  const r = resolve('/运营日报');
  assert(r !== null, 'resolve should return non-null');
  assert(typeof r.handler === 'function', 'should return handler function');
});

test('/日报 别名可被 resolve', () => {
  const r = resolve('/日报');
  assert(r !== null, 'resolve should return non-null');
  assert(typeof r.handler === 'function', 'should return handler function');
});

// ============================================================
// Test 2: 返回字符串
// ============================================================

test('handler({ mock: true }) 返回 string', () => {
  const result = handler({ mock: true });
  assert(typeof result === 'string', 'should return string');
  assert(result.length > 0, 'should not be empty');
});

// ============================================================
// Test 3: 输出包含核心段落
// ============================================================

let report;
test('生成 mock 报告并检查结构', () => {
  report = handler({ mock: true });
  assert(typeof report === 'string', 'should return string');
  assert(report.length > 0, 'should not be empty');
});

test('输出包含 今日运营报告 标题', () => {
  assert(report.includes('今日运营') || report.includes('运营报告'), 'should contain report title');
});

test('输出包含 GMV 相关', () => {
  assert(report.includes('GMV'), 'should contain GMV section');
});

test('输出包含 ROI 相关', () => {
  assert(report.includes('ROI'), 'should contain ROI section');
});

test('输出包含 风险 相关', () => {
  assert(report.includes('风险'), 'should contain risk section');
});

test('输出包含 活动 相关', () => {
  assert(report.includes('活动'), 'should contain activity section');
});

test('输出包含 视频 相关', () => {
  assert(report.includes('视频'), 'should contain video section');
});

test('输出包含 今日建议 相关', () => {
  assert(
    report.includes('今日建议') || report.includes('建议'),
    'should contain advice section'
  );
});

test('输出包含 调度方案', () => {
  assert(report.includes('调度方案') || report.includes('dispatch'), 'should contain dispatch summary');
});

// ============================================================
// Test 4: 无 [object Object]
// ============================================================

test('输出不包含 [object Object]', () => {
  assert(!report.includes('[object Object]'), 'should not contain [object Object]');
});

test('输出不包含 undefined', () => {
  assert(!report.includes('undefined'), 'should not contain undefined');
});

test('输出不包含 null', () => {
  assert(!report.includes('null'), 'should not contain null');
});

// ============================================================
// Test 5: 安全标记
// ============================================================

test('输出包含 REVIEW_ONLY__NO_AUTO_APPLY', () => {
  assert(report.includes('REVIEW_ONLY__NO_AUTO_APPLY'), 'should contain safety marker');
});

// ============================================================
// Test 6: 类型检查（内存对象，非 [object Object]）
// ============================================================

test('输出包含 Worker 名称（调度方案）', () => {
  assert(
    report.includes('planner') || report.includes('roi') || report.includes('video') || report.includes('risk'),
    'should reference worker names'
  );
});

test('输出包含 4 个 Worker 编排', () => {
  const { orchestrateWorkers } = require('../orchestrator/today-ops-orchestrator');
  const orch = orchestrateWorkers();
  assert(orch.dispatchPlan && orch.dispatchPlan.length === 4, 'should have 4 workers in plan');
});

// ============================================================
// 结果
// ============================================================

console.log(`\n共 ${passed + failed} 个测试，${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
