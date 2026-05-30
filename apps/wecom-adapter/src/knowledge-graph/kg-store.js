'use strict';var crypto=require('crypto');
var entities={},relations={};
var ETYPES=['product','sku','customer','campaign','ad','video','order','refund','mission','agent','event','kpi','budget','domain'];
var RTYPES=['caused_by','depends_on','belongs_to','created_by','executed_by','improves','degrades','mentions','observed_in','approved_by'];
function createEntity(p){var id='ent_'+Date.now().toString(36)+'_'+crypto.randomBytes(2).toString('hex');var e={id:id,type:p.type||'domain',name:p.name||'',props:p.props||{},created_at:new Date().toISOString()};entities[id]=e;return{success:true,entity:e};}
function getEntity(id){return entities[id]?{success:true,entity:entities[id]}:{success:false};}
function listEntities(f){var l=Object.values(entities);if(f&&f.type)l=l.filter(function(e){return e.type===f.type;});return{success:true,entities:l,total:l.length};}
function createRelation(p){if(!entities[p.from]||!entities[p.to])return{success:false};if(!RTYPES.includes(p.type))return{success:false};var id='rel_'+Date.now().toString(36);relations[id]={id:id,from:p.from,to:p.to,type:p.type,created_at:new Date().toISOString()};return{success:true,relation:relations[id]};}
function listRelations(f){var l=Object.values(relations);return{success:true,relations:l,total:l.length};}
function getNeighbors(id){var r=Object.values(relations).filter(function(r){return r.from===id||r.to===id;});return{success:true,entity_id:id,neighbors:r};}
function queryGraph(q){return{success:true,query:q,results:Object.values(entities).slice(0,10)};}
module.exports={createEntity,getEntity,listEntities,createRelation,listRelations,getNeighbors,queryGraph,ETYPES,RTYPES};
