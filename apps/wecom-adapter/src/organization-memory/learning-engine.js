'use strict';var t=require('./learning-types'),v=require('./learning-validator');
function analyzeSuccessPatterns(records){
  if(!records||!Array.isArray(records))return[];
  var successes=records.filter(function(r){return r.outcome==='success';});
  if(successes.length===0)return[];
  var byCategory={};successes.forEach(function(r){byCategory[r.category]=(byCategory[r.category]||0)+1;});
  var topCategory=Object.keys(byCategory).sort(function(a,b){return byCategory[b]-byCategory[a];})[0];
  var avgScore=Math.round(successes.reduce(function(s,r){return s+(r.score||0);},0)/successes.length);
  var insight=t.createLearningInsight({insightType:t.INSIGHT_TYPE.SUCCESS_PATTERN,category:topCategory||'ops',confidence:Math.min(1,successes.length/10),summary:successes.length+' success records identified. Top category: '+(topCategory||'N/A')+'. Avg score: '+avgScore,evidence:successes.slice(0,5).map(function(r){return r.knowledgeId;}),recommendations:['Analyze top category "'+topCategory+'" for repeatable patterns','Document success criteria for '+(topCategory||'unknown')]});
  return[insight];}
function analyzeFailurePatterns(records){
  if(!records||!Array.isArray(records))return[];
  var failures=records.filter(function(r){return r.outcome==='failure';});
  if(failures.length===0)return[];
  var byCategory={};failures.forEach(function(r){byCategory[r.category]=(byCategory[r.category]||0)+1;});
  var topCategory=Object.keys(byCategory).sort(function(a,b){return byCategory[b]-byCategory[a];})[0];
  var insight=t.createLearningInsight({insightType:t.INSIGHT_TYPE.FAILURE_PATTERN,category:topCategory||'ops',confidence:Math.min(1,failures.length/10),summary:failures.length+' failure records identified. Most failures in: '+(topCategory||'N/A'),evidence:failures.slice(0,5).map(function(r){return r.knowledgeId;}),recommendations:['Investigate root cause of failures in "'+topCategory+'"','Add preventative checks for '+(topCategory||'unknown')+' category']});
  return[insight];}
function analyzeAgentPerformance(records){
  if(!records||!Array.isArray(records))return[];
  var agentRecords=records.filter(function(r){return r.sourceType==='execution'||r.sourceType==='analytics';});
  if(agentRecords.length===0)return[];
  var avgScore=Math.round(agentRecords.reduce(function(s,r){return s+(r.score||0);},0)/agentRecords.length);
  return[t.createLearningInsight({insightType:t.INSIGHT_TYPE.AGENT_PERFORMANCE,category:'ops',confidence:Math.min(1,agentRecords.length/10),summary:'Agent execution: '+agentRecords.length+' records, avg score: '+avgScore,evidence:agentRecords.slice(0,5).map(function(r){return r.knowledgeId;}),recommendations:avgScore<70?['Review agent performance - average score below 70']:['Agent performance is acceptable']})];}
function analyzeApprovalRisk(records){
  if(!records||!Array.isArray(records))return[];
  var partials=records.filter(function(r){return r.outcome==='partial';});
  var lowScore=records.filter(function(r){return r.score<50;});
  var riskCount=partials.length+lowScore.length;
  if(riskCount===0)return[t.createLearningInsight({insightType:t.INSIGHT_TYPE.APPROVAL_RISK,category:'ops',confidence:0,summary:'No approval risk detected',recommendations:['No action needed']})];
  return[t.createLearningInsight({insightType:t.INSIGHT_TYPE.APPROVAL_RISK,category:'ops',confidence:Math.min(1,riskCount/20),summary:riskCount+' records with approval risk indicators',evidence:lowScore.slice(0,5).map(function(r){return r.knowledgeId;}),recommendations:['Review approval thresholds','Add fallback approval paths']})];}
function analyzeStrategyEffectiveness(records){
  if(!records||!Array.isArray(records))return[];
  var strategyRecords=records.filter(function(r){return r.sourceType==='strategy'||r.sourceType==='goal';});
  if(strategyRecords.length===0)return[];
  var successRate=strategyRecords.filter(function(r){return r.outcome==='success';}).length/strategyRecords.length;
  return[t.createLearningInsight({insightType:t.INSIGHT_TYPE.STRATEGY_EFFECTIVENESS,category:'ops',confidence:successRate,summary:'Strategy effectiveness: '+(successRate*100).toFixed(0)+'% ('+strategyRecords.length+' records)',evidence:strategyRecords.slice(0,5).map(function(r){return r.knowledgeId;}),recommendations:successRate<0.5?['Review strategy execution pipeline','Consider alternative strategies']:['Continue current strategy approach']})];}
module.exports={analyzeSuccessPatterns,analyzeFailurePatterns,analyzeAgentPerformance,analyzeApprovalRisk,analyzeStrategyEffectiveness};
