'use strict';var crypto=require('crypto');
var TYPES=['gmv','profit','roi','ctr','cvr','refund_rate','inventory_risk','task_success_rate','agent_success_rate','mission_completion_rate','budget_usage_rate'];
var targets={},measures={};
function createTarget(p){var id='kpi_'+Date.now().toString(36)+'_'+crypto.randomBytes(2).toString('hex');var t={id:id,type:p.type||'gmv',target:p.target||0,unit:p.unit||'',created_at:new Date().toISOString()};targets[id]=t;return{success:true,target:t};}
function measureKPI(p){var id='meas_'+Date.now().toString(36);var m={id:id,target_id:p.target_id,value:p.value||0,timestamp:new Date().toISOString()};measures[id]=m;return{success:true,measure:m};}
function getTarget(id){return targets[id]?{success:true,target:targets[id]}:{success:false};}
function listTargets(){return{success:true,targets:Object.values(targets),total:Object.keys(targets).length};}
function calculateAchievement(targetId){var t=targets[targetId];if(!t)return{success:false};var ms=Object.values(measures).filter(function(m){return m.target_id===targetId;});var latest=ms[ms.length-1]||{value:0};var rate=t.target>0?Math.round(latest.value/t.target*100):0;var alerts=[];if(rate<50)alerts.push({level:'danger',msg:'KPI严重低于目标: '+rate+'%'});else if(rate<80)alerts.push({level:'warning',msg:'KPI低于目标: '+rate+'%'});return{success:true,target_id:targetId,achievement:rate,alerts:alerts};}
function generateReport(){return{success:true,report:{targets:Object.values(targets),generated_at:new Date().toISOString()}};}
function scanAlerts(){var alerts=[];Object.keys(targets).forEach(function(k){var a=calculateAchievement(k);if(a.alerts.length>0)alerts.push({target_id:k,alerts:a.alerts});});return{success:true,alerts:alerts};}
module.exports={createTarget,measureKPI,getTarget,listTargets,calculateAchievement,generateReport,scanAlerts,TYPES};
