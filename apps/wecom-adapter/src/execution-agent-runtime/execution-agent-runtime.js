/** execution-agent-runtime.js — P9.7.4 Agent Runtime API. Dry-run only. */
'use strict';var t=require('./execution-agent-types'),v=require('./execution-agent-validator'),reg=require('./execution-agent-adapter-registry'),pl=require('./execution-agent-invocation-planner'),au=require('./execution-agent-audit');
var _invocations={};
function planAgentInvocation(orchestrationPlan,step,assignmentPlan,options){
  var r=pl.planAgentInvocation(orchestrationPlan,step,assignmentPlan,options);
  if(!r.success)return r;
  var val=v.validateInvocationPlan(r.plan);
  if(!val.valid)return{success:false,error:val.errors[0].message,code:val.errors[0].code};
  _invocations[r.plan.invocationId]=r.plan;
  au.recordAgentRuntimeEvent(r.plan.invocationId,'invocation_planned','system',{orchestrationId:orchestrationPlan.orchestrationId,stepId:step.stepId,agent:r.plan.selectedAgent});
  return r;}
function planAgentInvocations(orchestrationPlan,assignmentPlan,options){
  var r=pl.planAgentInvocations(orchestrationPlan,assignmentPlan,options);
  if(r.success){r.plans.forEach(function(p){_invocations[p.invocationId]=p;
    au.recordAgentRuntimeEvent(p.invocationId,'invocation_planned','system',{orchestrationId:orchestrationPlan.orchestrationId,stepId:p.stepId,agent:p.selectedAgent});});}
  return r;}
function validateAgentInvocationPlan(plan){return v.validateInvocationPlan(plan);}
function markInvocationValidated(invocationId){
  var p=_invocations[invocationId];if(!p)return{success:false,error:'not found',code:t.ERROR_CODES.INVOCATION_NOT_FOUND};
  if(!t.isValidTransition(p.status,t.INVOCATION_STATUS.VALIDATED))return{success:false,error:'cannot transition from '+p.status};
  p.status=t.INVOCATION_STATUS.VALIDATED;p.updatedAt=new Date().toISOString();au.recordAgentRuntimeEvent(invocationId,'invocation_validated','system',{});return{success:true,plan:p};}
function markInvocationDryRunReady(invocationId){
  var p=_invocations[invocationId];if(!p)return{success:false,error:'not found',code:t.ERROR_CODES.INVOCATION_NOT_FOUND};
  if(!t.isValidTransition(p.status,t.INVOCATION_STATUS.DRY_RUN_READY))return{success:false,error:'cannot transition from '+p.status};
  p.status=t.INVOCATION_STATUS.DRY_RUN_READY;p.updatedAt=new Date().toISOString();au.recordAgentRuntimeEvent(invocationId,'invocation_dry_run_ready','system',{from:p.status});return{success:true,plan:p};}
function markInvocationDryRunCompleted(invocationId,result){
  var p=_invocations[invocationId];if(!p)return{success:false,error:'not found',code:t.ERROR_CODES.INVOCATION_NOT_FOUND};
  if(!t.isValidTransition(p.status,t.INVOCATION_STATUS.DRY_RUN_COMPLETED))return{success:false,error:'cannot transition from '+p.status};
  p.status=t.INVOCATION_STATUS.DRY_RUN_COMPLETED;p.expectedOutput=result||{};p.updatedAt=new Date().toISOString();au.recordAgentRuntimeEvent(invocationId,'invocation_dry_run_completed','system',{result:result});return{success:true,plan:p};}
function failInvocation(invocationId,reason){
  var p=_invocations[invocationId];if(!p)return{success:false,error:'not found',code:t.ERROR_CODES.INVOCATION_NOT_FOUND};
  p.status=t.INVOCATION_STATUS.FAILED;p.updatedAt=new Date().toISOString();au.recordAgentRuntimeEvent(invocationId,'invocation_failed','system',{reason:reason});return{success:true,plan:p};}
function archiveInvocation(invocationId){
  var p=_invocations[invocationId];if(!p)return{success:false,error:'not found',code:t.ERROR_CODES.INVOCATION_NOT_FOUND};
  if(!t.isValidTransition(p.status,t.INVOCATION_STATUS.ARCHIVED))return{success:false,error:'cannot archive from '+p.status};
  p.status=t.INVOCATION_STATUS.ARCHIVED;p.updatedAt=new Date().toISOString();au.recordAgentRuntimeEvent(invocationId,'invocation_archived','system',{});return{success:true,plan:p};}
function generateAgentRuntimeSnapshot(invocations){
  invocations=invocations||Object.values(_invocations);
  var snap={total:invocations.length,statusCounts:{},agentsCount:{},invocations:invocations,generatedAt:new Date().toISOString()};
  invocations.forEach(function(p){snap.statusCounts[p.status]=(snap.statusCounts[p.status]||0)+1;snap.agentsCount[p.selectedAgent]=(snap.agentsCount[p.selectedAgent]||0)+1;});
  return{success:true,snapshot:snap};}
function getInvocation(id){return _invocations[id]||null;}
function listInvocations(f){f=f||{};var ids=Object.keys(_invocations),r=[];for(var i=0;i<ids.length;i++){var p=_invocations[ids[i]];var ok=true;if(f.status&&p.status!==f.status)ok=false;if(f.agent&&p.selectedAgent!==f.agent)ok=false;if(ok)r.push(p);}return r;}
function _clearAll(){_invocations={};}
module.exports={planAgentInvocation,planAgentInvocations,validateAgentInvocationPlan,markInvocationValidated,markInvocationDryRunReady,markInvocationDryRunCompleted,failInvocation,archiveInvocation,generateAgentRuntimeSnapshot,getInvocation,listInvocations,_clearAll};
