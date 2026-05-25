'use strict';

/**
 * test-task-db.cjs - Task Store v2 SQLite 专项测试
 *
 * 5 组测试:
 * A: 连接与 Schema
 * B: CRUD 操作
 * C: JSONL 审计备份
 * D: 数据持久化
 * E: 测试清理
 */

var fs = require('fs');
var path = require('path');

var taskDb = require('../src/storage/task-db');
var repo = require('../src/storage/task-repository');

// ─── 测试工具 ─────────────────────────────────────────────

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

// ─── 测试前清理 ──────────────────────────────────────────

var DB_PATH = taskDb._DB_PATH;
var LOG_DIR = repo._getLogDir();

// 清理 SQLite 数据库文件
function cleanDbFiles() {
  var files = [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm'];
  for (var i = 0; i < files.length; i++) {
    if (fs.existsSync(files[i])) {
      try { fs.unlinkSync(files[i]); } catch (_) {}
    }
  }
}

// 清理日志文件
function cleanLogFiles() {
  if (fs.existsSync(LOG_DIR)) {
    var logFiles = fs.readdirSync(LOG_DIR);
    for (var i = 0; i < logFiles.length; i++) {
      try { fs.unlinkSync(path.join(LOG_DIR, logFiles[i])); } catch (_) {}
    }
  }
}

// 初始清理
cleanDbFiles();
taskDb.close(); // 重置连接状态（重新检测 better-sqlite3）
cleanLogFiles();

// ─── 测试 ─────────────────────────────────────────────────

console.log('========================================');
console.log('  Task Store v2 SQLite - 专项测试');
console.log('========================================\n');

// ═══════════════════════════════════════════════════════════
// 测试组 A: 连接与 Schema
// ═══════════════════════════════════════════════════════════

console.log('=== TEST GROUP A: 连接与 Schema ===\n');

{
  var available = taskDb.isAvailable();
  console.log('A1. SQLite 可用性: ' + (available ? 'YES' : 'NO (降级 JSONL 模式)'));

  if (available) {
    var db = taskDb.getDb();
    assert(db !== null, 'A2. getDb() 返回 Database 实例');

    // 检查 tasks 表
    var taskCols = db.prepare('PRAGMA table_info(tasks)').all();
    var taskColNames = taskCols.map(function(c) { return c.name; });
    assert(taskColNames.indexOf('task_id') !== -1, 'A3. tasks 表有 task_id 列');
    assert(taskColNames.indexOf('agent') !== -1, 'A4. tasks 表有 agent 列');
    assert(taskColNames.indexOf('status') !== -1, 'A5. tasks 表有 status 列');
    assert(taskColNames.indexOf('priority') !== -1, 'A6. tasks 表有 priority 列');
    assert(taskColNames.indexOf('error') !== -1, 'A7. tasks 表有 error 列');

    // 检查 events 表
    var eventCols = db.prepare('PRAGMA table_info(events)').all();
    assert(eventCols.length > 0, 'A8. events 表存在');

    // 检查 WAL 模式
    var journalMode = db.prepare('PRAGMA journal_mode').get();
    var modeStr = journalMode ? journalMode.journal_mode : '';
    assert(modeStr.toLowerCase() === 'wal', 'A9. WAL 模式已开启: ' + modeStr);

    // 检查索引
    var indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all();
    assert(indexes.length >= 3, 'A10. 索引已创建 (' + indexes.length + ' 个)');
  } else {
    // 降级模式：跳过 SQLite 特定测试
    console.log('  (跳过 A2-A10: SQLite 不可用)');
  }
}

// ═══════════════════════════════════════════════════════════
// 测试组 B: CRUD 操作
// ═══════════════════════════════════════════════════════════

console.log('\n=== TEST GROUP B: CRUD 操作 ===\n');

{
  // B1: 创建任务
  var t1 = repo.createTask({
    taskId: 'test_db_001',
    type: 'agent_task',
    agent: 'codex',
    content: '测试 CRUD 任务1',
    priority: 'high'
  });
  assertEqual(t1.task_id, 'test_db_001', 'B1. createTask 返回正确 task_id');
  assertEqual(t1.status, 'PENDING', 'B2. 初始状态为 PENDING');
  assertEqual(t1.agent, 'codex', 'B3. agent 正确');
  assertEqual(t1.priority, 'high', 'B4. priority 正确');
  assert(t1.created_at !== null && t1.created_at !== undefined, 'B5. created_at 已设置');
  assert(t1.updated_at !== null && t1.updated_at !== undefined, 'B6. updated_at 已设置');

  // B7: 重复 task_id 拒绝
  var dupErr = null;
  try {
    repo.createTask({ taskId: 'test_db_001', agent: 'deepseek', content: '重复' });
  } catch (e) {
    dupErr = e.message;
  }
  assert(dupErr !== null, 'B7. 重复 task_id 被拒绝');
  assert(dupErr.indexOf('Duplicate') !== -1 || dupErr.indexOf('重复') !== -1, 'B8. 错误消息提示重复');

  // B9: 创建第二个任务
  var t2 = repo.createTask({
    taskId: 'test_db_002',
    type: 'agent_task',
    agent: 'deepseek',
    content: '测试 CRUD 任务2'
  });

  // B10: getTask
  var got = repo.getTask('test_db_001');
  assert(got !== null, 'B10. getTask 查到已有任务');
  assertEqual(got.task_id, 'test_db_001', 'B11. getTask task_id 正确');
  assertEqual(got.status, 'PENDING', 'B12. getTask status 正确');

  // B13: getTask 不存在的
  var notFound = repo.getTask('nonexistent');
  assert(notFound === null, 'B13. getTask 不存在的任务返回 null');

  // B14: updateTask 更新状态
  var updated = repo.updateTask('test_db_001', { status: 'RUNNING' });
  assert(updated !== null, 'B14. updateTask 返回更新后的对象');
  assertEqual(updated.status, 'RUNNING', 'B15. 状态已更新为 RUNNING');

  // B16: updateTask 不存在的
  var updNone = repo.updateTask('nonexistent', { status: 'COMPLETED' });
  assert(updNone === null, 'B16. updateTask 不存在的任务返回 null');

  // B17: updateTask 设置 error 字段
  repo.createTask({ taskId: 'test_db_003', agent: 'codex', content: '会失败' });
  var errUpdated = repo.updateTask('test_db_003', { status: 'FAILED', error: 'timeout' });
  assertEqual(errUpdated.status, 'FAILED', 'B17. FAILED 状态设置成功');
  assertEqual(errUpdated.error, 'timeout', 'B18. error 字段正确');

  // B19: listTasks 无过滤
  var all = repo.listTasks();
  assert(all.length >= 3, 'B19. listTasks 返回所有任务 (' + all.length + ' 个)');

  // B20: listTasks 按 status 过滤 (使用新大写状态)
  var pendingTasks = repo.listTasks({ status: 'PENDING' });
  assert(pendingTasks.length >= 1, 'B20. listTasks status 过滤有效');

  // B20b: listTasks 按旧小写 status 过滤 (向后兼容)
  var pendingTasksOld = repo.listTasks({ status: 'pending' });
  assert(pendingTasksOld.length >= 1, 'B20b. listTasks 旧小写 status 过滤有效');

  // B21: listTasks 按 agent 过滤
  var codexTasks = repo.listTasks({ agent: 'codex' });
  assert(codexTasks.length >= 2, 'B21. listTasks agent 过滤有效 (' + codexTasks.length + ' 个)');

  // B22: listTasks 双重过滤
  var filtered = repo.listTasks({ status: 'PENDING', agent: 'deepseek' });
  assert(filtered.length >= 1, 'B22. listTasks 双重过滤有效');

  // B23: getBlockers
  repo.updateTask('test_db_002', { status: 'BLOCKED' });
  var blockers = repo.getBlockers();
  assert(blockers.length >= 1, 'B23. getBlockers 返回阻断项 (' + blockers.length + ' 个)');

  // B24: getStats
  var stats = repo.getStats();
  assert(stats.total >= 3, 'B24. getStats.total 正确');
  assert(typeof stats.pending === 'number', 'B25. getStats.pending 是数字');
  assert(typeof stats.in_progress === 'number', 'B26. getStats.in_progress 是数字');
  assert(typeof stats.blocked === 'number', 'B27. getStats.blocked 是数字');
  // P6.6.2: 新大写状态 key 也存在
  assert(typeof stats.PENDING === 'number', 'B27b. getStats.PENDING 是数字');
  assert(typeof stats.RUNNING === 'number', 'B27c. getStats.RUNNING 是数字');
  assert(typeof stats.BLOCKED === 'number', 'B27d. getStats.BLOCKED 是数字');

  // B28: updateTask 更新 result 对象
  var resultObj = { plan: 'test plan', steps: 3 };
  repo.updateTask('test_db_001', { status: 'COMPLETED', result: resultObj });
  var withResult = repo.getTask('test_db_001');
  assertEqual(withResult.status, 'COMPLETED', 'B28. 状态更新为 COMPLETED');
  assert(withResult.result !== null, 'B29. result 不为 null');
}

// ═══════════════════════════════════════════════════════════
// 测试组 C: JSONL 审计备份
// ═══════════════════════════════════════════════════════════

console.log('\n=== TEST GROUP C: JSONL 审计备份 ===\n');

{
  var logFilePath = repo._getLogFilePath();

  // C1: JSONL 文件存在
  var jsonlExists = fs.existsSync(logFilePath);
  assert(jsonlExists, 'C1. JSONL 审计文件已创建: ' + logFilePath);

  if (jsonlExists) {
    var content = fs.readFileSync(logFilePath, 'utf-8');
    var lines = content.trim().split('\n').filter(function(l) { return l.trim(); });

    // C2: 文件非空
    assert(lines.length > 0, 'C2. JSONL 文件非空 (' + lines.length + ' 行)');

    // C3: 每行是合法 JSON
    var allValidJson = true;
    for (var i = 0; i < lines.length; i++) {
      try {
        JSON.parse(lines[i]);
      } catch (_) {
        allValidJson = false;
        break;
      }
    }
    assert(allValidJson, 'C3. 所有行都是合法 JSON');

    // C4: 文件包含 test_db_001 的记录
    var hasRecord = content.indexOf('test_db_001') !== -1;
    assert(hasRecord, 'C4. JSONL 包含 test_db_001 的记录');

    // C5: 文件名格式
    var fileName = path.basename(logFilePath);
    var datePattern = /^\d{4}-\d{2}-\d{2}\.jsonl$/;
    assert(datePattern.test(fileName), 'C5. 文件名符合 YYYY-MM-DD.jsonl 格式: ' + fileName);
  }
}

// ═══════════════════════════════════════════════════════════
// 测试组 D: 数据持久化
// ═══════════════════════════════════════════════════════════

console.log('\n=== TEST GROUP D: 数据持久化 ===\n');

{
  if (taskDb.isAvailable()) {
    // D1: 关闭连接后数据不丢失
    taskDb.close();

    // 强制重新初始化（清除缓存）
    var pathToInvalidate = require.resolve('../src/storage/task-db');
    delete require.cache[pathToInvalidate];
    taskDb = require('../src/storage/task-db');

    // 重新加载 repo
    var repoPathToInvalidate = require.resolve('../src/storage/task-repository');
    delete require.cache[repoPathToInvalidate];
    repo = require('../src/storage/task-repository');

    assert(taskDb.isAvailable(), 'D1. close/reopen 后 SQLite 仍然可用');

    var reopenedTask = repo.getTask('test_db_001');
    assert(reopenedTask !== null, 'D2. close/reopen 后数据不丢失');
    assertEqual(reopenedTask.status, 'COMPLETED', 'D3. 持久化后状态正确');

    // D4: DB 文件存在
    assert(fs.existsSync(DB_PATH), 'D4. tasks.db 文件存在');

    // D5: WAL 文件存在
    var walExists = fs.existsSync(DB_PATH + '-wal');
    assert(walExists, 'D5. WAL 文件存在');
  } else {
    console.log('  (跳过 D1-D5: SQLite 不可用)');
  }
}

// ═══════════════════════════════════════════════════════════
// 测试组 E: 清理
// ═══════════════════════════════════════════════════════════

console.log('\n=== TEST GROUP E: 清理 ===\n');

{
  // E1: 清理 DB 文件
  taskDb.close();
  cleanDbFiles();
  assert(!fs.existsSync(DB_PATH) || !taskDb.isAvailable(), 'E1. DB 文件已清理');

  // E2: 清理 JSONL 文件
  cleanLogFiles();
  var logStillExists = fs.existsSync(LOG_DIR) && fs.readdirSync(LOG_DIR).length > 0;
  assert(!logStillExists, 'E2. JSONL 文件已清理');
}

// ─── 测试结果 ─────────────────────────────────────────────

console.log('\n========================================');
console.log('  测试结果');
console.log('========================================');
console.log('  通过: ' + passed);
console.log('  失败: ' + failed);
console.log('  总计: ' + (passed + failed));
console.log('========================================');

if (failures.length > 0) {
  console.log('\n失败详情:');
  failures.forEach(function(f) { console.log('  ' + f); });
  process.exit(1);
} else {
  console.log('\nV 所有测试通过');
  process.exit(0);
}
