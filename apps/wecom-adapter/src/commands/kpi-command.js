"use strict";
/** P90 KPI Domain — /kpi 命令 */
var agg=null;try{agg=require("../kpi/kpi-aggregator")}catch(e){}
var strat=null;try{strat=require("../kpi/kpi-strategy-engine")}catch(e){}
var ec=null;try{ec=require("../kpi/kpi-execution-center")}catch(e){}
var agent=null;try{agent=require("../agents/kpi-planner-agent")}catch(e){}
var learn=null;try{learn=require("../memory/kpi-learning-hook")}catch(e){}

async function execute(ctx,args){
  args=(args||"").trim();

  if(args.indexOf("明细 ")==0){
    return agg?JSON.stringify(agg.detail(args.replace("明细 ","").trim()),null,2):"⚠️";
  }
  if(args.indexOf("趋势 ")==0){
    return agg?JSON.stringify(agg.trend(args.replace("趋势 ","").trim()),null,2):"⚠️";
  }
  if(args==="策略建议"||args.indexOf("策略")>=0){
    return strat?JSON.stringify(strat.recommend(),null,2):"⚠️";
  }
  if(args==="agent"||args.indexOf("agent")>=0||args.indexOf("建议")>=0){
    return agent?agent.advise(args):"⚠️";
  }
  if(args==="学习记录"||args.indexOf("学习记录")>=0){
    if(learn)learn.sync();return learn?learn.recentList(20):"⚠️";
  }
  if(args==="学习总结"||args.indexOf("学习总结")>=0){
    if(learn)learn.sync();return learn?learn.summary():"⚠️";
  }
  if(args==="memory"||args.indexOf("记忆")>=0){
    if(learn)learn.sync();return learn?learn.memStatus():"⚠️";
  }
  if(args==="执行中心"||args.indexOf("执行中心")>=0){
    return ec?ec.dashboard():"⚠️";
  }
  if(args==="历史"||args.indexOf("历史")>=0){
    return ec?ec.history():"⚠️";
  }
  if(args==="状态"||!args){
    return agg?JSON.stringify(agg.aggregate(),null,2):"⚠️";
  }
  if(args==="总览"||args.indexOf("总览")>=0){
    var m=agg?agg.aggregate().metrics:{};var s=strat?strat.score():{finalStrategyScore:0};
    return "📊 KPI 总览\n\n"+["GMV: ¥"+(m.gmv||0).toLocaleString(),"利润: ¥"+(m.profit||0).toLocaleString(),"ROI: "+(m.roi||0)+"x","CTR: "+(m.ctr||0)+"% | CVR: "+(m.cvr||0)+"%","活动: "+(m.activityCount||0),"素材: "+(m.assetCount||0),"视频: "+(m.videoPlanCount||0),"广告: "+(m.adsPlanCount||0),"策略分: "+s.finalStrategyScore+"/100"].join("\n")+"\n\n/kpi agent | /kpi 执行中心 | /kpi 趋势 gmv";
  }
  return "📊 /kpi 命令:\n总览 | 状态 | 明细 <date> | 趋势 <metric> | 策略建议 | agent <指令> | 学习记录 | 学习总结 | memory | 执行中心 | 历史";
}
var desc="KPI Domain: GMV/ROI/CTR/CVR 跨域汇总 (REVIEW_ONLY)";
module.exports={execute,desc};
