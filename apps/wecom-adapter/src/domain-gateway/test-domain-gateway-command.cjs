'use strict';

var cmd = require('../commands/domain-gateway-command');
var reg = require('./domain-registry');
var fs = require('fs');

var passed = 0, failed = 0;
function assert(desc, cond) { if (cond) { passed++; console.log('  ✅ ' + desc); } else { failed++; console.log('  ❌ ' + desc); } }
function summary() { console.log('\n' + '='.repeat(40)); console.log('  Total: ' + (passed + failed) + ' | Passed: ' + passed + ' | Failed: ' + failed); if (failed > 0) process.exit(1); }

reg.init();

console.log('── Test 1: Module ──');
assert('execute fn', typeof cmd.execute === 'function');
assert('desc string', typeof cmd.desc === 'string');

console.log('── Test 2: Overview (/企业) ──');
cmd.execute({}, '').then(function (r) {
  assert('/企业 shows overview', r.indexOf('Enterprise OS') >= 0);
  assert('overview 6 domains', r.indexOf('电商') >= 0 && r.indexOf('营销') >= 0 && r.indexOf('客服') >= 0 && r.indexOf('办公') >= 0 && r.indexOf('运维') >= 0 && r.indexOf('股票') >= 0);
  assert('overview REVIEW_ONLY', r.indexOf('REVIEW_ONLY') >= 0);
}).then(function () { return cmd.execute({}, '状态'); }).then(function (r) {
  assert('/企业 状态 shows overview', r.indexOf('Enterprise OS') >= 0);
});

console.log('── Test 3: Domain Views ──');
cmd.execute({}, '/电商').then(function (r) {
  assert('/电商 GMV', r.indexOf('GMV') >= 0);
  assert('/电商 订单', r.indexOf('订单') >= 0);
  assert('/电商 REVIEW_ONLY', r.indexOf('REVIEW_ONLY') >= 0);
}).then(function () { return cmd.execute({}, '/营销'); }).then(function (r) {
  assert('/营销 视频素材', r.indexOf('视频素材') >= 0);
  assert('/营销 投流中心', r.indexOf('投流中心') >= 0);
}).then(function () { return cmd.execute({}, '/客服'); }).then(function (r) {
  assert('/客服 exists', r.indexOf('客服') >= 0);
}).then(function () { return cmd.execute({}, '/办公'); }).then(function (r) {
  assert('/办公 ops-summary', r.indexOf('ops-summary') >= 0);
}).then(function () { return cmd.execute({}, '/运维'); }).then(function (r) {
  assert('/运维 worker', r.indexOf('worker') >= 0);
  assert('/运维 ai任务', r.indexOf('ai任务') >= 0);
}).then(function () { return cmd.execute({}, '/股票'); }).then(function (r) {
  assert('/股票 转债', r.indexOf('转债') >= 0);
});

console.log('── Test 4: English aliases ──');
cmd.execute({}, '/devops').then(function (r) {
  assert('/devops → devops', r.indexOf('worker') >= 0 || r.indexOf('运维') >= 0);
});

console.log('── Test 5: Unknown ──');
cmd.execute({}, '/unknown').then(function (r) {
  assert('unknown shows overview', r.indexOf('Enterprise OS') >= 0);
});

setTimeout(function () {
  console.log('── Test 6: Safety ──');
  var src = fs.readFileSync('src/commands/domain-gateway-command.js', 'utf-8');
  assert('no real execute', src.indexOf('executeCommand') < 0);
  assert('no auto deploy', src.indexOf('autoDeploy') < 0);
  assert('no auto launch', src.indexOf('autoLaunch') < 0);
  assert('REVIEW_ONLY present', src.indexOf('REVIEW_ONLY') >= 0);
  assert('no downstream call', src.indexOf('downstreamExec') < 0);

  console.log('── Test 7: All domains viewable ──');
  var domains = reg.listDomains();
  assert('6 domains can be viewed', domains.length === 6);
  domains.forEach(function (d) {
    assert(d.name + ' has commands', d.commands.length > 0);
    assert(d.name + ' has capabilities', d.capabilities.length > 0);
  });

  assert('all domains reviewOnly', domains.every(function (d) { return d.reviewOnly === true; }));
  assert('all domains requiresHumanApproval', domains.every(function (d) { return d.requiresHumanApproval === true; }));

  summary();
}, 500);
