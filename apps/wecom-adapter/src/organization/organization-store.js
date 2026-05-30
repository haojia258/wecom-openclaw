'use strict';
var crypto=require('crypto');

var ROLES={
CEO:{domains:['all'],kpis:['all'],budgets:['all'],missions:['all'],level:1},
COO:{domains:['commerce','customer'],kpis:['gmv','refund_rate','task_success_rate'],budgets:['server','tool'],missions:['development','deployment'],level:2},
CTO:{domains:['devops'],kpis:['agent_success_rate','mission_completion_rate'],budgets:['server','token','tool'],missions:['development','deployment','autonomous'],level:2},
CMO:{domains:['marketing','commerce'],kpis:['gmv','roi','ctr','cvr'],budgets:['ads','campaign'],missions:['commerce','report'],level:2},
CFO:{domains:['all'],kpis:['profit','roi','budget_usage_rate'],budgets:['all'],missions:['audit','report'],level:2}
};

var missions={};

function getRoles(){
  return{success:true,roles:Object.keys(ROLES).map(function(k){
    return{role:k,level:ROLES[k].level,domains:ROLES[k].domains,kpis:ROLES[k].kpis,budgets:ROLES[k].budgets};
  })};
}

function getRole(role){
  var r=ROLES[role];
  return r?{success:true,role:role,permissions:r}:{success:false};
}

function getOrgGraph(){
  var nodes=[
    {id:'CEO',role:'CEO',level:1,children:['COO','CTO','CMO','CFO']},
    {id:'COO',role:'COO',level:2,parent:'CEO'},
    {id:'CTO',role:'CTO',level:2,parent:'CEO'},
    {id:'CMO',role:'CMO',level:2,parent:'CEO'},
    {id:'CFO',role:'CFO',level:2,parent:'CEO'}
  ];
  return{success:true,graph:{nodes:nodes,root:'CEO'}};
}

function createMission(p){
  var role=p.role||'CEO';
  var r=ROLES[role];
  if(!r)return{success:false};
  var id='om_'+Date.now().toString(36)+'_'+crypto.randomBytes(2).toString('hex');
  var m={mission_id:id,role:role,domain:p.domain||'general',text:p.text||'',status:'created',assigned_to:[],created_at:new Date().toISOString()};
  missions[id]=m;
  return{success:true,mission:m};
}

function assignMission(missionId,agentRole){
  var m=missions[missionId];
  if(!m)return{success:false};
  if(!ROLES[agentRole])return{success:false};
  m.assigned_to.push(agentRole);m.status='assigned';
  return{success:true,mission:m};
}

module.exports={getRoles,getRole,getOrgGraph,createMission,assignMission,ROLES};
