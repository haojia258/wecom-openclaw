/**
 * test-audit-recorder.js
 * audit-recorder 审计记录测试
 *
 * 测试覆盖：
 * - 审计文件可写入
 * - 审计记录包含所有必需字段
 * - 敏感信息过滤
 * - JSONL 格式正确
 * - 审计历史读取
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// 使用临时目录进行测试
const testDir = path.join(os.tmpdir(), 'orchestrator-audit-test-' + Date.now());
const { recordAudit, readAuditLog, generateAuditId, setStorageDir, sanitizeRecord, formatAuditHistory } = require('../audit-recorder');

// 设置测试存储路径
setStorageDir(testDir);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `期望 "${expected}"，实际 "${actual}"`);
  }
}

// ============ 审计记录写入测试 ============

test('recordAudit 写入成功', () => {
  const mockPlan = {
    goal: '帮我做自动日报',
    intent: 'daily_report',
    recommendedAssignee: 'workbuddy',
    reason: '日报推送属于 WorkBuddy 核心职责',
    branch: 'feature/workbuddy-daily-report-20260522',
    patchFile: 'workbuddy-daily-report-v2.patch',
    prTarget: 'develop',
    forbidden: ['.env', 'nginx', 'PM2 主配置'],
    acceptance: ['日报内容覆盖 GMV/订单/利润/风险'],
    fullPrompt: '【日报任务】\n用户请求：帮我做自动日报\n',
  };

  const result = recordAudit(mockPlan);
  assert(result.saved === true, '应成功保存');
  assert(result.auditId.startsWith('orch-'), `Audit ID 应以 orch- 开头: ${result.auditId}`);
  assert(fs.existsSync(result.filePath), '审计文件应存在');
});

test('recordAudit 生成唯一 auditId', () => {
  const mockPlan = {
    goal: '测试1',
    intent: 'test',
    recommendedAssignee: 'workbuddy',
    reason: 'test',
    branch: 'feature/test',
    patchFile: 'test.patch',
    prTarget: 'develop',
    forbidden: [],
    acceptance: [],
    fullPrompt: '',
  };

  const r1 = recordAudit(mockPlan);
  const r2 = recordAudit(mockPlan);
  assert(r1.auditId !== r2.auditId, '两次审计应有不同的 ID');
});

// ============ 审计记录读取测试 ============

test('readAuditLog 可读取已写入的记录', () => {
  const records = readAuditLog();
  assert(Array.isArray(records), '应返回数组');
  assert(records.length > 0, '应有已写入的记录');

  const lastRecord = records[records.length - 1];
  assert(lastRecord.auditId, '应有 auditId');
  assert(lastRecord.goal !== undefined, '应有 goal');
  assert(lastRecord.status === 'planned', '状态应为 planned');
});

test('审计记录包含所有必需字段', () => {
  const records = readAuditLog();
  const record = records[0];
  const requiredFields = [
    'auditId', 'createdAt', 'goal', 'intent',
    'recommendedAssignee', 'reason', 'branch',
    'patchFile', 'prTarget', 'forbidden',
    'acceptance', 'status',
  ];
  for (const field of requiredFields) {
    assert(record[field] !== undefined, `缺少字段: ${field}`);
  }
});

// ============ 安全过滤测试 ============

test('sanitizeRecord 移除 apiKey 字段', () => {
  const dirty = {
    auditId: 'test-1',
    goal: 'test',
    apiKey: 'sk-secret-key-should-be-removed',
    token: 'bearer-token-secret',
    intent: 'test',
  };
  const clean = sanitizeRecord(dirty);
  assert(clean.apiKey === undefined, 'apiKey 应该被移除');
  assert(clean.token === undefined, 'token 应该被移除');
  assert(clean.goal === 'test', '正常字段应保留');
  assert(clean.intent === 'test', '正常字段应保留');
});

test('sanitizeRecord 保留正常字段', () => {
  const record = {
    auditId: 'test-2',
    goal: '正常任务',
    intent: 'daily_report',
    recommendedAssignee: 'workbuddy',
    status: 'planned',
  };
  const clean = sanitizeRecord(record);
  assertEqual(clean.auditId, 'test-2');
  assertEqual(clean.goal, '正常任务');
  assertEqual(clean.intent, 'daily_report');
});

test('记录中不包含 ApiKey 字段', () => {
  const records = readAuditLog();
  const record = records[0];
  assert(record.apiKey === undefined, '审计记录不应包含 apiKey');
  assert(record.token === undefined, '审计记录不应包含 token');
  assert(record.secret === undefined, '审计记录不应包含 secret');
});

// ============ JSONL 格式测试 ============

test('审计文件是合法的 JSONL 格式', () => {
  const records = readAuditLog();
  assert(records.length > 0, '应有记录');
  for (const record of records) {
    assert(typeof record === 'object' && record !== null, '每条记录应为对象');
    assert(record.auditId, '每条记录应有 auditId');
  }
});

// ============ generateAuditId 测试 ============

test('generateAuditId 格式正确', () => {
  const id = generateAuditId();
  assert(id.startsWith('orch-'), `应以前缀 orch- 开头: ${id}`);
  assert(id.length > 10, 'ID 应足够长');
});

// ============ 结果输出 ============

console.log('\n===== audit-recorder 测试结果 =====');
console.log(`✅ PASS: ${passed}`);
console.log(`❌ FAIL: ${failed}`);

// 清理测试目录
try {
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('\n🧹 测试临时目录已清理');
} catch (_) {
  // 忽略清理失败
}

process.exit(failed > 0 ? 1 : 0);
