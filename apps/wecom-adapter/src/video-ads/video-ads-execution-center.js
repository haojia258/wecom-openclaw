"use strict";var planE=null;try{planE=require("./video-plan-engine")}catch(e){};var scriptE=null;try{scriptE=require("./video-script-engine")}catch(e){};var adsE=null;try{adsE=require("./ads-plan-engine")}catch(e){};var roiA=null;try{roiA=require("./ads-roi-analyzer")}catch(e){}
function dashboard(){var vs=planE?planE.stats():{total:0},cfg=planE?planE.getConfig():{};return"🎬 视频/广告执行中心\n\n视频方案: "+vs.total+" (draft:"+(vs.draft||0)+")\n广告计划: "+(adsE?adsE.getByProduct("all").length||0:0)+"\n\nREVIEW_ONLY="+cfg.REVIEW_ONLY+"\nVIDEO_PUBLISH_EXECUTE="+cfg.VIDEO_PUBLISH_EXECUTE+"\nADS_EXECUTE="+cfg.ADS_EXECUTE}
function history(){return"📜 暂无历史记录"}
module.exports={dashboard,history};
