'use strict';

/**
 * test-agent-queue-builder.cjs - Agent Queue Builder 单元测试
 *
 * P6.6.3 Port: wecom-openclaw (CJS require)
 *
 * 测试覆盖:
 *   - GoalType 常量正确性
 *   - validateGoal 目标验证
 *   - buildQueue 队列构建 (所有 4 种目标)
 *   - 优先级排序
 *   - 上下文注入
 *   - maxItems 截断
 *   - listGoals 列表
 *   - getAgentRole 角色
 *   - 边界条件 (空目标、未知目标)
 */

var path = require('path');

var agentQueueBuilder = require('../src/orchestrator/v2/agent-queue-builder');
var GoalType      = agentQueueBuilder.GoalType;
var GOAL_LABELS   = agentQueueBuilder.GOAL_LABELS;
var validateGoal  = agentQueueBuilder.validateGoal;
var buildQueue    = agentQueueBuilder.buildQueue;
var listGoals     = agentQueueBuilder.listGoals;
var getAgentRole  = agentQueueBuilder.getAgentRole;

// ========== 测试统计 ==========
var passed = 0;
var failed = 0;
var failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push('FAIL: ' + message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    failures.push('FAIL: ' + message + ' - 期望: "' + expected + '", 实际: "' + actual + '"');
  }
}

function assertIncludes(actual, substring, message) {
  if (actual && actual.indexOf(substring) !== -1) {
    passed++;
  } else {
    failed++;
    failures.push('FAIL: ' + message + ' - "' + substring + '" 未在结果中找到');
  }
}

// ========== 主测试 ==========
function runTests() {
  console.log('====================================');
  console.log('  Agent Queue Builder - 测试套件');
  console.log('  Port: wecom-openclaw (CJS)');
  console.log('====================================\n');

  // ========== 测试1: GoalType 常量 ==========
  console.log('[TEST 1] GoalType 常量');
  {
    assertEqual(GoalType.BOOST_GMV,        'boost_gmv',       'BOOST_GMV 常量正确');
    assertEqual(GoalType.IMPROVE_ROI,      'improve_roi',     'IMPROVE_ROI 常量正确');
    assertEqual(GoalType.REDUCE_REFUND,    'reduce_refund',   'REDUCE_REFUND 常量正确');
    assertEqual(GoalType.OPTIMIZE_WECOM,   'optimize_wecom',  'OPTIMIZE_WECOM 常量正确');

    // 验证冻结 (strict mode CJS require throws on frozen property assignment)
    var original = GoalType.BOOST_GMV;
    var freezeWorks = false;
    try {
      GoalType.BOOST_GMV = 'hacked';
    } catch (e) {
      freezeWorks = true;
    }
    assert(freezeWorks, 'GoalType 冻结: 赋值抛出 TypeError (Object.freeze 生效)');
    assertEqual(GoalType.BOOST_GMV, original, 'GoalType 冻结: 值未被修改');
  }

  // ========== 测试2: GOAL_LABELS 映射 ==========
  console.log('\n[TEST 2] GOAL_LABELS 中文映射');
  {
    assertEqual(GOAL_LABELS[GoalType.BOOST_GMV],       '提升GMV',           'BOOST_GMV \u2192 提升GMV');
    assertEqual(GOAL_LABELS[GoalType.IMPROVE_ROI],     '提高ROI',           'IMPROVE_ROI \u2192 提高ROI');
    assertEqual(GOAL_LABELS[GoalType.REDUCE_REFUND],   '降低退款率',         'REDUCE_REFUND \u2192 降低退款率');
    assertEqual(GOAL_LABELS[GoalType.OPTIMIZE_WECOM],  '优化企业微信稳定性',  'OPTIMIZE_WECOM \u2192 优化企业微信稳定性');
  }

  // ========== 测试3: validateGoal - 英文常量 ==========
  console.log('\n[TEST 3] validateGoal - 英文常量');
  {
    var r1 = validateGoal('boost_gmv');
    assert(r1.valid, 'boost_gmv 验证通过');
    assertEqual(r1.normalized, 'boost_gmv', 'boost_gmv 标准化');

    var r2 = validateGoal('improve_roi');
    assert(r2.valid, 'improve_roi 验证通过');

    var r3 = validateGoal('reduce_refund');
    assert(r3.valid, 'reduce_refund 验证通过');

    var r4 = validateGoal('optimize_wecom');
    assert(r4.valid, 'optimize_wecom 验证通过');
  }

  // ========== 测试4: validateGoal - 中文名称 ==========
  console.log('\n[TEST 4] validateGoal - 中文名称');
  {
    var r1 = validateGoal('提升GMV');
    assert(r1.valid, '提升GMV 验证通过');
    assertEqual(r1.normalized, 'boost_gmv', '提升GMV \u2192 boost_gmv');

    var r2 = validateGoal('提高ROI');
    assert(r2.valid, '提高ROI 验证通过');

    var r3 = validateGoal('降低退款率');
    assert(r3.valid, '降低退款率 验证通过');

    var r4 = validateGoal('优化企业微信稳定性');
    assert(r4.valid, '优化企业微信稳定性 验证通过');
  }

  // ========== 测试5: validateGoal - 边界条件 ==========
  console.log('\n[TEST 5] validateGoal - 边界条件');
  {
    var r1 = validateGoal('');
    assert(!r1.valid, '空字符串验证失败');
    assert(r1.reason.indexOf('不能为空') !== -1, '空目标提示正确');

    var r2 = validateGoal(null);
    assert(!r2.valid, 'null 验证失败');

    var r3 = validateGoal(undefined);
    assert(!r3.valid, 'undefined 验证失败');

    var r4 = validateGoal('invalid_goal_xyz');
    assert(!r4.valid, '未知目标验证失败');
    assert(r4.reason.indexOf('不支持') !== -1, '未知目标提示正确');
  }

  // ========== 测试6: buildQueue - boost_gmv ==========
  console.log('\n[TEST 6] buildQueue - boost_gmv');
  {
    var result = buildQueue({ goal: 'boost_gmv' });
    assert(result.success, 'boost_gmv 队列构建成功');
    assertEqual(result.goal, 'boost_gmv', '目标正确');
    assert(result.queue.length >= 4, '至少 4 个推荐项');

    // 验证每个推荐项结构
    for (var i = 0; i < result.queue.length; i++) {
      var item = result.queue[i];
      assert(typeof item.seq      === 'number', 'seq 为数字: ' + item.seq);
      assert(typeof item.agent    === 'string', 'agent 为字符串: ' + item.agent);
      assert(typeof item.command  === 'string', 'command 为字符串: ' + item.command);
      assert(typeof item.priority === 'number', 'priority 为数字: ' + item.priority);
      assert(typeof item.reason   === 'string', 'reason 为字符串: ' + item.reason);
      assert(item.priority >= 1 && item.priority <= 5, 'priority 在 1-5 之间: ' + item.priority);
    }

    // 验证按 priority 升序排列
    for (var j = 1; j < result.queue.length; j++) {
      assert(result.queue[j].priority >= result.queue[j-1].priority,
        '队列按 priority 升序: ' + result.queue[j-1].priority + ' <= ' + result.queue[j].priority);
    }

    // 验证第一个是 codex (数据分析)
    assertEqual(result.queue[0].agent, 'codex', '第一步是 codex 数据分析');

    // 验证摘要
    var s = result.summary;
    assert(s !== null, '摘要不为空');
    assertEqual(s.goal, 'boost_gmv', '摘要目标正确');
    assertEqual(s.mode, 'plan-only', '摘要模式为 plan-only');
    assert(s.disclaimer.indexOf('不会自动执行') !== -1, '摘要包含免责声明');
  }

  // ========== 测试7: buildQueue - improve_roi ==========
  console.log('\n[TEST 7] buildQueue - improve_roi');
  {
    var result = buildQueue({ goal: 'improve_roi' });
    assert(result.success, 'improve_roi 队列构建成功');
    assert(result.queue.length >= 4, '至少 4 个推荐项');

    // 验证包含所有 Agent 类型
    var agents = result.queue.map(function(q) { return q.agent; });
    assert(agents.indexOf('codex') !== -1,     '包含 codex');
    assert(agents.indexOf('deepseek') !== -1,  '包含 deepseek');
    assert(agents.indexOf('workbuddy') !== -1, '包含 workbuddy');
    assert(agents.indexOf('doubao') !== -1,    '包含 doubao');
  }

  // ========== 测试8: buildQueue - reduce_refund ==========
  console.log('\n[TEST 8] buildQueue - reduce_refund');
  {
    var result = buildQueue({ goal: 'reduce_refund' });
    assert(result.success, 'reduce_refund 队列构建成功');
    assert(result.queue.length >= 4, '至少 4 个推荐项');
    assertEqual(result.queue[0].agent, 'codex', '第一步 codex 分析退款数据');
  }

  // ========== 测试9: buildQueue - optimize_wecom ==========
  console.log('\n[TEST 9] buildQueue - optimize_wecom');
  {
    var result = buildQueue({ goal: 'optimize_wecom' });
    assert(result.success, 'optimize_wecom 队列构建成功');
    assert(result.queue.length >= 4, '至少 4 个推荐项');

    // verify workbuddy check_status is included
    var hasCheckStatus = result.queue.some(function(q) { return q.command === 'check_status'; });
    assert(hasCheckStatus, '包含 check_status 命令');

    // verify summary
    assert(result.summary.agentsInvolved.indexOf('codex') !== -1,     '摘要包含 codex');
    assert(result.summary.agentsInvolved.indexOf('workbuddy') !== -1, '摘要包含 workbuddy');
  }

  // ========== 测试10: buildQueue - 中文名称 ==========
  console.log('\n[TEST 10] buildQueue - 中文名称');
  {
    var r1 = buildQueue({ goal: '提升GMV' });
    assert(r1.success, '提升GMV 构建成功');
    assertEqual(r1.goal, 'boost_gmv', '提升GMV \u2192 boost_gmv');

    var r2 = buildQueue({ goal: '提高ROI' });
    assert(r2.success, '提高ROI 构建成功');

    var r3 = buildQueue({ goal: '降低退款率' });
    assert(r3.success, '降低退款率 构建成功');

    var r4 = buildQueue({ goal: '优化企业微信稳定性' });
    assert(r4.success, '优化企业微信稳定性 构建成功');
  }

  // ========== 测试11: buildQueue - maxItems 截断 ==========
  console.log('\n[TEST 11] buildQueue - maxItems 截断');
  {
    var full = buildQueue({ goal: 'boost_gmv' });
    assert(full.queue.length >= 4, '完整队列 \u2265 4 项');

    var limited = buildQueue({ goal: 'boost_gmv', maxItems: 2 });
    assertEqual(limited.queue.length, 2, '截断后队列 = 2 项');
    assert(limited.success, '截断后仍为成功');
    assertEqual(limited.queue[0].priority, 1, '截断后第一项 priority=1');
    assertEqual(limited.queue[1].priority, 2, '截断后第二项 priority=2');
  }

  // ========== 测试12: buildQueue - 上下文注入 ==========
  console.log('\n[TEST 12] buildQueue - 上下文注入');
  {
    var ctx = { department: '电商', urgency: 'high' };
    var result = buildQueue({ goal: 'boost_gmv', context: ctx });

    for (var i = 0; i < result.queue.length; i++) {
      var item = result.queue[i];
      assertEqual(item.context.department, '电商', '上下文 department 已注入');
      assertEqual(item.context.urgency, 'high', '上下文 urgency 已注入');
    }
  }

  // ========== 测试13: buildQueue - 未知目标 ==========
  console.log('\n[TEST 13] buildQueue - 未知目标');
  {
    var result = buildQueue({ goal: 'unknown_goal' });
    assert(!result.success, '未知目标构建失败');
    assert(result.error.indexOf('不支持') !== -1, '错误提示正确');
    assertEqual(result.queue.length, 0, '队列为空');
  }

  // ========== 测试14: buildQueue - 空目标 ==========
  console.log('\n[TEST 14] buildQueue - 空目标');
  {
    var r1 = buildQueue({ goal: '' });
    assert(!r1.success, '空目标构建失败');

    var r2 = buildQueue({});
    assert(!r2.success, '无目标构建失败');
  }

  // ========== 测试15: listGoals ==========
  console.log('\n[TEST 15] listGoals - 目标列表');
  {
    var goals = listGoals();
    assertEqual(goals.length, 4, '共 4 个目标');

    for (var i = 0; i < goals.length; i++) {
      var g = goals[i];
      assert(typeof g.key         === 'string', 'key 为字符串: ' + g.key);
      assert(typeof g.label       === 'string', 'label 为字符串: ' + g.label);
      assert(typeof g.description === 'string', 'description 为字符串: ' + g.key);
      assert(g.description.length > 10, 'description 足够详细: ' + g.key);
    }
  }

  // ========== 测试16: getAgentRole ==========
  console.log('\n[TEST 16] getAgentRole - Agent 角色');
  {
    assertIncludes(getAgentRole('codex'),     '数据分析',   'codex 角色包含数据分析');
    assertIncludes(getAgentRole('deepseek'),  '策略生成',   'deepseek 角色包含策略生成');
    assertIncludes(getAgentRole('workbuddy'), '工程执行',   'workbuddy 角色包含工程执行');
    assertIncludes(getAgentRole('doubao'),    '内容创作',   'doubao 角色包含内容创作');

    assertIncludes(getAgentRole('unknown'),   '未知角色',   '未知 Agent 返回未知角色');
    assertIncludes(getAgentRole('CODEX'),     '数据分析',   '大写 codex 路径正确');
  }

  // ========== 测试17: 优先级范围验证 ==========
  console.log('\n[TEST 17] 优先级范围验证');
  {
    var goalValues = Object.values(GoalType);
    for (var i = 0; i < goalValues.length; i++) {
      var goal = goalValues[i];
      var result = buildQueue({ goal: goal });
      assert(result.success, goal + ' 构建成功');

      for (var j = 0; j < result.queue.length; j++) {
        var item = result.queue[j];
        assert(item.priority >= 1 && item.priority <= 5,
          goal + ' | ' + item.agent + ' priority ' + item.priority + ' 在 1-5 范围');
      }

      // 每个队列至少包含 priority 1
      var priorities = result.queue.map(function(q) { return q.priority; });
      assert(priorities.indexOf(1) !== -1, goal + ' 包含 priority=1');
    }
  }

  // ========== 测试18: seq 序号连续性 ==========
  console.log('\n[TEST 18] seq 序号连续性');
  {
    var goalValues = Object.values(GoalType);
    for (var i = 0; i < goalValues.length; i++) {
      var goal = goalValues[i];
      var result = buildQueue({ goal: goal });
      for (var j = 0; j < result.queue.length; j++) {
        assertEqual(result.queue[j].seq, j + 1,
          goal + ' seq[' + j + '] = ' + (j + 1));
      }
    }
  }

  // ========== 测试结果 ==========
  console.log('\n====================================');
  console.log('  测试结果');
  console.log('====================================');
  console.log('  通过: ' + passed);
  console.log('  失败: ' + failed);
  console.log('  总计: ' + (passed + failed));
  console.log('====================================');

  if (failures.length > 0) {
    console.log('\n失败详情:');
    for (var i = 0; i < failures.length; i++) {
      console.log('  ' + failures[i]);
    }
    process.exit(1);
  } else {
    console.log('\n\u2713 所有测试通过');
    process.exit(0);
  }
}

runTests();
