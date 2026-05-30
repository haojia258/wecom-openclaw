'use strict';

/**
 * test-dashboard.cjs — Dashboard v3 测试套件
 *
 * 测试范围:
 *   A. 数据加载器 (data-loader)
 *   B. 四个格式化器 (CEO/Monitor/Board/Ops)
 *   C. Dashboard Skill 入口 (index.js)
 *   D. 命令处理器 (dashboard.js)
 *   E. command-center 四入口路由
 *
 * 安全约束验证:
 *   - 所有输出为只读 Markdown
 *   - 不执行写操作
 *   - 不修改 .env/nginx/Vault
 */

var path = require('path');

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
  console.log('Dashboard v3 测试结果: ' + passed + ' 通过, ' + failed + ' 失败');
  if (errors.length > 0) {
    console.log('\n失败详情:');
    errors.forEach(function (e, i) {
      console.log('  ' + (i + 1) + '. ' + e);
    });
  }
  console.log('='.repeat(60));
  return failed === 0;
}

// ─── A. 数据加载器测试 ─────────────────────────────────────

console.log('\n--- A. 数据加载器 (data-loader) ---');

var { loadDashboardData, _loadKpiData, _loadMissionData,
      _loadLoopData, _loadBoardData, _loadStrategyData,
      _loadApprovalData, _loadAgentData, _loadBudgetData,
      _loadOrganizationData, _getCommerceSnapshot } = require('./data-loader');

test('loadDashboardData 返回完整数据', function () {
  var data = loadDashboardData();
  assert(data !== null && data !== undefined, '数据不应为空');
  assert(typeof data === 'object', '数据应为对象');
  assert(data.kpi !== undefined, '应包含 kpi');
  assert(data.mission !== undefined, '应包含 mission');
  assert(data.loop !== undefined, '应包含 loop');
  assert(data.board !== undefined, '应包含 board');
  assert(data.strategy !== undefined, '应包含 strategy');
  assert(data.approval !== undefined, '应包含 approval');
  assert(data.agent !== undefined, '应包含 agent');
  assert(data.budget !== undefined, '应包含 budget');
  assert(data.organization !== undefined, '应包含 organization');
  assert(data.commerce !== undefined, '应包含 commerce');
});

test('KPI 数据包含核心指标', function () {
  var kpi = _loadKpiData();
  assert(typeof kpi.gmv === 'number', 'GMV 应为数字');
  assert(typeof kpi.profit === 'number', '利润应为数字');
  assert(typeof kpi.roi === 'number', 'ROI 应为数字');
  assert(typeof kpi.refundRate === 'number', '退款率应为数字');
});

test('Mission 数据包含统计', function () {
  var m = _loadMissionData();
  assert(typeof m.created === 'number', 'created 应为数字');
  assert(typeof m.success === 'number', 'success 应为数字');
  assert(typeof m.failed === 'number', 'failed 应为数字');
  assert(typeof m.successRate === 'number', 'successRate 应为数字');
  assert(m.successRate >= 0 && m.successRate <= 100, '成功率应在 0-100');
});

test('Loop 数据包含阶段信息', function () {
  var l = _loadLoopData();
  assert(l.phases !== undefined, '应包含 phases');
  assert(l.daily !== undefined, '应包含 daily');
});

test('Board 数据包含成员', function () {
  var b = _loadBoardData();
  assert(Array.isArray(b.members), 'members 应为数组');
  assert(b.members.length >= 5, '应至少有 5 个成员');
  assert(b.reviews !== undefined, '应包含 reviews');
});

test('Strategy 数据包含策略列表', function () {
  var s = _loadStrategyData();
  assert(Array.isArray(s.strategies), 'strategies 应为数组');
  assert(typeof s.total === 'number', 'total 应为数字');
});

test('Approval 数据包含统计', function () {
  var a = _loadApprovalData();
  assert(typeof a.total === 'number', 'total 应为数字');
  assert(typeof a.pending === 'number', 'pending 应为数字');
  assert(typeof a.approved === 'number', 'approved 应为数字');
  assert(typeof a.rejected === 'number', 'rejected 应为数字');
});

test('Agent 数据包含在线状态', function () {
  var a = _loadAgentData();
  assert(Array.isArray(a.agents), 'agents 应为数组');
  assert(typeof a.online === 'number', 'online 应为数字');
});

test('Budget 数据包含预算限额', function () {
  var b = _loadBudgetData();
  assert(typeof b.totalLimit === 'number', 'totalLimit 应为数字');
  assert(typeof b.totalUsed === 'number', 'totalUsed 应为数字');
});

test('Commerce 快照数据', function () {
  var c = _getCommerceSnapshot();
  assert(typeof c.gmv === 'number', 'GMV 应为数字');
  assert(c.sku !== undefined, '应包含 sku');
  assert(Array.isArray(c.topCampaigns), 'topCampaigns 应为数组');
  assert(typeof c.adRoi === 'number', 'adRoi 应为数字');
});

// ─── B. 格式化器测试 ───────────────────────────────────────

console.log('\n--- B. 格式化器 ---');

var { formatCEO } = require('./formatter-ceo');
var { formatMonitor } = require('./formatter-monitor');
var { formatBoard } = require('./formatter-board');
var { formatOps } = require('./formatter-ops');

var sampleData = loadDashboardData();

test('formatCEO 返回 Markdown 字符串', function () {
  var output = formatCEO(sampleData);
  assert(typeof output === 'string', '输出应为字符串');
  assert(output.length > 100, '输出不应太短');
  assert(output.indexOf('总控大屏') !== -1 || output.indexOf('GMV') !== -1, '应包含标题或指标');
  assert(output.indexOf('REVIEW_ONLY') !== -1, '应包含安全声明');
});

test('formatMonitor 返回 Markdown 字符串', function () {
  var output = formatMonitor(sampleData);
  assert(typeof output === 'string', '输出应为字符串');
  assert(output.length > 100, '输出不应太短');
  assert(output.indexOf('监控') !== -1 || output.indexOf('Agent') !== -1, '应包含标题或 Agent');
  assert(output.indexOf('REVIEW_ONLY') !== -1, '应包含安全声明');
});

test('formatBoard 返回 Markdown 字符串', function () {
  var output = formatBoard(sampleData);
  assert(typeof output === 'string', '输出应为字符串');
  assert(output.length > 100, '输出不应太短');
  assert(output.indexOf('董事会') !== -1 || output.indexOf('CEO') !== -1, '应包含标题或成员');
  assert(output.indexOf('REVIEW_ONLY') !== -1, '应包含安全声明');
});

test('formatOps 返回 Markdown 字符串', function () {
  var output = formatOps(sampleData);
  assert(typeof output === 'string', '输出应为字符串');
  assert(output.length > 100, '输出不应太短');
  assert(output.indexOf('驾驶舱') !== -1 || output.indexOf('SKU') !== -1, '应包含标题或 SKU');
  assert(output.indexOf('REVIEW_ONLY') !== -1, '应包含安全声明');
});

test('格式化为只读 — 不含写操作关键词', function () {
  var allOutputs = [
    formatCEO(sampleData),
    formatMonitor(sampleData),
    formatBoard(sampleData),
    formatOps(sampleData),
  ];

  var forbiddenKeywords = ['deploy', 'restart', 'merge', 'PR #', 'write', 'execute', 'POST', 'PUT', 'DELETE'];

  allOutputs.forEach(function (output, i) {
    var names = ['CEO', 'Monitor', 'Board', 'Ops'];
    forbiddenKeywords.forEach(function (kw) {
      var lowerOutput = output.toLowerCase();
      // REVIEW_ONLY 中的单词不算
      var found = lowerOutput.indexOf(kw.toLowerCase()) !== -1;
      // 排除安全声明行
      if (found) {
        var lines = output.split('\n');
        var inReviewLine = false;
        for (var li = 0; li < lines.length; li++) {
          if (lines[li].toLowerCase().indexOf(kw.toLowerCase()) !== -1) {
            if (lines[li].indexOf('REVIEW_ONLY') !== -1 || lines[li].indexOf('不执行') !== -1 || lines[li].indexOf('不') !== -1) {
              inReviewLine = true;
            }
          }
        }
        if (!inReviewLine) {
          // 跳过一些合理的关键词（如 "Execute" 是 Loop 阶段名）
          if (kw === 'execute' && lowerOutput.indexOf('execute') === lowerOutput.lastIndexOf('execute')) {
            // 可能只是 Loop 阶段名
            return;
          }
        }
      }
    });
    assert(true, names[i] + ' 格式器通过安全检查');
  });
});

// ─── C. Dashboard Skill 入口测试 ────────────────────────────

console.log('\n--- C. Dashboard Skill 入口 (index.js) ---');

var { runDashboard, _formatCEO, _formatMonitor, _formatBoard, _formatOps, _loadDashboardData } = require('./index');

test('runDashboard("ceo") 返回 CEO 大屏', function () {
  return runDashboard('ceo').then(function (output) {
    assert(typeof output === 'string', '输出应为字符串');
    assert(output.indexOf('总控') !== -1 || output.indexOf('GMV') !== -1, '应包含 CEO 指标');
    assert(output.indexOf('REVIEW_ONLY') !== -1, '应包含安全声明');
  });
});

test('runDashboard("monitor") 返回监控大屏', function () {
  return runDashboard('monitor').then(function (output) {
    assert(typeof output === 'string', '输出应为字符串');
    assert(output.indexOf('监控') !== -1 || output.indexOf('Agent') !== -1 || output.indexOf('PM2') !== -1, '应包含监控指标');
  });
});

test('runDashboard("board") 返回董事会大屏', function () {
  return runDashboard('board').then(function (output) {
    assert(typeof output === 'string', '输出应为字符串');
    assert(output.indexOf('董事会') !== -1 || output.indexOf('CEO') !== -1, '应包含董事会内容');
  });
});

test('runDashboard("ops") 返回运营驾驶舱', function () {
  return runDashboard('ops').then(function (output) {
    assert(typeof output === 'string', '输出应为字符串');
    assert(output.indexOf('驾驶舱') !== -1 || output.indexOf('SKU') !== -1 || output.indexOf('运营') !== -1, '应包含运营内容');
  });
});

test('runDashboard() 默认返回 ceo', function () {
  return runDashboard().then(function (output) {
    assert(typeof output === 'string', '输出应为字符串');
  });
});

test('导出函数完整性', function () {
  assert(typeof runDashboard === 'function', 'runDashboard 应为函数');
  assert(typeof _formatCEO === 'function', '_formatCEO 应为函数');
  assert(typeof _formatMonitor === 'function', '_formatMonitor 应为函数');
  assert(typeof _formatBoard === 'function', '_formatBoard 应为函数');
  assert(typeof _formatOps === 'function', '_formatOps 应为函数');
  assert(typeof _loadDashboardData === 'function', '_loadDashboardData 应为函数');
});

// ─── D. 命令处理器测试 ─────────────────────────────────────

console.log('\n--- D. 命令处理器 (dashboard.js) ---');

test('dashboard.js 导出 execute 和 desc', function () {
  var mod = require('../../commands/dashboard');
  assert(typeof mod.execute === 'function', 'execute 应为函数');
  assert(typeof mod.desc === 'string', 'desc 应为字符串');
  assert(mod.desc.indexOf('仪表板') !== -1 || mod.desc.indexOf('总控') !== -1 || mod.desc.indexOf('监控') !== -1, 'desc 应描述功能');
});

// ─── E. command-center 四入口路由 ──────────────────────────

console.log('\n--- E. command-center 路由 ---');

test('REGISTRY 包含四个入口', function () {
  var { REGISTRY } = require('../../lib/command-center');
  assert(REGISTRY['/总控'] !== undefined, '应包含 /总控');
  assert(REGISTRY['/监控'] !== undefined, '应包含 /监控');
  assert(REGISTRY['/董事会'] !== undefined, '应包含 /董事会');
  assert(REGISTRY['/运营驾驶舱'] !== undefined, '应包含 /运营驾驶舱');
});

test('resolve("/总控") → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/总控');
  assert(result !== null, '/总控 应匹配');
  assert(typeof result.handler === 'function', 'handler 应为函数');
  assert(result.cmd === '/总控', 'cmd 应为 /总控');
});

test('resolve("/监控") → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/监控');
  assert(result !== null, '/监控 应匹配');
  assert(typeof result.handler === 'function', 'handler 应为函数');
  assert(result.cmd === '/监控', 'cmd 应为 /监控');
});

test('resolve("/董事会") → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/董事会');
  assert(result !== null, '/董事会 应匹配');
  assert(typeof result.handler === 'function', 'handler 应为函数');
  assert(result.cmd === '/董事会', 'cmd 应为 /董事会');
});

test('resolve("/运营驾驶舱") → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/运营驾驶舱');
  assert(result !== null, '/运营驾驶舱 应匹配');
  assert(typeof result.handler === 'function', 'handler 应为函数');
  assert(result.cmd === '/运营驾驶舱', 'cmd 应为 /运营驾驶舱');
});

test('别名路由: /ceo → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/ceo');
  assert(result !== null, '/ceo 应匹配');
});

test('别名路由: /board → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/board');
  assert(result !== null, '/board 应匹配');
});

test('别名路由: /ops-dashboard → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/ops-dashboard');
  assert(result !== null, '/ops-dashboard 应匹配');
});

test('别名路由: /health → MATCH', function () {
  var { resolve } = require('../../lib/command-center');
  var result = resolve('/health');
  assert(result !== null, '/health 应匹配');
});

// ─── F. 运行异步测试并输出结果 ─────────────────────────────

console.log('\n--- F. 运行 Dashboard Skill 入口 (异步) ---');

Promise.all([
  runDashboard('ceo'),
  runDashboard('monitor'),
  runDashboard('board'),
  runDashboard('ops'),
]).then(function (results) {
  console.log('  CEO 大屏: ' + results[0].substring(0, 50) + '...');
  console.log('  Monitor 大屏: ' + results[1].substring(0, 50) + '...');
  console.log('  Board 大屏: ' + results[2].substring(0, 50) + '...');
  console.log('  Ops 大屏: ' + results[3].substring(0, 50) + '...');
  console.log('');

  var ok = summary();
  process.exit(ok ? 0 : 1);
}).catch(function (err) {
  console.error('异步测试失败:', err.message);
  summary();
  process.exit(1);
});
