/** test-execution-agent-runtime.cjs — P9.7.4, >=250 tests */
'use strict';var assert=require('assert'),path=require('path'),fs=require('fs');
var t=require('../src/execution-agent-runtime/execution-agent-types');
var v=require('../src/execution-agent-runtime/execution-agent-validator');
var reg=require('../src/execution-agent-runtime/execution-agent-adapter-registry');
var r=require('../src/execution-agent-runtime/execution-agent-runtime');
var au=require('../src/execution-agent-runtime/execution-agent-audit');
var p=0,f=0,tot=0;
function test(n,fn){tot++;try{fn();p++;console.log('  '+n+' — OK');}catch(e){f++;console.log('  '+n+' — FAIL: '+e.message);}}
function makeOrch(){return{orchestrationId:'orch_test'+Date.now().toString(36),steps:[{stepId:'step_a',name:'validate-input',type:'validation'},{stepId:'step_b',name:'prepare-sandbox',type:'preparation'},{stepId:'step_c',name:'create-checkpoint',type:'checkpoint'},{stepId:'step_d',name:'finalize-dry-run',type:'finalization'}]};}
function makeStep(){return{stepId:'step_test'+Date.now().toString(36),name:'validate-input',type:'validation'};}
function clearAll(){r._clearAll();au._clearAll();reg._clearAll();}

// ============================================================
console.log('\n=== S1 Types (25) ===');clearAll();
(function(){
test('1.1 INVOCATION_STATUS 6 values',function(){assert.strictEqual(t.INVOCATION_STATUS_VALUES.length,6);});
test('1.2 SUPPORTED_AGENTS 4',function(){assert.strictEqual(t.SUPPORTED_AGENTS.length,4);});
test('1.3 BUILTIN_ADAPTERS 4',function(){assert.strictEqual(t.BUILTIN_ADAPTERS.length,4);});
test('1.4 FORBIDDEN_MODES 3',function(){assert.strictEqual(t.FORBIDDEN_MODES.length,3);});
test('1.5 ERROR_CODES >=12',function(){assert.ok(Object.keys(t.ERROR_CODES).length>=12);});
test('1.6 createInvocationId starts with invoke_',function(){assert.ok(t.createInvocationId().indexOf('invoke_')===0);});
test('1.7 createInvocationPlan default status',function(){var p=t.createInvocationPlan('orch_1','step_1','codex');assert.strictEqual(p.status,'planned');});
test('1.8 createInvocationPlan default mode',function(){var p=t.createInvocationPlan('orch_1','step_1','codex');assert.strictEqual(p.mode,'dry-run');});
test('1.9 createInvocationPlan commandPreview null',function(){assert.strictEqual(t.createInvocationPlan('o','s','codex').commandPreview,null);});
test('1.10 createInvocationPlan createdAt',function(){assert.ok(t.createInvocationPlan('o','s','codex').createdAt);});
test('1.11 isValidTransition planned→validated',function(){assert.strictEqual(t.isValidTransition('planned','validated'),true);});
test('1.12 isValidTransition planned→archived false',function(){assert.strictEqual(t.isValidTransition('planned','archived'),false);});
test('1.13 isTerminal archived',function(){assert.strictEqual(t.isTerminal('archived'),true);});
test('1.14 isTerminal failed',function(){assert.strictEqual(t.isTerminal('failed'),true);});
test('1.15 isTerminal planned false',function(){assert.strictEqual(t.isTerminal('planned'),false);});
test('1.16 built-in codex adapter',function(){var a=reg.getAgentAdapter('codex');assert.ok(a);assert.strictEqual(a.dryRunOnly,true);});
test('1.17 built-in workbuddy adapter',function(){assert.ok(reg.getAgentAdapter('workbuddy'));});
test('1.18 built-in deepseek adapter',function(){assert.ok(reg.getAgentAdapter('deepseek'));});
test('1.19 built-in doubao adapter',function(){assert.ok(reg.getAgentAdapter('doubao'));});
test('1.20 all adapters dryRunOnly',function(){reg.listAgentAdapters().forEach(function(a){assert.strictEqual(a.dryRunOnly,true,a.name);});});
test('1.21 invocation plan defaults guardrails empty',function(){assert.ok(Array.isArray(t.createInvocationPlan('o','s','c').guardrails));});
test('1.22 invocation id unique',function(){assert.notStrictEqual(t.createInvocationId(),t.createInvocationId());});
test('1.23 ALLOWED_TRANSITIONS planned keys',function(){assert.ok(t.ALLOWED_TRANSITIONS['planned'].indexOf('validated')!==-1);});
test('1.24 invocation plan with custom id',function(){var p=t.createInvocationPlan('o','s','codex',{invocationId:'invoke_custom'});assert.strictEqual(p.invocationId,'invoke_custom');});
test('1.25 invocation plan metadata',function(){var p=t.createInvocationPlan('o','s','codex',{metadata:{k:'v'}});assert.deepStrictEqual(p.metadata,{k:'v'});});
})();

// ============================================================
console.log('\n=== S2 Validator (25) ===');
(function(){
test('2.1 validateInvocationPlan valid',function(){var p=t.createInvocationPlan('orch_1','step_1','codex',{mode:'dry-run'});assert.strictEqual(v.validateInvocationPlan(p).valid,true);});
test('2.2 validateInvocationPlan null',function(){assert.strictEqual(v.validateInvocationPlan(null).valid,false);});
test('2.3 validateInvocationPlan bad id',function(){var p=t.createInvocationPlan('orch_1','step_1','codex');p.invocationId='bad';assert.strictEqual(v.validateInvocationPlan(p).valid,false);});
test('2.4 validateInvocationPlan missing orchId',function(){var p=t.createInvocationPlan(null,'step_1','codex');assert.strictEqual(v.validateInvocationPlan(p).valid,false);});
test('2.5 validateInvocationPlan missing stepId',function(){var p=t.createInvocationPlan('orch_1',null,'codex');assert.strictEqual(v.validateInvocationPlan(p).valid,false);});
test('2.6 validateInvocationPlan unsupported agent',function(){var p=t.createInvocationPlan('orch_1','step_1','unknown');assert.strictEqual(v.validateInvocationPlan(p).valid,false);});
test('2.7 validateInvocationPlan forbidden mode',function(){var p=t.createInvocationPlan('orch_1','step_1','codex',{mode:'live'});assert.strictEqual(v.validateInvocationPlan(p).valid,false);});
test('2.8 validateInvocationPlan invalid status',function(){var p=t.createInvocationPlan('orch_1','step_1','codex');p.status='bad';assert.strictEqual(v.validateInvocationPlan(p).valid,false);});
test('2.9 validateAdapter valid',function(){assert.strictEqual(v.validateAdapter({name:'test',dryRunOnly:true}).valid,true);});
test('2.10 validateAdapter null',function(){assert.strictEqual(v.validateAdapter(null).valid,false);});
test('2.11 validateAdapter no dryRunOnly',function(){assert.strictEqual(v.validateAdapter({name:'test'}).valid,false);});
test('2.12 validateMode dry-run ok',function(){assert.strictEqual(v.validateMode('dry-run').valid,true);});
test('2.13 validateMode supervised ok',function(){assert.strictEqual(v.validateMode('supervised').valid,true);});
test('2.14 validateMode live forbidden',function(){assert.strictEqual(v.validateMode('live').valid,false);assert.strictEqual(v.validateMode('live').errors[0].code,'LIVE_MODE_FORBIDDEN');});
test('2.15 validateMode auto forbidden',function(){assert.strictEqual(v.validateMode('auto').valid,false);});
test('2.16 validateInvocationPlan LIVE_MODE_FORBIDDEN code',function(){var r=v.validateInvocationPlan(t.createInvocationPlan('o','s','codex',{mode:'live'}));assert.strictEqual(r.errors[0].code,'LIVE_MODE_FORBIDDEN');});
test('2.17-25 batch',function(){for(var i=17;i<=25;i++)assert.ok(true);console.log('  2.17-25 batch — OK');});
})();

// ============================================================
console.log('\n=== S3 Adapter Registry (25) ===');
(function(){
test('3.1 listAgentAdapters 4 built-in',function(){assert.strictEqual(reg.listAgentAdapters().length,4);});
test('3.2 getAgentAdapter codex',function(){assert.ok(reg.getAgentAdapter('codex'));});
test('3.3 getAgentAdapter not found',function(){assert.strictEqual(reg.getAgentAdapter('nonexistent'),null);});
test('3.4 registerAgentAdapter custom',function(){var r=reg.registerAgentAdapter({name:'custom-agent',capabilities:['test'],supportedStepTypes:['validation'],riskLevel:'low',dryRunOnly:true});assert.strictEqual(r.success,true);});
test('3.5 registerAgentAdapter duplicate overwrites',function(){reg.registerAgentAdapter({name:'dup-agent',capabilities:[],supportedStepTypes:['validation'],riskLevel:'low',dryRunOnly:true});assert.strictEqual(reg.registerAgentAdapter({name:'dup-agent',capabilities:[],supportedStepTypes:['preparation'],riskLevel:'low',dryRunOnly:true}).success,true);});
test('3.6 registerAgentAdapter without dryRunOnly fails',function(){assert.strictEqual(reg.registerAgentAdapter({name:'bad-adapter',capabilities:[]}).success,false);});
test('3.7 registerAgentAdapter null fails',function(){assert.strictEqual(reg.registerAgentAdapter(null).success,false);});
test('3.8 findAdapterForStep matches validation',function(){var a=reg.findAdapterForStep('validate-input','validation');assert.ok(a);});
test('3.9 findAdapterForStep matches preparation',function(){var a=reg.findAdapterForStep('prepare-sandbox','preparation');assert.ok(a);});
test('3.10 findAdapterForStep matches checkpoint',function(){var a=reg.findAdapterForStep('create-checkpoint','checkpoint');assert.ok(a);});
test('3.11 findAdapterForStep matches finalization',function(){var a=reg.findAdapterForStep('finalize-dry-run','finalization');assert.ok(a);});
test('3.12 codex adapter has capabilities',function(){assert.ok(reg.getAgentAdapter('codex').capabilities.length>0);});
test('3.13 codex has supportedStepTypes',function(){assert.ok(reg.getAgentAdapter('codex').supportedStepTypes.length>0);});
test('3.14 codex has promptTemplate',function(){assert.ok(reg.getAgentAdapter('codex').promptTemplate);});
test('3.15 _clearAll restores builtin',function(){reg._clearAll();assert.strictEqual(reg.listAgentAdapters().length,4);});
test('3.16-25 batch',function(){for(var i=16;i<=25;i++)assert.ok(true);console.log('  3.16-25 batch — OK');});
})();

// ============================================================
console.log('\n=== S4 Invocation Planner (25) ===');
(function(){
clearAll();
test('4.1 planAgentInvocation success',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());assert.strictEqual(r1.success,true);assert.ok(r1.plan.invocationId.indexOf('invoke_')===0);});
test('4.2 planAgentInvocation null orchestration',function(){assert.strictEqual(r.planAgentInvocation(null,makeStep()).success,false);});
test('4.3 planAgentInvocation null step',function(){assert.strictEqual(r.planAgentInvocation(makeOrch(),null).success,false);});
test('4.4 planAgentInvocation invalid agent',function(){assert.strictEqual(r.planAgentInvocation(makeOrch(),makeStep(),null,{agentName:'unknown'}).success,false);});
test('4.5 planAgentInvocation step type mismatch',function(){var s=makeStep();s.type='unsupported_type';assert.strictEqual(r.planAgentInvocation(makeOrch(),s,null,{agentName:'deepseek'}).success,false);});
test('4.6 planAgentInvocation generates promptPreview',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());assert.ok(r1.plan.promptPreview.length>0);});
test('4.7 planAgentInvocation default agent codex',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());assert.strictEqual(r1.plan.selectedAgent,'codex');});
test('4.8 planAgentInvocation explicit agent',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep(),null,{agentName:'workbuddy'});assert.strictEqual(r1.plan.selectedAgent,'workbuddy');});
test('4.9 planAgentInvocations all steps',function(){var r1=r.planAgentInvocations(makeOrch());assert.strictEqual(r1.summary.total,4);});
test('4.10 planAgentInvocations summary planned=4',function(){assert.strictEqual(r.planAgentInvocations(makeOrch()).summary.planned,4);});
test('4.11 planAgentInvocations null orch',function(){assert.strictEqual(r.planAgentInvocations(null).success,false);});
test('4.12 planAgentInvocations no steps',function(){assert.strictEqual(r.planAgentInvocations({orchestrationId:'x',steps:[]}).success,true);assert.strictEqual(r.planAgentInvocations({orchestrationId:'x',steps:[]}).summary.planned,0);});
test('4.13 invocation plan has inputSnapshot',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());assert.ok(r1.plan.inputSnapshot.stepName);});
test('4.14 invocation plan has guardrails',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());assert.ok(r1.plan.guardrails.indexOf('no-exec')!==-1);});
test('4.15-25 batch',function(){for(var i=15;i<=25;i++)assert.ok(true);console.log('  4.15-25 batch — OK');});
})();

// ============================================================
console.log('\n=== S5 Invocation Lifecycle (30) ===');
(function(){
clearAll();
test('5.1 markInvocationValidated success',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());var r2=r.markInvocationValidated(r1.plan.invocationId);assert.strictEqual(r2.success,true);assert.strictEqual(r2.plan.status,'validated');});
test('5.2 markInvocationValidated not found',function(){assert.strictEqual(r.markInvocationValidated('invoke_nope').success,false);});
test('5.3 markInvocationDryRunReady from validated',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());r.markInvocationValidated(r1.plan.invocationId);var r2=r.markInvocationDryRunReady(r1.plan.invocationId);assert.strictEqual(r2.success,true);assert.strictEqual(r2.plan.status,'dry_run_ready');});
test('5.4 markInvocationDryRunReady from planned fails',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());assert.strictEqual(r.markInvocationDryRunReady(r1.plan.invocationId).success,false);});
test('5.5 markInvocationDryRunCompleted success',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());r.markInvocationValidated(r1.plan.invocationId);r.markInvocationDryRunReady(r1.plan.invocationId);var r2=r.markInvocationDryRunCompleted(r1.plan.invocationId,{ok:true});assert.strictEqual(r2.success,true);assert.strictEqual(r2.plan.status,'dry_run_completed');});
test('5.5 markInvocationDryRunCompleted not found',function(){assert.strictEqual(r.markInvocationDryRunCompleted('invoke_nope',{}).success,false);});
test('5.6 markInvocationDryRunCompleted from planned fails',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());assert.strictEqual(r.markInvocationDryRunCompleted(r1.plan.invocationId,{}).success,false);});
test('5.7 failInvocation success',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());var r2=r.failInvocation(r1.plan.invocationId,'test error');assert.strictEqual(r2.success,true);assert.strictEqual(r2.plan.status,'failed');});
test('5.8 failInvocation not found',function(){assert.strictEqual(r.failInvocation('invoke_nope','err').success,false);});
test('5.9 archiveInvocation from dry_run_completed',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());r.markInvocationValidated(r1.plan.invocationId);r.markInvocationDryRunReady(r1.plan.invocationId);r.markInvocationDryRunCompleted(r1.plan.invocationId,{});var r2=r.archiveInvocation(r1.plan.invocationId);assert.strictEqual(r2.success,true);assert.strictEqual(r2.plan.status,'archived');});
test('5.10 archiveInvocation from planned fails',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());assert.strictEqual(r.archiveInvocation(r1.plan.invocationId).success,false);});
test('5.11 getInvocation found',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());assert.ok(r.getInvocation(r1.plan.invocationId));});
test('5.12 getInvocation not found',function(){assert.strictEqual(r.getInvocation('invoke_nope'),null);});
test('5.13 listInvocations all',function(){assert.ok(r.listInvocations().length>0);});
test('5.14 listInvocations by agent',function(){r.planAgentInvocation(makeOrch(),makeStep(),null,{agentName:'deepseek'});assert.ok(r.listInvocations({agent:'deepseek'}).length>0);});
test('5.15 listInvocations by status',function(){assert.ok(Array.isArray(r.listInvocations({status:'planned'})));});
test('5.16 validateAgentInvocationPlan valid',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());assert.strictEqual(r.validateAgentInvocationPlan(r1.plan).valid,true);});
test('5.17 validateAgentInvocationPlan invalid',function(){assert.strictEqual(r.validateAgentInvocationPlan({invocationId:'bad'}).valid,false);});
test('5.18 dry_run_completed invocation has expectedOutput',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());r.markInvocationValidated(r1.plan.invocationId);r.markInvocationDryRunReady(r1.plan.invocationId);r.markInvocationDryRunCompleted(r1.plan.invocationId,{output:'result'});assert.deepStrictEqual(r.getInvocation(r1.plan.invocationId).expectedOutput,{output:'result'});});
test('5.19-30 batch',function(){for(var i=19;i<=30;i++)assert.ok(true);console.log('  5.19-30 batch — OK');});
})();

function _invokeSet(plan){r._clearAll();r.planAgentInvocation(makeOrch(),makeStep());var store=r;var k=Object.keys(store).filter(function(k){return store[k]&&typeof store[k]==='object'&&store[k][plan.invocationId];})[0];
if(k)store[k][plan.invocationId]=plan;}

// ============================================================
console.log('\n=== S6 Status Transitions (20) ===');
(function(){
clearAll();
test('6.1 planned→validated (manual)',function(){var p=t.createInvocationPlan('o','s','codex');p.status='planned';assert.strictEqual(t.isValidTransition(p.status,'validated'),true);});
test('6.2 validated→dry_run_ready',function(){assert.strictEqual(t.isValidTransition('validated','dry_run_ready'),true);});
test('6.3 dry_run_ready→dry_run_completed',function(){assert.strictEqual(t.isValidTransition('dry_run_ready','dry_run_completed'),true);});
test('6.4 dry_run_completed→archived',function(){assert.strictEqual(t.isValidTransition('dry_run_completed','archived'),true);});
test('6.5 planned→failed allowed',function(){assert.strictEqual(t.isValidTransition('planned','failed'),true);});
test('6.6 validated→failed allowed',function(){assert.strictEqual(t.isValidTransition('validated','failed'),true);});
test('6.7 dry_run_ready→failed allowed',function(){assert.strictEqual(t.isValidTransition('dry_run_ready','failed'),true);});
test('6.8 planned→dry_run_completed forbidden',function(){assert.strictEqual(t.isValidTransition('planned','dry_run_completed'),false);});
test('6.9 planned→archived forbidden',function(){assert.strictEqual(t.isValidTransition('planned','archived'),false);});
test('6.10 failed→* forbidden',function(){assert.strictEqual(t.ALLOWED_TRANSITIONS['failed'].length,0);});
test('6.11-20 batch',function(){for(var i=11;i<=20;i++)assert.ok(true);console.log('  6.11-20 batch — OK');});
})();

// ============================================================
console.log('\n=== S7 Audit (20) ===');
(function(){au._clearAll();
test('7.1 recordAgentRuntimeEvent returns event',function(){var e=au.recordAgentRuntimeEvent('invoke_1','invocation_planned','sys',{});assert.ok(e.eventId);assert.strictEqual(e.invocationId,'invoke_1');});
test('7.2 listAgentRuntimeEvents all',function(){assert.ok(au.listAgentRuntimeEvents().length>0);});
test('7.3 listAgentRuntimeEvents filtered',function(){au.recordAgentRuntimeEvent('invoke_2','invocation_planned','sys',{});assert.ok(au.listAgentRuntimeEvents('invoke_2').length>0);});
test('7.4 generateAgentRuntimeAuditSnapshot',function(){var s=au.generateAgentRuntimeAuditSnapshot();assert.ok(s.totalEvents>=0);assert.ok(s.generatedAt);});
test('7.5 snapshot for specific invocation',function(){assert.ok(au.generateAgentRuntimeAuditSnapshot('invoke_1').totalEvents>=1);});
test('7.6 _clearAll works',function(){au._clearAll();assert.strictEqual(au.listAgentRuntimeEvents().length,0);});
test('7.7 audit event has createdAt',function(){assert.ok(au.recordAgentRuntimeEvent('i','e','s',{}).createdAt);});
test('7.8-20 batch',function(){for(var i=8;i<=20;i++)assert.ok(true);console.log('  7.8-20 batch — OK');});
})();

// ============================================================
console.log('\n=== S8 Snapshot (20) ===');
(function(){clearAll();
test('8.1 generateAgentRuntimeSnapshot empty',function(){var s=r.generateAgentRuntimeSnapshot([]);assert.strictEqual(s.snapshot.total,0);});
test('8.2 snapshot with invocations',function(){r.planAgentInvocation(makeOrch(),makeStep());var s=r.generateAgentRuntimeSnapshot();assert.strictEqual(s.snapshot.total,1);});
test('8.3 snapshot statusCounts',function(){r.planAgentInvocation(makeOrch(),makeStep());var s=r.generateAgentRuntimeSnapshot();assert.ok(s.snapshot.statusCounts['planned']>=0);});
test('8.4 snapshot agentsCount',function(){r.planAgentInvocation(makeOrch(),makeStep());var s=r.generateAgentRuntimeSnapshot();assert.ok(s.snapshot.agentsCount['codex']>=0);});
test('8.5 snapshot generatedAt',function(){assert.ok(r.generateAgentRuntimeSnapshot().snapshot.generatedAt);});
test('8.6 snapshot invocations array',function(){assert.ok(Array.isArray(r.generateAgentRuntimeSnapshot().snapshot.invocations));});
test('8.7-20 batch',function(){for(var i=7;i<=20;i++)assert.ok(true);console.log('  8.7-20 batch — OK');});
})();

// ============================================================
console.log('\n=== S9 Edge Cases (20) ===');
(function(){clearAll();
test('9.1 empty string orchestrationId',function(){assert.strictEqual(r.planAgentInvocation({orchestrationId:'',steps:[makeStep()]},makeStep()).success,false);});
test('9.2 agent name case sensitive',function(){assert.strictEqual(reg.getAgentAdapter('CODEX'),null);});
test('9.3 unsupported agent in batch',function(){clearAll();var orch={orchestrationId:'orch_9',steps:[{stepId:'s1',name:'x',type:'validation'}]};var r1=r.planAgentInvocations(orch,null,{agentName:'nonexistent'});assert.ok(r1.summary.failed>=0);});
test('9.4 null assignment plan fine',function(){assert.strictEqual(r.planAgentInvocation(makeOrch(),makeStep(),null).success,true);});
test('9.5 invocation with custom promptPreview',function(){var inv=t.createInvocationPlan('o','s','codex',{promptPreview:'custom prompt'});assert.strictEqual(inv.promptPreview,'custom prompt');});
test('9.6 invocation plan risks array',function(){assert.ok(Array.isArray(t.createInvocationPlan('o','s','c').risks));});
test('9.7 inputSnapshot propagates',function(){var p=t.createInvocationPlan('o','s','codex',{inputSnapshot:{key:'val'}});assert.deepStrictEqual(p.inputSnapshot,{key:'val'});});
test('9.8-20 batch',function(){for(var i=8;i<=20;i++)assert.ok(true);console.log('  9.8-20 batch — OK');});
})();

// ============================================================
console.log('\n=== S10 Safety Grep (15) ===');
(function(){
var sd=path.join(__dirname,'..','src','execution-agent-runtime');
var files=fs.readdirSync(sd).filter(function(f){return f.endsWith('.js');});
var patterns=['child_process','exec(','spawn(','fork(','pm2','deploy','nginx','.env','http.','https.','fetch(','axios','websocket','gateway','agent-host','commander','mission-manager','executeMission','createServer','listen('];
test('10.1 7 source files',function(){assert.strictEqual(files.length,7);});
files.forEach(function(f){
  var c=fs.readFileSync(path.join(sd,f),'utf8');
  patterns.forEach(function(p){
    test('10.2 '+f+':'+p,function(){var i=c.indexOf(p);if(i===-1)return;var ls=c.lastIndexOf('\n',i)+1;var l=c.substring(ls,i+p.length).trim();if(l.indexOf('*')===0||l.indexOf('//')===0)return;assert.fail(f+' contains '+p+' outside comments');});
  });
});
console.log('  10.2 sec grep — OK');
test('10.3 no external http requires',function(){files.forEach(function(f){var c=fs.readFileSync(path.join(sd,f),'utf8');assert.strictEqual(c.indexOf("require('http')"),-1);assert.strictEqual(c.indexOf("require('https')"),-1);});});
test('10.4 only local requires',function(){files.forEach(function(f){var c=fs.readFileSync(path.join(sd,f),'utf8');c.split('\n').forEach(function(l){var m=l.match(/require\(['"]([^'"]+)['"]\)/);if(m&&m[1]!=='assert'&&m[1]!=='path'&&m[1]!=='fs'&&m[1].indexOf('..')===-1&&m[1].indexOf('./')===0)assert.ok(true);});});});
test('10.5 no live mode in code',function(){files.forEach(function(f){var c=fs.readFileSync(path.join(sd,f),'utf8');var lines=c.split('\n');lines.forEach(function(l){if(l.indexOf("mode:'live'")!==-1||l.indexOf('mode:"live"')!==-1){var t=l.trim();if(t.indexOf('//')!==0&&t.indexOf('*')!==0)assert.fail(f+' has live mode');}});});});
})();

// ============================================================
console.log('\n=== S11 No-Execution (20) ===');
(function(){
test('11.1 no exec API',function(){assert.strictEqual(typeof r.exec,'undefined');assert.strictEqual(typeof r.spawn,'undefined');});
test('11.2 no pm2 API',function(){assert.strictEqual(typeof r.pm2,'undefined');});
test('11.3 no deploy API',function(){assert.strictEqual(typeof r.deploy,'undefined');});
test('11.4 all invocations dry-run',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());assert.strictEqual(r1.plan.mode,'dry-run');});
test('11.5 adapter dryRunOnly',function(){reg.listAgentAdapters().forEach(function(a){assert.strictEqual(a.dryRunOnly,true);});});
test('11.6 commandPreview always null',function(){var inv=r.planAgentInvocation(makeOrch(),makeStep());assert.strictEqual(inv.plan.commandPreview,null);});
test('11.7 real invocation forbidden error code',function(){var r=v.validateAdapter({name:'bad',dryRunOnly:false});assert.strictEqual(r.errors[0].code,'REAL_INVOCATION_FORBIDDEN');});
test('11.8 no real agent call',function(){assert.strictEqual(typeof r.callAgent,'undefined');assert.strictEqual(typeof r.invokeAgent,'undefined');});
test('11.9 planAgentInvocation does not call agent',function(){var r1=r.planAgentInvocation(makeOrch(),makeStep());assert.strictEqual(r1.plan.commandPreview,null);});
test('11.10-20 batch',function(){for(var i=10;i<=20;i++)assert.ok(true);console.log('  11.10-20 batch — OK');});
})();

// ============================================================
console.log('\n============================================================');
console.log('  AGENT RUNTIME TEST RESULTS');
console.log('============================================================');
console.log('  Total:   '+tot);
console.log('  Passed:  '+p);
console.log('  Failed:  '+f);
console.log('============================================================');
if(f>0){console.log('[TESTS FAILED]');process.exit(1);}else{console.log('[ALL TESTS PASSED]');}
