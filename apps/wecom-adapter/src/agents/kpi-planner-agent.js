"use strict";var reg=null;try{reg=require("../skills/kpi/skill-registry")}catch(e){}
function advise(text){
  if(!reg)return"⚠️ KPI Skill未加载";
  var r=reg.invoke("getKpiOverview","");var s=reg.invoke("getKpiStrategy","");var rec=reg.invoke("getKpiRecommendations","");
  var m=r.status==="success"?r.data.metrics||{}:{};var sc=s.status==="success"?s.data:{finalStrategyScore:0};var recs=rec.status==="success"?rec.data.recommendations||[]:[];
  var lines=["📊 KPI 智能建议","","━━━ 核心指标 ━━━","GMV: ¥"+(m.gmv||0).toLocaleString(),"利润: ¥"+(m.profit||0).toLocaleString(),"ROI: "+(m.roi||0)+"x","CTR: "+(m.ctr||0)+"% | CVR: "+(m.cvr||0)+"%","策略分: "+sc.finalStrategyScore+"/100","","━━━ 建议 ━━━"];
  recs.forEach(function(r){lines.push("• ["+r.priority+"] "+r.action+" — "+r.detail)});
  lines.push("","下一步: /kpi 执行中心 | /kpi 策略建议 | /kpi 趋势 gmv","REVIEW_ONLY=true | BUDGET_DAILY_CAP=100");return lines.join("\n");
}
module.exports={advise};
