/** execution-analytics-runtime.js — P9.7.5 Core analytics API. No auto-fix. */
'use strict';var t=require('./execution-analytics-types'),v=require('./execution-analytics-validator'),m=require('./execution-metrics-aggregator'),f=require('./execution-feedback-engine'),au=require('./execution-analytics-audit');
var _reports={};
function createAnalyticsReport(execSession,orchPlan,invocations,options){
  var r=t.createAnalyticsReport(execSession,orchPlan,invocations,options);
  if(orchPlan&&orchPlan.steps){var steps=orchPlan.steps;r.metrics.totalSteps=steps.length;
    r.metrics.validatedSteps=steps.filter(function(s){return s.status==='validated'||s.status==='dry_run_completed';}).length;
    r.metrics.failedSteps=steps.filter(function(s){return s.status==='failed';}).length;
    r.metrics.skippedSteps=steps.filter(function(s){return s.status==='skipped';}).length;}
  if(invocations){r.metrics.totalInvocations=invocations.length;r.metrics.dryRunCompleted=invocations.filter(function(i){return i.status==='dry_run_completed';}).length;}
  r.metrics.avgRiskScore=calculateRiskScore(r);r.metrics.executionHealthScore=calculateExecutionHealthScore(r);r.metrics.orchestrationQualityScore=calculateOrchestrationQualityScore(r);
  r.feedback=f.generateFeedback(r);r.feedback.status=determineStatus(r);
  _reports[r.analyticsId]=r;au.recordAnalyticsEvent(r.analyticsId,t.AUDIT_EVENT.ANALYTICS_CREATED,'system',{status:r.feedback.status});
  return{success:true,report:r};}
function calculateExecutionHealthScore(report){if(!report)return 0;var m=report.metrics;if(!m)return 0;
  var s=100;if(m.failedSteps>0)s-=m.failedSteps*10;if(m.skippedSteps>0)s-=m.skippedSteps*5;
  if(m.totalSteps>0&&(m.validatedSteps/m.totalSteps)<0.8)s-=15;if(m.avgRiskScore>80)s-=20;else if(m.avgRiskScore>50)s-=10;
  if(report.status===t.ANALYTICS_STATUS.CRITICAL)s-=30;else if(report.status===t.ANALYTICS_STATUS.WARNING)s-=15;
  return Math.max(0,Math.min(100,s));}
function calculateRiskScore(report){if(!report)return 0;var m=report.metrics;if(!m)return 0;
  var s=0;if(m.failedSteps>0)s+=m.failedSteps*8;if(m.skippedSteps>0)s+=m.skippedSteps*4;
  if(report.trends&&report.trends.riskTrend===t.TREND.DEGRADING)s+=25;if(report.status===t.ANALYTICS_STATUS.CRITICAL)s+=30;
  return Math.min(100,s);}
function calculateOrchestrationQualityScore(report){
  var m=report.metrics;if(!m)return 0;
  var s=100;if(m.totalSteps>10)s-=(m.totalSteps-10)*3;
  if(m.totalSteps>0&&(m.validatedSteps/m.totalSteps)<0.9)s-=10;if(m.failedSteps>0)s-=m.failedSteps*15;
  return Math.max(0,Math.min(100,s));}
function determineStatus(report){var h=report.metrics?report.metrics.executionHealthScore||0:0;if(h>=90)return t.ANALYTICS_STATUS.HEALTHY;if(h>=70)return t.ANALYTICS_STATUS.WARNING;return t.ANALYTICS_STATUS.CRITICAL;}
function generateExecutionFeedback(report){return f.generateFeedback(report);}
function generateAnalyticsSnapshot(reports){reports=reports||Object.values(_reports);var byStatus={};reports.forEach(function(r){byStatus[r.feedback?r.feedback.status:r.status]=(byStatus[r.feedback?r.feedback.status:r.status]||0)+1;});return{success:true,snapshot:{total:reports.length,byStatus:byStatus,avgHealthScore:reports.length>0?Math.round(reports.reduce(function(s,r){return s+(r.metrics?r.metrics.executionHealthScore||0:0);},0)/reports.length):0,reports:reports,generatedAt:new Date().toISOString()}};}
function archiveAnalyticsReport(id,actor,reason){var r=_reports[id];if(!r)return{success:false,error:'not found'};r.status=t.ANALYTICS_STATUS.ARCHIVED;r.updatedAt=new Date().toISOString();au.recordAnalyticsEvent(id,t.AUDIT_EVENT.ANALYTICS_ARCHIVED,actor||'system',{reason:reason});return{success:true,report:r};}
function listAnalyticsReports(filter){filter=filter||{};var ids=Object.keys(_reports),res=[];for(var i=0;i<ids.length;i++){var r=_reports[ids[i]];var ok=true;if(filter.status&&r.feedback&&r.feedback.status!==filter.status)ok=false;if(ok)res.push(r);}return res;}
function getAnalyticsReport(id){return _reports[id]||null;}
function _clearAll(){_reports={};}
module.exports={createAnalyticsReport,calculateExecutionHealthScore,calculateRiskScore,generateExecutionFeedback,generateAnalyticsSnapshot,archiveAnalyticsReport,listAnalyticsReports,getAnalyticsReport,_clearAll};
