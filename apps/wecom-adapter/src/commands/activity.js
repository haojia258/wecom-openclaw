"use strict";
var activityCmd = null;
try { activityCmd = require("../activities/activity-command"); } catch(e) {}

async function execute(ctx, args) {
  if (!activityCmd) return "⚠️ Activity module not loaded";
  var r = activityCmd.handle(ctx.cmd + " " + (args || ""));
  return typeof r === "string" ? r : JSON.stringify(r, null, 2);
}
var desc = "活动中心：状态/列表/利润/风险/推荐/报名计划/复盘 (REVIEW_ONLY)";
module.exports = { execute: execute, desc: desc };
