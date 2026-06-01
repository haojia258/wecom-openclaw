"use strict";
var mem=null;try{mem=require("../memory/memory-engine")}catch(e){}
var wfv2=null;try{wfv2=require("../workflow/workflow-v2")}catch(e){}
var sched=null;try{sched=require("../scheduler/workflow-scheduler")}catch(e){}

async function execute(ctx,args){
  args=(args||"").trim();

  // ── Memory Commands ──
  if(args.indexOf("记忆 查询 ")==0){return mem?JSON.stringify(mem.query(args.replace("记忆 查询 ","").trim())):"⚠️"}
  if(args.indexOf("记忆 SKU")>=0){if(!mem)return"⚠️";var r=mem.query("SKU");return r.length===0?"无SKU记忆":r.map(function(e){return"• "+e.eventType+" "+e.assetId+" @"+(e.createdAt||"").substring(0,10)}).join("\n")}
  if(args.indexOf("记忆 活动")>=0){if(!mem)return"⚠️";var r=mem.query("activity");return r.length===0?"无活动记忆":r.slice(0,10).map(function(e){return"• "+e.eventType+" @"+(e.timestamp||e.createdAt||"").substring(0,10)}).join("\n")}
  if(args.indexOf("记忆 风险")>=0){if(!mem)return"⚠️";var r=mem.query("risk");return r.length===0?"无风险记忆":r.slice(0,10).map(function(e){return"• "+e.eventType+" @"+(e.timestamp||e.createdAt||"").substring(0,10)}).join("\n")}
  if(args.indexOf("记忆 最近7天")>=0||args.indexOf("记忆 最近")>=0){if(!mem)return"⚠️";var r=mem.recent(30);return"📋 最近记忆 ("+r.length+")\n"+r.map(function(e){return"• ["+e.eventType+"] "+(e.assetId||e.planId||"")}).join("\n")}
  if(args.indexOf("记忆")>=0){return mem?mem.summary():"⚠️ 记忆系统未加载"}

  // ── Workflow Commands ──
  if(args.indexOf("工作流 统计")>=0||args.indexOf("workflow 统计")>=0){
    if(!sched)return"⚠️";var st=sched.status();var r2=wfv2?wfv2.executeV2():{results:[]};
    return"📊 工作流统计\n调度: "+st.scheduled+"项\n下次: "+st.nextRun+"\nV2步骤: "+(r2.results||[]).length+"\n最后: "+(r2.summary||"N/A")+"\n\nDRY_RUN=true | REVIEW_ONLY=true"
  }
  if(args.indexOf("工作流 运行 v2")>=0||args.indexOf("工作流 运行 daily-commerce-workflow-v2")>=0){
    if(!sched)return"⚠️";var r3=sched.manualTrigger();
    if(r3.error)return"❌ "+r3.error;
    var lines=["✅ V2 工作流执行完成","","步骤: "+r3.results.length,""];
    r3.results.forEach(function(s){lines.push("• "+s.step+": "+s.status)});
    lines.push("","📊 "+r3.summary);
    if(r3.approvalRequired)lines.push("","⏸️ human_review 需人工审批");
    return lines.join("\n")
  }
  if(args.indexOf("工作流 历史 v2")>=0){
    var r4=wfv2?wfv2.executeV2():{results:[]};
    return"📋 V2 执行历史\n"+r4.summary;
  }
  if(args.indexOf("工作流")>=0||args.indexOf("workflow")>=0){
    return"📋 工作流 v2:\n运行 v2 — 执行 daily-commerce-workflow-v2\n统计 — 查看状态\n历史 v2 — 最近执行\n\n记忆: /记忆 | 查询 <kw> | SKU | 活动 | 风险 | 最近7天";
  }

  return"📋 /工作流 | /记忆 命令。";
}
var desc="P21: Memory System + Workflow v2 Integration";
module.exports={execute,desc};
