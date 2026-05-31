'use strict';
var assert = require('assert');
var tm = require('../src/orchestrator/task-maintenance');
var fs = require('fs');
var p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log('  ✓ ' + n); } catch (e) { f++; console.log('  ✗ ' + n + ' — ' + e.message); } }

console.log('\nP15.0 Task Maintenance Tests\n');

t('scan 返回完整对象', function () { var s = tm.scan(); assert.ok(s.total >= 0); assert.ok(Array.isArray(s.zombies)); });
t('ZOMBIE_RULES 有 5 条规则', function () { assert.strictEqual(tm.ZOMBIE_RULES.length, 5); });
t('clean 返回结果', function () { var r = tm.clean(); assert.ok(r.summary !== undefined); });
t('generateReport 生成 markdown', function () { var r = tm.generateReport(tm.scan(), []); assert.ok(r.indexOf('# 任务维护报告') !== -1); });
t('不含 .env', function () {
  var c = fs.readFileSync(__filename.replace('tests\\test-task-maintenance.cjs', 'src\\orchestrator\\task-maintenance.js'), 'utf-8');
  assert.strictEqual(c.indexOf('.env'), -1);
});
t('不含 deploy/merge', function () {
  var c = fs.readFileSync(__filename.replace('tests/test-task-maintenance.cjs', 'src/orchestrator/task-maintenance.js'), 'utf-8').toLowerCase();
  assert.strictEqual(c.indexOf('deploy('), -1); assert.strictEqual(c.indexOf('merge('), -1);
});
t('scan 不修改任务', function () { var before = tm.scan(); var after = tm.scan(); assert.strictEqual(before.total, after.total); });
t('startScheduler returns true', function () { assert.strictEqual(tm.startScheduler(3600000), true); tm.stopScheduler(); });

console.log('\nResults: ' + p + ' passed, ' + f + ' failed');
if (f) process.exit(1);
