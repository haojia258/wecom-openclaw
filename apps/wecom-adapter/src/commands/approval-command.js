"use strict";
var viewer = null; var action = null;
try { viewer = require("../activities/approval-viewer"); } catch (e) {}
try { action = require("../activities/approval-action"); } catch (e) {}

async function execute(ctx, args) {
  args = (args || "").trim();
  if (!viewer) return "⚠️ Approval viewer not available";

  // /审批 活动通过 <planId>
  if (args.indexOf("活动通过") >= 0) {
    var planId = args.replace("活动通过", "").trim();
    if (!planId) return "❌ 请提供计划ID。\n格式: /审批 活动通过 <计划ID>";
    if (!action) return "⚠️ Approval action module not available";
    var r = action.approve(planId, ctx && ctx.fromUser || "wecom-user");
    if (r.error) return "❌ " + r.error;
    return r.message + "\n\n计划ID: " + r.planId + "\n执行状态: " + r.executionStatus + "\n\n⚠️ 审批通过 ≠ 执行报名。AUTO_ENROLL_EXECUTE=false";
  }

  // /审批 活动拒绝 <planId> <reason>
  if (args.indexOf("活动拒绝") >= 0) {
    var rest = args.replace("活动拒绝", "").trim();
    var parts = rest.split(/\s+/);
    var pid = parts[0] || "";
    var reason = parts.slice(1).join(" ") || "No reason provided";
    if (!pid) return "❌ 请提供计划ID。\n格式: /审批 活动拒绝 <计划ID> <原因>";
    if (!action) return "⚠️ Approval action module not available";
    var rr = action.reject(pid, reason, ctx && ctx.fromUser || "wecom-user");
    if (rr.error) return "❌ " + rr.error;
    return rr.message + "\n\n计划ID: " + rr.planId + "\n执行状态: " + rr.executionStatus;
  }

  // /审批 活动详情 <planId>
  if (args.indexOf("活动详情") >= 0) {
    var dId = args.replace("活动详情", "").trim();
    return viewer.detail(dId || null);
  }

  // /审批 活动 (default = list)
  if (args.indexOf("活动") >= 0 || !args) {
    return viewer.listPending();
  }

  return "📋 审批命令:\n/审批 活动 — 待审批列表\n/审批 活动详情 <ID> — 查看详情\n/审批 活动通过 <ID> — 审批通过\n/审批 活动拒绝 <ID> <原因> — 审批拒绝";
}
var desc = "审批中心：活动报名审批/拒绝 (REVIEW_ONLY, 不执行)";
module.exports = { execute: execute, desc: desc };
