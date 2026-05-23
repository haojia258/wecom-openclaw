'use strict';

/**
 * 生产监控测试套件
 * 覆盖: 指标采集 / 告警检查 / 格式化 / 命令处理 / 回归
 */

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error('  FAIL: ' + name);
    console.error('        ' + e.message);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      (msg || 'assertEqual') +
        ': expected ' +
        JSON.stringify(expected) +
        ', got ' +
        JSON.stringify(actual)
    );
  }
}

function assertOk(val, msg) {
  if (!val) {
    throw new Error((msg || 'assertOk') + ': expected truthy, got ' + JSON.stringify(val));
  }
}

// ─── Mock 数据 ──────────────────────────────────────────────────

const mockProcessesOnline = [
  {
    name: 'wecom-adapter',
    pid: 12345,
    status: 'online',
    cpu: 5,
    memoryMB: 60,
    uptimeSec: 86400,
    restarts: 0,
    unstableRestarts: 0,
    heapTotalMB: 10,
    heapUsagePct: 60,
    eventLoopP95: 2.5,
    nodeVersion: '20.20.2',
  },
  {
    name: 'ads-worker',
    pid: 12346,
    status: 'online',
    cpu: 2,
    memoryMB: 55,
    uptimeSec: 172800,
    restarts: 0,
    unstableRestarts: 0,
    heapTotalMB: 15,
    heapUsagePct: 40,
    eventLoopP95: 1.5,
    nodeVersion: '20.20.2',
  },
];

const mockProcessesWithIssues = [
  {
    name: 'wecom-adapter',
    pid: 12345,
    status: 'online',
    cpu: 95,
    memoryMB: 950,
    uptimeSec: 30,
    restarts: 6,
    unstableRestarts: 3,
    heapTotalMB: 10,
    heapUsagePct: 98,
    eventLoopP95: 600,
    nodeVersion: '20.20.2',
  },
  {
    name: 'ads-worker',
    pid: 12346,
    status: 'errored',
    cpu: 0,
    memoryMB: 55,
    uptimeSec: 172800,
    restarts: 0,
    unstableRestarts: 0,
    heapTotalMB: 15,
    heapUsagePct: 40,
    eventLoopP95: 1.5,
    nodeVersion: '20.20.2',
  },
];

const mockProcessesWarnings = [
  {
    name: 'wecom-adapter',
    pid: 12345,
    status: 'online',
    cpu: 75,
    memoryMB: 750,
    uptimeSec: 86400,
    restarts: 2,
    unstableRestarts: 0,
    heapTotalMB: 10,
    heapUsagePct: 88,
    eventLoopP95: 3,
    nodeVersion: '20.20.2',
  },
];

// ─── 测试组 1: collect ─────────────────────────────────────────

console.log('\n=== 1. collect (mock) ===');

test('mock 模式返回空进程列表', () => {
  const result = require('../lib/monitor').collect({ mock: true });
  assertEqual(result.processes.length, 0);
  assertEqual(result.total, 0);
  assertEqual(result.online, 0);
});

test('collect 返回 timestamp', () => {
  const result = require('../lib/monitor').collect({ mock: true });
  assertOk(typeof result.timestamp === 'number');
});

// ─── 测试组 2: checkAlerts — 正常 ──────────────────────────────

console.log('\n=== 2. checkAlerts — 正常 ===');

test('所有正常时无告警', () => {
  const data = { processes: mockProcessesOnline, total: 2, online: 2 };
  const alerts = require('../lib/monitor').checkAlerts(data);
  assertEqual(alerts.warnings.length, 0);
  assertEqual(alerts.criticals.length, 0);
  assertOk(alerts.summary.includes('正常'));
});

test('空数据返回 critical', () => {
  const alerts = require('../lib/monitor').checkAlerts(null);
  assertOk(alerts.criticals.length > 0);
  assertOk(alerts.criticals[0].type === 'no_data');
});

test('空 processes 返回 critical', () => {
  const alerts = require('../lib/monitor').checkAlerts({ processes: [] });
  assertOk(alerts.criticals.length > 0);
});

// ─── 测试组 3: checkAlerts — 严重 ──────────────────────────────

console.log('\n=== 3. checkAlerts — 严重告警 ===');

test('状态异常触发 critical', () => {
  const data = { processes: mockProcessesWithIssues, total: 2, online: 1 };
  const alerts = require('../lib/monitor').checkAlerts(data);
  const statusAlerts = alerts.criticals.filter(function (a) {
    return a.type === 'status';
  });
  assertOk(statusAlerts.length > 0, 'should have status alerts');
});

test('CPU 过高触发 critical', () => {
  const data = { processes: mockProcessesWithIssues, total: 2, online: 1 };
  const alerts = require('../lib/monitor').checkAlerts(data);
  const cpuAlerts = alerts.criticals.filter(function (a) {
    return a.type === 'cpu';
  });
  assertOk(cpuAlerts.length > 0, 'should have CPU alerts');
});

test('内存过高触发 critical', () => {
  const data = { processes: mockProcessesWithIssues, total: 2, online: 1 };
  const alerts = require('../lib/monitor').checkAlerts(data);
  const memAlerts = alerts.criticals.filter(function (a) {
    return a.type === 'memory';
  });
  assertOk(memAlerts.length > 0, 'should have memory alerts');
});

test('堆内存过高触发 critical', () => {
  const data = { processes: mockProcessesWithIssues, total: 2, online: 1 };
  const alerts = require('../lib/monitor').checkAlerts(data);
  const heapAlerts = alerts.criticals.filter(function (a) {
    return a.type === 'heap';
  });
  assertOk(heapAlerts.length > 0, 'should have heap alerts');
});

test('重启次数过多触发 critical', () => {
  const data = { processes: mockProcessesWithIssues, total: 2, online: 1 };
  const alerts = require('../lib/monitor').checkAlerts(data);
  const restartAlerts = alerts.criticals.filter(function (a) {
    return a.type === 'restarts';
  });
  assertOk(restartAlerts.length > 0, 'should have restart alerts');
});

test('Event Loop 延迟触发 warning', () => {
  const data = { processes: mockProcessesWithIssues, total: 2, online: 1 };
  const alerts = require('../lib/monitor').checkAlerts(data);
  const elAlerts = alerts.warnings.filter(function (a) {
    return a.type === 'eventloop';
  });
  assertOk(elAlerts.length > 0);
});

// ─── 测试组 4: checkAlerts — 警告 ──────────────────────────────

console.log('\n=== 4. checkAlerts — 警告 ===');

test('CPU 偏高触发 warning', () => {
  const data = { processes: mockProcessesWarnings, total: 1, online: 1 };
  const alerts = require('../lib/monitor').checkAlerts(data);
  const cpuAlerts = alerts.warnings.filter(function (a) {
    return a.type === 'cpu';
  });
  assertOk(cpuAlerts.length > 0);
});

test('内存偏高触发 warning', () => {
  const data = { processes: mockProcessesWarnings, total: 1, online: 1 };
  const alerts = require('../lib/monitor').checkAlerts(data);
  const memAlerts = alerts.warnings.filter(function (a) {
    return a.type === 'memory';
  });
  assertOk(memAlerts.length > 0);
});

test('堆内存偏高触发 warning', () => {
  const data = { processes: mockProcessesWarnings, total: 1, online: 1 };
  const alerts = require('../lib/monitor').checkAlerts(data);
  const heapAlerts = alerts.warnings.filter(function (a) {
    return a.type === 'heap';
  });
  assertOk(heapAlerts.length > 0);
});

// ─── 测试组 5: formatStatus ────────────────────────────────────

console.log('\n=== 5. formatStatus ===');

test('格式化在线进程', () => {
  const data = { processes: mockProcessesOnline, total: 2, online: 2 };
  const result = require('../lib/monitor').formatStatus(data);
  assertOk(result.includes('wecom-adapter'));
  assertOk(result.includes('ads-worker'));
  assertOk(result.includes('🟢'));
});

test('格式化异常进程', () => {
  const data = { processes: mockProcessesWithIssues, total: 2, online: 1 };
  const result = require('../lib/monitor').formatStatus(data);
  assertOk(result.includes('🔴') || result.includes('errored'));
});

test('空数据返回错误', () => {
  const result = require('../lib/monitor').formatStatus({ processes: [] });
  assertOk(result.includes('无法获取'));
});

test('显示 CPU 和内存', () => {
  const data = { processes: mockProcessesOnline, total: 2, online: 2 };
  const result = require('../lib/monitor').formatStatus(data);
  assertOk(result.includes('CPU:'));
  assertOk(result.includes('内存:'));
});

// ─── 测试组 6: formatAlert ─────────────────────────────────────

console.log('\n=== 6. formatAlert ===');

test('无告警时显示正常', () => {
  const result = require('../lib/monitor').formatAlert({ warnings: [], criticals: [] });
  assertOk(result.includes('正常'));
});

test('有严重告警时显示', () => {
  const result = require('../lib/monitor').formatAlert({
    warnings: [],
    criticals: [
      { type: 'status', process: 'test', message: 'test down', value: 'errored' },
    ],
  });
  assertOk(result.includes('严重告警'));
  assertOk(result.includes('test down'));
});

test('有警告时显示', () => {
  const result = require('../lib/monitor').formatAlert({
    warnings: [
      { type: 'cpu', process: 'test', message: 'cpu high', value: 80 },
    ],
    criticals: [],
  });
  assertOk(result.includes('警告'));
  assertOk(result.includes('cpu high'));
});

// ─── 测试组 7: 命令处理器 ─────────────────────────────────────

console.log('\n=== 7. 命令处理器 ===');

const monitorCmd = require('./monitor');

test('命令有 execute 和 desc', () => {
  assertOk(typeof monitorCmd.execute === 'function');
  assertOk(typeof monitorCmd.desc === 'string');
});

test('无参数返回完整报告', async () => {
  const result = await monitorCmd.execute({ mock: true }, '');
  assertOk(result.includes('PM2'));
  assertOk(result.includes('告警'));
});

test('/监控 状态', async () => {
  const result = await monitorCmd.execute({ mock: true }, '状态');
  assertOk(result.includes('PM2'));
});

test('/监控 告警', async () => {
  const result = await monitorCmd.execute({ mock: true }, '告警');
  assertOk(result.includes('告警'));
  assertOk(result.includes('无法获取') || result.includes('正常'));
});

test('/监控 阈值', async () => {
  const result = await monitorCmd.execute({ mock: true }, '阈值');
  assertOk(result.includes('CPU'));
  assertOk(result.includes('内存'));
});

test('/monitor 英文别名', async () => {
  const result = await monitorCmd.execute({ mock: true }, 'status');
  assertOk(result.includes('PM2'));
});

test('未知子命令返回错误', async () => {
  const result = await monitorCmd.execute({ mock: true }, '未知');
  assertOk(result.includes('未知子命令'));
});

// ─── 测试组 8: 阈值配置 ───────────────────────────────────────

console.log('\n=== 8. 阈值配置 ===');

test('THRESHOLDS 包含所有类别', () => {
  const t = require('../lib/monitor').THRESHOLDS;
  assertOk('cpu' in t);
  assertOk('memory' in t);
  assertOk('heapUsage' in t);
  assertOk('minUptime' in t);
  assertOk('maxRestarts' in t);
  assertOk('eventLoopLatency' in t);
});

test('CPU 阈值合理', () => {
  const t = require('../lib/monitor').THRESHOLDS;
  assertOk(t.cpu.warn < t.cpu.critical);
});

test('内存阈值合理', () => {
  const t = require('../lib/monitor').THRESHOLDS;
  assertOk(t.memory.warn < t.memory.critical);
});

// ─── 测试组 9: 回归 — command-center REGISTRY ─────────────────

console.log('\n=== 9. 回归 — command-center ===');

test('REGISTRY 包含 /监控', () => {
  const cc = require('../lib/command-center');
  assertOk('/监控' in cc.REGISTRY);
});

test('别名包含 /monitor 和 /生产监控', () => {
  const cc = require('../lib/command-center');
  assertOk(cc.REGISTRY['/监控'].aliases.includes('/monitor'));
  assertOk(cc.REGISTRY['/监控'].aliases.includes('/生产监控'));
});

test('resolve("/监控") 返回 handler', () => {
  const cc = require('../lib/command-center');
  const result = cc.resolve('/监控');
  assertOk(result !== null);
  assertOk(typeof result.handler === 'function');
});

test('resolve("/监控 告警") 返回 handler + args', () => {
  const cc = require('../lib/command-center');
  const result = cc.resolve('/监控 告警');
  assertOk(result !== null);
  assertEqual(result.args, '告警');
});

test('REGISTRY 总数 = 20', () => {
  const cc = require('../lib/command-center');
  assertEqual(Object.keys(cc.REGISTRY).length, 20);
});

// ─── 汇总 ──────────────────────────────────────────────────────

console.log('\n=== 结果 ===');
console.log('通过: ' + passed);
console.log('失败: ' + failed);

if (failed > 0) {
  console.log('\n❌ 测试失败！');
  process.exit(1);
} else {
  console.log('✅ 全部通过！');
}
