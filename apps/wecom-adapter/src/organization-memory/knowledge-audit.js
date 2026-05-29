'use strict';var _events=[];
function recordKnowledgeEvent(knowledgeId,type,actor,details){
  var e={eventId:'kb_audit_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6),knowledgeId:knowledgeId,type:type,actor:actor||'system',details:details||{},createdAt:new Date().toISOString()};_events.push(e);return e;}
function listKnowledgeEvents(filter){if(!filter)return _events.slice();return _events.filter(function(e){return(!filter.knowledgeId||e.knowledgeId===filter.knowledgeId)&&(!filter.type||e.type===filter.type);});}
function _reset(){_events=[];}
module.exports={recordKnowledgeEvent,listKnowledgeEvents,_reset};
