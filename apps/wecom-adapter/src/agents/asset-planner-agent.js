"use strict";var path=require("path"),registry=null;try{registry=require("../skills/assets/skill-registry")}catch(e){}
function advise(text){
  text=(text||"").toLowerCase();
  if(!registry)return"⚠️ Asset Skill Layer未加载";
  var store=null;try{store=require("../assets/asset-store")}catch(e){}
  var stats=store?store.stats():{total:0,products:0};
  var r=registry.invoke("searchAssets","");
  var results=r.status==="success"?r.data.results||[]:[];
  return"📦 素材智能建议\n\n"+
    "素材总数: "+stats.total+" | 产品: "+stats.products+"\n\n"+
    "🏆 TOP素材:\n"+(results.slice(0,3).map(function(a,i){return (i+1)+". "+a.title+" ["+a.type+"] score:"+a.score}).join("\n")||"暂无")+
    "\n\n💡 建议:\n• /素材 入库 <productId> — 添加素材\n• /素材 视频匹配 <productId> — 视频方案\n• /素材 评分榜 <productId> — 查看评分\n\nREVIEW_ONLY=true";
}
module.exports={advise};
