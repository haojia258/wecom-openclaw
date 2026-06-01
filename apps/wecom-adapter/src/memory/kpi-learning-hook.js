"use strict";var w=require("./kpi-memory-writer");
function sync(){var agg=require("../kpi/kpi-aggregator");var m=agg.aggregate().metrics;w.write({eventType:"kpi_snapshot",gmv:m.gmv,profit:m.profit,roi:m.roi})}
function recentList(n){var r=w.recent(n||20);if(r.length===0)return"🧠 暂无KPI记忆";return"🧠 KPI记忆\n"+r.map(function(e,i){return(i+1)+". [kpi_snapshot] GMV:¥"+e.gmv+" @"+(e.createdAt||"").substring(0,10)}).join("\n")}
function summary(){var s=w.stats();return"🧠 KPI学习总结\n总记录:"+s.total+"\n最后:"+(s.lastSync||"无")}
function memStatus(){var s=w.stats();return"🧠 KPI记忆状态\n总记录:"+s.total+"\n最后:"+(s.lastSync||"无")}
module.exports={sync,recentList,summary,memStatus};
