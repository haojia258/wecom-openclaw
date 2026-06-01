"use strict";var planner=require("./enterprise-planner");
function score(){
  var p=planner.plan();
  var readyCount=p.tasks.filter(function(t){return t.status==="ready"}).length;
  var totalCount=p.tasks.length;
  var domainCount=Object.values(p.domains).filter(Boolean).length;
  var domScore=domainCount>=4?100:domainCount>=3?75:domainCount>=2?50:25;
  var readyScore=totalCount>0?Math.round(readyCount/totalCount*100):0;
  var total=Math.round(domScore*0.4+readyScore*0.3+(p.metrics.roi>=2?100:p.metrics.roi>=1?60:30)*0.3);
  return{domainScore:domScore,readyScore:readyScore,roiFactor:p.metrics.roi,finalOrchestrationScore:Math.max(1,Math.min(100,total)),readyTasks:readyCount,totalTasks:totalCount}
}
function recommend(){var s=score();var items=[];if(s.domainScore<100)items.push({action:"enable all 4 domains",priority:"high"});if(s.readyScore<50)items.push({action:"complete pending tasks",priority:"medium"});if(items.length===0)items.push({action:"all systems nominal",priority:"low"});return{score:s,recommendations:items}}
module.exports={score,recommend};
