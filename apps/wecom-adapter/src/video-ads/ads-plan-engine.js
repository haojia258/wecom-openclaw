"use strict";var fs=require("fs"),path=require("path");
var DIR=path.join(__dirname,"..","..","storage","video-ads"),AP=path.join(DIR,"ads-plans.json");
function init(){if(!fs.existsSync(DIR))fs.mkdirSync(DIR,{recursive:true});if(!fs.existsSync(AP))fs.writeFileSync(AP,"[]","utf8")}
function load(){try{return JSON.parse(fs.readFileSync(AP,"utf8"))}catch(e){return[]}}
function save(d){fs.writeFileSync(AP,JSON.stringify(d,null,2),"utf8")}
function create(videoPlanId){
  var planEngine=require("./video-plan-engine");var cfg=planEngine.getConfig();var plan=planEngine.getById(videoPlanId);
  if(!plan)return{error:"video plan not found"};
  init();var all=load();var cap=cfg.ADS_PLAN_BUDGET_CAP||300;
  var a={adsPlanId:"adsp-"+Date.now().toString(36),videoPlanId:videoPlanId,productId:plan.productId,goal:plan.goal,budgetSuggested:cap,dailyBudgetCap:cfg.ADS_DAILY_BUDGET_CAP||100,targetAudience:plan.targetAudience,expectedCTR:3.5,expectedCVR:8.0,expectedROI:2.0,riskLevel:"medium",status:"draft",createdAt:new Date().toISOString(),ADS_EXECUTE:cfg.ADS_EXECUTE};
  all.unshift(a);save(all);return a}
function getById(id){return load().find(function(a){return a.adsPlanId===id})||null}
function getByProduct(pid){return load().filter(function(a){return a.productId===pid})}
function estimateBudget(id){var a=getById(id);if(!a)return{error:"not found"};return{adsPlanId:id,budgetTotal:a.budgetSuggested,dailyCap:a.dailyBudgetCap,estimatedDays:Math.round(a.budgetSuggested/a.dailyBudgetCap),estimatedROI:a.expectedROI}}
init();module.exports={create,getById,getByProduct,estimateBudget};
