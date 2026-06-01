"use strict";var wf=null;try{wf=require("../workflow/workflow-engine")}catch(e){}
async function execute(ctx,args){
  args=(args||"").trim();if(!wf)return"⚠️ 工作流引擎未加载";
  if(args==="状态"||args.indexOf("工作流 状态")>=0){
    var l=wf.listWorkflows();return l.length===0?"无工作流":"📋 工作流 ("+l.length+"):\n"+l.map(function(w){return"• "+w.workflowId+" ["+w.domain+"] steps:"+w.steps+" status:"+w.status}).join("\n");
  }
  if(args==="列表"||args.indexOf("工作流 列表")>=0){return JSON.stringify(wf.listWorkflows(),null,2)}
  if((args.indexOf("运行")>=0||args.indexOf("run")>=0)&&args.indexOf("daily")>=0){
    var r=wf.execute("daily-commerce-workflow");if(r.error)return"❌ "+r.error;if(r.approvalRequired)return"⏸️ 暂停 @"+r.approvalStep+"\nRunID: "+r.runId+"\n需人工审批";return"✅ 完成\nRunID: "+r.runId+"\n步骤: "+r.stepResults.length;
  }
  if(args.indexOf("运行 ")==0||args.indexOf("run ")==0){var id=args.replace(/.*(?:运行|run)\s*/,"").trim();var r=wf.execute(id);return r.error?"❌ "+r.error:JSON.stringify(r,null,2)}
  if(args==="历史"){var h=wf.getHistory();return h.length===0?"无历史":h.map(function(r){return"• "+r.runId+" "+r.workflowId+" "+r.status+" @ "+(r.startedAt||"").substring(0,19)}).join("\n")}
  if(args==="帮助")return"📋 /工作流 命令:\n状态/列表/运行/历史/帮助\n\nREVIEW_ONLY=true | dry-run mode";
  return"📋 未知。发送 /工作流 帮助。";
}
var desc="Workflow Engine (REVIEW_ONLY, dry-run)";
module.exports={execute,desc};
