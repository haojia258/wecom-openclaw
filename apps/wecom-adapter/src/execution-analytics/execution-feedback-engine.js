/** execution-feedback-engine.js — P9.7.5 Recommendations only. No auto-fix. */
'use strict';var t=require('./execution-analytics-types');
function generateRecommendations(report){
  var recs=[];
  if(report.metrics){
    if(report.metrics.failedSteps>0)recs.push('Address '+report.metrics.failedSteps+' failed steps');
    if(report.metrics.skippedSteps>0)recs.push('Review '+report.metrics.skippedSteps+' skipped steps');
    if(report.metrics.stepSuccessRate<80)recs.push('Step success rate below 80%: review validation pipeline');
    if(report.metrics.invocationSuccessRate<80)recs.push('Invocation success rate below 80%: check agent adapters');
    if(report.metrics.totalSteps>15)recs.push('Orchestration has >15 steps: consider reducing complexity');
    if(report.metrics.executionHealthScore<70)recs.push('Execution health score low: increase validation coverage');
    if(report.metrics.orchestrationQualityScore<70)recs.push('Orchestration quality score low: review dependency graph');
    if(report.metrics.avgRiskScore>80)recs.push('Risk score high: add more guardrails');
  }
  return recs;}
function generateWarnings(report){
  var warns=[];
  if(report.metrics){
    if(report.metrics.failedSteps>3)warns.push('High failure count ('+report.metrics.failedSteps+')');
    if(report.metrics.stepSuccessRate<50)warns.push('Critical: step success rate below 50%');
    if(report.metrics.avgRiskScore>90)warns.push('Critical risk level');
  }
  if(report.trends&&report.trends.riskTrend===t.TREND.DEGRADING)warns.push('Risk trend is degrading');
  if(report.status===t.ANALYTICS_STATUS.CRITICAL)warns.push('Analytics status is critical');
  return warns;}
function generateRiskFeedback(report){
  var risks=[];
  if(report.metrics&&report.metrics.avgRiskScore>60)risks.push({level:'medium',description:'Elevated risk score: '+report.metrics.avgRiskScore});
  if(report.metrics&&report.metrics.avgRiskScore>85)risks.push({level:'high',description:'Critical risk score: '+report.metrics.avgRiskScore});
  if(report.metrics&&report.metrics.failedSteps>0)risks.push({level:'medium',description:report.metrics.failedSteps+' failed steps in orchestration'});
  if(report.trends&&report.trends.riskTrend===t.TREND.DEGRADING)risks.push({level:'high',description:'Risk trend is degrading over time'});
  return risks;}
function generateHealthFeedback(report){
  var score=report.metrics?report.metrics.executionHealthScore||0:0;
  if(score>=90)return{level:'healthy',message:'Execution pipeline is healthy'};
  if(score>=70)return{level:'warning',message:'Execution pipeline needs attention'};
  return{level:'critical',message:'Execution pipeline requires immediate review'};}
function generateFeedback(report){
  return{recommendations:generateRecommendations(report),warnings:generateWarnings(report),risks:generateRiskFeedback(report),health:generateHealthFeedback(report)};}
module.exports={generateRecommendations,generateWarnings,generateRiskFeedback,generateHealthFeedback,generateFeedback};
