'use strict';var P=0,F=0,T=[];
function t(n,fn){T.push({name:n,fn:fn});}
function a(c,m){if(!c)throw new Error('A: '+(m||''));}
var ca = require('../src/domain/commerce/commerce-agent');
console.log('=== P12.1 Commerce Domain Tests ===\n');
t('create mission',function(){var r=ca.createCommerceMission({text:'GMV分析'});a(r.success);a(r.mission.nodes.length===8);});
t('capabilities count',function(){a(ca.CAPABILITIES.length===8);});
t('run daily',function(){var r=ca.runDailyAnalysis();a(r.success);a(r.report.GMV==='待获取');});
t('get report',function(){var r=ca.runDailyAnalysis();a(ca.getReport(r.report.mission_id).success);});
t('get nonexistent',function(){a(!ca.getReport('x').success);});
T.forEach(function(t){try{t.fn();P++;console.log('PASS: '+t.name);}catch(e){F++;console.log('FAIL: '+t.name);}});
console.log('Results: '+P+'/'+(P+F)+' passed');if(F)process.exit(1);
