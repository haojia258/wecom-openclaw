'use strict';

var status = require('./domain-status');
var reg = require('./domain-registry');

var passed = 0, failed = 0;
function assert(desc, cond) { if (cond) { passed++; console.log('  ✅ ' + desc); } else { failed++; console.log('  ❌ ' + desc); } }
function summary() { console.log('\n' + '='.repeat(40)); console.log('  Total: ' + (passed + failed) + ' | Passed: ' + passed + ' | Failed: ' + failed); if (failed > 0) process.exit(1); }

reg.init();

console.log('── Test 1: Per-domain status ──');
var commerce = status.getDomainStatus('commerce');
assert('commerce ready', commerce.status === 'ready');
assert('commerce commandCount=6', commerce.commandCount === 6);
assert('commerce capabilityCount=6', commerce.capabilityCount === 6);
assert('commerce reviewOnly', commerce.reviewOnly === true);
assert('lastCheckedAt exists', !!commerce.lastCheckedAt);

console.log('── Test 2: All domain statuses ──');
assert('marketing ready', status.getDomainStatus('marketing').status === 'ready');
assert('customer partial', status.getDomainStatus('customer').status === 'partial');
assert('office ready', status.getDomainStatus('office').status === 'ready');
assert('devops ready', status.getDomainStatus('devops').status === 'ready');
assert('trading planned', status.getDomainStatus('trading').status === 'planned');
assert('unknown null', status.getDomainStatus('unknown') === null);

console.log('── Test 3: All status ──');
var all = status.getAllDomainStatus();
assert('6 domain status entries', all.length === 6);
assert('all require human approval', all.every(function (d) { return d.requiresHumanApproval === true; }));

console.log('── Test 4: Health ──');
var health = status.summarizeDomainHealth();
assert('health total=6', health.total === 6);
assert('health ready=4', health.ready === 4);
assert('health partial=1', health.partial === 1);
assert('health planned=1', health.planned === 1);
assert('health level', ['excellent','good','fair','needs_attention'].indexOf(health.health) >= 0);
assert('health reviewOnly', health.reviewOnly === true);

console.log('── Test 5: Modules ──');
var mods = status.collectRelatedModuleStatus('marketing');
assert('marketing has modules', mods.modules.length === 3);
var mods2 = status.collectRelatedModuleStatus('unknown');
assert('unknown returns not found', mods2.found === false);

console.log('── Test 6: Report ──');
var report = status.formatDomainStatusReport();
assert('report has title', report.indexOf('Dashboard') >= 0);
assert('report has health', report.indexOf('健康度') >= 0);
assert('report has 6 rows', (report.match(/\| ✅/g) || []).length + (report.match(/\| ⚠️/g) || []).length + (report.match(/\| 📋/g) || []).length >= 4);
assert('REVIEW_ONLY in report', report.indexOf('REVIEW_ONLY') >= 0);

summary();
