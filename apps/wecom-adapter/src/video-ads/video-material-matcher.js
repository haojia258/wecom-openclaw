"use strict";var fs=require("fs"),path=require("path");
var DIR=path.join(__dirname,"..","..","storage","video-ads"),MP=path.join(DIR,"video-material-matches.json");
function init(){if(!fs.existsSync(DIR))fs.mkdirSync(DIR,{recursive:true});if(!fs.existsSync(MP))fs.writeFileSync(MP,"[]","utf8")}
function match(planId){
  var assetStore=null;try{assetStore=require("../assets/asset-store")}catch(e){}
  if(!assetStore)return{matches:[],recommendation:"Asset模块未加载"};
  var planEngine=require("./video-plan-engine");var plan=planEngine.getById(planId);if(!plan)return{error:"plan not found"};
  var assets=assetStore.getByProduct(plan.productId).filter(function(a){return a.status==="reviewed"}).sort(function(a,b){return(b.score||0)-(a.score||0)});
  var cover=assets.filter(function(a){return a.type==="image"})[0];
  var broll=assets.filter(function(a){return a.type==="video"}).slice(0,3);
  var rec={matchId:"mat-"+Date.now().toString(36),videoPlanId:planId,productId:plan.productId,cover:cover?{assetId:cover.assetId,title:cover.title}:null,broll:broll.map(function(a){return{assetId:a.assetId,title:a.title}}),matchedAt:new Date().toISOString()};
  init();var all=JSON.parse(fs.readFileSync(MP,"utf8"));all.unshift(rec);fs.writeFileSync(MP,JSON.stringify(all,null,2),"utf8");
  return rec}
function recommendCover(planId){var r=match(planId);return r.cover?r.cover:{error:"无可用封面"}}
function listMaterials(planId){var r=match(planId);if(r.error)return r;return"📦 素材清单\n封面: "+(r.cover?r.cover.title:"无")+"\nB-roll: "+r.broll.map(function(b){return b.title}).join(", ")}
module.exports={match,recommendCover,listMaterials};
