'use strict';var _events=[];
function recordReplayEvent(replayId,type,actor,details){var e={eventId:'rpl_audit_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6),replayId:replayId,type:type,actor:actor||'system',details:details||{},createdAt:new Date().toISOString()};_events.push(e);return e;}
function listReplayEvents(filter){if(!filter)return _events.slice();return _events.filter(function(e){return(!filter.replayId||e.replayId===filter.replayId)&&(!filter.type||e.type===filter.type);});}
function _reset(){_events=[];}
module.exports={recordReplayEvent,listReplayEvents,_reset};
