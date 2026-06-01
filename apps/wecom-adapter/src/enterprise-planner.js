"use strict";var path=require("path");
function load(name){try{return require(path.join(__dirname,"..","agents",name))}catch(e){return null}}
function loadK(name){try{return require(path.join(__dirname,"..","kpi",name))}catch(e){return null}}

function plan(){
  var agents={activity:load("activity-planner-agent"),asset:load("asset-planner-agent"),videoads:load("video-ads-planner-agent"),kpi:load("kpi-planner-agent")};
  var kpiAgg=loadK("kpi-aggregator");
  var m=kpiAgg?kpiAgg.aggregate().metrics:{gmv:0,profit:0,roi:0};

  return{
    domains:{activity:!!agents.activity,asset:!!agents.asset,videoads:!!agents.videoads,kpi:!!agents.kpi},
    metrics:m,
    tasks:[
      {domain:"kpi",task:"collect_metrics",priority:"critical",status:"ready"},
      {domain:"activity",task:"analyze_activities",priority:"high",status:"ready",dependsOn:["collect_metrics"]},
      {domain:"asset",task:"scan_assets",priority:"medium",status:"ready"},
      {domain:"videoads",task:"analyze_ads_performance",priority:"medium",status:"ready",dependsOn:["collect_metrics"]},
      {domain:"kpi",task:"generate_summary",priority:"high",status:"waiting",dependsOn:["analyze_activities","analyze_ads_performance"]},
      {domain:"kpi",task:"human_review",priority:"critical",status:"waiting",dependsOn:["generate_summary"],requiresApproval:true}
    ],
    generatedAt:new Date().toISOString()
  }
}
module.exports={plan};
