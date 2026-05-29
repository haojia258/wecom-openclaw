'use strict';
var REPLAY_STATUS={CREATED:'created',ANALYZED:'analyzed',READY:'ready',APPLIED:'applied',ARCHIVED:'archived'};
var REPLAY_STATUS_VALUES=Object.values(REPLAY_STATUS);
var ERROR_CODES={
  INVALID_REPLAY:'INVALID_REPLAY',INVALID_REPLAY_ID:'INVALID_REPLAY_ID',
  INVALID_GOAL:'INVALID_GOAL',REPLAY_FAILED:'REPLAY_FAILED',
  NO_SIMILAR_GOALS:'NO_SIMILAR_GOALS',REPLAY_NOT_FOUND:'REPLAY_NOT_FOUND'
};
function createReplayId(){return'replay_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}
function createExperienceReplay(input){
  input=input||{};var now=new Date().toISOString();
  return{
    replayId:input.replayId||createReplayId(),
    goalId:input.goalId||null,
    similarGoals:input.similarGoals||[],
    relevantKnowledge:input.relevantKnowledge||[],
    relevantInsights:input.relevantInsights||[],
    recommendedStrategies:input.recommendedStrategies||[],
    riskWarnings:input.riskWarnings||[],
    confidence:typeof input.confidence==='number'?Math.max(0,Math.min(1,input.confidence)):0,
    status:input.status||REPLAY_STATUS.CREATED,
    createdAt:now,metadata:input.metadata||{}
  };
}
module.exports={REPLAY_STATUS,REPLAY_STATUS_VALUES,ERROR_CODES,createReplayId,createExperienceReplay};
