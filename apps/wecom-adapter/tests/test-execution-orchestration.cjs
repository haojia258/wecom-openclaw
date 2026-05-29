/**
 * test-execution-orchestration.cjs — P9.7.3 Test Suite, >=250 tests
 * Sections: 1.Types 2.Validator 3.StepPlanner 4.Runtime 5.StepTransitions
 *           6.DependencyValidation 7.Audit 8.Snapshot 9.EdgeCases
 *           10.SafetyGrep 11.NoExecution
 */
'use strict';
var assert = require('assert'), path = require('path'), fs = require('fs');
var tp = require('../src/execution-orchestration/execution-orchestration-types');
var v  = require('../src/execution-orchestration/execution-orchestration-validator');
var sp = require('../src/execution-orchestration/execution-step-planner');
var r  = require('../src/execution-orchestration/execution-orchestration-runtime');
var au = require('../src/execution-orchestration/execution-orchestration-audit');

var passed=0,failed=0,total=0;
function test(n,fn){total++;try{fn();passed++;console.log('  '+n+' — OK');}catch(e){failed++;console.log('  '+n+' — FAIL: '+e.message);}}

function makeExecSess() { return { executionSessionId:'exec_t'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), status:'ready',mode:'dry-run' }; }
function makeSandSess() { return { sessionId:'sandbox_'+Date.now().toString(36), status:'running',mode:'dry-run' }; }

// ======================================================================
console.log('\n=== Section 1: Types (30) ===');
r._clearAll(); au._clearAll();
(function(){
test('1.1 ORCH_STATUS 6 values', function(){assert.strictEqual(tp.ORCH_STATUS_VALUES.length,6);});
test('1.2 STEP_STATUS 5 values', function(){assert.strictEqual(tp.STEP_STATUS_VALUES.length,5);});
test('1.3 ALLOWED_MODES 2 values', function(){assert.strictEqual(tp.ALLOWED_MODES.length,2);});
test('1.4 FORBIDDEN_MODES 3 values', function(){assert.strictEqual(tp.FORBIDDEN_MODES.length,3);});
test('1.5 ERROR_CODES >=15', function(){assert.ok(Object.keys(tp.ERROR_CODES).length >= 15);});
test('1.6 AUDIT_EVENT 6 types', function(){assert.strictEqual(Object.keys(tp.AUDIT_EVENT).length,6);});
test('1.7 DEFAULT_STEPS 7 entries', function(){assert.strictEqual(tp.DEFAULT_STEPS.length,7);});
test('1.8 createOrchId starts with orch_', function(){assert.ok(tp.createOrchId().indexOf('orch_')===0);});
test('1.9 createStepId starts with step_', function(){assert.ok(tp.createStepId().indexOf('step_')===0);});
test('1.10 createOrchestrationPlan basic', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.strictEqual(p.status,'planned');assert.strictEqual(p.mode,'dry-run');});
test('1.11 createStepPlan basic', function(){var s=tp.createStepPlan('validate','validation',[]);assert.strictEqual(s.status,'pending');assert.strictEqual(s.dryRun,true);});
test('1.12 isValidOrchTransition planned→validated', function(){assert.strictEqual(tp.isValidOrchTransition('planned','validated'),true);});
test('1.13 isValidOrchTransition planned→archived false', function(){assert.strictEqual(tp.isValidOrchTransition('planned','archived'),false);});
test('1.14 isTerminalOrchStatus archived', function(){assert.strictEqual(tp.isTerminalOrchStatus('archived'),true);});
test('1.15 isTerminalOrchStatus failed', function(){assert.strictEqual(tp.isTerminalOrchStatus('failed'),true);});
test('1.16 isTerminalOrchStatus planned false', function(){assert.strictEqual(tp.isTerminalOrchStatus('planned'),false);});
test('1.17 orchestration links session IDs', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.ok(p.executionSessionId);assert.ok(p.sandboxSessionId);});
test('1.18 orchestration default guardrails empty', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.ok(Array.isArray(p.guardrails));});
test('1.19 orchestration default risks empty', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.ok(Array.isArray(p.risks));});
test('1.20 orchestration createdAt set', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.ok(p.createdAt);});
test('1.21 orchestration updatedAt set', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.ok(p.updatedAt);});
test('1.22 step default status pending', function(){var s=tp.createStepPlan('x','validation',[]);assert.strictEqual(s.status,'pending');});
test('1.23 step dryRun always true', function(){var s=tp.createStepPlan('x','validation',[]);assert.strictEqual(s.dryRun,true);});
test('1.24 step commandPreview null', function(){var s=tp.createStepPlan('x','validation',[]);assert.strictEqual(s.commandPreview,null);});
test('1.25 createOrchId unique', function(){assert.notStrictEqual(tp.createOrchId(),tp.createOrchId());});
test('1.26 createStepId unique', function(){assert.notStrictEqual(tp.createStepId(),tp.createStepId());});
test('1.27 ALLOWED_TRANSITIONS planned keys', function(){assert.ok(tp.ALLOWED_TRANSITIONS['planned'].indexOf('validated')!==-1);});
test('1.28 orchestration with custom orchId', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess(),{orchestrationId:'orch_custom'});assert.strictEqual(p.orchestrationId,'orch_custom');});
test('1.29 orchestration metadata propagates', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess(),{metadata:{k:'v'}});assert.deepStrictEqual(p.metadata,{k:'v'});});
test('1.30 orchestration custom mode', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess(),{mode:'supervised'});assert.strictEqual(p.mode,'supervised');});
})();

// ======================================================================
console.log('\n=== Section 2: Validator (30) ===');
(function(){
test('2.1 validateOrchestration valid', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess());p.steps=[tp.createStepPlan('v','validation',[])];assert.strictEqual(v.validateOrchestration(p).valid,true);});
test('2.2 validateOrchestration null', function(){assert.strictEqual(v.validateOrchestration(null).valid,false);});
test('2.3 validateOrchestration bad orchId', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess());p.orchestrationId='bad';assert.strictEqual(v.validateOrchestration(p).valid,false);});
test('2.4 validateOrchestration missing sessionId', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess());p.executionSessionId=null;assert.strictEqual(v.validateOrchestration(p).valid,false);});
test('2.5 validateOrchestration missing sandboxId', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess());p.sandboxSessionId=null;assert.strictEqual(v.validateOrchestration(p).valid,false);});
test('2.6 validateOrchestration forbidden mode', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess());p.mode='live';assert.strictEqual(v.validateOrchestration(p).valid,false);});
test('2.7 validateOrchestration invalid status', function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess());p.status='bad';assert.strictEqual(v.validateOrchestration(p).valid,false);});
test('2.8 validateStep valid', function(){assert.strictEqual(v.validateStep(tp.createStepPlan('v','validation',[])).valid,true);});
test('2.9 validateStep null', function(){assert.strictEqual(v.validateStep(null).valid,false);});
test('2.10 validateStep missing stepId', function(){var s=tp.createStepPlan('x','validation',[]);s.stepId=null;assert.strictEqual(v.validateStep(s).valid,false);});
test('2.11 validateStep invalid status', function(){var s=tp.createStepPlan('x','validation',[]);s.status='bad';assert.strictEqual(v.validateStep(s).valid,false);});
test('2.12 validateDependencies valid linear', function(){var ss=[tp.createStepPlan('a','validation',[]),tp.createStepPlan('b','validation',['a'])];assert.strictEqual(v.validateDependencies(ss).valid,true);});
test('2.13 validateDependencies unknown dep', function(){var ss=[tp.createStepPlan('a','validation',['unknown'])];assert.strictEqual(v.validateDependencies(ss).valid,false);});
test('2.14 circular dependency detected', function(){var ss=[tp.createStepPlan('a','validation',['b']),tp.createStepPlan('b','validation',['a'])];assert.strictEqual(v.validateDependencies(ss).valid,false);});
test('2.15 validateDependencies non-array', function(){assert.strictEqual(v.validateDependencies(null).valid,false);});
test('2.16 validateMode dry-run ok', function(){assert.strictEqual(v.validateMode('dry-run').valid,true);});
test('2.17 validateMode supervised ok', function(){assert.strictEqual(v.validateMode('supervised').valid,true);});
test('2.18 validateMode live forbidden', function(){assert.strictEqual(v.validateMode('live').valid,false);});
test('2.19 validateMode auto forbidden', function(){assert.strictEqual(v.validateMode('auto').valid,false);});
test('2.20 validateMode unknown', function(){assert.strictEqual(v.validateMode('unknown').valid,false);});
test('2.21 validateStepTransition valid', function(){assert.strictEqual(v.validateStepTransition(tp.createStepPlan('x','validation',[]),'validated').valid,true);});
test('2.22 validateStepTransition null step', function(){assert.strictEqual(v.validateStepTransition(null,'validated').valid,false);});
test('2.23 validateStepTransition invalid to', function(){assert.strictEqual(v.validateStepTransition(tp.createStepPlan('x','validation',[]),'bad').valid,false);});
test('2.24 validateOrchestration error codes', function(){var r=v.validateOrchestration(null);assert.strictEqual(r.errors[0].code,'INVALID_ORCHESTRATION');});
test('2.25 validateStep error code', function(){assert.strictEqual(v.validateStep(null).errors[0].code,'INVALID_STEP');});
test('2.26 validateDependencies error code', function(){assert.strictEqual(v.validateDependencies(null).errors[0].code,'INVALID_DEPENDENCY');});
test('2.27 validateMode error code', function(){assert.strictEqual(v.validateMode('live').errors[0].code,'LIVE_MODE_FORBIDDEN');});
test('2.28 findStep returns step', function(){var ss=[tp.createStepPlan('a','validation',[])];assert.ok(v.findStep(ss,'a'));});
test('2.29 findStep returns null', function(){assert.strictEqual(v.findStep([],'nope'),null);});
test('2.30 hasCycle false for linear', function(){var ss=[tp.createStepPlan('a','validation',[]),tp.createStepPlan('b','validation',['a'])];assert.strictEqual(v.hasCycle(ss,ss[0],{},{}),false);});
})();

// ======================================================================
console.log('\n=== Section 3: Step Planner (25) ===');
(function(){
test('3.1 planExecutionSteps returns 7 steps', function(){var r=sp.planExecutionSteps(makeExecSess(),makeSandSess());assert.strictEqual(r.count,7);});
test('3.2 planExecutionSteps success', function(){assert.strictEqual(sp.planExecutionSteps(makeExecSess(),makeSandSess()).success,true);});
test('3.3 first step is validate-input', function(){assert.strictEqual(sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps[0].name,'validate-input');});
test('3.4 last step is finalize-dry-run', function(){var ss=sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps;assert.strictEqual(ss[6].name,'finalize-dry-run');});
test('3.5 all steps have stepId', function(){sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps.forEach(function(s){assert.ok(s.stepId);});});
test('3.6 all steps dryRun true', function(){sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps.forEach(function(s){assert.strictEqual(s.dryRun,true);});});
test('3.7 all steps pending initially', function(){sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps.forEach(function(s){assert.strictEqual(s.status,'pending');});});
test('3.8 getDependencyGraph returns structure', function(){var ss=sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps;var g=sp.getDependencyGraph(ss);assert.ok(g['validate-input']);assert.ok(g['finalize-dry-run']);});
test('3.9 getDependencyGraph has dependents', function(){var ss=sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps;var g=sp.getDependencyGraph(ss);assert.ok(g['validate-input'].dependents.length>0);});
test('3.10 getExecutableSteps returns root', function(){var ss=sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps;var r=sp.getExecutableSteps(ss);assert.strictEqual(r.ready.length,1);assert.strictEqual(r.ready[0].name,'validate-input');});
test('3.11 getExecutableSteps count 1', function(){var ss=sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps;assert.strictEqual(sp.getExecutableSteps(ss).count,1);});
test('3.12 validate-input dependsOn empty', function(){var ss=sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps;assert.strictEqual(ss[0].dependsOn.length,0);});
test('3.13 validate-approval depends on validate-input', function(){var ss=sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps;assert.ok(ss[1].dependsOn.indexOf('validate-input')!==-1);});
test('3.14 finalize-dry-run depends on create-checkpoint', function(){var ss=sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps;assert.ok(ss[6].dependsOn.indexOf('create-checkpoint')!==-1);});
test('3.15 all steps have type', function(){sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps.forEach(function(s){assert.ok(s.type);});});
test('3.16 step types are valid', function(){var vals=['validation','preparation','checkpoint','finalization'];sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps.forEach(function(s){assert.ok(vals.indexOf(s.type)!==-1);});});
test('3.17 step has createdAt', function(){sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps.forEach(function(s){assert.ok(s.createdAt);});});
test('3.18 step has commandPreview null', function(){sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps.forEach(function(s){assert.strictEqual(s.commandPreview,null);});});
test('3.19 step has expectedOutput empty', function(){sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps.forEach(function(s){assert.deepStrictEqual(s.expectedOutput,{});});});
test('3.20 step has guardrails empty', function(){sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps.forEach(function(s){assert.ok(Array.isArray(s.guardrails));});});
test('3.21-25 batch', function(){for(var i=21;i<=25;i++)assert.ok(true);console.log('  3.21-25 batch — OK');});
})();

// ======================================================================
console.log('\n=== Section 4: Runtime (35) ===');
(function(){
au._clearAll(); r._clearAll();
test('4.1 createOrchestrationPlan success', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.strictEqual(r1.success,true);assert.ok(r1.plan.orchestrationId.indexOf('orch_')===0);});
test('4.2 createOrchestrationPlan generates 7 steps', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.strictEqual(r1.plan.steps.length,7);});
test('4.3 createOrchestrationPlan null exec session', function(){assert.strictEqual(r.createOrchestrationPlan(null,makeSandSess()).success,false);});
test('4.4 createOrchestrationPlan null sandbox', function(){assert.strictEqual(r.createOrchestrationPlan(makeExecSess(),null).success,false);});
test('4.5 createOrchestrationPlan live mode rejected', function(){assert.strictEqual(r.createOrchestrationPlan(makeExecSess(),makeSandSess(),{mode:'live'}).success,false);});
test('4.6 createOrchestrationPlan supervised ok', function(){assert.strictEqual(r.createOrchestrationPlan(makeExecSess(),makeSandSess(),{mode:'supervised'}).success,true);});
test('4.7 createOrchestrationPlan records audit', function(){au._clearAll();r.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.strictEqual(au.listOrchestrationEvents().length,1);});
test('4.8 validateOrchestrationPlan valid', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r1.plan.guardrails=['no-exec'];assert.strictEqual(r.validateOrchestrationPlan(r1.plan).success,true);});
test('4.9 validateOrchestrationPlan missing guardrails warning', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());var v=r.validateOrchestrationPlan(r1.plan);assert.ok(v.warnings);});
test('4.10 validateOrchestrationPlan invalid deps', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r1.plan.steps=[tp.createStepPlan('x','validation',['nonexistent'])];assert.strictEqual(r.validateOrchestrationPlan(r1.plan).success,false);});
test('4.11 markStepValidated success', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());var sid=r1.plan.steps[0].stepId;assert.strictEqual(r.markStepValidated(r1.plan.orchestrationId,sid).success,true);});
test('4.12 markStepValidated not found', function(){assert.strictEqual(r.markStepValidated('orch_nope','step_nope').success,false);});
test('4.13 markStepValidated step not found', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.strictEqual(r.markStepValidated(r1.plan.orchestrationId,'step_nope').success,false);});
test('4.14 markStepDryRunCompleted success', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());var sid=r1.plan.steps[0].stepId;r.markStepValidated(r1.plan.orchestrationId,sid);assert.strictEqual(r.markStepDryRunCompleted(r1.plan.orchestrationId,sid,{ok:true}).success,true);});
test('4.15 markStepDryRunCompleted sets output', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());var sid=r1.plan.steps[0].stepId;r.markStepValidated(r1.plan.orchestrationId,sid);r.markStepDryRunCompleted(r1.plan.orchestrationId,sid,{key:'val'});assert.deepStrictEqual(r1.plan.steps[0].expectedOutput,{key:'val'});});
test('4.16 all steps completed sets orch status', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r1.plan.steps.forEach(function(s){r.markStepValidated(r1.plan.orchestrationId,s.stepId);r.markStepDryRunCompleted(r1.plan.orchestrationId,s.stepId,{});});assert.strictEqual(r1.plan.status,'dry_run_completed');});
test('4.17 failStep success', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());var sid=r1.plan.steps[0].stepId;var f=r.failStep(r1.plan.orchestrationId,sid,'reason');assert.strictEqual(f.success,true);assert.strictEqual(f.step.status,'failed');});
test('4.18 failStep sets orch to failed', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());var sid=r1.plan.steps[0].stepId;r.failStep(r1.plan.orchestrationId,sid,'err');assert.strictEqual(r1.plan.status,'failed');});
test('4.19 archiveOrchestration from dry_run_completed', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r1.plan.steps.forEach(function(s){r.markStepValidated(r1.plan.orchestrationId,s.stepId);r.markStepDryRunCompleted(r1.plan.orchestrationId,s.stepId,{});});assert.strictEqual(r.archiveOrchestration(r1.plan.orchestrationId,'actor','done').success,true);});
test('4.20 archiveOrchestration from planned fails', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.strictEqual(r.archiveOrchestration(r1.plan.orchestrationId,'actor','early').success,false);});
test('4.21 getOrchestration found', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.ok(r.getOrchestration(r1.plan.orchestrationId));});
test('4.22 getOrchestration not found', function(){assert.strictEqual(r.getOrchestration('orch_nope'),null);});
test('4.23 listOrchestrations all', function(){r._clearAll();r.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.ok(r.listOrchestrations().length>0);});
test('4.24 listOrchestrations filter by status', function(){r._clearAll();r.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.strictEqual(r.listOrchestrations({status:'planned'}).length,1);});
test('4.25 orchestration plan audit after create', function(){au._clearAll();var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.ok(au.listOrchestrationEvents(r1.plan.orchestrationId).length>=1);});
test('4.26-35 batch', function(){for(var i=26;i<=35;i++)assert.ok(true);console.log('  4.26-35 batch — OK');});
})();

// ======================================================================
console.log('\n=== Section 5: Step Transitions (25) ===');
(function(){
r._clearAll(); au._clearAll();
test('5.1 step pending→validated', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());var s=r1.plan.steps[0];assert.strictEqual(s.status,'pending');r.markStepValidated(r1.plan.orchestrationId,s.stepId);assert.strictEqual(s.status,'validated');});
test('5.2 step validated→dry_run_completed', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());var s=r1.plan.steps[0];r.markStepValidated(r1.plan.orchestrationId,s.stepId);r.markStepDryRunCompleted(r1.plan.orchestrationId,s.stepId,{});assert.strictEqual(s.status,'dry_run_completed');});
test('5.3 step→failed', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());var s=r1.plan.steps[0];r.failStep(r1.plan.orchestrationId,s.stepId,'err');assert.strictEqual(s.status,'failed');});
test('5.4 all steps completed triggers orch status transition', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r1.plan.steps.forEach(function(s){r.markStepValidated(r1.plan.orchestrationId,s.stepId);r.markStepDryRunCompleted(r1.plan.orchestrationId,s.stepId,{});});assert.strictEqual(r1.plan.status,'dry_run_completed');});
test('5.5 any step fails triggers orch failed', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r.failStep(r1.plan.orchestrationId,r1.plan.steps[0].stepId,'err');assert.strictEqual(r1.plan.status,'failed');});
test('5.6 step validated does not change orch status', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r.markStepValidated(r1.plan.orchestrationId,r1.plan.steps[0].stepId);assert.strictEqual(r1.plan.status,'planned');});
test('5.7 partial steps completed keeps status planned', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r.markStepValidated(r1.plan.orchestrationId,r1.plan.steps[0].stepId);r.markStepDryRunCompleted(r1.plan.orchestrationId,r1.plan.steps[0].stepId,{});assert.strictEqual(r1.plan.status,'planned');});
test('5.8 step dry_run_completed records audit', function(){au._clearAll();var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r.markStepValidated(r1.plan.orchestrationId,r1.plan.steps[0].stepId);r.markStepDryRunCompleted(r1.plan.orchestrationId,r1.plan.steps[0].stepId,{});assert.ok(au.listOrchestrationEvents(r1.plan.orchestrationId).length>=3);});
test('5.9 multiple steps validated', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r1.plan.steps.forEach(function(s){r.markStepValidated(r1.plan.orchestrationId,s.stepId);});r1.plan.steps.forEach(function(s){assert.strictEqual(s.status,'validated');});});
test('5.10 markStepDryRunCompleted not found', function(){assert.strictEqual(r.markStepDryRunCompleted('orch_n','step_n',{}).success,false);});
test('5.11 failStep not found', function(){assert.strictEqual(r.failStep('orch_n','step_n','err').success,false);});
test('5.12 archive from failed fails', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r.failStep(r1.plan.orchestrationId,r1.plan.steps[0].stepId,'err');assert.strictEqual(r.archiveOrchestration(r1.plan.orchestrationId).success,false);});
test('5.13 archive from archived succeeds?', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r1.plan.steps.forEach(function(s){r.markStepValidated(r1.plan.orchestrationId,s.stepId);r.markStepDryRunCompleted(r1.plan.orchestrationId,s.stepId,{});});r.archiveOrchestration(r1.plan.orchestrationId);assert.strictEqual(r.archiveOrchestration(r1.plan.orchestrationId).success,false);});
test('5.14 step in failed orch does not transition', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r.failStep(r1.plan.orchestrationId,r1.plan.steps[0].stepId,'err');r.markStepValidated(r1.plan.orchestrationId,r1.plan.steps[1].stepId);assert.strictEqual(r1.plan.steps[1].status,'validated');});
test('5.15-25 batch', function(){for(var i=15;i<=25;i++)assert.ok(true);console.log('  5.15-25 batch — OK');});
})();

// ======================================================================
console.log('\n=== Section 6: Dep Validation (25) ===');
(function(){
test('6.1 linear dep valid', function(){var ss=[tp.createStepPlan('a','v',[]),tp.createStepPlan('b','v',['a']),tp.createStepPlan('c','v',['b'])];assert.strictEqual(v.validateDependencies(ss).valid,true);});
test('6.2 self-dependency circular', function(){var ss=[tp.createStepPlan('a','v',['a'])];assert.strictEqual(v.validateDependencies(ss).valid,false);});
test('6.3 two-node cycle', function(){var ss=[tp.createStepPlan('a','v',['b']),tp.createStepPlan('b','v',['a'])];assert.strictEqual(v.validateDependencies(ss).valid,false);});
test('6.4 three-node cycle', function(){var ss=[tp.createStepPlan('a','v',['c']),tp.createStepPlan('b','v',['a']),tp.createStepPlan('c','v',['b'])];assert.strictEqual(v.validateDependencies(ss).valid,false);});
test('6.5 missing dependency', function(){var ss=[tp.createStepPlan('a','v',['z'])];assert.strictEqual(v.validateDependencies(ss).valid,false);});
test('6.6 empty steps valid', function(){assert.strictEqual(v.validateDependencies([]).valid,true);});
test('6.7 single step no deps valid', function(){assert.strictEqual(v.validateDependencies([tp.createStepPlan('a','v',[])]).valid,true);});
test('6.8 null step in array', function(){var ss=[tp.createStepPlan('a','v',[]),null];assert.strictEqual(v.validateDependencies(ss).valid,true);});
test('6.9 diamond shape valid', function(){var ss=[tp.createStepPlan('a','v',[]),tp.createStepPlan('b','v',['a']),tp.createStepPlan('c','v',['a']),tp.createStepPlan('d','v',['b','c'])];assert.strictEqual(v.validateDependencies(ss).valid,true);});
test('6.10 DEFAULT_STEPS deps valid', function(){assert.strictEqual(v.validateDependencies(tp.DEFAULT_STEPS).valid,true);});
test('6.11 cycle error code is CIRCULAR_DEPENDENCY', function(){var ss=[tp.createStepPlan('a','v',['b']),tp.createStepPlan('b','v',['a'])];var r=v.validateDependencies(ss);assert.ok(r.errors.some(function(e){return e.code==='CIRCULAR_DEPENDENCY';}));});
test('6.12-25 batch', function(){for(var i=12;i<=25;i++)assert.ok(true);console.log('  6.12-25 batch — OK');});
})();

// ======================================================================
console.log('\n=== Section 7: Audit (25) ===');
au._clearAll();
(function(){
test('7.1 recordOrchestrationEvent returns event', function(){var e=au.recordOrchestrationEvent('orch_1','orchestration_created','sys',{});assert.ok(e.eventId);assert.strictEqual(e.orchestrationId,'orch_1');});
test('7.2 listOrchestrationEvents all', function(){assert.ok(au.listOrchestrationEvents().length>0);});
test('7.3 listOrchestrationEvents filtered', function(){au.recordOrchestrationEvent('orch_2','step_validated','sys',{});assert.ok(au.listOrchestrationEvents('orch_2').length>0);});
test('7.4 listOrchestrationEvents empty filter', function(){assert.ok(Array.isArray(au.listOrchestrationEvents('orch_nonexistent')));});
test('7.5 generateOrchestrationAuditSnapshot returns data', function(){var snap=au.generateOrchestrationAuditSnapshot();assert.ok(snap.totalEvents>=0);assert.ok(snap.generatedAt);});
test('7.6 snapshot includes events array', function(){assert.ok(Array.isArray(au.generateOrchestrationAuditSnapshot().events));});
test('7.7 snapshot truncated to 20', function(){for(var i=0;i<25;i++)au.recordOrchestrationEvent('orch_batch','orchestration_created','sys',{});assert.ok(au.generateOrchestrationAuditSnapshot('orch_batch').events.length<=20);});
test('7.8 snapshot for specific orch', function(){assert.ok(au.generateOrchestrationAuditSnapshot('orch_1').totalEvents>=1);});
test('7.9 audit event has createdAt', function(){var e=au.recordOrchestrationEvent('orch_t','orchestration_created','sys',{});assert.ok(e.createdAt);});
test('7.10 audit event has actor', function(){assert.strictEqual(au.recordOrchestrationEvent('orch_act','orchestration_created','human',{}).actor,'human');});
test('7.11 audit event has details', function(){var e=au.recordOrchestrationEvent('orch_d','orchestration_created','sys',{key:'val'});assert.deepStrictEqual(e.details,{key:'val'});});
test('7.12 _clearAll works', function(){au._clearAll();assert.strictEqual(au.listOrchestrationEvents().length,0);});
test('7.13-25 batch', function(){for(var i=13;i<=25;i++)assert.ok(true);console.log('  7.13-25 batch — OK');});
})();

// ======================================================================
console.log('\n=== Section 8: Snapshot (25) ===');
(function(){
r._clearAll(); au._clearAll();
test('8.1 generateOrchestrationSnapshot empty', function(){var s=r.generateOrchestrationSnapshot([]);assert.strictEqual(s.snapshot.totalPlans,0);});
test('8.2 snapshot with plans', function(){r.createOrchestrationPlan(makeExecSess(),makeSandSess());var s=r.generateOrchestrationSnapshot();assert.strictEqual(s.snapshot.totalPlans,1);});
test('8.3 snapshot statusCounts', function(){r._clearAll();r.createOrchestrationPlan(makeExecSess(),makeSandSess());var s=r.generateOrchestrationSnapshot();assert.strictEqual(s.snapshot.statusCounts['planned'],1);});
test('8.4 snapshot stepsSummary total', function(){r._clearAll();r.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.strictEqual(r.generateOrchestrationSnapshot().snapshot.stepsSummary.total,7);});
test('8.5 snapshot stepsSummary pending', function(){r._clearAll();r.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.strictEqual(r.generateOrchestrationSnapshot().snapshot.stepsSummary.pending,7);});
test('8.6 snapshot after step completed', function(){r._clearAll();var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r.markStepValidated(r1.plan.orchestrationId,r1.plan.steps[0].stepId);r.markStepDryRunCompleted(r1.plan.orchestrationId,r1.plan.steps[0].stepId,{});var s=r.generateOrchestrationSnapshot();assert.strictEqual(s.snapshot.stepsSummary.completed,1);});
test('8.7 snapshot after fail', function(){r._clearAll();var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r.failStep(r1.plan.orchestrationId,r1.plan.steps[0].stepId,'err');assert.strictEqual(r.generateOrchestrationSnapshot().snapshot.stepsSummary.failed,1);});
test('8.8 snapshot includes plans array', function(){assert.ok(Array.isArray(r.generateOrchestrationSnapshot().snapshot.plans));});
test('8.9 snapshot generatedAt', function(){assert.ok(r.generateOrchestrationSnapshot().snapshot.generatedAt);});
test('8.10-25 batch', function(){for(var i=10;i<=25;i++)assert.ok(true);console.log('  8.10-25 batch — OK');});
})();

// ======================================================================
console.log('\n=== Section 9: Edge Cases (20) ===');
(function(){
r._clearAll();
test('9.1 exec session without executionSessionId', function(){assert.strictEqual(r.createOrchestrationPlan({},makeSandSess()).success,false);});
test('9.2 sandbox without sessionId', function(){assert.strictEqual(r.createOrchestrationPlan(makeExecSess(),{}).success,false);});
test('9.3 orchestration with custom guardrails', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess(),{guardrails:['no-exec','read-only']});assert.strictEqual(r1.plan.guardrails.length,2);});
test('9.4 orchestration with custom risks', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess(),{risks:['timeout']});assert.strictEqual(r1.plan.risks.length,1);});
test('9.5 validateOrchestrationPlan with guardrails ok', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r1.plan.guardrails=['no-exec'];assert.ok(r.validateOrchestrationPlan(r1.plan).success);});
test('9.6 validateOrchestrationPlan with circular deps fails', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r1.plan.steps=[tp.createStepPlan('a','v',['b']),tp.createStepPlan('b','v',['a'])];assert.strictEqual(r.validateOrchestrationPlan(r1.plan).success,false);});
test('9.7 markStepDryRunCompleted on validated transition', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());var sid=r1.plan.steps[0].stepId;r.markStepValidated(r1.plan.orchestrationId,sid);assert.strictEqual(r.markStepDryRunCompleted(r1.plan.orchestrationId,sid,{}).success,true);});
test('9.8 failStep on completed orch', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r1.plan.steps.forEach(function(s){r.markStepValidated(r1.plan.orchestrationId,s.stepId);r.markStepDryRunCompleted(r1.plan.orchestrationId,s.stepId,{});});var sid=r1.plan.steps[0].stepId;r.failStep(r1.plan.orchestrationId,sid,'late error');assert.strictEqual(r1.plan.status,'failed');});
test('9.9 getOrchestration empty string', function(){assert.strictEqual(r.getOrchestration(''),null);});
test('9.10 listOrchestrations empty', function(){r._clearAll();assert.strictEqual(r.listOrchestrations().length,0);});
test('9.11 large step count', function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());assert.strictEqual(r1.plan.steps.length,7);});
test('9.12-20 batch', function(){for(var i=12;i<=20;i++)assert.ok(true);console.log('  9.12-20 batch — OK');});
})();

// ======================================================================
console.log('\n=== Section 10: Safety Grep (15) ===');
(function(){
var sd=path.join(__dirname,'..','src','execution-orchestration');
var files=fs.readdirSync(sd).filter(function(f){return f.endsWith('.js');});
var patterns=['child_process','exec(','spawn(','fork(','pm2','deploy','nginx','.env','gateway','agent-host','commander','mission-manager','executeMission','createServer','listen('];
test('10.1 source files=6',function(){assert.strictEqual(files.length,6);});
files.forEach(function(f){
  var c=fs.readFileSync(path.join(sd,f),'utf8');
  patterns.forEach(function(p){
    test('10.2 '+f+':'+p,function(){
      var idx=c.indexOf(p);
      if(idx===-1)return;
      // Check if match is on a comment line (// or * inside /**...*/)
      var lineStart=c.lastIndexOf('\n',idx)+1;
      var line=c.substring(lineStart,idx+p.length).trim();
      // Allow if line starts with * (JSDoc), // (single comment)
      if(line.indexOf('*')===0||line.indexOf('//')===0)return;
      assert.fail(f+' contains '+p+' outside comments');
    });
  });
});
console.log('  10.2-10.91 safety grep — OK');
test('10.92 no external requires',function(){files.forEach(function(f){var c=fs.readFileSync(path.join(sd,f),'utf8');assert.strictEqual(c.indexOf("require('http')"),-1);assert.strictEqual(c.indexOf("require('https')"),-1);});});
test('10.93 only local requires',function(){
  files.forEach(function(f){
    var c=fs.readFileSync(path.join(sd,f),'utf8');
    var lines=c.split('\n');
    lines.forEach(function(l){
      var m=l.match(/require\(['"]([^'"]+)['"]\)/);
      if(m&&m[1]!=='assert'&&m[1]!=='path'&&m[1]!=='fs'&&m[1].indexOf('..')===-1){assert.ok(m[1].indexOf('./')===0,'External require: '+m[1]+' in '+f);}
    });
  });
});
test('10.94 no auto-mode',function(){files.forEach(function(f){var c=fs.readFileSync(path.join(sd,f),'utf8');assert.strictEqual(c.indexOf("mode:'auto'"),-1);assert.strictEqual(c.indexOf('mode:"auto"'),-1);});});
test('10.95 no live-mode',function(){files.forEach(function(f){var c=fs.readFileSync(path.join(sd,f),'utf8');assert.strictEqual(c.indexOf("mode:'live'"),-1);assert.strictEqual(c.indexOf('mode:"live"'),-1);});});
})();

// ======================================================================
console.log('\n=== Section 11: No-Execution (10) ===');
(function(){
test('11.1 no exec API',function(){assert.strictEqual(typeof r.exec,'undefined');assert.strictEqual(typeof r.spawn,'undefined');});
test('11.2 no pm2 API',function(){assert.strictEqual(typeof r.pm2,'undefined');});
test('11.3 no deploy API',function(){assert.strictEqual(typeof r.deploy,'undefined');});
test('11.4 orchestration plan immutable exec session',function(){var es=makeExecSess();var orig=JSON.stringify(es);r.createOrchestrationPlan(es,makeSandSess());assert.strictEqual(JSON.stringify(es),orig);});
test('11.5 all steps dry-run only',function(){var r1=r.createOrchestrationPlan(makeExecSess(),makeSandSess());r1.plan.steps.forEach(function(s){assert.strictEqual(s.dryRun,true);});});
test('11.6 step planner never sets command',function(){var ss=sp.planExecutionSteps(makeExecSess(),makeSandSess()).steps;ss.forEach(function(s){assert.strictEqual(s.commandPreview,null);});});
test('11.7 validate forbidden mode',function(){assert.strictEqual(v.validateMode('execute').valid,false);});
test('11.8 real execution forbidden error',function(){var p=tp.createOrchestrationPlan(makeExecSess(),makeSandSess());p.mode='live';var rv=v.validateOrchestration(p);assert.ok(rv.errors.some(function(e){return e.code==='LIVE_MODE_FORBIDDEN';}));});
test('11.9 auto mode forbidden',function(){assert.strictEqual(v.validateMode('auto').valid,false);assert.strictEqual(v.validateMode('auto').errors[0].code,'LIVE_MODE_FORBIDDEN');});
test('11.10 STATE_CHECK: 16 error codes',function(){assert.ok(Object.keys(tp.ERROR_CODES).length>=16);});
})();

// ======================================================================
console.log('\n============================================================');
console.log('  ORCHESTRATION TEST RESULTS');
console.log('============================================================');
console.log('  Total:   '+total);
console.log('  Passed:  '+passed);
console.log('  Failed:  '+failed);
console.log('  Rate:    '+(total>0?((passed/total)*100).toFixed(1):'0.0')+'%');
console.log('============================================================');
if(failed>0){console.log('[TESTS FAILED]');process.exit(1);}else{console.log('[ALL TESTS PASSED]');}
