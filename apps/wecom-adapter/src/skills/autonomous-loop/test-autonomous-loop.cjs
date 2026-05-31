'use strict';
var assert = require('assert');
var loop = require('./autonomous-loop');
var fs = require('fs');
var p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log('  ✓ ' + n); } catch (e) { f++; console.log('  ✗ ' + n + ' — ' + e.message); } }
function ae(v) { assert.ok(v != null); }
function at(v, t) { assert.strictEqual(typeof v, t); }

console.log('\nP14.5 Autonomous Company Loop Tests\n');

t('runLoop 返回完整', function () {
  var r = loop.runLoop(); ae(r); ae(r.loopId); assert.ok(r.loopId.startsWith('loop-')); ae(r.stages); ae(r.summary);
});
t('7 个阶段', function () { assert.strictEqual(loop.runLoop().stages.length, 7); });
t('阶段名称正确', function () {
  var names = ['Goal', 'Decision', 'Plan', 'Board', 'Task', 'Review', 'Memory'];
  loop.runLoop().stages.forEach(function (s, i) { assert.strictEqual(s.name, names[i]); });
});
t('每个阶段有 status', function () {
  loop.runLoop().stages.forEach(function (s) { ae(s.status); assert.ok(s.status.length > 0); });
});
t('summary 健康度', function () {
  var s = loop.runLoop().summary;
  assert.ok(s.health.indexOf('%') !== -1); ae(s.recommendation);
});
t('Review 阶段有 score/grade', function () {
  var r = loop.runLoop().stages[5];
  assert.strictEqual(r.name, 'Review');
  at(r.data.score, 'number'); assert.ok(['A','B','C','D'].indexOf(r.data.grade) !== -1);
});
t('不含 .env', function () {
  assert.strictEqual(fs.readFileSync(__filename.replace('test-autonomous-loop.cjs', 'autonomous-loop.js'), 'utf-8').indexOf('.env'), -1);
});
t('不含 deploy/merge 操作', function () {
  var c = fs.readFileSync(__filename.replace('test-autonomous-loop.cjs', 'autonomous-loop.js'),'utf-8').toLowerCase();
  assert.strictEqual(c.indexOf('deploy('), -1); assert.strictEqual(c.indexOf('merge('), -1);
  assert.strictEqual(c.indexOf('git merge'), -1); assert.strictEqual(c.indexOf('git push'), -1);
});
t('幂等', function () { assert.notStrictEqual(loop.runLoop().loopId, loop.runLoop().loopId); });

console.log('\nResults: ' + p + ' passed, ' + f + ' failed');
if (f) process.exit(1);
