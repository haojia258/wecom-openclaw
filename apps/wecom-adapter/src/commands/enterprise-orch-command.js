"use strict";var planner=null;try{planner=require("../orchestration/enterprise-planner")}catch(e){};var graph=null;try{graph=require("../orchestration/task-graph-builder")}catch(e){};var disp=null;try{disp=require("../orchestration/agent-dispatcher")}catch(e){};var strat=null;try{strat=require("../orchestration/orchestration-strategy")}catch(e){};var ec=null;try{ec=require("../orchestration/orchestration-execution-center")}catch(e){};var mem=null;try{mem=require("../orchestration/orchestration-memory")}catch(e){};var agent=null;try{agent=require("../agents/enterprise-agent")}catch(e){}
async function execute(ctx,args){
  args=(args||"").trim();
  if(args==="计划"||args.indexOf("plan")>=0){var p=planner?planner.plan():null;return p?JSON.stringify(p.tasks,null,2):"⚠️"}
  if(args==="图谱"||args.indexOf("graph")>=0){var g=graph?graph.build():null;return g?JSON.stringify(g,null,2):"⚠️"}
  if(args==="调度"||args.indexOf("dispatch")>=0){var d=disp?disp.dispatchAll():[];return d.length===0?"无就绪任务":d.map(function(r){return"• ["+r.domain+"] "+(r.result?"✅":"❌")}).join("\n")}
  if(args==="策略"||args.indexOf("strategy")>=0){var s=strat?strat.score():null;return s?JSON.stringify(s,null,2):"⚠️"}
  if(args==="建议"||args==="agent"||args.indexOf("advise")>=0){return agent?agent.advise(args):"⚠️"}
  if(args==="记忆"||args==="memory"){var ms=mem?mem.stats():{total:0};return"🧠 编排记忆\n总记录:"+ms.total}
  if(args==="执行中心"||args==="ec"){return ec?ec.dashboard():"⚠️"}
  if(args==="状态"||!args){var p2=planner?planner.plan():{domains:{},tasks:[]};return"🏢 Enterprise Status\nDomains: "+Object.keys(p2.domains).filter(function(k){return p2.domains[k]}).length+"/4\nTasks: "+p2.tasks.length+"\n\n/enterprise 计划|图谱|调度|策略|建议|记忆|执行中心"}
  return"🏢 /enterprise 命令:\n状态 | 计划 | 图谱 | 调度 | 策略 | 建议 | 记忆 | 执行中心";
}
var desc="Enterprise Orchestration: 4-domain unified agent (REVIEW_ONLY)";
module.exports={execute,desc};
