'use strict';var t=require('./knowledge-types');
function validateKnowledge(kb){var e=[];
  if(!kb||typeof kb!=='object'){e.push({code:t.ERROR_CODES.INVALID_KNOWLEDGE,message:'kb required'});return{valid:false,errors:e};}
  if(!kb.knowledgeId||typeof kb.knowledgeId!=='string'||kb.knowledgeId.indexOf('kb_')!==0)e.push({code:t.ERROR_CODES.INVALID_KNOWLEDGE_ID,message:'knowledgeId must start with kb_'});
  if(!kb.sourceType||t.SOURCE_TYPE_VALUES.indexOf(kb.sourceType)===-1)e.push({code:t.ERROR_CODES.INVALID_SOURCE_TYPE,message:'invalid sourceType'});
  if(!kb.category||t.CATEGORY_VALUES.indexOf(kb.category)===-1)e.push({code:t.ERROR_CODES.INVALID_CATEGORY,message:'invalid category'});
  if(!kb.outcome||t.OUTCOME_VALUES.indexOf(kb.outcome)===-1)e.push({code:t.ERROR_CODES.INVALID_OUTCOME,message:'invalid outcome'});
  if(typeof kb.score!=='number'||kb.score<0||kb.score>100)e.push({code:t.ERROR_CODES.INVALID_SCORE,message:'score 0-100'});
  if(!kb.summary||typeof kb.summary!=='string')e.push({code:t.ERROR_CODES.INVALID_SUMMARY,message:'summary required'});
  return{valid:e.length===0,errors:e};}
function validateInput(input){var e=[];
  if(!input||typeof input!=='object'){e.push({code:t.ERROR_CODES.INVALID_KNOWLEDGE,message:'input required'});return{valid:false,errors:e};}
  return{valid:true,errors:[]};}
module.exports={validateKnowledge,validateInput};
