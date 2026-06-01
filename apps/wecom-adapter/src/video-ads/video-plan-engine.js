"use strict";var fs=require("fs"),path=require("path");
var DIR=path.join(__dirname,"..","..","storage","video-ads");
var FP=path.join(DIR,"video-plans.json"),CFG=path.join(DIR,"video-ads-config.json");
function init(){if(!fs.existsSync(DIR))fs.mkdirSync(DIR,{recursive:true});if(!fs.existsSync(FP))fs.writeFileSync(FP,"[]","utf8");if(!fs.existsSync(CFG))fs.writeFileSync(CFG,JSON.stringify({REVIEW_ONLY:true,VIDEO_PUBLISH_EXECUTE:false,ADS_EXECUTE:false,ADS_DAILY_BUDGET_CAP:100,ADS_PLAN_BUDGET_CAP:300},null,2),"utf8")}
function load(){try{return JSON.parse(fs.readFileSync(FP,"utf8"))}catch(e){return[]}}
function save(d){fs.writeFileSync(FP,JSON.stringify(d,null,2),"utf8")}
function getConfig(){return JSON.parse(fs.readFileSync(CFG,"utf8"))}
var GOALS=["引流","转化","活动推广","复购","品牌种草"];
function create(productId,goal){init();var all=load();var p={videoPlanId:"vidp-"+Date.now().toString(36),productId:productId,goal:goal||"引流",targetAudience:"18-45岁女性",sellingPoints:["高性价比","正品保证","限时优惠"],matchedAssets:[],scriptId:null,status:"draft",createdAt:new Date().toISOString()};all.unshift(p);save(all);return p}
function getByProduct(pid){return load().filter(function(p){return p.productId===pid})}
function getById(id){return load().find(function(p){return p.videoPlanId===id})||null}
function updateStatus(id,status){var all=load();var p=all.find(function(x){return x.videoPlanId===id});if(!p)return null;p.status=status;p.updatedAt=new Date().toISOString();save(all);return p}
function stats(){var all=load();return{total:all.length,draft:all.filter(function(p){return p.status==="draft"}).length,scripted:all.filter(function(p){return p.scriptId}).length}}
init();module.exports={create,getByProduct,getById,updateStatus,stats,getConfig,GOALS};
