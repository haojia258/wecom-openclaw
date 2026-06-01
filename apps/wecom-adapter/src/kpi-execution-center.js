"use strict";var agg=require("./kpi-aggregator"),strat=require("./kpi-strategy-engine");
function dashboard(){var m=agg.aggregate().metrics;var s=strat.score();return"📊 KPI 执行中心\n\nGMV: ¥"+m.gmv.toLocaleString()+" | 利润: ¥"+m.profit.toLocaleString()+"\nROI: "+m.roi+"x | CTR: "+m.ctr+"% | CVR: "+m.cvr+"%\n活动: "+m.activityCount+" | 素材: "+m.assetCount+" | 视频: "+m.videoPlanCount+"\n广告: "+m.adsPlanCount+" | 预算利用率: "+m.budgetUtilization+"%\n\n策略分: "+s.finalStrategyScore+"/100\nREVIEW_ONLY=true"}
function history(){return"📜 暂无 KPI 历史"}
module.exports={dashboard,history};
