'use strict';

/**
 * test-scheduler.js - scheduler 功能测试
 */

const assert = require('assert');

// ─── Test 1: pushOpsSummary mock 发送成功 ──────────────────

async function testPushSummaryMockSuccess() {
  const scheduler = require('./scheduler');

  // stop any running cron to avoid test noise
  scheduler.stop();

  const result = await scheduler.pushOpsSummary({ mock: true });

  assert.ok(result, 'pushOpsSummary should return result');
  assert.strictEqual(result.success, true, 'mock push should succeed');
  assert.ok(typeof result.summary === 'string' && result.summary.length > 0, 'summary should be non-empty string');
  assert.ok(result.summary.includes('运营摘要') || result.summary.includes('GMV'), 'summary should contain ops keywords');
  console.log('OK: mock push succeed with summary');
}

// ─── Test 2: pushOpsSummary 发送失败时不崩溃 ──────────────

async function testPushSummaryFailureNoCrash() {
  const scheduler = require('./scheduler');
  scheduler.stop();

  // 模拟 sendToConfiguredUsers 返回失败，但不崩溃
  // pushOpsSummary 内部已有 try/catch，发送失败时返回 success:false
  const result = await scheduler.pushOpsSummary({ mock: false });

  // 无论成功或失败，都不应抛出异常
  assert.ok(result, 'result should exist even on failure');
  assert.ok(typeof result.success === 'boolean', 'result.success should be boolean');
  console.log('OK: pushOpsSummary does not crash on failure (success=' + result.success + ')');
}

// ─── Test 3: scheduler 能注册 3 个计划 ────────────────────

function testScheduler3Plans() {
  const { getJobs, SCHEDULES, start, stop } = require('./scheduler');

  stop();

  // 验证 SCHEDULES 有 3 个计划
  assert.strictEqual(SCHEDULES.length, 3, 'SCHEDULES should have 3 plans');
  assert.strictEqual(SCHEDULES[0].name, '晨报');
  assert.strictEqual(SCHEDULES[1].name, '午报');
  assert.strictEqual(SCHEDULES[2].name, '日报');

  // 验证 getJobs() 返回 3 个描述
  const jobs = getJobs();
  assert.strictEqual(jobs.length, 3, 'getJobs() should return 3 jobs');
  assert.ok(jobs[0].includes('晨报'), 'first job should be 晨报');
  assert.ok(jobs[1].includes('午报'), 'second job should be 午报');
  assert.ok(jobs[2].includes('日报'), 'third job should be 日报');

  // 验证 cron 表达式
  assert.ok(SCHEDULES[0].cron.includes('9'), '晨报 should be at 9');
  assert.ok(SCHEDULES[1].cron.includes('13'), '午报 should be at 13');
  assert.ok(SCHEDULES[2].cron.includes('22'), '日报 should be at 22');

  console.log('OK: 3 schedules registered: ' + jobs.join(', '));
}

// ─── Test 4: 不影响 /技能 ──────────────────────────────

function testDoesNotBreakSkills() {
  const { resolveSkill, SKILLS } = require('../skills');

  assert.ok(SKILLS['ops-summary'], 'ops-summary skill must still exist');
  assert.ok(SKILLS['push-summary'], 'push-summary skill must exist');
  assert.ok(Object.keys(SKILLS).length >= 2, 'SKILLS should have at least 2 entries');

  const ops = resolveSkill('ops-summary');
  assert.ok(ops, 'resolveSkill("ops-summary") should work');
  assert.strictEqual(ops.id, 'ops-summary');

  console.log('OK: /技能 registry intact');
}

// ─── Test 5: 不影响 /技能 ops-summary ───────────────────

async function testDoesNotBreakOpsSummary() {
  const skillAgent = require('../agents/skill-agent');

  const result = await skillAgent.execute({ mock: true }, 'ops-summary');

  assert.ok(typeof result === 'string', 'ops-summary should return string');
  assert.ok(result.includes('运营摘要') || result.includes('GMV'), 'ops-summary should return summary');
  assert.ok(!result.includes('推送'), 'ops-summary should NOT contain push content');

  console.log('OK: /技能 ops-summary still works');
}

// ─── Test 6: /技能 push-summary 返回 string ─────────────

async function testPushSummaryReturnsString() {
  const skillAgent = require('../agents/skill-agent');

  const result = await skillAgent.execute({ mock: true }, 'push-summary');

  assert.ok(typeof result === 'string', 'push-summary should return string');
  assert.ok(result.includes('mock 发送成功') || result.includes('运营摘要已推送'), 'should report success');
  assert.ok(!result.includes('未实现'), 'should NOT report unimplemented');

  console.log('OK: /技能 push-summary returns string: ' + result);
}

// ─── 测试运行器 ─────────────────────────────────────────

const tests = [
  { name: 'push-summary mock 发送成功', fn: testPushSummaryMockSuccess },
  { name: '发送失败不崩溃', fn: testPushSummaryFailureNoCrash },
  { name: 'scheduler 注册 3 个计划', fn: testScheduler3Plans },
  { name: '不影响 /技能', fn: testDoesNotBreakSkills },
  { name: '不影响 /技能 ops-summary', fn: testDoesNotBreakOpsSummary },
  { name: '/技能 push-summary 返回 string', fn: testPushSummaryReturnsString },
];

(async function () {
  console.log('scheduler push-summary 测试\n');

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      await t.fn();
      passed++;
    } catch (e) {
      console.error('❌ FAIL (' + t.name + '):', e.message);
      failed++;
    }
  }

  console.log('\nScheduler tests: ' + passed + '/' + tests.length + ' passed');
  process.exit(failed > 0 ? 1 : 0);
})();
