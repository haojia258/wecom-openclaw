'use strict';
var crypto=require('crypto');
var events={},deadLetter={};
var TYPES=['GMV_DROP','REFUND_SPIKE','AGENT_OFFLINE','TASK_FAILED','APPROVAL_REQUIRED','DEPLOY_BLOCKED','MISSION_COMPLETED'];
function publishEvent(params) {
  var id='evt_'+Date.now().toString(36)+'_'+crypto.randomBytes(2).toString('hex');
  var e={event_id:id,type:params.type||'unknown',source:params.source||'',payload:params.payload||{},status:'published',created_at:new Date().toISOString(),retries:0};
  events[id]=e;return{success:true,event:e};
}
function listEvents(f){var l=Object.values(events);if(f&&f.type)l=l.filter(function(e){return e.type===f.type;});if(f&&f.status)l=l.filter(function(e){return e.status===f.status;});return{success:true,events:l,total:l.length};}
function getEvent(id){return events[id]?{success:true,event:events[id]}:{success:false};}
function ackEvent(id){var e=events[id];if(!e)return{success:false};e.status='acknowledged';return{success:true,event:e};}
function retryEvent(id){var e=events[id];if(!e)return{success:false};e.retries++;e.status=e.retries>3?'dead_letter':'retrying';if(e.status==='dead_letter')deadLetter[id]=e;return{success:true,event:e};}
function getDeadLetter(){return{success:true,events:Object.values(deadLetter)};}
function replayEvent(id){var e=deadLetter[id]||events[id];if(!e)return{success:false};e.status='published';e.retries=0;return{success:true,event:e};}
module.exports={publishEvent,listEvents,getEvent,ackEvent,retryEvent,getDeadLetter,replayEvent,TYPES};
