"use strict";var path=require("path"),{SkillResult}=require("./skill-layer");
function load(n){try{return require(path.join(__dirname,"..","..","assets",n))}catch(e){return null}}
var REGISTRY=[{name:"createProductAssetLibrary",desc:"创建产品素材库"},{name:"ingestAsset",desc:"素材入库"},{name:"reviewAsset",desc:"素材审核"},{name:"searchAssets",desc:"搜索素材"},{name:"matchVideoAssets",desc:"视频匹配"},{name:"scoreAsset",desc:"素材评分"},{name:"getAssetExecutionCenter",desc:"执行中心"},{name:"getAssetMemoryStatus",desc:"记忆状态"}];
function invoke(name,args){
  var store=load("asset-store"),srch=load("asset-search"),scorer=load("asset-score-engine"),matcher=load("asset-video-matcher"),ec=load("asset-execution-center");
  try{
    switch(name){
      case"createProductAssetLibrary":return SkillResult(name,{productId:args,created:true});
      case"ingestAsset":if(!store)throw new Error("store");var a=store.ingest(args.productId||"default",args);return SkillResult(name,a);
      case"reviewAsset":var rv=load("asset-reviewer");return SkillResult(name,rv?rv.pending():[]);
      case"searchAssets":if(!srch)throw new Error("search");return SkillResult(name,{results:srch.search(args),total:srch.search(args).length});
      case"matchVideoAssets":if(!matcher)throw new Error("matcher");var m=matcher.matchForVideo(args,"引流");return SkillResult(name,m);
      case"scoreAsset":if(!scorer)throw new Error("scorer");var s=scorer.scoreAsset(args);return SkillResult(name,s);
      case"getAssetExecutionCenter":if(!ec)throw new Error("ec");return SkillResult(name,{dashboard:ec.dashboard()});
      case"getAssetMemoryStatus":return SkillResult(name,{total:store?store.stats().total:0});
    default:return{skill:name,status:"error",data:{},meta:{timestamp:new Date().toISOString(),reviewOnly:true},error:"未知技能: "+name};
    }
  }catch(e){return{skill:name,status:"error",data:{},meta:{timestamp:new Date().toISOString(),reviewOnly:true},error:e.message}}
}
function status(){return REGISTRY.map(function(r){try{var s=invoke(r.name);return{name:r.name,available:s.status==="success",error:s.error}}catch(e){return{name:r.name,available:false,error:e.message}}})}
module.exports={invoke,status,REGISTRY};
