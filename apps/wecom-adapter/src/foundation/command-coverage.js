"use strict";var path=require("path");
var CHECKS=[
  {cmd:"/活动 状态",path:"activities/activity-command"},
  {cmd:"/素材 状态",path:"assets/asset-store"},
  {cmd:"/视频 状态",path:"video-ads/video-plan-engine"},
  {cmd:"/工作流 状态",path:"workflow/workflow-engine"},
  {cmd:"/记忆",path:"memory/memory-engine"},
  {cmd:"/技能 activity status",path:"skills/activity/skill-registry"},
  {cmd:"/投流 历史",path:"video-ads/video-ads-execution-center"},
  {cmd:"/董事会",path:"commands/board-command"}
];
function check(){
  return CHECKS.map(function(c){
    try{require(path.join(__dirname,"..",c.path));return{cmd:c.cmd,load:"✅"}}
    catch(e){return{cmd:c.cmd,load:"❌",error:e.message}}
  })
}
function coverage(){
  var r=check();var pass=r.filter(function(x){return x.load==="✅"}).length;
  return{total:r.length,passed:pass,rate:Math.round(pass/r.length*100)+"%",details:r};
}
module.exports={check,coverage};
