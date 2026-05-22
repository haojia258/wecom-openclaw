'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var TEST_DATA_DIR = path.join(__dirname, '__test_activity_data__');

function createTestData() {
  if (!fs.existsSync(TEST_DATA_DIR)) fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  var data = {
    type: 'check-activity',
    version: 5.1,
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    activities: [
      { name: '抖音商城618大促', signupStatus: 'available', deadline: '06/18', dateRange: '05/15 ~ 06/18' },
      { name: '节盟计划-引流联合', signupStatus: 'available', deadline: null, dateRange: null }
    ],
    summary: { availableActivities: 2, totalActivities: 2 }
  };
  fs.writeFileSync(path.join(TEST_DATA_DIR, 'check-activity_latest.json'), JSON.stringify(data, null, 2));
}

function cleanupTestData() {
  var fp = path.join(TEST_DATA_DIR, 'check-activity_latest.json');
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  if (fs.existsSync(TEST_DATA_DIR)) fs.rmdirSync(TEST_DATA_DIR);
}

function testSkillLoads() {
  console.log('Test 1: get-activity.skill module loads');
  var mod = require('../activity/get-activity.skill');
  assert.ok(mod, 'module must load');
  assert.strictEqual(typeof mod.execute, 'function');
  console.log('  PASS');
}

function testSkillMock() {
  console.log('Test 2: skill mock mode');
  var execute = require('../activity/get-activity.skill').execute;
  var result = execute({ mock: true });
  assert.strictEqual(typeof result, 'string');
  assert(result.indexOf('618') >= 0);
  assert(result.indexOf('可报名') >= 0);
  console.log('  PASS');
}

function testSkillRealData() {
  console.log('Test 3: skill with real data');
  createTestData();
  var execute = require('../activity/get-activity.skill').execute;
  var dataFile = path.join(TEST_DATA_DIR, 'check-activity_latest.json');
  var result = execute({ dataFile: dataFile });
  assert(result.indexOf('618') >= 0);
  assert(result.indexOf('2 个活动') >= 0);
  cleanupTestData();
  console.log('  PASS');
}

function testSkillMissingData() {
  console.log('Test 4: skill missing data');
  var execute = require('../activity/get-activity.skill').execute;
  var result = execute({ dataFile: '/nonexistent/activity.json' });
  assert(result.indexOf('暂无活动数据') >= 0);
  console.log('  PASS');
}

async function testCommandMock() {
  console.log('Test 5: /活动 command mock');
  var execute = require('../../commands/activity').execute;
  var result = await execute({ mock: true });
  assert.strictEqual(typeof result, 'string');
  assert(result.indexOf('618') >= 0);
  console.log('  PASS');
}

async function testCommandRealData() {
  console.log('Test 6: /活动 command real data');
  createTestData();
  var execute = require('../../commands/activity').execute;
  var dataFile = path.join(TEST_DATA_DIR, 'check-activity_latest.json');
  var result = await execute({ dataFile: dataFile });
  assert(result.indexOf('618') >= 0);
  cleanupTestData();
  console.log('  PASS');
}

function testNLPFallback() {
  console.log('Test 7: NLP keyword fallback');
  var resolve = require('../../lib/command-center').resolve;
  assert.ok(resolve('帮我看看有什么推广活动'), 'keyword 推广活动');
  assert.ok(resolve('最近618有什么活动'), 'keyword 618');
  assert.ok(resolve('平台大促活动有哪些'), 'keyword 大促');
  assert.strictEqual(resolve('今天天气怎么样'), null, 'irrelevant text');
  console.log('  PASS');
}

function testRegistryUnchanged() {
  console.log('Test 8: REGISTRY commands still work');
  var resolve = require('../../lib/command-center').resolve;
  assert.ok(resolve('/帮助'), '/帮助');
  assert.ok(resolve('/活动'), '/活动');
  assert.ok(resolve('/推广活动'), '/推广活动 alias');
  console.log('  PASS');
}

var tests = [
  testSkillLoads, testSkillMock, testSkillRealData, testSkillMissingData,
  testCommandMock, testCommandRealData,
  testNLPFallback, testRegistryUnchanged
];
var passed = 0;
var failed = 0;

(async function() {
  for (var i = 0; i < tests.length; i++) {
    try {
      await tests[i]();
      passed++;
    } catch (e) {
      console.error('FAIL:', e.message);
      failed++;
    }
  }
  console.log('');
  console.log('Activity tests: ' + passed + '/' + tests.length + ' passed');
  process.exit(failed > 0 ? 1 : 0);
})();
