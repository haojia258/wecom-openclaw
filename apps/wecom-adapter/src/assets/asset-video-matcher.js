"use strict";var store=require("./asset-store"),fs=require("fs"),path=require("path");
var DIR=path.join(__dirname,"..","..","storage","assets","video-matches");
function matchForVideo(productId,goal){var assets=store.getByProduct(productId);if(assets.length===0)return{productId:productId,goal:goal||"引流",matches:[],recommendation:"该产品暂无素材，请先入库"};var scored=assets.filter(function(a){return a.status!=="rejected"&&a.status!=="archived"}).sort(function(a,b){return(b.score||0)-(a.score||0)});
  var recs=scored.slice(0,5).map(function(a,i){return{rank:i+1,assetId:a.assetId,type:a.type,title:a.title,score:a.score,suggestedUse:i===0?"主素材":i===1?"备选":"补充"}});
  return{productId:productId,goal:goal||"引流",totalAssets:assets.length,matches:recs,planId:"vid-"+Date.now().toString(36)}
}
function recommendCover(pid){var imgs=store.getByProduct(pid).filter(function(a){return a.type==="image"&&a.status!=="rejected"}).sort(function(a,b){return(b.score||0)-(a.score||0)});return imgs.slice(0,1).map(function(a){return{assetId:a.assetId,title:a.title,score:a.score,reason:"最高评分图片"}});}
function recommendSelling(pid){var texts=store.getByProduct(pid).filter(function(a){return a.type==="text"||a.type==="script"}).sort(function(a,b){return(b.score||0)-(a.score||0)});return texts.slice(0,3).map(function(a){return{assetId:a.assetId,title:a.title,score:a.score}})}
function createPlan(pid){var r=matchForVideo(pid,"引流");if(!fs.existsSync(DIR))fs.mkdirSync(DIR,{recursive:true});fs.writeFileSync(path.join(DIR,r.planId+".json"),JSON.stringify(r,null,2),"utf8");return r}
module.exports={matchForVideo,recommendCover,recommendSelling,createPlan};
