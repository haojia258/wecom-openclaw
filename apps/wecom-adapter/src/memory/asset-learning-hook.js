"use strict";var writer=require("./asset-memory-writer");
function recentList(n){var r=writer.recent(n||20);if(r.length===0)return"🧠 暂无素材学习记录";return"🧠 素材学习记录\n"+r.map(function(e,i){return(i+1)+". ["+e.eventType+"] "+e.assetId+" @ "+(e.createdAt||"").substring(0,19)}).join("\n")}
function summary(){var s=writer.stats();if(s.total===0)return"🧠 暂无素材学习数据";return"🧠 素材学习总结\n总数:"+s.total+"\n事件:"+JSON.stringify(s.eventTypes).substring(0,200)}
function status(){var s=writer.stats();return"🧠 素材记忆状态\n总记录:"+s.total+"\n最后:"+(s.lastSync||"无")}
module.exports={recentList,summary,status};
