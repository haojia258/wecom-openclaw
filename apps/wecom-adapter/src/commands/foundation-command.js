"use strict";
/** P22 Foundation Hardening — /底座 命令 */
var health=null;try{health=require("../foundation/foundation-health")}catch(e){}
var recovery=null;try{recovery=require("../foundation/workflow-recovery")}catch(e){}
var retention=null;try{retention=require("../foundation/memory-retention")}catch(e){}
var coverage=null;try{coverage=require("../foundation/command-coverage")}catch(e){}
var nightly=null;try{nightly=require("../foundation/nightly-report")}catch(e){}
var audit=null;try{audit=require("../audit/foundation-audit")}catch(e){}

async function execute(ctx,args){
  args=(args||"").trim();

  if(args==="健康"||args.indexOf("底座 健康")>=0)return health?health.status():"⚠️";
  if(args==="报告"||args.indexOf("底座 报告")>=0)return health?health.report():"⚠️";

  // Workflow recovery
  if(args.indexOf("恢复 ")==0){if(!recovery)return"⚠️";var r=recovery.resume(args.replace("恢复 ","").trim());return r.error?r.error:"✅ "+r.message}
  if(args.indexOf("回滚 ")==0){if(!recovery)return"⚠️";var r=recovery.rollback(args.replace("回滚 ","").trim());return r.error?r.error:"✅ "+r.message}
  if(args.indexOf("重试 ")==0){if(!recovery)return"⚠️";var r=recovery.retryFailed(args.replace("重试 ","").trim());return r.error?r.error:"✅ 重试 #"+r.retryCount}

  // Memory retention
  if(args.indexOf("保留 ")==0){if(!retention)return"⚠️";var d=parseInt(args.replace("保留 ",""))||7;var r2=retention.retention(d);return"✅ 保留最近 "+d+" 天, 移除 "+r2.removed+" 条"}
  if(args==="去重"){if(!retention)return"⚠️";var r3=retention.dedup();return"✅ 去重完成, 移除 "+r3.deduped+" 条"}
  if(args==="归档"){if(!retention)return"⚠️";var r4=retention.archive(30);return"✅ 归档完成, 剩余 "+r4.remaining+" 条"}

  // Coverage + Audit + Nightly
  if(args==="覆盖"||args.indexOf("覆盖率")>=0){if(!coverage)return"⚠️";var c=coverage.coverage();return"📊 命令覆盖率: "+c.rate+" ("+c.passed+"/"+c.total+")\n"+c.details.map(function(d){return d.load+" "+d.cmd}).join("\n")}
  if(args==="审计"||args.indexOf("审计")>=0){if(!audit)return"⚠️";var a=audit.score();return"🏅 Foundation Audit\nScore: "+a.total+"/100\nGrade: "+a.grade+"\n\n"+Object.keys(a.modules).map(function(k){return k+": "+a.modules[k]}).join("\n")}
  if(args==="日报"||args.indexOf("nightly")>=0){if(!nightly)return"⚠️";return nightly.generate()}

  if(args.indexOf("底座 状态")>=0||!args||args==="状态"){
    var h=health?health.health():{score:0};var c2=coverage?coverage.coverage():{rate:"?"};
    return "🏗️ Foundation Status\n\nHealth: "+h.score+"/100\nCoverage: "+c2.rate+"\n\n/底座 健康 | 报告 | 审计 | 覆盖 | 日报 | 去重 | 归档 | 恢复/回滚/重试 <runId>";
  }

  return "🏗️ /底座 命令:\n状态 | 健康 | 报告 | 审计 | 覆盖 | 日报 | 去重 | 归档 | 保留 <days> | 恢复/回滚/重试 <runId>";
}
var desc="Foundation Hardening: Health/Recovery/Retention/Audit/Coverage";
module.exports={execute,desc};
