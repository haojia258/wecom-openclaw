/** execution-agent-invocation-planner.js — Maps orchestration steps to agent invocations */
'use strict';var t=require('./execution-agent-types'),reg=require('./execution-agent-adapter-registry');
function planAgentInvocation(orchestrationPlan,step,assignmentPlan,options){
  options=options||{};
  if(!orchestrationPlan||!orchestrationPlan.orchestrationId)return{success:false,error:'invalid orchestration',code:t.ERROR_CODES.INVALID_ORCHESTRATION_ID};
  if(!step||!step.stepId)return{success:false,error:'invalid step',code:t.ERROR_CODES.INVALID_STEP_ID};
  var agentName=options.agentName||'codex';
  var adapter=reg.getAgentAdapter(agentName);
  if(!adapter)return{success:false,error:'adapter not found: '+agentName,code:t.ERROR_CODES.ADAPTER_NOT_FOUND};
  if(adapter.supportedStepTypes&&adapter.supportedStepTypes.indexOf(step.type)===-1)return{success:false,error:'step type mismatch',code:t.ERROR_CODES.STEP_TYPE_MISMATCH};
  var promptPreview=adapter.promptTemplate?adapter.promptTemplate.replace('{stepName}',step.name||'unknown'):'Dry-run invocation for step: '+(step.name||'unknown');
  var plan=t.createInvocationPlan(orchestrationPlan.orchestrationId,step.stepId,agentName,{mode:options.mode||'dry-run',promptPreview:promptPreview,inputSnapshot:{stepName:step.name,stepType:step.type,orchestrationId:orchestrationPlan.orchestrationId},guardrails:options.guardrails||['no-exec','dry-run-only'],risks:options.risks||['dry-run-no-real-execution']});
  return{success:true,plan:plan,adapter:adapter};}
function planAgentInvocations(orchestrationPlan,assignmentPlan,options){
  options=options||{};
  if(!orchestrationPlan||!orchestrationPlan.steps)return{success:false,error:'invalid orchestration plan',code:t.ERROR_CODES.INVALID_ORCHESTRATION_ID};
  var results=[];var errors=[];
  for(var i=0;i<orchestrationPlan.steps.length;i++){
    var step=orchestrationPlan.steps[i];var adapter=reg.findAdapterForStep(step.name,step.type);
    var agentName=adapter?adapter.name:(options.agentName||'codex');
    var r=planAgentInvocation(orchestrationPlan,step,assignmentPlan,{agentName:agentName,mode:options.mode||'dry-run',guardrails:options.guardrails,risks:options.risks});
    if(r.success)results.push(r.plan);else errors.push({stepIndex:i,stepName:step.name,error:r.error,code:r.code});}
  return{success:errors.length===0,plans:results,errors:errors.length>0?errors:undefined,summary:{total:orchestrationPlan.steps.length,planned:results.length,failed:errors.length}};}
module.exports={planAgentInvocation,planAgentInvocations};
