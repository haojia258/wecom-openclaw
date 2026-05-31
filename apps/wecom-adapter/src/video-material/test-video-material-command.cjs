'use strict';

var cmd = require('../commands/video-material-command');
var engine = require('./engine');
var sg = require('./script-generator');
var fs = require('fs');

var passed = 0, failed = 0;
function assert(desc, cond, detail) {
  if (cond) { passed++; console.log('  ✅ ' + desc); }
  else { failed++; console.log('  ❌ ' + desc + (detail ? ' — ' + detail : '')); }
}
function summary() {
  console.log('\n' + '='.repeat(40));
  console.log('  Total: ' + (passed + failed) + ' | Passed: ' + passed + ' | Failed: ' + failed);
  if (failed > 0) process.exit(1);
}

sg._cleanup();
engine._reset();

console.log('── Test 1: Command Module ──');
assert('typeof execute function', typeof cmd.execute === 'function');
assert('desc is string', typeof cmd.desc === 'string');

console.log('── Test 2: Help ──');
cmd.execute({}, '帮助').then(function (r) {
  assert('help non-empty', r.length > 50);
  assert('help contains REVIEW_ONLY', r.indexOf('REVIEW_ONLY') >= 0);
  assert('help lists sub-commands', r.indexOf('创建') >= 0);
}).then(function () {
  return cmd.execute({}, '');
}).then(function (r) {
  assert('empty args shows help', r.indexOf('Usage') >= 0);
});

console.log('── Test 3: Create Plan ──');
cmd.execute({}, '创建 prod-003').then(function (r) {
  assert('create returns planId', r.indexOf('planId') >= 0);
  assert('create shows status draft', r.indexOf('draft') >= 0);
  assert('create REVIEW_ONLY', r.indexOf('REVIEW_ONLY') >= 0);

  var planId = (r.match(/vp-[a-z0-9]+-[a-z0-9]+/) || [''])[0];
  assert('planId in output', planId.length > 0);

  // Missing productId
  return cmd.execute({}, '创建');
}).then(function (r) {
  assert('missing productId error', r.indexOf('请提供产品 ID') >= 0 || r.indexOf('productId') >= 0);
});

console.log('── Test 4: Generate Script ──');
var plans = engine.listPlans();
var planId = plans[0].planId;

cmd.execute({}, '脚本 ' + planId).then(function (r) {
  assert('script return contains scriptId', r.indexOf('scriptId') >= 0);
  assert('script REVIEW_ONLY', r.indexOf('REVIEW_ONLY') >= 0);
  assert('script shows hook', r.indexOf('hook') >= 0);

  // Missing planId
  return cmd.execute({}, '脚本');
}).then(function (r) {
  assert('missing planId script error', r.indexOf('请提供 planId') >= 0);
});

console.log('── Test 5: View Plan ──');
cmd.execute({}, '查看 ' + planId).then(function (r) {
  assert('view contains planId', r.indexOf(planId) >= 0);
  assert('view shows status', r.indexOf('status') >= 0);
});

console.log('── Test 6: List ──');
cmd.execute({}, '列表').then(function (r) {
  assert('list contains Plans', r.indexOf('Plans') >= 0 || r.indexOf('plans') >= 0);
});

console.log('── Test 7: Match ──');
cmd.execute({}, '匹配 ' + planId).then(function (r) {
  assert('match shows matched', r.indexOf('matched') >= 0 || r.indexOf('assets') >= 0);
  assert('match REVIEW_ONLY', r.indexOf('REVIEW_ONLY') >= 0);

  // Non-existent planId
  return cmd.execute({}, '匹配 nonexistent');
}).then(function (r) {
  assert('non-existent planId error', r.indexOf('not found') >= 0 || r.indexOf('Not found') >= 0);
});

// Wait for all async
setTimeout(function () {
  console.log('\n── Test 8: Safety ──');
  var src = fs.readFileSync('src/commands/video-material-command.js', 'utf-8');
  assert('no publish function', src.indexOf('publishVideo') < 0 && src.indexOf('publish(') < 0 && src.indexOf('publish ') < 0);
  assert('no launch function', src.indexOf('launchTask') < 0 && src.indexOf('launch(') < 0);
  assert('no real video', src.indexOf('video_generation') < 0);
  assert('REVIEW_ONLY present', src.indexOf('REVIEW_ONLY') >= 0);

  summary();
}, 500);
