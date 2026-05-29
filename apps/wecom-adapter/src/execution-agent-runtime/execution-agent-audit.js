/** execution-agent-audit.js — P9.7.4 audit logging */
'use strict';var _events=[];
function recordAgentRuntimeEvent(invocationId,eventType,actor,details){
  var e={eventId:'agent_audit_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6),invocationId:invocationId,event:eventType,actor:actor||'system',details:details||{},createdAt:new Date().toISOString()};_events.push(e);return e;}
function listAgentRuntimeEvents(invocationId){if(!invocationId)return _events.slice();return _events.filter(function(e){return e.invocationId===invocationId;});}
function generateAgentRuntimeAuditSnapshot(invocationId){var evts=invocationId?listAgentRuntimeEvents(invocationId):_events.slice();return{totalEvents:evts.length,events:evts.slice(-20),generatedAt:new Date().toISOString()};}
function _clearAll(){_events=[];}
module.exports={recordAgentRuntimeEvent,listAgentRuntimeEvents,generateAgentRuntimeAuditSnapshot,_clearAll};
