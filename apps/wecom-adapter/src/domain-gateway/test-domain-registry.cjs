'use strict';

var reg = require('./domain-registry');
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

reg.init();

console.log('── Test 1: listDomains ──');
var all = reg.listDomains();
assert('6 domains loaded', all.length === 6);

console.log('── Test 2: getDomain ──');
assert('commerce exists', !!reg.getDomain('commerce') && reg.getDomain('commerce').name === '电商');
assert('marketing exists', !!reg.getDomain('marketing'));
assert('customer exists', !!reg.getDomain('customer'));
assert('office exists', !!reg.getDomain('office'));
assert('devops exists', !!reg.getDomain('devops'));
assert('trading exists', !!reg.getDomain('trading'));
assert('non-existent returns null', reg.getDomain('nonexistent') === null);

console.log('── Test 3: findDomainByCommand ──');
assert('/电商 → commerce', reg.findDomainByCommand('/电商').domainId === 'commerce');
assert('/营销 → marketing', reg.findDomainByCommand('/营销').domainId === 'marketing');
assert('/客服 → customer', reg.findDomainByCommand('/客服').domainId === 'customer');
assert('/办公 → office', reg.findDomainByCommand('/办公').domainId === 'office');
assert('/运维 → devops', reg.findDomainByCommand('/运维').domainId === 'devops');
assert('/股票 → trading', reg.findDomainByCommand('/股票').domainId === 'trading');
assert('unknown cmd → null', reg.findDomainByCommand('/unknown') === null);

console.log('── Test 4: Route ──');
var r = reg.routeDomainCommand('/营销');
assert('route found', r.found === true);
assert('route domainId', r.domainId === 'marketing');
assert('route has suggestedCommands', r.suggestedCommands.length >= 3);
assert('route has capabilities', r.capabilities.length >= 3);
assert('route reviewOnly', r.reviewOnly === true);
assert('route requiresHumanApproval', r.requiresHumanApproval === true);

console.log('── Test 5: Alias & English ──');
assert('/enterprise alias handled', reg.findDomainByCommand('/enterprise') === null); // no such alias
assert('/devops alias → devops', reg.findDomainByCommand('/devops').domainId === 'devops');

console.log('── Test 6: validateDomainConfig ──');
var ok = reg.validateDomainConfig(reg.getDomain('commerce'));
assert('valid config passes', ok.valid === true);
var bad = reg.validateDomainConfig({ domainId: null, reviewOnly: false });
assert('invalid config fails', bad.valid === false);

console.log('── Test 7: Capabilities & Commands ──');
assert('commerce has 6 capabilities', reg.listDomainCapabilities('commerce').length === 6);
assert('office has 3 commands', reg.getDomain('office').commands.length === 3);

console.log('── Test 8: All reviewOnly──');
assert('all reviewOnly', all.every(function (d) { return d.reviewOnly === true; }));
assert('all requiresHumanApproval', all.every(function (d) { return d.requiresHumanApproval === true; }));

console.log('── Test 9: Stats ──');
var st = reg.stats();
assert('stats total 6', st.total === 6);
assert('stats has totalCapabilities', st.totalCapabilities > 10);

summary();
