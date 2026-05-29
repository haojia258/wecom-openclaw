'use strict';var t=require('./execution-analytics-types');
function validateAnalyticsReport(report){var e=[];
  if(!report||typeof report!=='object'){e.push({code:t.ERROR_CODES.INVALID_ANALYTICS,message:'report required'});return{valid:false,errors:e};}
  if(!report.analyticsId||typeof report.analyticsId!=='string'||report.analyticsId.indexOf('analytics_')!==0)e.push({code:t.ERROR_CODES.INVALID_ANALYTICS_ID,message:'invalid analyticsId'});
  if(!report.metrics||typeof report.metrics!=='object')e.push({code:t.ERROR_CODES.INVALID_METRICS,message:'metrics required'});
  if(!report.feedback||typeof report.feedback!=='object')e.push({code:t.ERROR_CODES.INVALID_FEEDBACK,message:'feedback required'});
  var st=report.status||(report.feedback?report.feedback.status:null);
  if(!st||t.ANALYTICS_STATUS_VALUES.indexOf(st)===-1)e.push({code:t.ERROR_CODES.INVALID_STATUS,message:'invalid status'});
  if(report.trends){var tv=t.TREND_STATUS_VALUES;if(report.trends.riskTrend&&tv.indexOf(report.trends.riskTrend)===-1)e.push({code:t.ERROR_CODES.INVALID_TREND,message:'invalid riskTrend'});}
  return{valid:e.length===0,errors:e};}
function validateMetrics(metrics){var e=[];
  if(!metrics||typeof metrics!=='object'){e.push({code:t.ERROR_CODES.INVALID_METRICS,message:'metrics required'});return{valid:false,errors:e};}
  if(typeof metrics.totalSteps!=='number'||metrics.totalSteps<0)e.push({code:t.ERROR_CODES.INVALID_METRICS,message:'invalid totalSteps'});return{valid:e.length===0,errors:e};}
function validateFeedback(feedback){var e=[];
  if(!feedback||typeof feedback!=='object'){e.push({code:t.ERROR_CODES.INVALID_FEEDBACK,message:'feedback required'});return{valid:false,errors:e};}
  if(!feedback.status||t.ANALYTICS_STATUS_VALUES.indexOf(feedback.status)===-1)e.push({code:t.ERROR_CODES.INVALID_STATUS,message:'invalid feedback status'});return{valid:e.length===0,errors:e};}
function validateTrend(trend){var e=[];
  if(!trend||t.TREND_STATUS_VALUES.indexOf(trend)===-1){e.push({code:t.ERROR_CODES.INVALID_TREND,message:'invalid trend: '+trend});}return{valid:e.length===0,errors:e};}
function validateScore(score){var e=[];
  if(typeof score!=='number'||score<0||score>100)e.push({code:t.ERROR_CODES.INVALID_SCORE,message:'score must be 0-100'});return{valid:e.length===0,errors:e};}
function validateAnalyticsInput(executionSession,orchestrationPlan,invocationPlans){var e=[];
  if(!executionSession||!executionSession.executionSessionId)e.push({code:t.ERROR_CODES.INVALID_ANALYTICS,message:'executionSession required'});
  if(!orchestrationPlan||!orchestrationPlan.orchestrationId)e.push({code:t.ERROR_CODES.INVALID_ORCHESTRATION,message:'orchestrationPlan required'});
  if(!invocationPlans||!Array.isArray(invocationPlans))e.push({code:t.ERROR_CODES.INVALID_INVOCATION,message:'invocationPlans must be array'});return{valid:e.length===0,errors:e};}
module.exports={validateAnalyticsReport,validateMetrics,validateFeedback,validateTrend,validateScore,validateAnalyticsInput};
