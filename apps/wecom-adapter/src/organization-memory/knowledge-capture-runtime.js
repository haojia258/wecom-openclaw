'use strict';var t=require('./knowledge-types'),v=require('./knowledge-validator'),st=require('./knowledge-store'),au=require('./knowledge-audit');
function captureKnowledge(input){
  var vi=v.validateInput(input);if(!vi.valid)return{success:false,error:vi.errors[0].message,code:vi.errors[0].code};
  var kb=t.createKnowledgeRecord(input);
  var vk=v.validateKnowledge(kb);if(!vk.valid)return{success:false,error:vk.errors[0].message,code:vk.errors[0].code};
  var saved=st.saveKnowledge(kb);if(!saved.success)return saved;
  au.recordKnowledgeEvent(kb.knowledgeId,'knowledge_captured','system',{sourceType:kb.sourceType,category:kb.category});
  return{success:true,record:kb};}
function captureFromGoal(goal){
  if(!goal||!goal.goalId)return{success:false,error:'invalid goal',code:t.ERROR_CODES.INVALID_KNOWLEDGE};
  return captureKnowledge({
    sourceType:t.SOURCE_TYPE.GOAL,sourceId:goal.goalId,
    category:goal.category||t.CATEGORY.OPS,
    title:goal.title||'Goal: '+goal.goalId,
    summary:goal.description||goal.title||'No description',
    outcome:goal.outcome||t.OUTCOME.UNKNOWN,score:goal.score||goal.priority==='high'?80:50,
    tags:goal.tags||[],relatedIds:{goalId:goal.goalId},metadata:{goal:goal}});}
function captureFromExecutionAnalytics(report){
  if(!report||!report.analyticsId)return{success:false,error:'invalid report',code:t.ERROR_CODES.INVALID_KNOWLEDGE};
  return captureKnowledge({
    sourceType:t.SOURCE_TYPE.ANALYTICS,sourceId:report.analyticsId,
    category:t.CATEGORY.OPS,
    title:'Analytics: '+report.analyticsId,
    summary:'Health: '+(report.metrics?report.metrics.executionHealthScore:'N/A')+', Risk: '+(report.metrics?report.metrics.avgRiskScore:'N/A'),
    outcome:report.status==='healthy'?t.OUTCOME.SUCCESS:t.OUTCOME.FAILURE,
    score:report.metrics?report.metrics.executionHealthScore||0:0,
    relatedIds:{analyticsId:report.analyticsId,executionSessionId:report.executionSessionId,orchestrationId:report.orchestrationId},
    metadata:{analytics:report}});}
function captureFromOrchestration(orchPlan){
  if(!orchPlan||!orchPlan.orchestrationId)return{success:false,error:'invalid orchestration',code:t.ERROR_CODES.INVALID_KNOWLEDGE};
  return captureKnowledge({
    sourceType:t.SOURCE_TYPE.EXECUTION,sourceId:orchPlan.orchestrationId,
    category:t.CATEGORY.OPS,
    title:'Orchestration: '+orchPlan.orchestrationId,
    summary:'Status: '+orchPlan.status+', Steps: '+(orchPlan.steps?orchPlan.steps.length:0),
    outcome:orchPlan.status==='dry_run_completed'?t.OUTCOME.SUCCESS:orchPlan.status==='failed'?t.OUTCOME.FAILURE:t.OUTCOME.PARTIAL,
    score:orchPlan.status==='dry_run_completed'?90:50,
    relatedIds:{orchestrationId:orchPlan.orchestrationId},metadata:{orchestration:orchPlan}});}
function getKnowledgeRecord(id){return st.getKnowledge(id);}
function listKnowledgeRecords(filter){return st.listKnowledge(filter);}
function generateKnowledgeSnapshot(records){
  records=records||st.listKnowledge();var bySource={},byCategory={},byOutcome={};
  records.forEach(function(r){bySource[r.sourceType]=(bySource[r.sourceType]||0)+1;byCategory[r.category]=(byCategory[r.category]||0)+1;byOutcome[r.outcome]=(byOutcome[r.outcome]||0)+1;});
  return{total:records.length,bySource:bySource,byCategory:byCategory,byOutcome:byOutcome,records:records,generatedAt:new Date().toISOString()};}
function _reset(){st._clearAll();au._reset();}
module.exports={captureKnowledge,captureFromGoal,captureFromExecutionAnalytics,captureFromOrchestration,getKnowledgeRecord,listKnowledgeRecords,generateKnowledgeSnapshot,_reset};
