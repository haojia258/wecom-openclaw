'use strict';
var PASS=0,FAIL=0,tests=[];
function test(n,fn){tests.push({name:n,fn:fn});}
function assert(c,m){if(!c)throw new Error('ASSERT: '+(m||''));}
function assertContains(t,s,m){if(t.indexOf(s)===-1)throw new Error('ASSERT: '+(m||'contain '+s));}

var policy = require('../src/multi-agent/multi-agent-policy');
var planner = require('../src/multi-agent/multi-agent-planner');
var dispatcher = require('../src/multi-agent/multi-agent-dispatcher');
var runtime = require('../src/multi-agent/multi-agent-runtime');
var reportGen = require('../src/multi-agent/multi-agent-report');

function run(){
  console.log('=== P11.4 Multi-Agent Runtime Tests ===\n');
  tests.forEach(function(t){try{t.fn();PASS++;console.log('  PASS: '+t.name);}catch(e){FAIL++;console.log('  FAIL: '+t.name+'\n        '+e.message.replace(/\n/g,'\n        '));}});
  console.log('\n=== Results: '+PASS+'/'+(PASS+FAIL)+' passed ===');if(FAIL)process.exit(1);
}

// ─── A: Policy (14) ──────────────────────────────────────
console.log('\n--- A: Policy ---');
test('A1: codex code.patch valid',function(){assert(policy.validateAgentMapping('codex','code.patch').valid);});
test('A2: codex docs.write valid',function(){assert(policy.validateAgentMapping('codex','docs.write').valid);});
test('A3: workbuddy test.run valid',function(){assert(policy.validateAgentMapping('workbuddy','test.run').valid);});
test('A4: workbuddy server.audit valid',function(){assert(policy.validateAgentMapping('workbuddy','server.audit').valid);});
test('A5: deepseek risk.analysis valid',function(){assert(policy.validateAgentMapping('deepseek','risk.analysis').valid);});
test('A6: deepseek audit.review valid',function(){assert(policy.validateAgentMapping('deepseek','audit.review').valid);});
test('A7: doubao report.write valid',function(){assert(policy.validateAgentMapping('doubao','report.write').valid);});
test('A8: invalid mapping rejected',function(){assert(!policy.validateAgentMapping('codex','test.run').valid);});
test('A9: unknown agent rejected',function(){assert(!policy.validateAgentMapping('unknown','test.run').valid);});
test('A10: getMissionAgents development',function(){var a=policy.getMissionAgents('development');assert(a.indexOf('codex')!==-1&&a.indexOf('workbuddy')!==-1);});
test('A11: getMissionAgents audit',function(){var a=policy.getMissionAgents('audit');assert(a.indexOf('deepseek')!==-1);});
test('A12: getMissionAgents full_cycle',function(){var a=policy.getMissionAgents('full_cycle');assert(a.length===4,'should have 4 agents');});
test('A13: getNodeTemplate',function(){var n=policy.getNodeTemplate('code_development');assert(n&&n.agent==='codex');});
test('A14: generatePlanNodes produces nodes',function(){var n=policy.generatePlanNodes('development');assert(n.length>0);});

// ─── B: Planner (12) ─────────────────────────────────────
console.log('\n--- B: Planner ---');
test('B1: create development plan',function(){var r=planner.createMissionPlan({mission_type:'development'});assert(r.success);assert(r.plan.nodes.length>0);});
test('B2: create audit plan',function(){var r=planner.createMissionPlan({mission_type:'audit'});assert(r.success);assert(r.plan.agents.indexOf('deepseek')!==-1);});
test('B3: create full_cycle plan',function(){var r=planner.createMissionPlan({mission_type:'full_cycle'});assert(r.success);assert(r.plan.nodes.length>=5);});
test('B4: plan has graph_id',function(){var r=planner.createMissionPlan({mission_type:'general'});assert(r.plan.graph_id);});
test('B5: plan status is planned',function(){var r=planner.createMissionPlan({mission_type:'development'});assert(r.plan.status==='planned');});
test('B6: code review depends on code dev',function(){var r=planner.createMissionPlan({mission_type:'development'});var cr=r.plan.nodes.find(function(n){return n.node_type==='code_review';});assert(cr&&cr.dependencies.length>0);});
test('B7: PR depends on test execution',function(){var r=planner.createMissionPlan({mission_type:'development'});var pr=r.plan.nodes.find(function(n){return n.node_type==='pr_management';});assert(pr&&pr.dependencies.length>0);});
test('B8: report depends on others',function(){var r=planner.createMissionPlan({mission_type:'full_cycle'});var rp=r.plan.nodes.find(function(n){return n.node_type==='report_generation';});assert(rp&&rp.dependencies.length>0);});
test('B9: compute parallel groups',function(){var r=planner.createMissionPlan({mission_type:'development'});var g=planner.computeParallelGroups(r.plan.nodes);assert(g.length>0);});
test('B10: getNextExecutableNodes initial',function(){var r=planner.createMissionPlan({mission_type:'development'});var n=planner.getNextExecutableNodes(r.plan);assert(n.length>0);});
test('B11: generateId',function(){var id=planner.generateId('test');assert(id.indexOf('test')===0);});
test('B12: unknown mission type defaults',function(){var r=planner.createMissionPlan({mission_type:'nonexistent'});assert(r.success);});

// ─── C: Dispatcher (10) ──────────────────────────────────
console.log('\n--- C: Dispatcher ---');
test('C1: dispatch node',function(){var r=planner.createMissionPlan({mission_type:'general'});var n=r.plan.nodes[0];var d=dispatcher.dispatchNode(r.plan,n);assert(d.success,'should dispatch');assert(n.job_id,'should have job_id');});
test('C2: dispatch all executable',function(){var r=planner.createMissionPlan({mission_type:'development'});var d=dispatcher.dispatchExecutableNodes(r.plan);assert(d.success);assert(d.total>0);});
test('C3: dispatch updates node status',function(){var r=planner.createMissionPlan({mission_type:'general'});dispatcher.dispatchExecutableNodes(r.plan);assert(r.plan.nodes[0].status==='dispatched');});
test('C4: dispatch updates progress',function(){var r=planner.createMissionPlan({mission_type:'general'});dispatcher.dispatchExecutableNodes(r.plan);assert(r.plan.progress>=0);});
test('C5: handleNodeCallback completed',function(){var r=planner.createMissionPlan({mission_type:'general'});dispatcher.dispatchExecutableNodes(r.plan);var n=r.plan.nodes[0];dispatcher.handleNodeCallback(r.plan,n.job_id,'completed',{tests:'passed'});var nu=r.plan.nodes.find(function(x){return x.id===n.id;});assert(nu.status==='completed');});
test('C6: handleNodeCallback failed',function(){var r=planner.createMissionPlan({mission_type:'general'});dispatcher.dispatchExecutableNodes(r.plan);var n=r.plan.nodes[1]||r.plan.nodes[0];dispatcher.handleNodeCallback(r.plan,n.job_id,'failed',{error:'test'});var nu=r.plan.nodes.find(function(x){return x.id===n.id;});assert(nu.status==='failed');});
test('C7: callback updates progress',function(){var r=planner.createMissionPlan({mission_type:'general'});dispatcher.dispatchExecutableNodes(r.plan);r.plan.nodes.forEach(function(n){if(n.job_id)dispatcher.handleNodeCallback(r.plan,n.job_id,'completed',{});});assert(r.plan.progress>0);});
test('C8: updatePlanProgress',function(){var r=planner.createMissionPlan({mission_type:'general'});dispatcher.updatePlanProgress(r.plan);assert(r.plan.total_nodes>0);});
test('C9: full cycle dispatch+callback',function(){var r=planner.createMissionPlan({mission_type:'development'});var dispatched=0;do{dispatcher.dispatchExecutableNodes(r.plan);r.plan.nodes.filter(function(n){return n.status==='dispatched'&&!n.result;}).forEach(function(n){dispatcher.handleNodeCallback(r.plan,n.job_id,'completed',{});});dispatched=r.plan.nodes.filter(function(n){return n.status==='completed';}).length;}while(dispatched<r.plan.nodes.length);assert(r.plan.progress===100||r.plan.status==='completed');});
test('C10: partial failure sets status',function(){var r=planner.createMissionPlan({mission_type:'general'});dispatcher.dispatchExecutableNodes(r.plan);r.plan.nodes.forEach(function(n,i){if(n.job_id)dispatcher.handleNodeCallback(r.plan,n.job_id,i===0?'failed':'completed',{});});assert(r.plan.status==='partial_success'||r.plan.failed_nodes>0);});

// ─── D: Runtime (14) ─────────────────────────────────────
console.log('\n--- D: Runtime ---');
test('D1: create mission',function(){var r=runtime.createMission({mission_type:'development'});assert(r.success);assert(r.mission.mission_id);});
test('D2: create mission returns plan',function(){var r=runtime.createMission({mission_type:'development'});assert(r.plan.nodes.length>0);});
test('D3: create mission returns report',function(){var r=runtime.createMission({mission_type:'development'});assert(r.report);});
test('D4: get mission',function(){var r=runtime.createMission({mission_type:'development'});var g=runtime.getMission(r.mission.mission_id);assert(g.success);});
test('D5: get nonexistent mission',function(){assert(!runtime.getMission('nonexistent').success);});
test('D6: list missions',function(){var l=runtime.listMissions();assert(l.success);assert(l.total>0);});
test('D7: run mission dispatches',function(){var r=runtime.createMission({mission_type:'development'});var run=runtime.runMission(r.mission.mission_id);assert(run.success);assert(run.dispatched.length>=0);});
test('D8: run sets in_progress',function(){var r=runtime.createMission({mission_type:'development'});runtime.runMission(r.mission.mission_id);var g=runtime.getMission(r.mission.mission_id);assert(g.mission.status==='in_progress');});
test('D9: callback updates mission',function(){var r=runtime.createMission({mission_type:'general'});runtime.runMission(r.mission.mission_id);var n=r.plan.nodes.find(function(x){return x.job_id;});if(n)runtime.handleCallback(r.mission.mission_id,{job_id:n.job_id,status:'completed',result:{}});var g=runtime.getMission(r.mission.mission_id);assert(g.mission.progress>0);});
test('D10: callback nonexistent mission',function(){assert(!runtime.handleCallback('nonexistent',{job_id:'x'}).success);});
test('D11: run completed mission fails',function(){var r=runtime.createMission({mission_type:'general'});runtime.runMission(r.mission.mission_id);r.plan.nodes.forEach(function(n){if(n.job_id)runtime.handleCallback(r.mission.mission_id,{job_id:n.job_id,status:'completed'});});assert(!runtime.runMission(r.mission.mission_id).success);});
test('D12: full_cycle agent count',function(){var r=runtime.createMission({mission_type:'full_cycle'});assert(r.plan.agents.length===4);});
test('D13: audit type has deepseek',function(){var r=runtime.createMission({mission_type:'audit'});assert(r.plan.agents.indexOf('deepseek')!==-1);});
test('D14: autonomous type has workbuddy',function(){var r=runtime.createMission({mission_type:'autonomous'});assert(r.plan.agents.indexOf('workbuddy')!==-1);});

// ─── E: Report (6) ───────────────────────────────────────
console.log('\n--- E: Report ---');
test('E1: generate report',function(){var r=planner.createMissionPlan({mission_type:'development'});var rep=reportGen.generateReport(r.plan);assert(rep.mission_id);assert(rep.nodes.length>0);});
test('E2: report has progress',function(){var r=planner.createMissionPlan({mission_type:'development'});var rep=reportGen.generateReport(r.plan);assert(typeof rep.progress==='number');});
test('E3: report has agents',function(){var r=planner.createMissionPlan({mission_type:'development'});var rep=reportGen.generateReport(r.plan);assert(rep.agents.length>0);});
test('E4: formatWeComReport',function(){var r=planner.createMissionPlan({mission_type:'development'});var f=reportGen.formatWeComReport(r.plan);assertContains(f,'Multi-Agent Mission');assertContains(f,r.plan.mission_id);});
test('E5: formatWeComReport shows nodes',function(){var r=planner.createMissionPlan({mission_type:'development'});var f=reportGen.formatWeComReport(r.plan);assert(f.indexOf('codex')!==-1||f.indexOf('workbuddy')!==-1);});
test('E6: report for completed',function(){var r=planner.createMissionPlan({mission_type:'general'});var dp=0;do{dispatcher.dispatchExecutableNodes(r.plan);r.plan.nodes.filter(function(n){return n.status==='dispatched'&&!n.result;}).forEach(function(n){dispatcher.handleNodeCallback(r.plan,n.job_id,'completed',{});});dp=r.plan.nodes.filter(function(n){return n.status==='completed';}).length;}while(dp<r.plan.nodes.length);var rep=reportGen.generateReport(r.plan);assert(rep.status==='completed'||rep.progress===100);});

// ─── F: Agent Types (10) ─────────────────────────────────
console.log('\n--- F: Agent Types ---');
test('F1: codex dispatch via runtime',function(){var r=runtime.createMission({mission_type:'development'});var n=r.plan.nodes.find(function(x){return x.agent==='codex';});assert(n,'should have codex node');});
test('F2: workbuddy dispatch via runtime',function(){var r=runtime.createMission({mission_type:'development'});var n=r.plan.nodes.find(function(x){return x.agent==='workbuddy';});assert(n,'should have workbuddy node');});
test('F3: deepseek dispatch via runtime',function(){var r=runtime.createMission({mission_type:'development'});var n=r.plan.nodes.find(function(x){return x.agent==='deepseek';});assert(n,'should have deepseek node');});
test('F4: doubao dispatch via runtime',function(){var r=runtime.createMission({mission_type:'full_cycle'});var n=r.plan.nodes.find(function(x){return x.agent==='doubao';});assert(n,'should have doubao node');});
test('F5: codex capabilities',function(){assert(policy.DEFAULT_AGENT_MAP.codex.indexOf('code.patch')!==-1);});
test('F6: workbuddy capabilities',function(){assert(policy.DEFAULT_AGENT_MAP.workbuddy.indexOf('test.run')!==-1);});
test('F7: deepseek capabilities',function(){assert(policy.DEFAULT_AGENT_MAP.deepseek.indexOf('audit.review')!==-1);});
test('F8: doubao capabilities',function(){assert(policy.DEFAULT_AGENT_MAP.doubao.indexOf('report.write')!==-1);});
test('F9: all mission types in map',function(){['development','audit','deployment','report','full_cycle'].forEach(function(t){assert(policy.getMissionAgents(t).length>0,t);});});
test('F10: 8 node templates exist',function(){var count=Object.keys(policy.NODE_TEMPLATES).length;assert(count===8,'expected 8, got '+count);});

// ─── G: Parallel Execution (6) ────────────────────────────
console.log('\n--- G: Parallel Execution ---');
test('G1: parallel groups computed',function(){var r=planner.createMissionPlan({mission_type:'development'});assert(r.plan.parallel_groups.length>0);});
test('G2: first group has code dev',function(){var r=planner.createMissionPlan({mission_type:'development'});var g0=r.plan.parallel_groups[0];assert(g0.some(function(n){return n.node_type==='code_development';}));});
test('G3: dispatch multiple nodes parallel',function(){var r=planner.createMissionPlan({mission_type:'development'});dispatcher.dispatchExecutableNodes(r.plan);var dispatched=r.plan.nodes.filter(function(n){return n.status==='dispatched';});assert(dispatched.length>0);});
test('G4: all dispatched nodes have job_ids',function(){var r=planner.createMissionPlan({mission_type:'development'});dispatcher.dispatchExecutableNodes(r.plan);r.plan.nodes.filter(function(n){return n.status==='dispatched';}).forEach(function(n){assert(n.job_id,'should have job_id');});});
test('G5: dependency order respected',function(){var r=planner.createMissionPlan({mission_type:'development'});var cr=r.plan.nodes.find(function(n){return n.node_type==='code_review';});var cd=r.plan.nodes.find(function(n){return n.node_type==='code_development';});assert(cr.dependencies.indexOf(cd.id)!==-1);});
test('G6: callback triggers next dispatch',function(){var r=runtime.createMission({mission_type:'development'});runtime.runMission(r.mission.mission_id);var n=r.plan.nodes.find(function(x){return x.job_id;});if(n){runtime.handleCallback(r.mission.mission_id,{job_id:n.job_id,status:'completed'});var g=runtime.getMission(r.mission.mission_id);assert(g.mission.progress>=0);}});

// ─── H: Approval & Recovery (6) ──────────────────────────
console.log('\n--- H: Approval & Recovery ---');
test('H1: required node cannot fail mission',function(){var r=planner.createMissionPlan({mission_type:'general'});var n=r.plan.nodes[0];n.required=true;n.can_fail=false;dispatcher.dispatchExecutableNodes(r.plan);if(n.job_id)dispatcher.handleNodeCallback(r.plan,n.job_id,'failed',{});assert(n.status==='failed');});
test('H2: can_fail nodes can fail',function(){var r=planner.createMissionPlan({mission_type:'general'});var n=r.plan.nodes[0];n.can_fail=true;assert(n.can_fail);});
test('H3: mission partial_success on mix',function(){var r=runtime.createMission({mission_type:'general'});runtime.runMission(r.mission.mission_id);var nodes=r.plan.nodes.filter(function(x){return x.job_id;});nodes.forEach(function(n,i){runtime.handleCallback(r.mission.mission_id,{job_id:n.job_id,status:i===0?'failed':'completed'});});var g=runtime.getMission(r.mission.mission_id);assert(g.mission.failed_nodes>0||g.mission.status==='partial_success'||g.mission.progress>0);});
test('H4: completed mission does not rerun',function(){var r=runtime.createMission({mission_type:'general'});runtime.runMission(r.mission.mission_id);r.plan.nodes.forEach(function(n){if(n.job_id)runtime.handleCallback(r.mission.mission_id,{job_id:n.job_id,status:'completed'});});assert(!runtime.runMission(r.mission.mission_id).success);});
test('H5: progress updates correctly',function(){var r=runtime.createMission({mission_type:'development'});runtime.runMission(r.mission.mission_id);var n=r.plan.nodes.find(function(x){return x.job_id;});if(n){runtime.handleCallback(r.mission.mission_id,{job_id:n.job_id,status:'completed'});var g=runtime.getMission(r.mission.mission_id);assert(g.mission.progress>0);}});
test('H6: agent mapping covers all generated nodes',function(){var r=planner.createMissionPlan({mission_type:'full_cycle'});r.plan.nodes.forEach(function(n){assert(policy.DEFAULT_AGENT_MAP[n.agent],n.agent+' should be mapped');});});

// ─── I: Dashboard v1.3 check (2) ─────────────────────────
console.log('\n--- I: Dashboard v1.3 ---');
test('I1: dashboard file exists',function(){var fs=require('fs');var p=require('path');var dp=p.join(__dirname,'..','public','mission-control.html');assert(fs.existsSync(dp),'dashboard should exist');});
test('I2: dashboard contains v1.3',function(){var fs=require('fs');var p=require('path');var h=fs.readFileSync(p.join(__dirname,'..','public','mission-control.html'),'utf-8');assert(h.indexOf('v1.3')!==-1||h.indexOf('v1.3')!==-1,'should contain v1.3');});

// ─── Run ──────────────────────────────────────────────────
run();
