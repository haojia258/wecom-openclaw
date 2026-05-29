'use strict';var t=require('./learning-types'),v=require('./learning-validator'),eng=require('./learning-engine'),au=require('./learning-audit');
var _insights=[];
function generateLearningInsights(knowledgeRecords){
  if(!knowledgeRecords||!Array.isArray(knowledgeRecords))knowledgeRecords=[];
  var insights=[].concat(
    eng.analyzeSuccessPatterns(knowledgeRecords),
    eng.analyzeFailurePatterns(knowledgeRecords),
    eng.analyzeAgentPerformance(knowledgeRecords),
    eng.analyzeApprovalRisk(knowledgeRecords),
    eng.analyzeStrategyEffectiveness(knowledgeRecords)
  );
  insights.forEach(function(i){_insights.push(i);au.recordLearningEvent(i.insightId,'learning_insight_generated','system',{insightType:i.insightType});});
  return{success:true,insights:insights,count:insights.length};}
function analyzeSuccessPatterns(records){return eng.analyzeSuccessPatterns(records);}
function analyzeFailurePatterns(records){return eng.analyzeFailurePatterns(records);}
function analyzeAgentPerformance(records){return eng.analyzeAgentPerformance(records);}
function analyzeApprovalRisk(records){return eng.analyzeApprovalRisk(records);}
function analyzeStrategyEffectiveness(records){return eng.analyzeStrategyEffectiveness(records);}
function generateLearningSnapshot(insights){
  insights=insights||_insights;var byType={},byCategory={};
  insights.forEach(function(i){byType[i.insightType]=(byType[i.insightType]||0)+1;byCategory[i.category]=(byCategory[i.category]||0)+1;});
  return{total:insights.length,byType:byType,byCategory:byCategory,insights:insights,generatedAt:new Date().toISOString()};}
function getLearningInsight(id){for(var i=0;i<_insights.length;i++){if(_insights[i].insightId===id)return _insights[i];}return null;}
function listLearningInsights(filter){
  filter=filter||{};return _insights.filter(function(i){return(!filter.insightType||i.insightType===filter.insightType)&&(!filter.category||i.category===filter.category);});}
function _reset(){_insights=[];au._reset();}
module.exports={generateLearningInsights,analyzeSuccessPatterns,analyzeFailurePatterns,analyzeAgentPerformance,analyzeApprovalRisk,analyzeStrategyEffectiveness,generateLearningSnapshot,getLearningInsight,listLearningInsights,_reset};
