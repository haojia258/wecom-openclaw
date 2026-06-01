"use strict";var fs=require("fs"),path=require("path");
var DIR=path.join(__dirname,"..","..","storage","video-ads"),RP=path.join(DIR,"ads-roi-analysis.json");
function init(){if(!fs.existsSync(RP))fs.writeFileSync(RP,"[]","utf8")}
function analyze(adsPlanId){
  var planEngine=null;try{planEngine=require("./ads-plan-engine")}catch(e){}
  if(!planEngine)return{error:"ads module not loaded"};
  var plan=planEngine.getById(adsPlanId);if(!plan)return{error:"plan not found"};
  var budget=plan.budgetSuggested||300;var roi=plan.expectedROI||2.0;
  var gmv=Math.round(budget*roi);var profit=Math.round(gmv*0.3);
  var r={analysisId:"roia-"+Date.now().toString(36),adsPlanId:adsPlanId,estimatedROI:roi,estimatedGMV:gmv,estimatedProfit:profit,riskLevel:plan.riskLevel,recommendation:roi>=2.0?"recommend":roi>=1.5?"moderate":"pause",dailyBudget:plan.dailyBudgetCap,analyzedAt:new Date().toISOString()};
  init();var all=JSON.parse(fs.readFileSync(RP,"utf8"));all.unshift(r);fs.writeFileSync(RP,JSON.stringify(all,null,2),"utf8");return r}
function compare(pid){var planE=require("./ads-plan-engine");var plans=planE.getByProduct(pid);return plans.map(function(p){return analyze(p.adsPlanId)}).sort(function(a,b){return(b.estimatedROI||0)-(a.estimatedROI||0)})}
function recommend(id){var r=analyze(id);if(r.recommendation==="recommend")return"✅ 推荐投放 (ROI: "+r.estimatedROI+"x)";if(r.recommendation==="moderate")return"⏸️ 建议观察 (ROI: "+r.estimatedROI+"x)";return"❌ 建议暂停 (ROI: "+r.estimatedROI+"x)"}
module.exports={analyze,compare,recommend};
