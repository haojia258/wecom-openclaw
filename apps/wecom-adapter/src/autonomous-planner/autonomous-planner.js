'use strict';
var crypto=require('crypto');
var FORBIDDEN=['env.write','nginx.modify','secrets.write','vault.modify'];
var REQUIRES_APPROVAL=['deploy.production','pm2.restart','git.merge'];
var plans={};
function createPlan(params){
  var domain=params.domain||'commerce';
  var agents=['codex','workbuddy','deepseek','doubao'];
  var id='ap_'+Date.now().toString(36)+'_'+crypto.randomBytes(2).toString('hex');
  var nodes=agents.map(function(a,i){return{id:'n'+i,agent:a,action:a==='codex'?'code.patch':a==='deepseek'?'audit.review':a==='doubao'?'report.write':'test.run',status:'pending',requiresApproval:false};});
  // Add approval nodes for sensitive actions
  REQUIRES_APPROVAL.forEach(function(cap){var n=nodes.find(function(n){return n.action===cap;});if(!n){nodes.push({id:'n'+(nodes.length+1),agent:'workbuddy',action:cap,status:'pending',requiresApproval:true});}});
  var plan={
    plan_id:id, goal:params.goal||'', domain:domain,
    nodes:nodes,graph_id:'graph_'+id,
    status:'draft',created_at:new Date().toISOString(),
    required_artifacts:['plan.md','graph.json','dispatch.json','approval-gates.json'],
    forbidden_actions:FORBIDDEN
  };
  plans[id]=plan;return{success:true,plan:plan};
}
function getPlan(id){return plans[id]?{success:true,plan:plans[id]}:{success:false};}
function approvePlan(id){var p=plans[id];if(!p)return{success:false};p.status='approved';p.approved_at=new Date().toISOString();return{success:true,plan:p};}
function planAndDispatch(params){
  var pr=createPlan(params);if(!pr.success)return pr;
  var plan=pr.plan;
  plan.status='dispatched';plan.nodes.forEach(function(n){if(!n.requiresApproval)n.status='dispatched';});
  return{success:true,plan:plan,dispatched:plan.nodes.filter(function(n){return n.status==='dispatched';}).length};
}
module.exports={createPlan,getPlan,approvePlan,planAndDispatch,FORBIDDEN,REQUIRES_APPROVAL};
