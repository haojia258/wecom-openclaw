"use strict";
var viewer = null;
try { viewer = require("../activities/approval-viewer"); } catch (e) {}

async function execute(ctx, args) {
  args = (args || "").trim();
  if (!viewer) return "⚠️ Approval viewer not available";

  if (args.indexOf("活动详情") >= 0) {
    var planId = args.replace("活动详情", "").trim();
    return viewer.detail(planId || null);
  }
  if (args.indexOf("活动") >= 0) {
    return viewer.listPending();
  }
  return "📋 审批命令:\n/审批 活动 — 待审批活动列表\n/审批 活动详情 <计划ID> — 查看详情";
}
var desc = "审批中心：查看待审批活动报名计划 (REVIEW_ONLY)";
module.exports = { execute: execute, desc: desc };
