"use strict";var fs=require("fs"),path=require("path");
var DIR=path.join(__dirname,"..","..","storage","workflow");
var CP=path.join(DIR,"checkpoints.json");
function init(){if(!fs.existsSync(DIR))fs.mkdirSync(DIR,{recursive:true});if(!fs.existsSync(CP))fs.writeFileSync(CP,"[]","utf8")}
function load(){try{return JSON.parse(fs.readFileSync(CP,"utf8"))}catch(e){return[]}}
function save(d){fs.writeFileSync(CP,JSON.stringify(d,null,2),"utf8")}
function checkpoint(runId,currentStep,state){init();var all=load();var idx=all.findIndex(function(c){return c.runId===runId});var cp={runId:runId,currentStep:currentStep,state:state,savedAt:new Date().toISOString()};if(idx>=0)all[idx]=cp;else all.push(cp);save(all)}
function resume(runId){
  var cp=load().find(function(c){return c.runId===runId});if(!cp)return{error:"no checkpoint for "+runId};
  return{resumed:true,runId:runId,fromStep:cp.currentStep,state:cp.state,message:"恢复自: "+cp.currentStep};
}
function rollback(runId){
  var cp=load().find(function(c){return c.runId===runId});if(!cp)return{error:"no checkpoint"};
  cp.state="cancelled";cp.rolledBackAt=new Date().toISOString();save(load().map(function(c){return c.runId===runId?cp:c}));
  return{rolledBack:true,runId:runId,message:"已回滚并取消"}
}
function retryFailed(runId){
  var cp=load().find(function(c){return c.runId===runId});if(!cp)return{error:"no checkpoint"};
  cp.state="retrying";cp.retryCount=(cp.retryCount||0)+1;save(load().map(function(c){return c.runId===runId?cp:c}));
  return{retry:true,runId:runId,retryCount:cp.retryCount}
}
function listCheckpoints(){return load()}
init();module.exports={checkpoint,resume,rollback,retryFailed,listCheckpoints};
