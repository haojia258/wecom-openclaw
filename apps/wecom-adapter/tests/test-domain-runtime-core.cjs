'use strict';
var P=0,F=0,T=[];
function t(n,fn){T.push({name:n,fn:fn});}
function a(c,m){if(!c)throw new Error('A: '+(m||''));}
var registry = require('../src/domain/domain-registry');
var runtime = require('../src/domain/domain-runtime');

function r(){
  console.log('=== P12.0 Domain Runtime Core Tests ===\n');
  T.forEach(function(t){try{t.fn();P++;console.log('  PASS: '+t.name);}catch(e){F++;console.log('  FAIL: '+t.name+'\n        '+e.message);}});
  console.log('\n=== Results: '+P+'/'+(P+F)+' passed ===');if(F)process.exit(1);
}

console.log('\n--- Domain Registry ---');
t('domain list 6 types',function(){var d=registry.listDomains();a(d.length===6);});
t('commerce exists',function(){a(!!registry.getDomain('commerce'));});
t('marketing exists',function(){a(!!registry.getDomain('marketing'));});
t('customer exists',function(){a(!!registry.getDomain('customer'));});
t('devops exists',function(){a(!!registry.getDomain('devops'));});
t('trading exists',function(){a(!!registry.getDomain('trading'));});
t('unknown domain null',function(){a(!registry.getDomain('nonexistent'));});
t('routeToDomain commerce',function(){a(registry.routeToDomain('GMV分析')==='commerce');});
t('routeToDomain marketing',function(){a(registry.routeToDomain('ROI分析')==='marketing');});
t('routeToDomain customer',function(){a(registry.routeToDomain('客服回复')==='customer');});
t('routeToDomain devops',function(){a(registry.routeToDomain('健康检查')==='devops');});
t('routeToDomain trading',function(){a(registry.routeToDomain('股票观察')==='trading');});

console.log('\n--- Domain Runtime ---');
t('create commerce mission',function(){var r=runtime.createDomainMission({domain:'commerce',text:'GMV分析'});a(r.success);a(r.mission.domain==='commerce');});
t('create mission generates nodes',function(){var r=runtime.createDomainMission({domain:'commerce'});a(r.mission.nodes.length>=3);});
t('list missions',function(){var r=runtime.listMissions();a(r.total>0);});
t('get mission',function(){var cr=runtime.createDomainMission({domain:'commerce'});var g=runtime.getMission(cr.mission.mission_id);a(g.success);});
t('run mission',function(){var cr=runtime.createDomainMission({domain:'commerce'});var ru=runtime.runMission(cr.mission.mission_id);a(ru.success);a(ru.mission.status==='in_progress');});
t('filter by domain',function(){runtime.createDomainMission({domain:'marketing'});runtime.createDomainMission({domain:'commerce'});a(runtime.listMissions({domain:'commerce'}).total>0);});
t('auto route from text',function(){var r=runtime.createDomainMission({text:'GMV分析'});a(r.mission.domain==='commerce');});

r();
