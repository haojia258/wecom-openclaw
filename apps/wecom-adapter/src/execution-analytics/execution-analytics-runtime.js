'use strict';var t=require('./execution-analytics-types'),v=require('./execution-analytics-validator'),m=require('./execution-metrics-aggregator'),f=require('./execution-feedback-engine'),au=require('./execution-analytics-audit');
var _reports={};
function createAnalyticsReport(executionSession,orchestrationPlan,invocationPlans,previousReports){
  var val=v.validateAnalyticsInput(executionSession,orchestrationPlan,invocationPlans);
  if(!val.valid)return{success:false,error:val.errors[0].message,code:val.errors[0].code};
  var report=t.createAnalyticsReport({
    executionSessionId:executionSession.executionSessionId,
    orchestrationId:orchestrationPlan.orchestrationId,
    mode:executionSession.mode||'dry-run'
  });
  var all=m.aggregateAllMetrics(executionSession,orchestrationPlan,invocationPlans,previousReports);
  report.metrics=all.executionMetrics;
  report.feedback=f.generateFeedback(report.metrics);
  report.feedback.status=report.metrics.executionHealthScore>=90?t.ANALYTICS_STATUS.HEALTHY:report.metrics.executionHealthScore>=70?t.ANALYTICS_STATUS.WARNING:t.ANALYTICS_STATUS.CRITICAL;
  report.status=report.feedback.status;
  if(all.trendMetrics&&all.trendMetrics.total>0){
    var prevRisk=all.trendMetrics.byTrend[t.TREND_STATUS.DEGRADING]||0;
    report.trends.riskTrend=prevRisk>0?t.TREND_STATUS.DEGRADING:t.TREND_STATUS.STABLE;
  }
  _reports[report.analyticsId]=report;
  au.recordAnalyticsEvent(report.analyticsId,'analytics_created','system',{status:report.status});
  return{success:true,report:report};}
function calculateExecutionHealthScore(report){if(!report||!report.metrics)return 0;var mt=report.metrics;var s=100;if(mt.failedSteps>0)s-=mt.failedSteps*10;if(mt.skippedSteps>0)s-=mt.skippedSteps*5;if(mt.totalSteps>0&&(mt.validatedSteps/mt.totalSteps)<0.8)s-=15;if(mt.avgRiskScore>80)s-=20;else if(mt.avgRiskScore>50)s-=10;return t.normalizeScore(s);}
function calculateRiskScore(report){if(!report||!report.metrics)return 0;var mt=report.metrics;var s=0;if(mt.failedSteps>0)s+=mt.failedSteps*8;if(mt.skippedSteps>0)s+=mt.skippedSteps*4;if(report.trends&&report.trends.riskTrend===t.TREND_STATUS.DEGRADING)s+=25;if(report.status===t.ANALYTICS_STATUS.CRITICAL)s+=30;return t.normalizeScore(s);}
function generateExecutionFeedback(report){if(!report||!report.metrics)return t.createEmptyFeedback();return f.generateFeedback(report.metrics);}
function generateAnalyticsSnapshot(reports){reports=reports||Object.values(_reports);var byStatus={};reports.forEach(function(r){byStatus[r.status]=(byStatus[r.status]||0)+1;});return{success:true,snapshot:{total:reports.length,byStatus:byStatus,avgHealthScore:reports.length>0?Math.round(reports.reduce(function(s,r){return s+(r.metrics?r.metrics.executionHealthScore||0:0);},0)/reports.length):0,reports:reports,generatedAt:new Date().toISOString()}};}
function archiveAnalyticsReport(analyticsId,actor,reason){var r=_reports[analyticsId];if(!r)return{success:false,error:'not found'};r.status=t.ANALYTICS_STATUS.ARCHIVED;r.updatedAt=new Date().toISOString();au.recordAnalyticsEvent(analyticsId,'analytics_archived',actor||'system',{reason:reason});return{success:true,report:r};}
function listAnalyticsReports(filter){filter=filter||{};var ids=Object.keys(_reports),res=[];for(var i=0;i<ids.length;i++){var r=_reports[ids[i]];var ok=true;if(filter.status&&r.status!==filter.status)ok=false;if(ok)res.push(r);}return res;}
function getAnalyticsReport(analyticsId){return _reports[analyticsId]||null;}
function _reset(){_reports={};}
module.exports={createAnalyticsReport,calculateExecutionHealthScore,calculateRiskScore,generateExecutionFeedback,generateAnalyticsSnapshot,archiveAnalyticsReport,listAnalyticsReports,getAnalyticsReport,_reset};
