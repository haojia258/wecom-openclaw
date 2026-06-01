"use strict";
/** P70 P2 — Asset Reviewer */
var fs=require("fs"),path=require("path");
var DIR=path.join(__dirname,"..","..","storage","assets");
var RP=path.join(DIR,"asset-review-plans.json"),HIST=path.join(DIR,"asset-history.json");
function init(){if(!fs.existsSync(DIR))fs.mkdirSync(DIR,{recursive:true});if(!fs.existsSync(RP))fs.writeFileSync(RP,"[]","utf8");if(!fs.existsSync(HIST))fs.writeFileSync(HIST,"[]","utf8")}
function loadR(){try{return JSON.parse(fs.readFileSync(RP,"utf8"))}catch(e){return[]}}
function saveR(d){fs.writeFileSync(RP,JSON.stringify(d,null,2),"utf8")}
function loadH(){try{return JSON.parse(fs.readFileSync(HIST,"utf8"))}catch(e){return[]}}
function saveH(d){fs.writeFileSync(HIST,JSON.stringify(d,null,2),"utf8")}
function writeHist(e){var h=loadH();e.createdAt=new Date().toISOString();h.unshift(e);saveH(h)}

function createPlan(assetId){init();var all=loadR();var plan={planId:"rvw-"+Date.now().toString(36),assetId:assetId,status:"pending",createdAt:new Date().toISOString()};all.unshift(plan);saveR(all);writeHist({eventType:"asset_review_created",assetId:assetId,planId:plan.planId});return plan}
function approve(assetId){init();var all=loadR();var p=all.find(function(x){return x.assetId===assetId&&x.status==="pending"});if(!p)return{error:"no pending review"};p.status="approved";p.approvedAt=new Date().toISOString();saveR(all);writeHist({eventType:"asset_approved",assetId:assetId,planId:p.planId});return p}
function reject(assetId,reason){init();var all=loadR();var p=all.find(function(x){return x.assetId===assetId&&x.status==="pending"});if(!p)return{error:"no pending review"};if(!reason)return{error:"reason required"};p.status="rejected";p.reason=reason;p.rejectedAt=new Date().toISOString();saveR(all);writeHist({eventType:"asset_rejected",assetId:assetId,planId:p.planId,reason:reason});return p}
function pending(){init();return loadR().filter(function(x){return x.status==="pending"})}
function detail(assetId){init();return loadR().find(function(x){return x.assetId===assetId})||null}
module.exports={createPlan,approve,reject,pending,detail,init};
