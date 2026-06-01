"use strict";
/** P80 — Video & Ads Domain Command Handler. 38+ commands. */
var planE=null;try{planE=require("../video-ads/video-plan-engine")}catch(e){}
var scriptE=null;try{scriptE=require("../video-ads/video-script-engine")}catch(e){}
var matcher=null;try{matcher=require("../video-ads/video-material-matcher")}catch(e){}
var adsE=null;try{adsE=require("../video-ads/ads-plan-engine")}catch(e){}
var roiA=null;try{roiA=require("../video-ads/ads-roi-analyzer")}catch(e){}
var strat=null;try{strat=require("../video-ads/video-ads-strategy-engine")}catch(e){}
var ec=null;try{ec=require("../video-ads/video-ads-execution-center")}catch(e){}
var agent=null;try{agent=require("../agents/video-ads-planner-agent")}catch(e){}
var learn=null;try{learn=require("../memory/video-ads-learning-hook")}catch(e){}

function safe(fn){try{return fn()}catch(e){return "⚠️ "+e.message}}

async function execute(ctx,args){
  args=(args||"").trim();

  if(!args)return "🎬 /视频 或 /投流 命令。请提供子命令。";

  var isVideo=args.indexOf("视频 ")!==-1||ctx.cmd===undefined||(ctx.cmd||"").indexOf("/视频")>=0;
  var isAd=args.indexOf("投流 ")!==-1||(ctx.cmd||"").indexOf("/投流")>=0;

  // ── Video Commands ──
  if(args.indexOf("方案详情 ")==0){var pid=args.replace("方案详情 ","").trim();var p=planE?planE.getById(pid):null;return p?JSON.stringify(p,null,2):"❌ 未找到"}
  if(args.indexOf("方案列表 ")==0){var lst=planE?planE.getByProduct(args.replace("方案列表 ","").trim()):[];return lst.length===0?"无方案":lst.map(function(p){return"• "+p.videoPlanId+" "+p.goal+" "+p.status}).join("\n")}
  if(args.indexOf("方案 ")==0){return safe(function(){var p=planE.create(args.replace("方案 ","").trim(),"引流");return"✅ 视频方案已创建\nID: "+p.videoPlanId+"\n产品: "+p.productId+"\n目标: "+p.goal})}

  if(args.indexOf("脚本修改 ")==0){var parts=args.replace("脚本修改 ","").trim().split(/\s+/);var id=parts[0];var ins=parts.slice(1).join(" ")||"优化脚本";var s=scriptE?scriptE.revise(id,ins):null;return s?"✅ 脚本已修改: "+s.scriptId:"❌ 未找到"}
  if(args.indexOf("脚本详情 ")==0){var s=scriptE?scriptE.getById(args.replace("脚本详情 ","").trim()):null;return s?JSON.stringify(s,null,2):"❌ 未找到"}
  if(args.indexOf("脚本 ")==0){return safe(function(){var s=scriptE.create(args.replace("脚本 ","").trim());return"✅ 脚本已生成\nID: "+s.scriptId+"\n口播: "+s.voiceover.substring(0,80)+"..."})}

  if(args.indexOf("素材清单 ")==0){return safe(function(){return matcher.listMaterials(args.replace("素材清单 ","").trim())})}
  if(args.indexOf("封面 ")==0){return safe(function(){var c=matcher.recommendCover(args.replace("封面 ","").trim());return c.error||"🖼️ "+c.assetId+" "+c.title})}
  if(args.indexOf("素材匹配 ")==0){return safe(function(){var m=matcher.match(args.replace("素材匹配 ","").trim());return"✅ 匹配完成\n封面: "+(m.cover?m.cover.title:"无")+"\nB-roll: "+m.broll.length+"个"})}

  if(args.indexOf("表现 ")==0){return safe(function(){var p=planE?planE.getById(args.replace("表现 ","").trim()):null;return p?"📊 视频表现\n方案: "+p.videoPlanId+"\n产品: "+p.productId+"\n目标: "+p.goal+"\n状态: "+p.status:"❌ 未找到"})}

  // ── Ads Commands ──
  if(args.indexOf("计划详情 ")==0){var a=adsE?adsE.getById(args.replace("计划详情 ","").trim()):null;return a?JSON.stringify(a,null,2):"❌ 未找到"}
  if(args.indexOf("预算预估 ")==0){return safe(function(){var b=adsE.estimateBudget(args.replace("预算预估 ","").trim());return b.error||"💰 "+b.budgetTotal+"元 / "+b.estimatedDays+"天 / ROI "+b.estimatedROI})}
  if(args.indexOf("计划 ")==0){return safe(function(){var a=adsE.create(args.replace("计划 ","").trim());return a.error||"✅ 广告计划已创建\nID: "+a.adsPlanId+"\n预算: ¥"+a.budgetSuggested+"\nROI: "+a.expectedROI+"x"})}

  if(args.indexOf("建议 ")==0){return safe(function(){return roiA.recommend(args.replace("建议 ","").trim())})}
  if(args.indexOf("对比 ")==0){return safe(function(){var c=roiA.compare(args.replace("对比 ","").trim());return"📊 对比\n"+c.map(function(r,i){return(i+1)+". ROI: "+r.estimatedROI+"x GMV: ¥"+r.estimatedGMV}).join("\n")})}
  if(args.indexOf("ROI ")==0){return safe(function(){var r=roiA.analyze(args.replace("ROI ","").trim());return r.error||"📊 ROI: "+r.estimatedROI+"x\nGMV: ¥"+r.estimatedGMV+"\n利润: ¥"+r.estimatedProfit+"\n建议: "+r.recommendation})}

  // ── Strategy ──
  if(args.indexOf("策略推荐 ")==0){return safe(function(){var r=strat.recommend(args.replace("策略推荐 ","").trim());return r.length===0?"无数据":r.map(function(s,i){return(i+1)+". "+s.videoPlanId+" score: "+s.finalVideoAdsScore}).join("\n")})}
  if(args.indexOf("策略详情 ")==0){return safe(function(){return strat.detail(args.replace("策略详情 ","").trim())})}
  if(args.indexOf("策略回测")>=0){return safe(function(){return strat.backtest()})}

  // ── Agent ──
  if(args.indexOf("智能建议")>=0||args==="agent"){return safe(function(){return agent?agent.advise(args):"⚠️ Agent未加载"})}

  // ── Learning ──
  if(args==="学习记录"||args.indexOf("学习记录 ")==0){return safe(function(){return learn?learn.recentList(20):"⚠️"})}
  if(args==="学习总结"||args.indexOf("学习总结 ")==0){return safe(function(){return learn?learn.summary():"⚠️"})}
  if(args==="记忆状态"||args.indexOf("记忆状态 ")==0){return safe(function(){return learn?learn.memStatus():"⚠️"})}

  // ── EC ──
  if(args==="执行中心"||args.indexOf("执行中心 ")==0){return safe(function(){return ec?ec.dashboard():"⚠️"})}
  if(args==="历史"||args.indexOf("历史 ")==0){return safe(function(){return ec?ec.history():"⚠️"})}
  if(args==="状态"||args.indexOf("状态 ")==0){return safe(function(){var s=planE?planE.stats():{total:0};return"视频方案: "+s.total+"\nREVIEW_ONLY=true\nVIDEO_PUBLISH_EXECUTE=false\nADS_EXECUTE=false"})}

  return "🎬 /视频 | /投流 命令帮助。\n\n视频: 方案/方案详情/方案列表/脚本/脚本详情/脚本修改/素材匹配/封面/素材清单/表现/策略推荐/智能建议/学习记录/学习总结/记忆状态/执行中心/历史/状态\n\n投流: 计划/计划详情/预算预估/ROI/对比/建议/策略推荐/策略详情/策略回测/智能建议/学习记录/学习总结/记忆状态/执行中心/历史/状态";
}
var desc="视频/广告域: 方案→脚本→素材→广告→ROI→策略 (REVIEW_ONLY)";
module.exports={execute,desc};
