"use strict";var fs=require("fs"),path=require("path");
function checkModule(name,modPath){
  try{require(path.join(__dirname,"..",modPath));return{name:name,status:"✅",score:25}}
  catch(e){return{name:name,status:"❌",score:0,error:e.message}}
}
function health(){
  var checks=[
    checkModule("Workflow Engine","workflow/workflow-engine"),
    checkModule("Workflow V2","workflow/workflow-v2"),
    checkModule("Memory System","memory/memory-engine"),
    checkModule("Activity Domain","activities/activity-store"),
    checkModule("Asset Domain","assets/asset-store"),
    checkModule("Video/Ads Domain","video-ads/video-plan-engine"),
    checkModule("Skill Layer","skills/activity/skill-registry"),
    checkModule("Agent Runtime","agents/activity-planner-agent")
  ];
  var score=checks.reduce(function(s,c){return s+c.score},0);
  return{checks:checks,score:Math.min(100,score),checkedAt:new Date().toISOString()};
}
function status(){
  var h=health();return"🏥 Foundation Health Center\n\n"+h.checks.map(function(c){return c.status+" "+c.name}).join("\n")+"\n\nScore: "+h.score+"/100\nLast: "+h.checkedAt.substring(0,19);
}
function report(){
  var h=health();
  var wf=null;try{wf=require(path.join(__dirname,"..","scheduler","workflow-scheduler"))}catch(e){}
  var mem=null;try{mem=require(path.join(__dirname,"..","memory","memory-engine"))}catch(e){}
  var ms=mem?mem.agg():[];
  return"📊 Foundation Daily Report\n\n━━━ Health ━━━\n"+h.checks.map(function(c){return c.status+" "+c.name}).join("\n")+"\nScore: "+h.score+"/100\n\n━━━ Memory ━━━\n"+ms.map(function(x){return"• "+x.domain+": "+x.count}).join("\n")+"\n\n━━━ Workflow ━━━\nScheduler: "+(wf?wf.getScheduled().length:"?")+" jobs\n\nREVIEW_ONLY=true";
}
module.exports={health,status,report};
