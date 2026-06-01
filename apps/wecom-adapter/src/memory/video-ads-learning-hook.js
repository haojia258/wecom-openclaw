"use strict";var w=require("./video-ads-memory-writer");
function recentList(n){var r=w.recent(n||20);if(r.length===0)return"🧠 暂无学习记录";return"🧠 学习记录\n"+r.map(function(e,i){return(i+1)+". ["+e.eventType+"] "+e.videoPlanId+" @ "+(e.createdAt||"").substring(0,19)}).join("\n")}
function summary(){var s=w.stats();return"🧠 学习总结\n总记录:"+s.total+"\nREVIEW_ONLY=true"}
function memStatus(){var s=w.stats();return"🧠 记忆状态\n总记录:"+s.total+"\n最后:"+(s.lastSync||"无")}
module.exports={recentList,summary,memStatus};
