"use strict";var planner=require("./enterprise-planner"),strat=require("./orchestration-strategy");
function dashboard(){var p=planner.plan();var s=strat.score();return"🏢 Enterprise Orchestration\n\nDomains: "+Object.keys(p.domains).filter(function(k){return p.domains[k]}).length+"/4 active\nTasks: "+s.readyTasks+"/"+s.totalTasks+" ready\nScore: "+s.finalOrchestrationScore+"/100\n\nTasks:\n"+p.tasks.map(function(t){return"  "+(t.status==="ready"?"✅":t.status==="waiting"?"⏳":"❌")+" ["+t.domain+"] "+t.task+(t.requiresApproval?" 🔒":"")}).join("\n")+"\n\nREVIEW_ONLY=true"}
function history(){return"📜 暂无编排历史"}
module.exports={dashboard,history};
