"use strict";
var autoApi = null;
try { autoApi = require("../autonomous/autonomous-api"); } catch(e) {}

async function execute(ctx, args) {
  args = (args || "").trim();
  if (!autoApi) return "⚠️ Autonomous module not loaded";

  if (args.indexOf("状态") >= 0 || !args) {
    var s = autoApi.getStatus();
    return "⚡ 自治公司 — " + s.phase + " 阶段\n\n" +
      "数据源: P50+P51+P52+P53\n" +
      "今日任务: 6 项 | 风险: 4 | 审批: 4\n\n" +
      "/自治公司 今日计划 | /自治公司 风险 | /自治公司 审批 | /自治公司 复盘 | /自治公司 明日建议";
  }
  if (args.indexOf("今日计划") >= 0) { var p = autoApi.getTodayPlan(); return "📋 今日计划 (" + p.plan.tasks.length + " 任务)\n" + p.plan.tasks.map(function(t) { return "- " + t.title }).join("\n"); }
  if (args.indexOf("风险") >= 0) { var r = autoApi.getRisks(); return "⚠️ 风险报告 (" + r.alerts.length + " 项)\n" + r.alerts.map(function(a) { return "- [" + a.level + "] " + a.message }).join("\n"); }
  if (args.indexOf("审批") >= 0) { var a = autoApi.getApprovals(); return "✋ 待审批 (" + a.tasks.length + " 项)\n" + a.tasks.map(function(t) { return "- [" + t.risk + "] " + t.title }).join("\n"); }
  if (args.indexOf("复盘") >= 0) { var rv = autoApi.runReview(); return "📊 晚间复盘\nGMV: " + rv.summary.gmv + " | 订单: " + rv.summary.orders + " | ROI: " + rv.summary.roi + "\n利润: " + rv.summary.profit + "\n\n" + rv.highlights.map(function(h) { return "✅ " + h }).join("\n"); }
  if (args.indexOf("明日") >= 0) { var tm = autoApi.getTomorrowPlan(); return "📅 明日方案\n" + tm.priorities.map(function(p) { return "- [" + p.pri + "] " + p.task }).join("\n"); }
  return "⚡ 自治公司命令:\n/自治公司 状态 | 今日计划 | 风险 | 审批 | 复盘 | 明日建议";
}

var desc = "自治公司闭环：状态/计划/风险/审批/复盘/明日建议 (REVIEW_ONLY)";
module.exports = { execute: execute, desc: desc };
