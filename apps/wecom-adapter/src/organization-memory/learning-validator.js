'use strict';var t=require('./learning-types');
function validateLearningInsight(insight){var e=[];
  if(!insight||typeof insight!=='object'){e.push({code:t.ERROR_CODES.INVALID_INSIGHT});return{valid:false,errors:e};}
  if(!insight.insightId||typeof insight.insightId!=='string'||insight.insightId.indexOf('insight_')!==0)e.push({code:t.ERROR_CODES.INVALID_INSIGHT_ID});
  if(!insight.insightType||t.INSIGHT_TYPE_VALUES.indexOf(insight.insightType)===-1)e.push({code:t.ERROR_CODES.INVALID_INSIGHT_TYPE});
  if(typeof insight.confidence!=='number'||insight.confidence<0||insight.confidence>1)e.push({code:t.ERROR_CODES.INVALID_CONFIDENCE});
  return{valid:e.length===0,errors:e};}
function validateRecommendation(rec){var e=[];
  if(!rec||typeof rec!=='string'||rec.length===0)e.push({code:t.ERROR_CODES.INVALID_RECOMMENDATION});return{valid:e.length===0,errors:e};}
module.exports={validateLearningInsight,validateRecommendation};
