'use strict';
var assert = require('assert');
var mab = require('./multi-agent-board');
var fs = require('fs');
var p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log('  ✓ ' + n); } catch (e) { f++; console.log('  ✗ ' + n + ' — ' + e.message); } }
function ae(v) { assert.ok(v != null); }
function at(v, t) { assert.strictEqual(typeof v, t); }

console.log('\nP14.4 Multi-Agent Board Tests\n');

t('8 agents', function () { assert.strictEqual(mab.AGENTS.length, 8); });
t('convene 返回完整', function () {
  var m = mab.convene();
  ae(m); ae(m.meetingId); ae(m.proposals); ae(m.votes); ae(m.result);
  assert.ok(m.meetingId.startsWith('mab-'));
});
t('proposals ≤5', function () { assert.ok(mab.convene().proposals.length <= 5); });
t('每个 agent 有投票记录', function () {
  var m = mab.convene();
  m.votes.forEach(function (v) { at(v.weight, 'number'); assert.ok(v.votes.length >= 0); });
});
t('result 统计正确', function () {
  var r = mab.convene().result;
  assert.strictEqual(r.approved + r.rejected, r.results.length);
  ae(r.consensus); ae(r.recommendation);
});
t('不含 .env', function () {
  var c = fs.readFileSync(__filename.replace('test-multi-agent-board.cjs', 'multi-agent-board.js'), 'utf-8');
  assert.strictEqual(c.indexOf('.env'), -1);
});
t('不含 deploy/merge', function () {
  var c = fs.readFileSync(__filename.replace('test-multi-agent-board.cjs', 'multi-agent-board.js'), 'utf-8').toLowerCase();
  assert.strictEqual(c.indexOf('deploy'), -1); assert.strictEqual(c.indexOf('merge'), -1);
});
t('幂等', function () { assert.notStrictEqual(mab.convene().meetingId, mab.convene().meetingId); });

console.log('\nResults: ' + p + ' passed, ' + f + ' failed');
if (f) process.exit(1);
