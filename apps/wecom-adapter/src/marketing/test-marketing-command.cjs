'use strict';

var engine = require('./decision-engine');
var budget = require('./budget-engine');
var cmd = require('../commands/marketing-command');
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

engine._reset();

console.log('── Test 1: Command Module ──');
assert('typeof execute function', typeof cmd.execute === 'function');
assert('desc is string', typeof cmd.desc === 'string');

console.log('── Test 2: Help ──');
cmd.execute({}, '帮助').then(function (r) {
  assert('help non-empty', r.length > 50);
  assert('help REVIEW_ONLY', r.indexOf('REVIEW_ONLY') >= 0);
  assert('help lists aliases', r.indexOf('marketing') >= 0);
}).then(function () {
  return cmd.execute({}, '');
}).then(function (r) {
  assert('empty shows help', r.indexOf('Usage') >= 0);
});

console.log('── Test 3: Analyze ──');
cmd.execute({}, '分析 10000 35000 50000 2000 150').then(function (r) {
  assert('analysis has decisionId', r.indexOf('decisionId') >= 0);
  assert('analysis REVIEW_ONLY', r.indexOf('REVIEW_ONLY') >= 0);
  assert('analysis has ROI', r.indexOf('ROI') >= 0);
  assert('analysis has recommendation', r.indexOf('Recommendation') >= 0 || r.indexOf('recommend') >= 0);
});

console.log('── Test 4: ROI ──');
cmd.execute({}, 'ROI 10000 30000 50000 2000 100').then(function (r) {
  assert('ROI has label', r.indexOf('Label') >= 0);
  assert('ROI has score', r.indexOf('Score') >= 0);
  assert('ROI REVIEW_ONLY', r.indexOf('REVIEW_ONLY') >= 0);
});

console.log('── Test 5: Budget ──');
cmd.execute({}, '预算 10000 35000 50000 2000 150').then(function (r) {
  assert('budget has budgetId', r.indexOf('budgetId') >= 0);
  assert('budget has action', r.indexOf('action') >= 0);
  assert('budget has scenarios', r.indexOf('Scenarios') >= 0 || r.indexOf('Scenario') >= 0);
  assert('budget REVIEW_ONLY', r.indexOf('REVIEW_ONLY') >= 0);
});

console.log('── Test 6: Risk ──');
cmd.execute({}, '风险').then(function (r) {
  assert('risk has Risk Assessment', r.indexOf('Risk Assessment') >= 0 || r.indexOf('Risk') >= 0);
  assert('risk REVIEW_ONLY', r.indexOf('REVIEW_ONLY') >= 0);
});

console.log('── Test 7: Report ──');
engine.analyzeCampaign({ campaignId: 'camp-rpt', spend: 10000, revenue: 25000, impressions: 40000, clicks: 1800, conversions: 120 });
cmd.execute({}, '报告').then(function (r) {
  assert('report has campaign', r.indexOf('camp-rpt') >= 0 || r.indexOf('Campaign') >= 0);
  assert('report REVIEW_ONLY', r.indexOf('REVIEW_ONLY') >= 0);
});

// Safety checks
setTimeout(function () {
  console.log('\n── Test 8: Safety ──');
  var src = fs.readFileSync('src/commands/marketing-command.js', 'utf-8');
  assert('no ad publish', src.indexOf('publishAd') < 0 && src.indexOf('adPublish') < 0);
  assert('no auto budget', src.indexOf('autoBudget') < 0 && src.indexOf('modifyBudget') < 0);
  assert('no auto launch', src.indexOf('autoLaunch') < 0);
  assert('REVIEW_ONLY present', src.indexOf('REVIEW_ONLY') >= 0);
  assert('unknown sub handled', src.indexOf('Unknown') >= 0);

  summary();
}, 500);
