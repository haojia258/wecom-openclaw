"use strict";var store=require("./asset-store"),reviewer=null;try{reviewer=require("./asset-reviewer")}catch(e){}
function dashboard(){
  var s=store.stats(),cfg=store.getConfig(),pend=reviewer?reviewer.pending().length:0;
  return"📦 素材执行中心\n\n"+["产品数: "+s.products,"总素材: "+s.total,"raw: "+s.raw+" | reviewed: "+s.reviewed,"rejected: "+s.rejected+" | archived: "+s.archived,"待审核: "+pend].join("\n")+"\n\nREVIEW_ONLY="+cfg.REVIEW_ONLY;
}
function history(){var h=[];try{var path=require("path"),fs=require("fs");h=JSON.parse(fs.readFileSync(path.join(__dirname,"..","..","storage","assets","asset-history.json"),"utf8"))}catch(e){}if(h.length===0)return"暂无记录";return"📜 最近 "+Math.min(20,h.length)+" 条\n"+h.slice(0,20).map(function(e,i){return (i+1)+". ["+e.eventType+"] "+e.assetId+" @ "+(e.createdAt||"").substring(0,19)}).join("\n")}
module.exports={dashboard,history};
