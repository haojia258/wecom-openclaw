"use strict";var path=require("path"),{SkillResult}=require("./skill-layer");
var REGISTRY=[{name:"createVideoPlan",desc:"创建视频方案"},{name:"createVideoScript",desc:"生成脚本"},{name:"matchVideoMaterials",desc:"匹配素材"},{name:"createAdsPlan",desc:"创建广告计划"},{name:"analyzeAdsROI",desc:"ROI分析"},{name:"recommendAdsAction",desc:"投放建议"},{name:"getVideoAdsExecutionCenter",desc:"执行中心"},{name:"getVideoAdsMemoryStatus",desc:"记忆状态"}];
function invoke(name,args){
  try{
    var vp=require("../../video-ads/video-plan-engine"),vs=require("../../video-ads/video-script-engine"),vm=require("../../video-ads/video-material-matcher"),ap=require("../../video-ads/ads-plan-engine"),roi=require("../../video-ads/ads-roi-analyzer"),st=require("../../video-ads/video-ads-strategy-engine"),ec=require("../../video-ads/video-ads-execution-center");
    switch(name){
      case"createVideoPlan":return SkillResult(name,vp.create(args,"引流"));
      case"createVideoScript":return SkillResult(name,vs.create(args));
      case"matchVideoMaterials":return SkillResult(name,vm.match(args));
      case"createAdsPlan":return SkillResult(name,ap.create(args));
      case"analyzeAdsROI":return SkillResult(name,roi.analyze(args));
      case"recommendAdsAction":return SkillResult(name,{action:roi.recommend(args)});
      case"getVideoAdsExecutionCenter":return SkillResult(name,{dashboard:ec.dashboard()});
      case"getVideoAdsMemoryStatus":return SkillResult(name,{total:vp.stats().total});
      default:return{skill:name,status:"error",data:{},meta:{timestamp:new Date().toISOString(),reviewOnly:true},error:"未知技能"};
    }
  }catch(e){return{skill:name,status:"error",data:{},meta:{timestamp:new Date().toISOString(),reviewOnly:true},error:e.message}}
}
function status(){return REGISTRY.map(function(r){try{var s=invoke(r.name);return{name:r.name,available:s.status==="success"}}catch(e){return{name:r.name,available:false}}})}
module.exports={invoke,status,REGISTRY};
