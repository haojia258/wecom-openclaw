"use strict";var planner=null;try{planner=require("../orchestration/enterprise-planner")}catch(e){};var strat=null;try{strat=require("../orchestration/orchestration-strategy")}catch(e){};var disp=null;try{disp=require("../orchestration/agent-dispatcher")}catch(e){};var mem=null;try{mem=require("../orchestration/orchestration-memory")}catch(e){}
function advise(text){
  if(!planner)return"⚠️ Orchestration未加载";
  var p=planner.plan();var s=strat?strat.score():{finalOrchestrationScore:0};var raws=disp?disp.dispatchAll():[];
  var lines=["🏢 Enterprise Agent — 跨域协调","","━━━ 域状态 ━━━"];
  Object.keys(p.domains).forEach(function(k){lines.push((p.domains[k]?"✅":"❌")+" "+k)});
  lines.push("","━━━ 任务 DAG ━━━");
  p.tasks.forEach(function(t){lines.push("  "+(t.status==="ready"?"✅":"⏳")+" ["+t.domain+"] "+t.task+(t.requiresApproval?" 🔒":""))});
  lines.push("","━━━ 调度结果 ━━━");
  raws.forEach(function(r){lines.push("  • ["+r.domain+"] "+(r.result?r.result.substring(0,60):r.error))});
  lines.push("","编排分: "+s.finalOrchestrationScore+"/100","REVIEW_ONLY=true");
  if(mem)mem.write({eventType:"enterprise_agent_advised",domain:"all",task:"cross_domain_plan"});
  return lines.join("\n");
}
module.exports={advise};
