'use strict';
var MEMORY_TYPE={KNOWLEDGE:'knowledge',INSIGHT:'insight',EXPERIENCE:'experience',PATTERN:'pattern',WARNING:'warning',RECOMMENDATION:'recommendation'};
var MEMORY_TYPE_VALUES=Object.values(MEMORY_TYPE);
var ERROR_CODES={
  INVALID_MEMORY:'INVALID_MEMORY',INVALID_MEMORY_ID:'INVALID_MEMORY_ID',
  INVALID_MEMORY_TYPE:'INVALID_MEMORY_TYPE',INVALID_CONTENT:'INVALID_CONTENT',
  MEMORY_NOT_FOUND:'MEMORY_NOT_FOUND',QUERY_FAILED:'QUERY_FAILED',
  STORE_WRITE_ERROR:'STORE_WRITE_ERROR'
};
function createMemoryId(){return'mem_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}
function createMemory(input){
  input=input||{};var now=new Date().toISOString();
  return{
    memoryId:input.memoryId||createMemoryId(),
    type:input.type||MEMORY_TYPE.KNOWLEDGE,
    category:input.category||'ops',
    title:input.title||'',
    content:input.content||'',
    score:typeof input.score==='number'?input.score:0,
    tags:input.tags||[],
    sourceId:input.sourceId||null,
    relatedIds:input.relatedIds||{},
    createdAt:now,updatedAt:now,
    metadata:input.metadata||{}
  };
}
module.exports={MEMORY_TYPE,MEMORY_TYPE_VALUES,ERROR_CODES,createMemoryId,createMemory};
