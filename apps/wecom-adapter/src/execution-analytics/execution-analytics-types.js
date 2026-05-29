/** execution-analytics-types.js — P9.7.5 Analytics types. Dry-run only. */
'use strict';
const ANALYTICS_STATUS={HEALTHY:'healthy',WARNING:'warning',CRITICAL:'critical',ARCHIVED:'archived'};
const ANALYTICS_STATUS_VALUES=Object.values(ANALYTICS_STATUS);
const TREND={IMPROVING:'improving',STABLE:'stable',DEGRADING:'degrading'};
const TREND_VALUES=Object.values(TREND);
const ERROR_CODES={
  INVALID_ANALYTICS:'INVALID_ANALYTICS',INVALID_ANALYTICS_ID:'INVALID_ANALYTICS_ID',
  INVALID_METRICS:'INVALID_METRICS',INVALID_FEEDBACK:'INVALID_FEEDBACK',
  INVALID_STATUS:'INVALID_STATUS',INVALID_TREND:'INVALID_TREND',
  INVALID_SCORE:'INVALID_SCORE',INVALID_REPORT:'INVALID_REPORT',
  INVALID_RECOMMENDATION:'INVALID_RECOMMENDATION',INVALID_WARNING:'INVALID_WARNING',
  INVALID_RISK:'INVALID_RISK',INVALID_ORCHESTRATION:'INVALID_ORCHESTRATION',
  INVALID_INVOCATION:'INVALID_INVOCATION',AUTO_FIX_FORBIDDEN:'AUTO_FIX_FORBIDDEN',
  REAL_METRICS_FORBIDDEN:'REAL_METRICS_FORBIDDEN'
};
const AUDIT_EVENT={ANALYTICS_CREATED:'analytics_created',ANALYTICS_UPDATED:'analytics_updated',FEEDBACK_GENERATED:'feedback_generated',SNAPSHOT_GENERATED:'snapshot_generated',ANALYTICS_ARCHIVED:'analytics_archived'};
function createAnalyticsId(){return'analytics_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}
function createAnalyticsReport(execSession,orchPlan,invocations,options){
  options=options||{};var now=new Date().toISOString();
  return{
    analyticsId:options.analyticsId||createAnalyticsId(),
    executionSessionId:(execSession&&execSession.executionSessionId)||null,
    orchestrationId:(orchPlan&&orchPlan.orchestrationId)||null,
    mode:options.mode||'dry-run',
    metrics:{totalSteps:0,validatedSteps:0,failedSteps:0,skippedSteps:0,totalInvocations:0,dryRunCompleted:0,avgRiskScore:0,executionHealthScore:0,orchestrationQualityScore:0},
    feedback:{status:ANALYTICS_STATUS.HEALTHY,recommendations:[],warnings:[],risks:[]},
    trends:{riskTrend:TREND.STABLE,executionTrend:TREND.STABLE,orchestrationTrend:TREND.STABLE},
    createdAt:now,updatedAt:now,metadata:options.metadata||{}
  };
}
module.exports={ANALYTICS_STATUS,ANALYTICS_STATUS_VALUES,TREND,TREND_VALUES,ERROR_CODES,AUDIT_EVENT,createAnalyticsId,createAnalyticsReport};
