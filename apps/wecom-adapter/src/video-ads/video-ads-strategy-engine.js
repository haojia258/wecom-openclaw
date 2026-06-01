"use strict";var planE=null;try{planE=require("./video-plan-engine")}catch(e){};var roiA=null;try{roiA=require("./ads-roi-analyzer")}catch(e){}
function scoreVideoPlan(planId){
  var plan=planE?planE.getById(planId):null;if(!plan)return{error:"plan not found"};
  var assetSc=plan.matchedAssets?Math.min(100,plan.matchedAssets.length*20):40;
  var scriptSc=plan.scriptId?80:20;
  var ads=null;try{ads=require("./ads-plan-engine").create(planId)}catch(e){}
  var roiSc=ads&&ads.expectedROI>=2?90:ads&&ads.expectedROI>=1.5?60:30;
  var riskPn=ads&&ads.riskLevel==="high"?30:ads&&ads.riskLevel==="medium"?10:0;
  var memSc=50;
  var budgetSc=ads&&ads.budgetSuggested<=200?90:ads&&ads.budgetSuggested<=300?60:30;
  var final=Math.round(assetSc*0.2+scriptSc*0.2+roiSc*0.25-riskPn+memSc*0.2+budgetSc*0.15);
  return{videoPlanId:planId,assetScore:assetSc,scriptScore:scriptSc,expectedRoiScore:roiSc,riskPenalty:riskPn,memoryScore:memSc,budgetSafetyScore:budgetSc,finalVideoAdsScore:Math.max(1,Math.min(100,final))};
}
function recommend(pid){var plans=planE?planE.getByProduct(pid):[];return plans.map(function(p){return scoreVideoPlan(p.videoPlanId)}).filter(function(s){return!s.error}).sort(function(a,b){return b.finalVideoAdsScore-a.finalVideoAdsScore}).slice(0,5)}
function detail(id){var s=scoreVideoPlan(id);if(s.error)return s.error;return Object.keys(s).map(function(k){return k+": "+s[k]}).join("\n")}
function backtest(){return"📊 暂无回测数据\n\n系统将从视频/广告执行事件积累数据"}
module.exports={scoreVideoPlan,recommend,detail,backtest};
