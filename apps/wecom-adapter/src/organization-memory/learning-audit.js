'use strict';var _events=[];
function recordLearningEvent(insightId,type,actor,details){var e={eventId:'lrn_audit_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6),insightId:insightId,type:type,actor:actor||'system',details:details||{},createdAt:new Date().toISOString()};_events.push(e);return e;}
function listLearningEvents(filter){if(!filter)return _events.slice();return _events.filter(function(e){return(!filter.insightId||e.insightId===filter.insightId)&&(!filter.type||e.type===filter.type);});}
function _reset(){_events=[];}
module.exports={recordLearningEvent,listLearningEvents,_reset};
