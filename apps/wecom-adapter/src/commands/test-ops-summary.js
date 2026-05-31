'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 测试数据目录
const TEST_DATA_DIR = path.join(__dirname, '__test_data__');

/**
 * 创建模拟数据文件
 */
function createTestDataFiles() {
  // orders_latest.json
  const orders = {
    type: 'orders',
    version: 4,
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    metrics: {
      settlementGMV: 123400, // ¥1,234
      payOrders: 12,
      exposureCount: 150,
      experienceScore: 75,
    },
  };
  fs.writeFileSync(path.join(TEST_DATA_DIR, 'orders_latest.json'), JSON.stringify(orders, null, 2));

  // fetch-metrics_latest.json
  const metrics = {
    type: 'doudian-metrics',
    timestamp: new Date().toISOString(),
    compass: {
      metrics: {
        settlementGMV: 123400,
        payOrders: 12,
        experienceScore: 75,
      },
    },
    summary: {
      todayGMV: 123400,
      yesterdayGMV: 98000,
    },
  };
  fs.writeFileSync(path.join(TEST_DATA_DIR, 'fetch-metrics_latest.json'), JSON.stringify(metrics, null, 2));

  // check-risk_latest.json
  const risk = {
    type: 'check-risk',
    version: 3,
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    risks: [],
    riskLevel: 'low',
    summary: { riskCount: 0, hasError: false },
  };
  fs.writeFileSync(path.join(TEST_DATA_DIR, 'check-risk_latest.json'), JSON.stringify(risk, null, 2));

  // sku-profit_latest.json
  const profit = {
    type: 'sku-profit-model',
    version: 2,
    timestamp: new Date().toISOString(),
    skus: [
      {
        name: '6-pack',
        bucketCount: 6,
        boxes: 1,
        sellingPrice: 3300, // 分
        cost: 1500,
        shipping: 600,
        grossProfit: 1200,
        margin: 36.36,
        marginStr: '36.4%',
      },
      {
        name: '12-pack',
        bucketCount: 12,
        boxes: 2,
        sellingPrice: 5800,
        cost: 3000,
        shipping: 1200,
        grossProfit: 1600,
        margin: 27.59,
        marginStr: '27.6%',
      },
    ],
  };
  fs.writeFileSync(path.join(TEST_DATA_DIR, 'sku-profit_latest.json'), JSON.stringify(profit, null, 2));
}

/**
 * 清理测试数据文件
 */
function cleanupTestDataFiles() {
  const files = [
    'orders_latest.json',
    'fetch-metrics_latest.json',
    'check-risk_latest.json',
    'sku-profit_latest.json',
  ];
  files.forEach(f => {
    const fp = path.join(TEST_DATA_DIR, f);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
}

/**
 * 测试 1：/技能 ops-summary 返回 string
 */
async function testReturnsString() {
  console.log('Test 1: /技能 ops-summary 返回 string');
  const { execute } = require('./ops-summary');
  const result = await execute({ mock: true });
  assert.strictEqual(typeof result, 'string', 'execute() 应返回 string');
  assert(result.length > 0, '返回字符串不应为空');
  console.log('  ✅ PASS\n');
}

/**
 * 测试 2：数据文件存在时返回真实摘要
 */
async function testRealSummaryWithData() {
  console.log('Test 2: 数据文件存在时返回真实摘要');
  createTestDataFiles();

  const { execute } = require('./ops-summary');
  const result = await execute({ dataDir: TEST_DATA_DIR });
  assert.strictEqual(typeof result, 'string', 'execute() 应返回 string');
  assert(result.includes('📋 今日运营摘要'), '应包含标题');
  assert(result.includes('¥1,234') || result.includes('GMV'), '应包含 GMV 数据');
  assert(result.includes('12 单'), '应包含订单数');
  assert(result.includes('低'), '应包含风险等级');

  cleanupTestDataFiles();
  console.log('  ✅ PASS\n');
}

/**
 * 测试 3：数据文件不存在时返回"数据暂缺"
 */
async function testMissingData() {
  console.log('Test 3: 数据文件不存在时返回"数据暂缺"');
  const { execute } = require('./ops-summary');
  // 使用一个不存在的目录
  const result = await execute({ dataDir: '/tmp/nonexistent_dir_12345' });
  assert.strictEqual(result, '数据暂缺', '数据缺失时应返回"数据暂缺"');
  console.log('  ✅ PASS\n');
}

/**
 * 测试 4：不影响 /技能（通过 skills.js 测试）
 */
function testSkillsCommandUnchanged() {
  console.log('Test 4: 不影响 /技能');
  // 这个测试需要在 skills.js 的测试文件中
  // 这里只做基本检查：确保 ops-summary.js 的 desc 正确
  const { desc } = require('./ops-summary');
  assert.strictEqual(desc, '运营摘要', 'desc 应为"运营摘要"');
  console.log('  ✅ PASS (desc 正确)\n');
}

/**
 * 测试 5：不影响 /技能 列表（通过 skills.js 测试）
 */
function testSkillsListUnchanged() {
  console.log('Test 5: 不影响 /技能 列表');
  // 确保 ops-summary.js 导出了 execute 函数
  const { execute } = require('./ops-summary');
  assert.strictEqual(typeof execute, 'function', '应导出 execute 函数');
  console.log('  ✅ PASS (execute 已导出)\n');
}

/**
 * 测试 6：部分数据缺失时仍生成摘要
 */
async function testPartialData() {
  console.log('Test 6: 部分数据缺失时仍生成摘要');
  // 只创建部分文件
  const orders = {
    type: 'orders',
    version: 4,
    metrics: {
      settlementGMV: 123400,
      payOrders: 12,
    },
  };
  fs.writeFileSync(path.join(TEST_DATA_DIR, 'orders_latest.json'), JSON.stringify(orders, null, 2));

  const { execute } = require('./ops-summary');
  const result = await execute({ dataDir: TEST_DATA_DIR });
  assert.strictEqual(typeof result, 'string', '部分数据时应返回 string');
  assert(result.includes('📋 今日运营摘要'), '应包含标题');
  // 应有"数据暂缺"的字段
  assert(result.includes('数据暂缺'), '缺失字段应显示"数据暂缺"');

  cleanupTestDataFiles();
  console.log('  ✅ PASS\n');
}

// 运行测试
async function runTests() {
  console.log('='.repeat(60));
  console.log('ops-summary.js 测试');
  console.log('='.repeat(60) + '\n');

  try {
    await testReturnsString();
    await testRealSummaryWithData();
    await testMissingData();
    testSkillsCommandUnchanged();
    testSkillsListUnchanged();
    await testPartialData();

    console.log('='.repeat(60));
    console.log('✅ 全部 6 个测试通过');
    console.log('='.repeat(60));
    process.exit(0);
  } catch (err) {
    console.error('❌ 测试失败:', err.message);
    console.error(err.stack);
    cleanupTestDataFiles();
    process.exit(1);
  }
}

runTests();
