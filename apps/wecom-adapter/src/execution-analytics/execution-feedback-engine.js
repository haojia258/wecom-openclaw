'use strict';var t=require('./execution-analytics-types');
function generateRecommendations(metrics){var recs=[];
  if(!metrics)return recs;
  if(metrics.failedSteps>0)recs.push('Address '+metrics.failedSteps+' failed steps');
  if(metrics.skippedSteps>0)recs.push('Review '+metrics.skippedSteps+' skipped steps');
  if(metrics.totalSteps>0&&(metrics.validatedSteps/metrics.totalSteps)<0.8)recs.push('Step success rate below 80%: review validation');
  if(metrics.totalInvocations>0&&(metrics.dryRunCompleted/metrics.totalInvocations)<0.8)recs.push('Invocation success rate below 80%: check adapters');
  if(metrics.totalSteps>15)recs.push('Orchestration has >15 steps: reduce complexity');
  if(metrics.executionHealthScore<70)recs.push('Health score low: increase validation coverage');
  if(metrics.orchestrationQualityScore<70)recs.push('Quality score low: review dependency graph');
  if(metrics.avgRiskScore>80)recs.push('Risk score high: add guardrails');
  return recs;}
function generateWarnings(metrics){
  var warns=[];if(!metrics)return warns;
  if(metrics.failedSteps>3)warns.push('High failure count ('+metrics.failedSteps+')');
  if(metrics.totalSteps>0&&(metrics.validatedSteps/metrics.totalSteps)<0.5)warns.push('Critical: step success rate below 50%');
  if(metrics.avgRiskScore>90)warns.push('Critical risk level');
  return warns;}
function generateRiskFeedback(metrics){
  var risks=[];if(!metrics)return risks;
  if(metrics.avgRiskScore>60)risks.push({level:'medium',description:'Elevated risk score: '+metrics.avgRiskScore});
  if(metrics.avgRiskScore>85)risks.push({level:'high',description:'Critical risk score: '+metrics.avgRiskScore});
  if(metrics.failedSteps>0)risks.push({level:'medium',description:metrics.failedSteps+' failed steps'});
  return risks;}
function generateHealthFeedback(metrics){
  var h=metrics?metrics.executionHealthScore||0:0;
  if(h>=90)return{level:'healthy',message:'Pipeline is healthy'};
  if(h>=70)return{level:'warning',message:'Pipeline needs attention'};
  return{level:'critical',message:'Pipeline requires immediate review'};}
function generateFeedback(metrics){
  return{recommendations:generateRecommendations(metrics),warnings:generateWarnings(metrics),risks:generateRiskFeedback(metrics),health:generateHealthFeedback(metrics)};}
module.exports={generateRecommendations,generateWarnings,generateRiskFeedback,generateHealthFeedback,generateFeedback};
