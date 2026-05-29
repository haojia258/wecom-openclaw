'use strict';
var SOURCE_TYPE={GOAL:'goal',STRATEGY:'strategy',MISSION:'mission',DISPATCH:'dispatch',EXECUTION:'execution',ANALYTICS:'analytics'};
var SOURCE_TYPE_VALUES=Object.values(SOURCE_TYPE);
var CATEGORY={COMMERCE:'commerce',OPS:'ops',DEVOPS:'devops',MARKETING:'marketing',CUSTOMER:'customer',FINANCE:'finance',SECURITY:'security',RELIABILITY:'reliability',COST:'cost',PERFORMANCE:'performance',COMPLIANCE:'compliance'};
var CATEGORY_VALUES=Object.values(CATEGORY);
var OUTCOME={SUCCESS:'success',FAILURE:'failure',PARTIAL:'partial',UNKNOWN:'unknown'};
var OUTCOME_VALUES=Object.values(OUTCOME);
var ERROR_CODES={
  INVALID_KNOWLEDGE:'INVALID_KNOWLEDGE',INVALID_KNOWLEDGE_ID:'INVALID_KNOWLEDGE_ID',
  INVALID_SOURCE_TYPE:'INVALID_SOURCE_TYPE',INVALID_CATEGORY:'INVALID_CATEGORY',
  INVALID_OUTCOME:'INVALID_OUTCOME',INVALID_SCORE:'INVALID_SCORE',
  INVALID_SUMMARY:'INVALID_SUMMARY',KNOWLEDGE_NOT_FOUND:'KNOWLEDGE_NOT_FOUND',
  STORE_WRITE_ERROR:'STORE_WRITE_ERROR',STORE_READ_ERROR:'STORE_READ_ERROR',
  CAPTURE_FAILED:'CAPTURE_FAILED'
};
function createKnowledgeId(){return'kb_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}
function createKnowledgeRecord(input){
  input=input||{};var now=new Date().toISOString();
  return{
    knowledgeId:input.knowledgeId||createKnowledgeId(),
    sourceType:input.sourceType||SOURCE_TYPE.ANALYTICS,
    sourceId:input.sourceId||null,
    category:input.category||CATEGORY.OPS,
    title:input.title||'Untitled',
    summary:input.summary||'',
    outcome:input.outcome||OUTCOME.UNKNOWN,
    score:typeof input.score==='number'?Math.max(0,Math.min(100,input.score)):0,
    lessons:input.lessons||[],
    tags:input.tags||[],
    relatedIds:input.relatedIds||{},
    createdAt:now,updatedAt:now,
    metadata:input.metadata||{}
  };
}
module.exports={SOURCE_TYPE,SOURCE_TYPE_VALUES,CATEGORY,CATEGORY_VALUES,OUTCOME,OUTCOME_VALUES,ERROR_CODES,createKnowledgeId,createKnowledgeRecord};
