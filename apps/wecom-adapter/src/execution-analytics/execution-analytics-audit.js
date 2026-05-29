'use strict';var _events=[];
function recordAnalyticsEvent(analyticsId,type,actor,details){
  var e={eventId:'aa_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6),analyticsId:analyticsId,type:type,actor:actor||'system',details:details||{},createdAt:new Date().toISOString()};_events.push(e);return e;}
function listAnalyticsEvents(filter){if(!filter)return _events.slice();return _events.filter(function(e){return(!filter.analyticsId||e.analyticsId===filter.analyticsId)&&(!filter.type||e.type===filter.type);});}
function generateAnalyticsAuditSnapshot(events){var evts=events||_events;return{totalEvents:evts.length,events:evts.slice(-20),generatedAt:new Date().toISOString()};}
function _reset(){_events=[];}
module.exports={recordAnalyticsEvent,listAnalyticsEvents,generateAnalyticsAuditSnapshot,_reset};
