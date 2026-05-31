'use strict';var t=require('./replay-types'),v=require('./replay-validator'),mq=require('./memory-query-engine'),mr=require('./memory-runtime');
function replayExperienceForGoal(goal){
  if(!goal||!goal.goalId)return{success:false,error:'invalid goal',code:t.ERROR_CODES.INVALID_GOAL};
  var similarGoals=findSimilarGoalExperiences(goal);
  var relevantKnowledge=mq.searchMemory(goal.title||'')||[];
  var relevantInsights=mr.findRelevantInsights(goal.category||'ops')||[];
  var recommendedStrategies=recommendStrategiesFromMemory(goal);
  var riskWarnings=generateRiskWarnings(goal);
  var confidence=similarGoals.length>0?Math.min(1,0.3+similarGoals.length*0.1):0.1;
  var replay=t.createExperienceReplay({goalId:goal.goalId,similarGoals:similarGoals.slice(0,10),relevantKnowledge:relevantKnowledge.slice(0,10),relevantInsights:relevantInsights.slice(0,10),recommendedStrategies:recommendedStrategies,riskWarnings:riskWarnings,confidence:confidence,status:t.REPLAY_STATUS.CREATED});
  return{success:true,replay:replay};}
function findSimilarGoalExperiences(goal){
  if(!goal||!goal.title)return[];
  var similar=mq.findSimilarGoals(goal);
  return similar.map(function(m){return{goalId:m.sourceId||m.memoryId,title:m.title,category:m.category,score:m.score,relevance:'similar'};});}
function recommendStrategiesFromMemory(goal){
  if(!goal)return[];var category=goal.category||'ops';
  var related=mr.listMemory({type:'knowledge',category:category,limit:5});
  return related.map(function(m){return{strategy:'Reuse pattern from: '+m.title,sourceId:m.sourceId||m.memoryId,confidence:m.score/100||0.5};});}
function generateRiskWarnings(goal){
  if(!goal)return[];var warns=[];
  var failures=mr.listMemory({type:'knowledge',category:goal.category||'ops'}).filter(function(m){return m.score<50;});
  if(failures.length>0)warns.push({level:'medium',description:failures.length+' past failures in category '+goal.category});
  return warns;}
function generateReplaySnapshot(replays){
  replays=replays||[];
  return{total:replays.length,statusCounts:{},avgConfidence:replays.length>0?Math.round(replays.reduce(function(s,r){return s+(r.confidence||0);},0)/replays.length*100)/100:0,replays:replays,generatedAt:new Date().toISOString()};
}
module.exports={replayExperienceForGoal,findSimilarGoalExperiences,recommendStrategiesFromMemory,generateRiskWarnings,generateReplaySnapshot};
