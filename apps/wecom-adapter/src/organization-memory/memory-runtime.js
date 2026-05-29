'use strict';var t=require('./memory-types'),v=require('./memory-validator'),st=require('./memory-store'),q=require('./memory-query-engine');
function addMemory(input){var m=t.createMemory(input);var vr=v.validateMemory(m);if(!vr.valid)return{success:false,error:vr.errors[0].message,code:vr.errors[0].code};return st.addMemory(m);}
function getMemory(id){return st.getMemory(id);}
function listMemory(filter){return st.listMemory(filter);}
function searchMemory(query){return q.searchMemory(query);}
function findSimilarGoals(goal){return q.findSimilarGoals(goal);}
function findRelevantInsights(category){return q.findRelevantInsights(category);}
function generateMemorySnapshot(){
  var all=st.listMemory();var byType={},byCategory={};
  all.forEach(function(m){byType[m.type]=(byType[m.type]||0)+1;byCategory[m.category]=(byCategory[m.category]||0)+1;});
  return{total:all.length,byType:byType,byCategory:byCategory,records:all,generatedAt:new Date().toISOString()};}
function addBulkKnowledge(records){
  if(!records||!Array.isArray(records))records=[];var results=[];
  for(var i=0;i<records.length;i++){
    var input={type:t.MEMORY_TYPE.KNOWLEDGE,category:records[i].category||'ops',title:records[i].title||'K'+i,content:records[i].summary||'',score:records[i].score||0,tags:records[i].tags||[],sourceId:records[i].knowledgeId,relatedIds:records[i].relatedIds||{}};
    results.push(addMemory(input));}
  return{success:true,total:records.length,added:results.filter(function(r){return r.success;}).length};}
function _reset(){st._clearAll();}
module.exports={addMemory,getMemory,listMemory,searchMemory,findSimilarGoals,findRelevantInsights,generateMemorySnapshot,addBulkKnowledge,_reset};
