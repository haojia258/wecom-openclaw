'use strict';
/** Memory Fabric - P16 */
var crypto=require('crypto');
var TYPES=['mission','artifact','event','agent','domain','customer','product','campaign','risk','kpi','approval'];
var store={},links={};

function recordMemory(p){
  var id='mem_'+Date.now().toString(36)+'_'+crypto.randomBytes(2).toString('hex');
  var m={id:id,type:p.type||'general',source:p.source||'',content:p.content||'',tags:p.tags||[],created_at:new Date().toISOString(),expires_at:p.expires_at||null,linked:[]};
  store[id]=m;return{success:true,memory:m};
}
function getMemory(id){return store[id]?{success:true,memory:store[id]}:{success:false};}
function listMemories(f){
  var l=Object.values(store);
  if(f&&f.type)l=l.filter(function(m){return m.type===f.type;});
  if(f&&f.source)l=l.filter(function(m){return m.source===f.source;});
  return{success:true,memories:l,total:l.length};
}
function searchMemories(q){
  q=(q||'').toLowerCase();var l=Object.values(store).filter(function(m){return m.content.toLowerCase().indexOf(q)!==-1||m.tags.some(function(t){return t.toLowerCase().indexOf(q)!==-1;});});
  return{success:true,results:l,total:l.length};
}
function linkMemory(id1,id2,rel){
  if(!store[id1]||!store[id2])return{success:false};
  links[id1]=links[id1]||[];links[id2]=links[id2]||[];
  links[id1].push({target:id2,relation:rel||'related'});links[id2].push({target:id1,relation:rel||'related'});
  return{success:true};
}
function summarizeMemory(filter){var l=listMemories(filter).memories;return{success:true,summary:{total:l.length,by_type:{},timestamp:new Date().toISOString()}};}
function expireMemory(){var now=new Date();var expired=[];Object.keys(store).forEach(function(k){if(store[k].expires_at&&new Date(store[k].expires_at)<now){expired.push(store[k]);delete store[k];}});return{success:true,expired:expired};}
module.exports={recordMemory,getMemory,listMemories,searchMemories,linkMemory,summarizeMemory,expireMemory,TYPES};
