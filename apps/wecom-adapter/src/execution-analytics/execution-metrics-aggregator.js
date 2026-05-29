'use strict';var t=require('./execution-analytics-types');
function aggregateExecutionMetrics(executionSession){
  var m=t.createEmptyMetrics();
  if(!executionSession||!executionSession.steps)return m;
  var steps=executionSession.steps;m.totalSteps=steps.length;
  m.validatedSteps=steps.filter(function(s){return s.status==='validated'||s.status==='dry_run_completed';}).length;
  m.failedSteps=steps.filter(function(s){return s.status==='failed';}).length;
  m.skippedSteps=steps.filter(function(s){return s.status==='skipped';}).length;
  return m;}
function aggregateOrchestrationMetrics(orchestrationPlan){
  var m=t.createEmptyMetrics();
  if(!orchestrationPlan||!orchestrationPlan.steps)return m;
  var steps=orchestrationPlan.steps;m.totalSteps=steps.length;
  m.validatedSteps=steps.filter(function(s){return s.status==='validated'||s.status==='dry_run_completed';}).length;
  m.failedSteps=steps.filter(function(s){return s.status==='failed';}).length;
  m.skippedSteps=steps.filter(function(s){return s.status==='skipped';}).length;
  return m;}
function aggregateInvocationMetrics(invocationPlans){
  if(!invocationPlans||!Array.isArray(invocationPlans))return{total:0,byAgent:{},byStatus:{}};
  var byAgent={},byStatus={};invocationPlans.forEach(function(i){var a=i.selectedAgent||'unknown';byAgent[a]=(byAgent[a]||0)+1;byStatus[i.status]=(byStatus[i.status]||0)+1;});
  return{total:invocationPlans.length,byAgent:byAgent,byStatus:byStatus};}
function aggregateRiskMetrics(executionSession,orchestrationPlan,invocationPlans){
  var m=aggregateExecutionMetrics(executionSession);
  var s=0;if(m.failedSteps>0)s+=m.failedSteps*8;if(m.skippedSteps>0)s+=m.skippedSteps*4;
  return{riskScore:t.normalizeScore(s),failedSteps:m.failedSteps,skippedSteps:m.skippedSteps};}
function aggregateTrendMetrics(reports){
  if(!reports||!Array.isArray(reports))return{total:0,byTrend:{}};
  var byTrend={};reports.forEach(function(r){if(r.trends){byTrend[r.trends.riskTrend]=(byTrend[r.trends.riskTrend]||0)+1;}});
  return{total:reports.length,byTrend:byTrend};}
function aggregateAllMetrics(executionSession,orchestrationPlan,invocationPlans,previousReports){
  var exec=aggregateExecutionMetrics(executionSession);
  var orch=aggregateOrchestrationMetrics(orchestrationPlan);
  var inv=aggregateInvocationMetrics(invocationPlans);
  var risk=aggregateRiskMetrics(executionSession,orchestrationPlan,invocationPlans);
  var trend=aggregateTrendMetrics(previousReports||[]);
  exec.totalInvocations=inv.total;exec.dryRunCompleted=inv.byStatus['dry_run_completed']||0;
  exec.avgRiskScore=risk.riskScore;exec.executionHealthScore=calculateHealthFromMetrics(exec);
  exec.orchestrationQualityScore=calculateQualityFromMetrics(orch);
  return{executionMetrics:exec,orchMetrics:orch,invocationMetrics:inv,riskMetrics:risk,trendMetrics:trend};}
function calculateHealthFromMetrics(m){
  var s=100;if(m.failedSteps>0)s-=m.failedSteps*10;if(m.skippedSteps>0)s-=m.skippedSteps*5;
  if(m.totalSteps>0&&(m.validatedSteps/m.totalSteps)<0.8)s-=15;if(m.avgRiskScore>80)s-=20;else if(m.avgRiskScore>50)s-=10;
  return t.normalizeScore(s);}
function calculateQualityFromMetrics(m){
  var s=100;if(m.totalSteps>10)s-=(m.totalSteps-10)*3;
  if(m.totalSteps>0&&(m.validatedSteps/m.totalSteps)<0.9)s-=10;if(m.failedSteps>0)s-=m.failedSteps*15;
  return t.normalizeScore(s);}
module.exports={aggregateExecutionMetrics,aggregateOrchestrationMetrics,aggregateInvocationMetrics,aggregateRiskMetrics,aggregateTrendMetrics,aggregateAllMetrics};
