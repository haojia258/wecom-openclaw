/** execution-metrics-aggregator.js — P9.7.5 Metrics from dry-run data only. */
'use strict';
function aggregateExecutionMetrics(sessions,orchPlans,invocations){
  sessions=sessions||[];orchPlans=orchPlans||[];invocations=invocations||[];
  var totalSteps=0,validatedSteps=0,failedSteps=0,skippedSteps=0;
  orchPlans.forEach(function(o){if(o.steps)o.steps.forEach(function(s){totalSteps++;if(s.status==='validated'||s.status==='dry_run_completed')validatedSteps++;if(s.status==='failed')failedSteps++;if(s.status==='skipped')skippedSteps++;});});
  var totalInvocations=invocations.length,dryRunCompleted=invocations.filter(function(i){return i.status==='dry_run_completed';}).length;
  return{totalSessions:sessions.length,totalOrchs:orchPlans.length,totalSteps:totalSteps,validatedSteps:validatedSteps,failedSteps:failedSteps,skippedSteps:skippedSteps,totalInvocations:totalInvocations,dryRunCompleted:dryRunCompleted,stepSuccessRate:totalSteps>0?Math.round((validatedSteps/totalSteps)*100):0,invocationSuccessRate:totalInvocations>0?Math.round((dryRunCompleted/totalInvocations)*100):0};}
function aggregateInvocationMetrics(invocations){
  invocations=invocations||[];
  var byAgent={};invocations.forEach(function(i){var a=i.selectedAgent||'unknown';byAgent[a]=(byAgent[a]||0)+1;});
  var byStatus={};invocations.forEach(function(i){byStatus[i.status]=(byStatus[i.status]||0)+1;});
  return{total:invocations.length,byAgent:byAgent,byStatus:byStatus};}
function aggregateOrchestrationMetrics(orchPlans){
  orchPlans=orchPlans||[];
  var byStatus={};orchPlans.forEach(function(o){byStatus[o.status]=(byStatus[o.status]||0)+1;});
  var avgStepCount=orchPlans.length>0?Math.round(orchPlans.reduce(function(s,o){return s+(o.steps?o.steps.length:0);},0)/orchPlans.length):0;
  return{total:orchPlans.length,byStatus:byStatus,avgStepCount:avgStepCount};}
function aggregateRiskMetrics(reports){
  reports=reports||[];
  var scores=reports.map(function(r){return r.metrics?r.metrics.avgRiskScore||0:0;});
  var avg=scores.length>0?Math.round(scores.reduce(function(a,b){return a+b;},0)/scores.length):0;
  var max=scores.length>0?Math.max.apply(null,scores):0;
  return{avgRiskScore:avg,maxRiskScore:max,totalReports:reports.length};}
function aggregateTrendMetrics(reports){
  reports=reports||[];
  var byTrend={};reports.forEach(function(r){if(r.trends){byTrend[r.trends.riskTrend]=(byTrend[r.trends.riskTrend]||0)+1;byTrend[r.trends.executionTrend]=(byTrend[r.trends.executionTrend]||0)+1;}});
  return{total:reports.length,byTrend:byTrend};}
module.exports={aggregateExecutionMetrics,aggregateInvocationMetrics,aggregateOrchestrationMetrics,aggregateRiskMetrics,aggregateTrendMetrics};
