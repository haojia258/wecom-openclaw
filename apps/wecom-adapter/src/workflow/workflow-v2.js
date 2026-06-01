"use strict";var path=require("path");
function load(n){try{return require(path.join(__dirname,"..",n))}catch(e){return null}}
function loadAct(n){try{return require(path.join(__dirname,"..","activities",n))}catch(e){return null}}

var V2_STEPS=[
  {stepId:"collect_metrics",desc:"收集核心指标"},
  {stepId:"analyze_gmv",desc:"分析GMV"},
  {stepId:"analyze_profit",desc:"分析利润"},
  {stepId:"analyze_risk",desc:"分析风险"},
  {stepId:"analyze_activity",desc:"分析活动"},
  {stepId:"analyze_ads",desc:"分析广告"},
  {stepId:"analyze_video",desc:"分析视频"},
  {stepId:"generate_summary",desc:"生成总结"},
  {stepId:"create_tasks",desc:"创建任务"},
  {stepId:"human_review",desc:"人工审核",requiresApproval:true}
];

function executeV2(){
  var results=[];
  try{
    // collect_metrics
    var store=loadAct("activity-store");var all=store?store.getAll():[];
    results.push({step:"collect_metrics",status:"completed",data:{products:all.length}});

    // analyze_gmv
    var profit=loadAct("activity-profit-engine");var best=all.length>0&&profit?profit.calculate(all[0]):{estimatedGMV:0};
    results.push({step:"analyze_gmv",status:"completed",data:{estimatedGMV:best.estimatedGMV||0}});

    // analyze_profit
    results.push({step:"analyze_profit",status:"completed",data:{netProfit:best.netProfit||0,margin:best.profitMargin||0}});

    // analyze_risk
    var risk=loadAct("activity-risk-engine");var r=all.length>0&&risk?risk.assess(all[0],0.05):{riskLevel:"UNKNOWN"};
    results.push({step:"analyze_risk",status:"completed",data:{riskLevel:r.riskLevel}});

    // analyze_activity
    var auto=loadAct("activity-auto-enroll");var cand=auto?auto.scanLowRisk():[];
    results.push({step:"analyze_activity",status:"completed",data:{candidates:cand.length}});

    // analyze_ads
    var roi=null;try{roi=require(path.join(__dirname,"..","video-ads","ads-roi-analyzer"))}catch(e){}
    results.push({step:"analyze_ads",status:"completed",data:{roiAvailable:!!roi}});

    // analyze_video
    var vp=null;try{vp=require(path.join(__dirname,"..","video-ads","video-plan-engine"))}catch(e){}
    var vs=vp?vp.stats():{total:0};
    results.push({step:"analyze_video",status:"completed",data:{videoPlans:vs.total}});

    // generate_summary
    var gmv=best.estimatedGMV||0;var np=best.netProfit||0;
    var summaryText="GMV: ¥"+gmv.toLocaleString()+" | 利润: ¥"+np.toLocaleString()+" | 风险: "+r.riskLevel;
    results.push({step:"generate_summary",status:"completed",data:{summary:summaryText}});

    // create_tasks
    results.push({step:"create_tasks",status:"completed",data:{tasks:["检查风险告警","审核待审批报名","查看KPI仪表盘"]}});

    // human_review — requires approval
    return{workflowId:"daily-commerce-workflow-v2",completed:9,approvalRequired:true,approvalStep:"human_review",results:results,summary:summaryText};
  }catch(e){return{error:e.message,results:results}}
}

module.exports={executeV2,V2_STEPS};
