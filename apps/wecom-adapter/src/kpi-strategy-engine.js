"use strict";var agg=require("./kpi-aggregator");
function score(){
  var m=agg.aggregate().metrics;
  var roiS=m.roi>=2?90:m.roi>=1.5?60:30;
  var gmvS=m.gmv>100000?90:m.gmv>50000?70:m.gmv>0?50:10;
  var ctrS=(m.ctr||3)>=4?80:(m.ctr||3)>=3?60:30;
  var cvrS=(m.cvr||7)>=8?85:(m.cvr||7)>=6?55:25;
  var marginS=(m.profit/(m.gmv||1))*100;marginS=marginS>=30?90:marginS>=15?60:30;
  var budgetS=100-m.budgetUtilization;
  var total=Math.round(roiS*0.25+gmvS*0.2+ctrS*0.15+cvrS*0.15+marginS*0.15+budgetS*0.1);
  return{roiScore:roiS,gmvScore:gmvS,ctrScore:ctrS,cvrScore:cvrS,marginScore:marginS,budgetScore:budgetS,finalStrategyScore:Math.max(1,Math.min(100,total)),metrics:m};
}
function recommend(){
  var s=score();var items=[];
  if(s.roiScore<50)items.push({action:"优化投流ROI",priority:"high",detail:"当前ROI: "+s.metrics.roi+"x"});
  if(s.ctrScore<50)items.push({action:"优化CTR",priority:"medium",detail:"当前CTR: "+s.metrics.ctr+"%"});
  if(s.gmvScore<50)items.push({action:"提升GMV",priority:"high",detail:"当前GMV: ¥"+s.metrics.gmv.toLocaleString()});
  if(s.marginScore<50)items.push({action:"优化利润",priority:"medium"});
  if(items.length===0)items.push({action:"保持现状",priority:"low",detail:"各项指标正常"});
  return{score:s,recommendations:items};
}
module.exports={score,recommend};
