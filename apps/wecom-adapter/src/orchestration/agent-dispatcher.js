"use strict";var path=require("path");
function dispatch(domain,task,args){
  var agent=null;
  try{
    switch(domain){
      case"activity":agent=require(path.join(__dirname,"..","agents","activity-planner-agent"));return agent?{result:agent.advise(args||"智能建议"),domain:domain,task:task}:"⚠️";
      case"asset":agent=require(path.join(__dirname,"..","agents","asset-planner-agent"));return agent?{result:agent.advise(args||"智能建议"),domain:domain,task:task}:"⚠️";
      case"videoads":agent=require(path.join(__dirname,"..","agents","video-ads-planner-agent"));return agent?{result:agent.advise(args||"智能建议"),domain:domain,task:task}:"⚠️";
      case"kpi":agent=require(path.join(__dirname,"..","agents","kpi-planner-agent"));return agent?{result:agent.advise(args||"智能建议"),domain:domain,task:task}:"⚠️";
      default:return{error:"unknown domain: "+domain}
    }
  }catch(e){return{error:e.message}}
}
function dispatchAll(){var p=require("./enterprise-planner").plan();return p.tasks.filter(function(t){return t.status==="ready"}).map(function(t){return dispatch(t.domain,t.task)})}
module.exports={dispatch,dispatchAll};
