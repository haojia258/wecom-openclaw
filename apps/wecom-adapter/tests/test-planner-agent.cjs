'use strict';

/**
 * test-planner-agent.cjs - P6.5 Planner Agent 测试
 *
 * 覆盖:
 * - goal-parser 模块导出和基本解析
 * - goal-parser 领域映射
 * - goal-parser 边界情况
 * - task-planner 模板匹配
 * - task-planner 边界情况
 * - planner-agent 集成测试
 * - planner-agent 安全策略
 */

var tests = 0;
var passed = 0;
var failed = 0;

function assert(condition, msg) {
  tests++;
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log('  FAIL: ' + msg);
  }
}

function section(name) {
  console.log('\n=== ' + name + ' ===');
}

// ─── TEST 1: goal-parser 模块导出 ──────────────────────────

section('TEST 1: goal-parser 模块导出');

var goalParser = require('../src/orchestrator/v2/goal-parser');

assert(typeof goalParser.parse === 'function', 'parse 是函数');
assert(typeof goalParser._extractKeywords === 'function', '_extractKeywords 是函数');
assert(typeof goalParser._matchDomain === 'function', '_matchDomain 是函数');
assert(typeof goalParser._inferCategory === 'function', '_inferCategory 是函数');
assert(typeof goalParser._detectPatterns === 'function', '_detectPatterns 是函数');

// ─── TEST 2: goal-parser 基本解析 ──────────────────────────

section('TEST 2: goal-parser 基本解析');

var result = goalParser.parse('提升GMV');
assert(result.goal === '提升GMV', 'goal 保留原始文本');
assert(result.keywords.indexOf('提升') !== -1 || result.keywords.indexOf('gmv') !== -1, '提取关键词');
assert(result.domain === 'sales', '域名匹配为 sales');
assert(result.category === 'growth', '分类为 growth');

// ─── TEST 3: goal-parser 领域映射 ──────────────────────────

section('TEST 3: goal-parser 领域映射');

assert(goalParser.parse('降低退款率').domain === 'risk', '退款率 → risk');
assert(goalParser.parse('提高ROI').domain === 'ads', 'ROI → ads');
assert(goalParser.parse('优化视频内容').domain === 'content', '视频内容 → content');
assert(goalParser.parse('提升企业微信稳定性').domain === 'ops', '企业微信稳定性 → ops');
assert(goalParser.parse('优化商品定价').domain === 'product', '商品定价 → product');
assert(goalParser.parse('提高客户复购率').domain === 'user', '客户复购 → user');

// ─── TEST 4: goal-parser 策略分类 ──────────────────────────

section('TEST 4: goal-parser 策略分类');

assert(goalParser.parse('提升销售额').category === 'growth', '提升 → growth');
assert(goalParser.parse('降低退款率').category === 'reduction', '降低 → reduction');
assert(goalParser.parse('优化服务器性能').category === 'optimization', '优化 → optimization');
assert(goalParser.parse('保持系统稳定').category === 'maintain', '保持 → maintain');

// ─── TEST 5: goal-parser 空输入 ────────────────────────────

section('TEST 5: goal-parser 空输入');

var emptyResult = goalParser.parse('');
assert(emptyResult.goal === '', '空文本 goal 为空');
assert(emptyResult.domain === 'general', '空输入 domain = general');
assert(emptyResult.keywords.length === 0, '空输入无关键词');

// ─── TEST 6: goal-parser 模式检测 ──────────────────────────

section('TEST 6: goal-parser 模式检测');

var patternResult = goalParser.parse('分析近7天 GMV 下降原因并给出建议');
assert(patternResult.patterns.indexOf('time_range') !== -1, '检测到 time_range');
assert(patternResult.patterns.indexOf('root_cause') !== -1, '检测到 root_cause');
assert(patternResult.patterns.indexOf('recommendation') !== -1, '检测到 recommendation');

// ─── TEST 7: task-planner 模块导出 ─────────────────────────

section('TEST 7: task-planner 模块导出');

var taskPlanner = require('../src/orchestrator/v2/task-planner');

assert(typeof taskPlanner.plan === 'function', 'plan 是函数');
assert(typeof taskPlanner.matchTemplates === 'function', 'matchTemplates 是函数');
assert(typeof taskPlanner.collectCommands === 'function', 'collectCommands 是函数');

// ─── TEST 8: task-planner sales+growth ─────────────────────

section('TEST 8: task-planner sales+growth');

var planResult = taskPlanner.plan({ goal: '提升GMV', domain: 'sales', category: 'growth', keywords: ['gmv'] });
assert(planResult.tasks.length >= 2, '生成至少2个任务');
assert(planResult.p1Tasks.length >= 1, '至少1个 P1 任务');
assert(planResult.commands.length >= 1, '至少1条推荐命令');

// ─── TEST 9: task-planner risk+reduction ───────────────────

section('TEST 9: task-planner risk+reduction');

var riskPlan = taskPlanner.plan({ goal: '降低退款率', domain: 'risk', category: 'reduction', keywords: ['退款'] });
assert(riskPlan.tasks.length >= 2, '至少2个风险任务');
assert(riskPlan.agentCounts['deepseek'] > 0, '包含 DeepSeek 任务');

// ─── TEST 10: task-planner 回退模板 ────────────────────────

section('TEST 10: task-planner 回退模板');

var fallbackPlan = taskPlanner.plan({ goal: '未知目标', domain: 'unknown_domain', category: 'optimization', keywords: [] });
assert(fallbackPlan.tasks.length >= 1, '回退到通用模板');

// ─── TEST 11: task-planner 空 goal ─────────────────────────

section('TEST 11: task-planner 空 goal');

var nilPlan = taskPlanner.plan({ goal: '', domain: 'general', category: 'optimization', keywords: [] });
assert(nilPlan.tasks.length >= 1, '空 goal 也生成通用模板');
assert(nilPlan.domainLabel !== undefined, 'domainLabel 存在');

// ─── TEST 12: planner-agent 模块导出 ───────────────────────

section('TEST 12: planner-agent 模块导出');

var plannerAgent = require('../src/orchestrator/v2/planner-agent');

assert(typeof plannerAgent.execute === 'function', 'execute 是函数');
assert(typeof plannerAgent.formatOutput === 'function', 'formatOutput 是函数');

// ─── TEST 13: planner-agent 集成测试 ───────────────────────

section('TEST 13: planner-agent 提升GMV');

plannerAgent.execute({ goal: '提升GMV' }).then(function(r) {
  assert(r.success === true, '提升GMV 执行成功');
  assert(r.output.indexOf('[Planner]') !== -1, '输出包含 [Planner]');
  assert(r.output.indexOf('提升GMV') !== -1, '输出包含原始目标');
  assert(r.output.indexOf('P1') !== -1, '输出包含 P1');
  assert(r.output.indexOf('Agent 分工') !== -1, '输出包含 Agent 分工');
  assert(r.output.indexOf('plan-only') !== -1, '输出包含 plan-only');
  assert(r.taskId !== undefined, '有 taskId');
  checkAsyncDone();
}).catch(function(e) {
  assert(false, '不应抛异常: ' + e.message);
  checkAsyncDone();
});

// ─── TEST 14: planner-agent 降低退款率 ─────────────────────

section('TEST 14: planner-agent 降低退款率');

plannerAgent.execute({ goal: '降低退款率' }).then(function(r) {
  assert(r.success === true, '降低退款率 执行成功');
  assert(r.output.indexOf('降低退款率') !== -1, '输出包含目标');
  assert(r.parsedGoal.domain === 'risk', '领域为 risk');
  checkAsyncDone();
}).catch(function(e) {
  assert(false, '不应抛异常: ' + e.message);
  checkAsyncDone();
});

// ─── TEST 15: planner-agent 安全策略 ───────────────────────

section('TEST 15: planner-agent 安全策略');

plannerAgent.execute({ goal: 'git merge deploy' }).then(function(r) {
  assert(r.success === false, '包含 forbidden action 应被拦截');
  checkAsyncDone();
}).catch(function(e) {
  assert(false, '不应抛异常: ' + e.message);
  checkAsyncDone();
});

// ─── TEST 16: planner-agent 空输入 ─────────────────────────

section('TEST 16: planner-agent 空输入');

plannerAgent.execute({ goal: '' }).then(function(r) {
  assert(r.success === false, '空输入返回失败');
  assert(r.error !== undefined, '有错误信息');
  checkAsyncDone();
}).catch(function(e) {
  assert(false, '不应抛异常: ' + e.message);
  checkAsyncDone();
});

// ─── TEST 17: planner-agent 优化企业微信稳定性 ─────────────

section('TEST 17: planner-agent 优化企业微信稳定性');

plannerAgent.execute({ goal: '优化企业微信稳定性' }).then(function(r) {
  assert(r.success === true, '稳定性规划成功');
  assert(r.parsedGoal.domain === 'ops', '领域为 ops');
  assert(r.output.indexOf('系统运维') !== -1, '输出包含系统运维');
  checkAsyncDone();
}).catch(function(e) {
  assert(false, '不应抛异常: ' + e.message);
  checkAsyncDone();
});

// ─── 完成 ──────────────────────────────────────────────────

var asyncDone = 0;
var asyncTarget = 5;

function checkAsyncDone() {
  asyncDone++;
  if (asyncDone >= asyncTarget) {
    finish();
  }
}

function finish() {
  console.log('\n============================================================');
  console.log('测试完成: ' + tests + ' 个断言');
  console.log('通过: ' + passed);
  console.log('失败: ' + failed);

  if (failed > 0) {
    console.log('\n存在失败测试!');
    process.exit(1);
  } else {
    console.log('\n所有测试通过!');
    process.exit(0);
  }
}

// 兜底超时
setTimeout(function() {
  if (asyncDone < asyncTarget) {
    console.log('\n超时: ' + asyncDone + '/' + asyncTarget + ' 异步测试完成');
    finish();
  }
}, 8000);
