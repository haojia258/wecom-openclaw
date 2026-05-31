'use strict';

var engine = require('./loop-engine');
var scheduler = require('./task-scheduler');
var collector = require('./artifact-collector');
var reporter = require('./report-generator');

var passed = 0, failed = 0;
function assert(desc, cond) { if (cond) { passed++; console.log('  ✅ ' + desc); } else { failed++; console.log('  ❌ ' + desc); } }
function summary() { console.log('\n' + '='.repeat(40)); console.log('  Total: ' + (passed + failed) + ' | Passed: ' + passed + ' | Failed: ' + failed); if (failed > 0) process.exit(1); }

engine._reset();

console.log('── Test 1: Run Daily Loop ──');
var loop = engine.runDailyLoop('2026-06-01');
assert('loopId exists', !!loop.loopId && loop.loopId.startsWith('loop-'));
assert('status=complete', loop.status === 'complete');
assert('reviewRequired=true', loop.reviewRequired === true);
assert('reviewOnly=true', loop.reviewOnly === true);
assert('requiresHumanApproval=true', loop.requiresHumanApproval === true);
assert('has 4 phases', Object.keys(loop.phases).length === 4);
assert('has startedAt', !!loop.startedAt);
assert('has completedAt', !!loop.completedAt);

console.log('── Test 2: Data Collection ──');
var coll = loop.phases.collect;
assert('GMV data exists', !!coll.gmv && coll.gmv.today > 0);
assert('order data exists', !!coll.orders && coll.orders.total > 0);
assert('profit data exists', !!coll.profit && coll.profit.margin > 0);
assert('ROI data exists', !!coll.roi && coll.roi.roas > 0);
assert('CTR data exists', !!coll.ctr && coll.ctr.ctrPct > 0);
assert('campaign data exists', !!coll.campaign && coll.campaign.active > 0);
assert('inventory data exists', !!coll.inventory && coll.inventory.total > 0);
assert('source=mock', coll.source === 'mock');

console.log('── Test 3: Task Scheduling ──');
var sched = loop.phases.schedule;
assert('15 daily tasks generated', sched.taskCount === 15);
assert('tasks is array', Array.isArray(sched.tasks) && sched.tasks.length === 15);
assert('reviewOnly in schedule', sched.reviewOnly === true);

console.log('── Test 4: Agent Assignment ──');
var agentSummary = scheduler.summarizeAssignments(sched.tasks);
assert('deepseek assigned', (agentSummary['deepseek'] || 0) >= 5);
assert('agent total matches tasks', Object.values(agentSummary).reduce(function (a, b) { return a + b; }, 0) === 15);

console.log('── Test 5: Artifact Collection ──');
var exec = loop.phases.execute;
assert('artifactCount > 0', exec.artifactCount > 0);
assert('reviewOnly on artifacts', exec.reviewOnly === true);

console.log('── Test 6: Report Generation ──');
var report = loop.phases.report;
assert('report has title', report.indexOf('自动化运营日报') >= 0);
assert('report has GMV', report.indexOf('GMV') >= 0);
assert('report has ROI', report.indexOf('ROI') >= 0);
assert('report has tasks', report.indexOf('15') >= 0);
assert('report has artifacts', report.indexOf('产物') >= 0);
assert('report has audit', report.indexOf('审计') >= 0);
assert('report REVIEW_ONLY', report.indexOf('REVIEW_ONLY') >= 0);

console.log('── Test 7: Loop Status ──');
var status = engine.getLoopStatus(loop.loopId);
assert('getLoopStatus works', !!status && status.status === 'complete');
assert('status has taskCount', status.taskCount === 15);
assert('status has artifactCount', status.artifactCount > 0);

console.log('── Test 8: List & Stats ──');
var list = engine.listLoops();
assert('listLoops returns array', list.length === 1);
var st = engine.stats();
assert('stats has totalLoops', st.totalLoops === 1);

console.log('── Test 9: Safety ──');
assert('mock data only', coll.source === 'mock');
assert('no real publish', report.indexOf('自动发布') >= 0 && report.indexOf('未触发') >= 0);
assert('no real trade', report.indexOf('自动下单') >= 0 && report.indexOf('未触发') >= 0);

summary();
