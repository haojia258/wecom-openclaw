"use strict";var path=require("path"),{SkillResult}=require("./skill-layer");
var REGISTRY=[{name:"getKpiOverview",desc:"KPI总览"},{name:"getKpiDetail",desc:"KPI明细"},{name:"getKpiTrend",desc:"KPI趋势"},{name:"getKpiStrategy",desc:"策略评分"},{name:"getKpiRecommendations",desc:"优化建议"},{name:"getKpiExecutionCenter",desc:"执行中心"},{name:"getKpiMemoryStatus",desc:"记忆状态"},{name:"getKpiAgentAdvice",desc:"Agent建议"}];
function invoke(name,args){
  try{
    var agg=require("../../kpi/kpi-aggregator"),strat=require("../../kpi/kpi-strategy-engine"),ec=require("../../kpi/kpi-execution-center");
    switch(name){
      case"getKpiOverview":return SkillResult(name,agg.aggregate());
      case"getKpiDetail":return SkillResult(name,agg.detail(args||new Date().toISOString().substring(0,10)));
      case"getKpiTrend":return SkillResult(name,agg.trend(args||"gmv"));
      case"getKpiStrategy":return SkillResult(name,strat.score());
      case"getKpiRecommendations":return SkillResult(name,strat.recommend());
      case"getKpiExecutionCenter":return SkillResult(name,{dashboard:ec.dashboard()});
      case"getKpiMemoryStatus":return SkillResult(name,{total:agg.aggregate().metrics.activityCount});
      case"getKpiAgentAdvice":return SkillResult(name,{recommendations:strat.recommend().recommendations});
      default:return{skill:name,status:"error",data:{},meta:{timestamp:new Date().toISOString(),reviewOnly:true},error:"未知技能"};
    }
  }catch(e){return{skill:name,status:"error",data:{},meta:{timestamp:new Date().toISOString(),reviewOnly:true},error:e.message}}
}
function status(){return REGISTRY.map(function(r){try{var s=invoke(r.name);return{name:r.name,available:s.status==="success"}}catch(e){return{name:r.name,available:false}}})}
module.exports={invoke,status,REGISTRY};
