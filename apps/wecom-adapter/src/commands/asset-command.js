"use strict";
/** P70 — Asset Command Handler. 26+ commands via /素材 prefix. */
var store=null;try{store=require("../assets/asset-store")}catch(e){}
var reviewer=null;try{reviewer=require("../assets/asset-reviewer")}catch(e){}
var search=null;try{search=require("../assets/asset-search")}catch(e){}
var matcher=null;try{matcher=require("../assets/asset-video-matcher")}catch(e){}
var scorer=null;try{scorer=require("../assets/asset-score-engine")}catch(e){}
var ec=null;try{ec=require("../assets/asset-execution-center")}catch(e){}
var agent=null;try{agent=require("../agents/asset-planner-agent")}catch(e){}
var alearn=null;try{alearn=require("../memory/asset-learning-hook")}catch(e){}
var reg=null;try{reg=require("../skills/assets/skill-registry")}catch(e){}

function safe(fn){try{return fn()}catch(e){return"⚠️ "+e.message}}

async function execute(ctx,args){
  args=(args||"").trim();
  if(!store)return"⚠️ 素材模块未加载";

  // P1 Store
  if(args.indexOf("产品 ")==0){var pid=args.replace("产品 ","").trim();var list=store.getByProduct(pid);return"📦 产品素材: "+pid+"\n素材数: "+list.length+"\n\n/素材 入库 "+pid+" — 添加素材"}
  if(args.indexOf("入库 ")==0){var p=args.replace("入库 ","").trim().split(/\s+/);var a=store.ingest(p[0],{type:p[1]||"image",title:p[2]||"未命名",tags:p.slice(3),skuId:p[0]});return"✅ 素材已入库\nID: "+a.assetId+"\n产品: "+a.productId}
  if(args.indexOf("列表 ")==0){var lst=store.getByProduct(args.replace("列表 ","").trim());return lst.length===0?"暂无素材":lst.map(function(a){return"• "+a.assetId+" "+a.title+" ["+a.type+"] "+a.status}).join("\n")}
  if(args.indexOf("详情 ")==0){var d=store.getById(args.replace("详情 ","").trim());return d?JSON.stringify(d,null,2):"未找到"}

  // P2 Review
  if(args.indexOf("审核详情 ")==0){var rv=reviewer?reviewer.detail(args.replace("审核详情 ","").trim()):null;return rv?JSON.stringify(rv):"未找到"}
  if(args==="审核"){var pend=reviewer?reviewer.pending():[];return pend.length===0?"无待审核":"📋 待审核 ("+pend.length+"):\n"+pend.map(function(p){return"• "+p.planId+" "+p.assetId}).join("\n")}
  if(args.indexOf("通过 ")==0){var ap=reviewer?reviewer.approve(args.replace("通过 ","").trim()):{error:"reviewer"};return ap.error?"❌ "+ap.error:"✅ 已通过"}
  if(args.indexOf("拒绝 ")==0){var p2=args.replace("拒绝 ","").trim().split(/\s+/);var rj=reviewer?reviewer.reject(p2[0],p2.slice(1).join(" ")):{error:"reviewer"};return rj.error?"❌ "+rj.error:"✅ 已拒绝: "+rj.reason}

  // P3 Search
  if(args.indexOf("搜索 ")==0){var sr=search?search.search(args.replace("搜索 ","").trim()):[];return sr.length===0?"无结果":sr.map(function(a){return"• "+a.assetId+" "+a.title+" ["+a.type+"] score:"+a.score}).join("\n")}
  if(args.indexOf("标签 ")==0){var tg=search?search.byTags(args.replace("标签 ","").trim().split(/\s+/)):[];return tg.length===0?"无匹配":tg.map(function(a){return"• "+a.assetId+" "+a.title}).join("\n")}
  if(args.indexOf("TOP ")==0){var top=scorer?scorer.topScored(args.replace("TOP ","").trim()):[];return top.length===0?"无数据":top.map(function(a,i){return(i+1)+". "+a.assetId+" "+a.title+" ["+a.type+"] "+a.finalAssetScore}).join("\n")}
  if(args.indexOf("SKU ")==0){var sk=search?search.bySku(args.replace("SKU ","").trim()):[];return sk.length===0?"无匹配":sk.map(function(a){return"• "+a.assetId+" "+a.title}).join("\n")}

  // P4 Video
  if(args.indexOf("视频匹配 ")==0){return safe(function(){var m=matcher.matchForVideo(args.replace("视频匹配 ","").trim(),"引流");return"🎬 视频匹配方案\n"+m.matches.map(function(x){return x.rank+". "+x.assetId+" "+x.title+" ["+x.type+"] → "+x.suggestedUse}).join("\n")})}
  if(args.indexOf("封面推荐 ")==0){return safe(function(){var c=matcher.recommendCover(args.replace("封面推荐 ","").trim());return c.length>0?"🖼️ "+c[0].assetId+" "+c[0].title+" score:"+c[0].score:"无推荐"})}
  if(args.indexOf("卖点推荐 ")==0){return safe(function(){var s=matcher.recommendSelling(args.replace("卖点推荐 ","").trim());return s.length===0?"无推荐":s.map(function(x){return"• "+x.assetId+" "+x.title}).join("\n")})}
  if(args.indexOf("视频方案 ")==0){return safe(function(){var p=matcher.createPlan(args.replace("视频方案 ","").trim());return"📋 方案ID: "+p.planId+"\n匹配素材:"+p.matches.length+"\n目标:"+p.goal})}

  // P5 Score
  if(args.indexOf("评分 ")==0){return safe(function(){var s=scorer.scoreAsset(args.replace("评分 ","").trim());return s.error?"❌ "+s.error:Object.keys(s).map(function(k){return k+": "+s[k]}).join("\n")})}
  if(args.indexOf("评分重算 ")==0){return safe(function(){var r=scorer.rescoreAll(args.replace("评分重算 ","").trim());return"✅ 重算完成: "+r.length+" 个素材"})}
  if(args.indexOf("评分榜 ")==0){return safe(function(){var t=scorer.topScored(args.replace("评分榜 ","").trim());return t.map(function(a,i){return(i+1)+". "+a.assetId+" "+a.title+" score:"+a.finalAssetScore}).join("\n")})}

  // Agent
  if(args.indexOf("智能建议")>=0||args==="agent"){return safe(function(){return agent?agent.advise(args):"⚠️ Agent未加载"})}

  // Learning
  if(args==="学习记录"){return safe(function(){return alearn?alearn.recentList(20):"⚠️ 未加载"})}
  if(args==="学习总结"){return safe(function(){return alearn?alearn.summary():"⚠️ 未加载"})}
  if(args==="记忆状态"){return safe(function(){return alearn?alearn.status():"⚠️ 未加载"})}

  // EC
  if(args==="执行中心"){return safe(function(){return ec?ec.dashboard():"⚠️ 未加载"})}
  if(args==="历史"){return safe(function(){return ec?ec.history():"⚠️ 未加载"})}
  if(args==="状态"){return safe(function(){return"📦 素材域\n产品: "+store.stats().products+"\n素材: "+store.stats().total+"\nREVIEW_ONLY="+store.getConfig().REVIEW_ONLY})}

  return"📦 /素材 命令:\n产品 <id> | 入库 <pid> | 列表 <pid> | 详情 <id> | 审核 | 通过/拒绝 <id> | 搜索 <kw> | 标签 <t> | TOP <pid> | 视频匹配/封面推荐/卖点推荐/视频方案 <pid> | 评分/评分重算/评分榜 | 智能建议 | 学习记录/学习总结/记忆状态 | 执行中心/历史/状态";
}
var desc="产品素材域: 入库/审核/搜索/视频匹配/评分 (REVIEW_ONLY)";
module.exports={execute,desc};
