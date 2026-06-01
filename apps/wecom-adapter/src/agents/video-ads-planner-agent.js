"use strict";var reg=null;try{reg=require("../skills/video-ads/skill-registry")}catch(e){}
function advise(text){if(!reg)return"⚠️ Skill未加载";var r=reg.invoke("getVideoAdsExecutionCenter","");return"🎬 视频/广告智能建议\n\n"+r.data.dashboard+"\n\n💡 命令:\n• /视频 方案 <pid> — 创建视频方案\n• /投流 计划 <vidPlanId> — 广告计划\n• /投流 ROI <adsPlanId> — ROI分析\n• /投流 策略推荐 <pid>\n\nREVIEW_ONLY=true | ADS_EXECUTE=false"}
module.exports={advise};
