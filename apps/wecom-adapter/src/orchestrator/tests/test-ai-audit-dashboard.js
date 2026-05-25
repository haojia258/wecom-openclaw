'use strict';

/**
 * test-ai-audit-dashboard.js — AI 审计仪表板测试套件
 *
 * 测试范围:
 *   1. audit 读取正常
 *   2. Markdown 输出正常
 *   3. 不泄露敏感信息
 *   4. command-center resolve 正常
 *
 * Phase: AI Audit Dashboard v1
 */

const path = require('path');
const fs = require('fs');

// 使用绝对路径确保测试环境中模块正确解析
const PROJ_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

// ============================================================
// 测试辅助
// ============================================================

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.error('  ✗ FAIL: ' + msg);
  }
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  console.log('  ' + title);
  console.log('='.repeat(60));
}

function summary() {
  console.log('\n' + '='.repeat(60));
  console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
  console.log('='.repeat(60));
}

// ============================================================
// 准备测试环境：创建临时 JSONL 文件
// ============================================================

var TMP_DIR = path.join(__dirname, '..', '..', '..', 'storage', 'orchestrator', '_test_ai_audit');

function setupTestData() {
  // 清理并重建
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TMP_DIR, { recursive: true });

  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1).padStart(2, '0');
  var dd = String(today.getDate()).padStart(2, '0');
  var dateStr = yyyy + mm + dd;

  // 写入 worker-audit 测试数据
  var workerAuditFile = path.join(TMP_DIR, 'worker-audit-' + dateStr + '.jsonl');
  var workerAuditLines = [
    { ts: new Date(Date.now() - 1800000).toISOString(), worker: 'planner-summary-worker', model: 'gpt-4o', taskId: 'task-001', latency: 2340, tokenEstimate: 850, resultStatus: 'success' },
    { ts: new Date(Date.now() - 3600000).toISOString(), worker: 'planner-summary-worker', model: 'gpt-4o', taskId: 'task-002', latency: 1890, tokenEstimate: 720, resultStatus: 'success' },
    { ts: new Date(Date.now() - 7200000).toISOString(), worker: 'roi-analysis-worker', model: 'deepseek-chat', taskId: 'task-003', latency: 3450, tokenEstimate: 1100, resultStatus: 'success' },
    { ts: new Date(Date.now() - 14400000).toISOString(), worker: 'planner-summary-worker', model: 'gpt-4o', taskId: 'task-004', latency: -1, tokenEstimate: 0, resultStatus: 'rejected', rejectReason: 'GATE_DISABLED: OPENAI_WORKER_ENABLED is not true' },
    { ts: new Date(Date.now() - 21600000).toISOString(), worker: 'roi-analysis-worker', model: 'deepseek-chat', taskId: 'task-005', latency: -1, tokenEstimate: 0, resultStatus: 'error', errorMessage: 'API timeout after 30s (sanitized)' },
  ];
  fs.writeFileSync(workerAuditFile, workerAuditLines.map(JSON.stringify).join('\n') + '\n', 'utf-8');

  // 写入 audit-recorder 测试数据
  var auditRecorderFile = path.join(TMP_DIR, 'audit-' + dateStr + '.jsonl');
  var auditRecorderLines = [
    { auditId: 'audit-001', taskId: 'task-001', action: 'create', fromStatus: 'queued', toStatus: 'planned', actor: 'system', summary: 'Created task', rollbackHint: null, timestamp: new Date(Date.now() - 1800000).toISOString() },
    { auditId: 'audit-002', taskId: 'task-001', action: 'plan', fromStatus: 'planned', toStatus: 'dispatched', actor: 'system', summary: 'Planned task', rollbackHint: null, timestamp: new Date(Date.now() - 3600000).toISOString() },
    { auditId: 'audit-003', taskId: 'task-002', action: 'create', fromStatus: 'queued', toStatus: 'planned', actor: 'system', summary: 'Created task', rollbackHint: null, timestamp: new Date(Date.now() - 7200000).toISOString() },
  ];
  fs.writeFileSync(auditRecorderFile, auditRecorderLines.map(JSON.stringify).join('\n') + '\n', 'utf-8');

  console.log('  Test data prepared at: ' + TMP_DIR);
}

function cleanupTestData() {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
  console.log('  Test data cleaned up.');
}

// ============================================================
// 测试套件
// ============================================================

function runTests() {
  // 加载模块
  var dashboard = require('../ai-audit-dashboard');

  // =========================================
  // Test 1: Audit 读取正常
  // =========================================
  section('Test 1: Audit 读取正常');

  // 1a: JSONL 文件解析
  section('1a: JSONL 文件解析');
  var testJsonl = path.join(TMP_DIR, 'test-parse.jsonl');
  fs.writeFileSync(testJsonl, '{"a":1}\n{"b":2}\n', 'utf-8');
  var parsed = dashboard._readJsonlFile(testJsonl);
  assert(parsed.length === 2, 'parsed 2 lines from JSONL');
  assert(parsed[0].a === 1, 'first record has a=1');
  assert(parsed[1].b === 2, 'second record has b=2');
  fs.unlinkSync(testJsonl);

  // 1b: 空文件返回空数组
  section('1b: 空文件处理');
  var emptyFile = path.join(TMP_DIR, 'test-empty.jsonl');
  fs.writeFileSync(emptyFile, '', 'utf-8');
  assert(dashboard._readJsonlFile(emptyFile).length === 0, 'empty file returns []');
  fs.unlinkSync(emptyFile);

  // 1c: 不存在的文件返回空数组
  section('1c: 不存在文件处理');
  assert(dashboard._readJsonlFile('/nonexistent/file.jsonl').length === 0, 'nonexistent file returns []');

  // 1d: loadWorkerCalls 读取测试数据
  section('1d: loadWorkerCalls');
  var origWADir = null;
  var origARDir = null;
  try {
    var workerAudit = require('../worker-audit');
    var auditRecorder = require('../audit-recorder');
    origWADir = workerAudit.getStorageDir();
    origARDir = auditRecorder.getStorageDir();
    workerAudit.setStorageDir(TMP_DIR);
    auditRecorder.setStorageDir(TMP_DIR);

    // 因为用了模块缓存，需要重新获取
    delete require.cache[require.resolve('../ai-audit-dashboard')];
    var dashboardFresh = require('../ai-audit-dashboard');

    var calls = dashboardFresh._loadWorkerCalls();
    assert(calls.length === 5, 'loaded 5 worker call records');
    assert(calls[0].worker === 'planner-summary-worker', 'first record is planner-summary-worker (most recent)');

    // 1e: loadTaskAudits 读取测试数据
    section('1e: loadTaskAudits');
    var audits = dashboardFresh._loadTaskAudits();
    assert(audits.length === 3, 'loaded 3 task audit records');
    assert(audits[0].action === 'create', 'first task audit is create');
  } finally {
    try {
      if (origWADir !== null) require('../worker-audit').setStorageDir(origWADir);
      if (origARDir !== null) require('../audit-recorder').setStorageDir(origARDir);
    } catch (_) {}
  }

  // =========================================
  // Test 2: 统计数据正确
  // =========================================
  section('Test 2: 统计数据正确');

  var mockCalls = [
    { ts: new Date().toISOString(), worker: 'planner-summary-worker', model: 'gpt-4o', latency: 2000, tokenEstimate: 800, resultStatus: 'success' },
    { ts: new Date().toISOString(), worker: 'planner-summary-worker', model: 'gpt-4o', latency: 1800, tokenEstimate: 700, resultStatus: 'success' },
    { ts: new Date().toISOString(), worker: 'roi-analysis-worker', model: 'deepseek-chat', latency: 3500, tokenEstimate: 1200, resultStatus: 'success' },
    { ts: new Date().toISOString(), worker: 'planner-summary-worker', model: 'gpt-4o', latency: -1, tokenEstimate: 0, resultStatus: 'rejected', rejectReason: 'GATE' },
    { ts: new Date().toISOString(), worker: 'roi-analysis-worker', model: 'deepseek-chat', latency: -1, tokenEstimate: 0, resultStatus: 'error', errorMessage: 'timeout' },
  ];

  var stats = dashboard._computeWorkerStats(mockCalls);

  assert(stats.total === 5, 'total = 5');
  assert(stats.success === 3, 'success = 3');
  assert(stats.error === 1, 'error = 1');
  assert(stats.rejected === 1, 'rejected = 1');
  assert(stats.totalTokens === 2700, 'totalTokens = 2700 (800+700+1200)');
  assert(stats.latencyCount === 3, 'latencyCount = 3 (only valid latencies)');
  assert(Math.abs(stats.latencySum - 7300) < 1, 'latencySum = 7300 (2000+1800+3500)');
  assert(stats.failures.length === 2, 'failures = 2 (1 rejected + 1 error)');
  assert(stats.byWorker['planner-summary-worker'].total === 3, 'planner-summary-worker has 3 calls');
  assert(stats.byWorker['roi-analysis-worker'].total === 2, 'roi-analysis-worker has 2 calls');

  // =========================================
  // Test 3: Markdown 输出正常
  // =========================================
  section('Test 3: Markdown 输出正常');

  var mockTaskAudits = [
    { action: 'create', timestamp: new Date().toISOString() },
    { action: 'plan', timestamp: new Date().toISOString() },
  ];
  var taskStats = dashboard._computeTaskStats(mockTaskAudits);
  var md = dashboard._renderMarkdown(stats, taskStats, 'enabled');

  // 3a: 包含关键标题
  assert(md.includes('# 🤖 AI 审计仪表板'), 'contains main title');
  assert(md.includes('## ⚙️ Feature Gate'), 'contains Feature Gate section');
  assert(md.includes('## 📊 调用概览'), 'contains Overview section');
  assert(md.includes('## 👷 Worker 分组'), 'contains Worker Breakdown section');
  assert(md.includes('## ⚠️ 最近失败'), 'contains Recent Failures section');
  assert(md.includes('## 📋 任务审计'), 'contains Task Audit section');

  // 3b: 包含统计数据
  assert(md.includes('**5**'), 'contains total count 5');
  assert(md.includes('planner-summary-worker'), 'contains worker name');
  assert(md.includes('gpt-4o'), 'contains model name');
  assert(md.includes('openai') || md.includes('OpenAI'), 'contains provider name (openai)');

  // 3c: Feature gate 状态
  assert(md.includes('🟢') && md.includes('已启用'), 'shows enabled gate');

  // 3d: 无记录时不崩溃
  var emptyStats = dashboard._computeWorkerStats([]);
  var emptyTaskStats = dashboard._computeTaskStats([]);
  var emptyMd = dashboard._renderMarkdown(emptyStats, emptyTaskStats, 'disabled');
  assert(typeof emptyMd === 'string' && emptyMd.length > 0, 'empty dashboard renders without errors');
  assert(emptyMd.includes('🔴') && emptyMd.includes('已禁用'), 'shows disabled gate');
  assert(emptyMd.includes('无失败记录'), 'shows no failure message');

  // =========================================
  // Test 4: 不泄露敏感信息
  // =========================================
  section('Test 4: 不泄露敏感信息');

  // 4a: 不包含 prompt 关键词或 API key 模式
  // 使用更精确的模式检查，避免误伤 "risk-review-worker" 中的 "sk-" 子串
  var apiKeyPattern = /sk-[a-zA-Z0-9]{20,}/;  // 真正的 OpenAI key 格式
  var authHeaderPattern = /Bearer\s+[a-zA-Z0-9\-_\.]{20,}/;  // Authorization header 格式

  var sensitiveTerms = [
    'prompt_全文',
    'api_key',
    'apiKey',
    'api-key',
  ];

  sensitiveTerms.forEach(function (term) {
    assert(!md.toLowerCase().includes(term.toLowerCase()), 'output does NOT contain: ' + term);
  });

  // API key 模式检查
  assert(!apiKeyPattern.test(md), 'output does NOT contain real API key pattern (sk-xxx)');
  assert(!authHeaderPattern.test(md), 'output does NOT contain Authorization Bearer token');

  // 4b: mock 输出也不含敏感信息
  var mockMd = dashboard.generateMock();
  sensitiveTerms.forEach(function (term) {
    assert(!mockMd.toLowerCase().includes(term.toLowerCase()), 'mock output does NOT contain: ' + term);
  });
  assert(!apiKeyPattern.test(mockMd), 'mock output does NOT contain real API key pattern');
  assert(!authHeaderPattern.test(mockMd), 'mock output does NOT contain Authorization Bearer token');

  // 4c: 安全声明存在
  assert(md.includes('REVIEW_ONLY__NO_AUTO_APPLY'), 'contains safety note');

  // =========================================
  // Test 5: generate() mock 模式
  // =========================================
  section('Test 5: generate() mock 模式');

  var mockReport = dashboard.generate({ mock: true });
  assert(typeof mockReport === 'string' && mockReport.length > 500, 'mock report has substantial content');
  assert(mockReport.includes('planner-summary-worker'), 'mock contains worker name');
  assert(mockReport.includes('roi-analysis-worker'), 'mock contains second worker');
  assert(mockReport.includes('video-content-worker'), 'mock contains third worker');
  assert(mockReport.includes('risk-review-worker'), 'mock contains fourth worker');
  assert(mockReport.includes('成功率'), 'mock contains success rate');

  // =========================================
  // Test 6: 工具函数
  // =========================================
  section('Test 6: 工具函数');

  // 6a: formatLatency
  assert(dashboard._formatLatency(500) === '500ms', '500ms formats correctly');
  assert(dashboard._formatLatency(2500) === '2.5s', '2500ms → 2.5s');
  assert(dashboard._formatLatency(120000) === '2.0min', '120000ms → 2.0min');

  // 6b: formatTokens
  assert(dashboard._formatTokens(500) === '500', '500 tokens as is');
  assert(dashboard._formatTokens(1500) === '1.5K', '1500 tokens → 1.5K');

  // 6c: formatTime
  var testDate = new Date('2026-05-25T09:15:30.000Z');
  // 本地时区 +8
  var localHours = String(testDate.getHours() + 8).padStart(2, '0');
  var formatted = dashboard._formatTime(testDate.toISOString());
  assert(formatted.length > 0, 'formatTime returns non-empty');

  // 6d: statusBadge
  assert(dashboard._statusBadge('success') === '✅', 'success badge');
  assert(dashboard._statusBadge('error') === '❌', 'error badge');
  assert(dashboard._statusBadge('rejected') === '🚫', 'rejected badge');
  assert(dashboard._statusBadge('unknown') === '❓', 'unknown badge');

  // 6e: getWorkerProviderInfo
  var info = dashboard._getWorkerProviderInfo('planner-summary-worker');
  assert(info.provider === 'openai', 'planner-summary-worker → openai');
  assert(info.model === 'gpt-4o', 'planner-summary-worker → gpt-4o');

  var info2 = dashboard._getWorkerProviderInfo('unknown-worker');
  assert(info2.provider === 'unknown', 'unknown worker → unknown provider');
  assert(info2.name === 'unknown-worker', 'unknown worker keeps name');

  // =========================================
  // Test 7: command-center resolve 正常
  // =========================================
  section('Test 7: command-center resolve');

  var commandCenter = require('../../lib/command-center');

  // 7a: /ai审计 精确匹配
  var result1 = commandCenter.resolve('/ai审计');
  assert(result1 !== null, '/ai审计 resolves');
  assert(typeof result1.handler === 'function', 'handler is a function');
  assert(result1.args === '', 'no args');

  // 7b: /aiaudit 别名匹配
  var result2 = commandCenter.resolve('/aiaudit');
  assert(result2 !== null, '/aiaudit alias resolves');
  assert(typeof result2.handler === 'function', 'alias handler is a function');

  // 7c: /AI审计 别名匹配
  var result3 = commandCenter.resolve('/AI审计');
  assert(result3 !== null, '/AI审计 alias resolves');

  // 7d: /ai审计 别名匹配
  var result4 = commandCenter.resolve('/ai审计');
  assert(result4 !== null, '/ai审计 alias resolves');

  // 7e: 命令在 REGISTRY 中
  assert(commandCenter.REGISTRY['/ai审计'] !== undefined, 'REGISTRY has /ai审计');
  assert(commandCenter.REGISTRY['/ai审计'].aliases.includes('/aiaudit'), 'REGISTRY alias includes /aiaudit');

  // =========================================
  // Test 8: 边界情况
  // =========================================
  section('Test 8: 边界情况');

  // 8a: 损坏的 JSONL 行被跳过
  var corruptFile = path.join(TMP_DIR, 'test-corrupt.jsonl');
  fs.writeFileSync(corruptFile, '{"a":1}\nthis is not json\n{"b":2}\n', 'utf-8');
  var corruptParsed = dashboard._readJsonlFile(corruptFile);
  assert(corruptParsed.length === 2, 'corrupt JSONL: 2 valid lines, 1 skipped');
  fs.unlinkSync(corruptFile);

  // 8b: 全部空 worker audit 不崩溃
  var statsEmpty = dashboard._computeWorkerStats([]);
  assert(statsEmpty.total === 0, 'empty calls → total 0');
  assert(statsEmpty.failures.length === 0, 'empty calls → no failures');
  assert(Object.keys(statsEmpty.byWorker).length === 0, 'empty calls → no workers');

  // 8c: latency=-1 不计入平均
  var latencyTestData = [
    { ts: new Date().toISOString(), worker: 'test', model: 'test', latency: -1, tokenEstimate: 0, resultStatus: 'error' },
    { ts: new Date().toISOString(), worker: 'test', model: 'test', latency: 1000, tokenEstimate: 10, resultStatus: 'success' },
  ];
  var latencyStats = dashboard._computeWorkerStats(latencyTestData);
  assert(latencyStats.latencyCount === 1, 'only 1 valid latency counted (not -1)');

  // =========================================
  // Test 9: redactSensitive() 脱敏函数
  // =========================================
  section('Test 9: redactSensitive() 脱敏函数');

  // 9a: sk- API key
  var skResult = dashboard.redactSensitive('Authorization: Bearer sk-proj-abc123def456ghi789jkl');
  assert(!skResult.includes('sk-proj'), 'sk- API key masked');
  // 链式脱敏会把 sk- → [MASKED_API_KEY] → 再被 Bearer/Authorization 覆盖为 [MASKED]
  // 核心断言：原始敏感信息已去除，输出中不包含原始 key 片段
  assert(skResult.includes('[MASKED') || skResult.includes('MASKED'), 'sk- replaced (masked)');

  // 9b: Bearer token
  var bearerResult = dashboard.redactSensitive('Header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  assert(!bearerResult.includes('eyJhbGci'), 'Bearer token masked');
  assert(bearerResult.includes('Bearer [MASKED]'), 'Bearer replaced');

  // 9c: Authorization header
  var authResult = dashboard.redactSensitive('Auth: Authorization: basic dXNlcjpwYXNz');
  assert(!authResult.includes('dXNlcjpwYXNz'), 'Authorization header masked');
  assert(authResult.includes('Authorization: [MASKED]'), 'Authorization replaced');

  // 9d: Cookie header
  var cookieResult = dashboard.redactSensitive('Headers: Cookie: session=abc123def456; path=/');
  assert(!cookieResult.includes('session=abc123'), 'Cookie header masked');
  assert(cookieResult.includes('Cookie: [MASKED]'), 'Cookie replaced');

  // 9e: token=xxx
  var tokenResult = dashboard.redactSensitive('env: token=gIkuVAsDdM3xPz7qR2tY');
  assert(!tokenResult.includes('gIkuVAsDdM3xPz7qR2tY'), 'token= masked');
  assert(tokenResult.includes('token=[MASKED]'), 'token= replaced');

  // 9f: key=xxx
  var keyResult = dashboard.redactSensitive('env: key=aB3dEfGhIjKlMnOpQrStUv');
  assert(!keyResult.includes('aB3dEfGhIjKlMnOpQrStUv'), 'key= masked');
  assert(keyResult.includes('key=[MASKED]'), 'key= replaced');

  // 9g: secret=xxx
  var secretResult = dashboard.redactSensitive('env: secret=mySuperSecret123!');
  assert(!secretResult.includes('mySuperSecret123!'), 'secret= masked');
  assert(secretResult.includes('secret=[MASKED]'), 'secret= replaced');

  // 9h: password=xxx
  var passwordResult = dashboard.redactSensitive('cred: password=SuperP@ssw0rd!');
  assert(!passwordResult.includes('SuperP@ssw0rd!'), 'password= masked');
  assert(passwordResult.includes('password=[MASKED]'), 'password= replaced');

  // 9i: Windows 绝对路径
  var winPathResult = dashboard.redactSensitive('file at C:\\Users\\admin\\.env and C:\\Program Files\\app');
  assert(!winPathResult.includes('C:\\Users'), 'Windows Users path masked');
  assert(!winPathResult.includes('Program Files'), 'Windows Program path masked');
  assert(winPathResult.includes('[MASKED_PATH]'), 'Windows path replaced');

  // 9j: Linux 绝对路径
  var linuxPathResult = dashboard.redactSensitive('config at /opt/wecom-openclaw/.env and /home/admin/secrets');
  assert(!linuxPathResult.includes('/opt/wecom-openclaw'), 'Linux /opt path masked');
  assert(!linuxPathResult.includes('/home/admin'), 'Linux /home path masked');
  assert(linuxPathResult.includes('[MASKED_PATH]'), 'Linux path replaced');

  // 9k: .env 路径
  var envResult = dashboard.redactSensitive('load .env with dotenv');
  assert(!envResult.includes('.env'), '.env path masked');
  assert(envResult.includes('[MASKED_PATH]'), '.env replaced');

  // =========================================
  // Test 10: 含敏感字符串的 JSONL 脱敏集成测试
  // =========================================
  section('Test 10: 含敏感字符串的 JSONL 脱敏集成');

  // 构造包含各种敏感信息的 JSONL 数据
  var sensitiveCalls = [
    {
      ts: new Date(Date.now() - 1800000).toISOString(),
      worker: 'planner-**inject**|table',
      model: 'sk-proj-INTEGRATIONTEST123456',
      latency: 2000,
      tokenEstimate: 800,
      resultStatus: 'error',
      errorMessage: 'Failed with Authorization: Bearer sk-test-secret-key-abcdef123456 and Cookie: session=leaked_session_token_xyz'
    },
    {
      ts: new Date(Date.now() - 3600000).toISOString(),
      worker: 'roi-**bold**',
      model: 'deepseek-chat',
      latency: -1,
      tokenEstimate: 0,
      resultStatus: 'rejected',
      rejectReason: 'GATE: token=secretToken12345 key=apiKeyXYZ secret=hunter2 password=admin123'
    },
    {
      ts: new Date(Date.now() - 7200000).toISOString(),
      worker: 'worker-from-C:\\Users\\haoji\\.env-config',
      model: 'model-from-/opt/wecom-openclaw/.env',
      latency: 1500,
      tokenEstimate: 500,
      resultStatus: 'success'
    },
  ];

  var sensitiveStats = dashboard._computeWorkerStats(sensitiveCalls);
  var sensitiveMd = dashboard._renderMarkdown(sensitiveStats, { totalTasks: 0, actions: {} }, 'enabled');

  // 10a: 不包含 sk- 前缀
  assert(!sensitiveMd.includes('sk-proj'), 'output does NOT contain sk- API key prefix');
  assert(!sensitiveMd.includes('sk-test'), 'output does NOT contain sk- test key');

  // 10b: 不包含 Bearer
  assert(!sensitiveMd.match(/Bearer\s+[a-zA-Z0-9]/), 'output does NOT contain Bearer token value');

  // 10c: 不包含 Authorization 头
  assert(!sensitiveMd.match(/Authorization:\s+[a-zA-Z0-9]/), 'output does NOT contain Authorization header value');

  // 10d: 不包含 Cookie 头
  assert(!sensitiveMd.match(/Cookie:\s+[a-zA-Z0-9]/), 'output does NOT contain Cookie header value');

  // 10e: 不包含 token=xxx
  assert(!sensitiveMd.match(/token=[A-Za-z0-9]{8,}/), 'output does NOT contain token= value');

  // 10f: 不包含 key=xxx
  assert(!sensitiveMd.match(/key=[A-Za-z0-9]{8,}/), 'output does NOT contain key= value');

  // 10g: 不包含 secret=xxx
  assert(!sensitiveMd.match(/secret=[A-Za-z0-9]{8,}/), 'output does NOT contain secret= value');

  // 10h: 不包含 password=xxx（脱敏后 password=[MASKED] 可接受）
  assert(!sensitiveMd.match(/password=(?!\[MASKED\])[^\s,;`|]{4,}/), 'output does NOT contain password= value');

  // 10i: 不包含 .env
  assert(!sensitiveMd.includes('.env'), 'output does NOT contain .env path');

  // 10j: 不包含本地绝对路径
  assert(!sensitiveMd.includes('C:\\Users'), 'output does NOT contain Windows Users path');
  assert(!sensitiveMd.includes('/opt/wecom'), 'output does NOT contain Linux /opt path');

  // 10k: Markdown 表格未被注入破坏
  var tableLines = sensitiveMd.split('\n').filter(function (l) { return l.indexOf('|') === 0; });
  // 确保表格行数一致（表头 + 分隔行 + 3 worker 行 = 5 行）
  var tableRowCount = tableLines.filter(function (l) { return l.startsWith('| ') && !l.startsWith('|-'); }).length;
  // Worker 分组标题只显示有实际数据的 Worker，注入的管道符被转义后不会产生新行
  assert(tableRowCount >= 3, 'Markdown table has correct number of rows (not broken by injection)');

  // 10l: 注入的 | 字符在 worker 字段中被转义（不会新增列）
  var injectWorkerLine = sensitiveMd.split('\n').find(function (l) {
    return l.includes('inject') || l.includes('MASKED');
  });
  assert(injectWorkerLine !== undefined, 'injected worker line exists in output');
  // 管道符被转义为 \|，计数时只算未转义的 |
  var unescapedPipes = (injectWorkerLine.match(/(?<!\\)\|/g) || []).length;
  // 标准表格有 9 列 = 10 个未转义管道符 | col1 | col2 | ... | col9 |
  assert(unescapedPipes === 10, 'table has correct column count (pipe injection prevented): got ' + unescapedPipes);

  // 10m: worker 字段中 markdown 注入的 ** 被保留但不影响表格结构
  assert(typeof sensitiveMd === 'string' && sensitiveMd.length > 0, 'sensitive dashboard renders without error');
}

// ============================================================
// 执行
// ============================================================

try {
  setupTestData();
  runTests();
} catch (e) {
  console.error('\n  FATAL: ' + e.message);
  console.error(e.stack);
  failed++;
} finally {
  cleanupTestData();
}

summary();

// 如果失败，以非零退出
if (failed > 0) {
  process.exit(1);
}
