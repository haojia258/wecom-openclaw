"use strict";
var exec = null;
try { exec = require("../activities/enrollment-executor"); } catch(e) {}
async function execute(ctx, args) {
  args = (args || "").trim();
  if (!exec) return "⚠️ Enrollment executor not available";

  if (args.indexOf("执行确认") >= 0) {
    var rest = args.replace("执行确认", "").trim();
    var parts = rest.split(/\s+/);
    var pid = parts[0] || "";
    var token = parts[1] || "";
    var r = exec.confirm(pid, token);
    return r.error ? "❌ " + r.error : r.message;
  }
  if (args.indexOf("执行状态") >= 0) {
    var sid = args.replace("执行状态", "").trim();
    var plans = require("../activities/approval-action").loadPlans();
    var p = plans.find(function(x) { return x.planId === sid; });
    if (!p) return "❌ Plan not found: " + sid;
    return "📊 执行状态\n计划ID: " + p.planId + "\n审批: " + p.status + "\n执行: " + (p.executionStatus || "NOT_EXECUTED") + "\n阻断: " + p.blocked;
  }
  if (args.indexOf("执行报名") >= 0) {
    var eid = args.replace("执行报名", "").trim();
    if (!eid) return "❌ 请提供计划ID。\n格式: /活动 执行报名 <计划ID>";
    var pr = exec.preview(eid);
    return pr.error ? "❌ " + pr.error : pr.message;
  }
  return "📋 执行命令:\n/活动 执行报名 <ID> — 预览\n/活动 执行确认 <ID> CONFIRM — 确认执行\n/活动 执行状态 <ID> — 查看状态";
}
var desc = "活动报名执行：预览/确认/状态 (REVIEW_ONLY, AUTO_ENROLL_EXECUTE=false)";
module.exports = { execute: execute, desc: desc };
