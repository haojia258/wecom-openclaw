/** execution-analytics-validator.js — P9.7.5 */
'use strict';var t=require('./execution-analytics-types');
function validateAnalyticsReport(r){var e=[];if(!r||typeof r!=='object'){e.push({code:t.ERROR_CODES.INVALID_ANALYTICS});return{valid:false,errors:e};}
if(!r.analyticsId||typeof r.analyticsId!=='string'||r.analyticsId.indexOf('analytics_')!==0)e.push({code:t.ERROR_CODES.INVALID_ANALYTICS_ID});
if(!r.metrics||typeof r.metrics!=='object')e.push({code:t.ERROR_CODES.INVALID_METRICS});
if(!r.feedback||typeof r.feedback!=='object')e.push({code:t.ERROR_CODES.INVALID_FEEDBACK});
if(t.ANALYTICS_STATUS_VALUES.indexOf(r.feedback?r.feedback.status:r.status)===-1)e.push({code:t.ERROR_CODES.INVALID_STATUS});
if(r.trends){var tv=t.TREND_VALUES;if(r.trends.riskTrend&&tv.indexOf(r.trends.riskTrend)===-1)e.push({code:t.ERROR_CODES.INVALID_TREND});if(r.trends.executionTrend&&tv.indexOf(r.trends.executionTrend)===-1)e.push({code:t.ERROR_CODES.INVALID_TREND});}
return{valid:e.length===0,errors:e};}
function validateScore(score){if(typeof score!=='number'||score<0||score>100)return{valid:false,errors:[{code:t.ERROR_CODES.INVALID_SCORE}]};return{valid:true,errors:[]};}
function validateRecommendation(rec){if(!rec||typeof rec!=='string'||rec.length===0)return{valid:false,errors:[{code:t.ERROR_CODES.INVALID_RECOMMENDATION}]};return{valid:true,errors:[]};}
module.exports={validateAnalyticsReport,validateScore,validateRecommendation};
