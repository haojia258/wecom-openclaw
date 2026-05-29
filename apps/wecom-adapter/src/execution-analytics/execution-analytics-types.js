'use strict';
var ANALYTICS_STATUS={HEALTHY:'healthy',WARNING:'warning',CRITICAL:'critical',ARCHIVED:'archived'};
var ANALYTICS_STATUS_VALUES=Object.values(ANALYTICS_STATUS);
var TREND_STATUS={IMPROVING:'improving',STABLE:'stable',DEGRADING:'degrading'};
var TREND_STATUS_VALUES=Object.values(TREND_STATUS);
var ERROR_CODES={
  INVALID_ANALYTICS:'INVALID_ANALYTICS',INVALID_ANALYTICS_ID:'INVALID_ANALYTICS_ID',
  INVALID_METRICS:'INVALID_METRICS',INVALID_FEEDBACK:'INVALID_FEEDBACK',
  INVALID_STATUS:'INVALID_STATUS',INVALID_TREND:'INVALID_TREND',
  INVALID_SCORE:'INVALID_SCORE',INVALID_REPORT:'INVALID_REPORT',
  INVALID_RECOMMENDATION:'INVALID_RECOMMENDATION',INVALID_WARNING:'INVALID_WARNING',
  INVALID_RISK:'INVALID_RISK',INVALID_ORCHESTRATION:'INVALID_ORCHESTRATION',
  INVALID_INVOCATION:'INVALID_INVOCATION',AUTO_FIX_FORBIDDEN:'AUTO_FIX_FORBIDDEN',
  REAL_METRICS_FORBIDDEN:'REAL_METRICS_FORBIDDEN'
};
function createAnalyticsId(){return'analytics_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}
function normalizeScore(value){if(typeof value!=='number')return 0;return Math.max(0,Math.min(100,Math.round(value)));}
function createEmptyMetrics(){return{totalSteps:0,validatedSteps:0,failedSteps:0,skippedSteps:0,totalInvocations:0,dryRunCompleted:0,avgRiskScore:0,executionHealthScore:0,orchestrationQualityScore:0};}
function createEmptyFeedback(){return{status:ANALYTICS_STATUS.HEALTHY,recommendations:[],warnings:[],risks:[]};}
function createAnalyticsReport(input){
  input=input||{};var now=new Date().toISOString();
  return{
    analyticsId:input.analyticsId||createAnalyticsId(),
    executionSessionId:input.executionSessionId||null,
    orchestrationId:input.orchestrationId||null,
    mode:input.mode||'dry-run',
    metrics:input.metrics||createEmptyMetrics(),
    feedback:input.feedback||createEmptyFeedback(),
    trends:{riskTrend:TREND_STATUS.STABLE,executionTrend:TREND_STATUS.STABLE,orchestrationTrend:TREND_STATUS.STABLE},
    status:ANALYTICS_STATUS.HEALTHY,
    createdAt:now,updatedAt:now,metadata:input.metadata||{}
  };
}
module.exports={ANALYTICS_STATUS,ANALYTICS_STATUS_VALUES,TREND_STATUS,TREND_STATUS_VALUES,ERROR_CODES,createAnalyticsId,normalizeScore,createEmptyMetrics,createEmptyFeedback,createAnalyticsReport};
