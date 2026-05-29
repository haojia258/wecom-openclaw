'use strict';
var INSIGHT_TYPE={SUCCESS_PATTERN:'success-pattern',FAILURE_PATTERN:'failure-pattern',AGENT_PERFORMANCE:'agent-performance',APPROVAL_RISK:'approval-risk',STRATEGY_EFFECTIVENESS:'strategy-effectiveness'};
var INSIGHT_TYPE_VALUES=Object.values(INSIGHT_TYPE);
var ERROR_CODES={
  INVALID_INSIGHT:'INVALID_INSIGHT',INVALID_INSIGHT_ID:'INVALID_INSIGHT_ID',
  INVALID_INSIGHT_TYPE:'INVALID_INSIGHT_TYPE',INVALID_CONFIDENCE:'INVALID_CONFIDENCE',
  INVALID_EVIDENCE:'INVALID_EVIDENCE',INVALID_RECOMMENDATION:'INVALID_RECOMMENDATION',
  INSIGHT_NOT_FOUND:'INSIGHT_NOT_FOUND',LEARNING_ENGINE_ERROR:'LEARNING_ENGINE_ERROR'
};
function createInsightId(){return'insight_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}
function createLearningInsight(input){
  input=input||{};var now=new Date().toISOString();
  return{
    insightId:input.insightId||createInsightId(),
    category:input.category||'ops',
    insightType:input.insightType||INSIGHT_TYPE.SUCCESS_PATTERN,
    confidence:typeof input.confidence==='number'?Math.max(0,Math.min(1,input.confidence)):0,
    summary:input.summary||'',
    evidence:input.evidence||[],
    recommendations:input.recommendations||[],
    createdAt:now,metadata:input.metadata||{}
  };
}
module.exports={INSIGHT_TYPE,INSIGHT_TYPE_VALUES,ERROR_CODES,createInsightId,createLearningInsight};
