'use strict';
var crypto=require('crypto');
var RULES={
  GMV_DROP:{domain:'commerce',mission_type:'recovery',agents:['codex','workbuddy','deepseek'],requiresApproval:false},
  REFUND_SPIKE:{domain:'commerce',mission_type:'audit',agents:['deepseek','workbuddy'],requiresApproval:false},
  AGENT_OFFLINE:{domain:'devops',mission_type:'recovery',agents:['workbuddy'],requiresApproval:false},
  TASK_FAILED:{domain:'general',mission_type:'recovery',agents:['workbuddy'],requiresApproval:false},
  APPROVAL_REQUIRED:{domain:'general',mission_type:'audit',agents:['deepseek'],requiresApproval:true},
  DEPLOY_BLOCKED:{domain:'devops',mission_type:'security',agents:['workbuddy','deepseek'],requiresApproval:true},
  MISSION_COMPLETED:{domain:'general',mission_type:'report',agents:['doubao'],requiresApproval:false}
};
var missions={};
function generate(event){var rule=RULES[event.type];if(!rule)return{success:false,error:'no rule for: '+event.type};var id='mg_'+Date.now().toString(36)+'_'+crypto.randomBytes(2).toString('hex');var m={mission_id:id,domain:rule.domain,type:rule.mission_type,agents:rule.agents,requiresApproval:rule.requiresApproval,trigger_event:event,status:'created',created_at:new Date().toISOString()};missions[id]=m;return{success:true,mission:m};}
function dryRun(event){var rule=RULES[event.type];return{success:true,will_generate:!!rule,rule:rule||null};}
function listRules(){return{success:true,rules:Object.keys(RULES).map(function(k){var r=RULES[k];return{event:k,domain:r.domain,agents:r.agents,requiresApproval:r.requiresApproval};})};}
function listMissions(){return{success:true,missions:Object.values(missions)};}
module.exports={generate,dryRun,listRules,listMissions,RULES};
