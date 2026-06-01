"use strict";
/**
 * P63 — Activity Learning Hook
 * 包装 activity-memory-writer，提供学习总结和只读查询。
 */
var writer = require("./activity-memory-writer");

function sync() { return writer.syncFromHistory(); }

function status() {
  var s = writer.stats();
  var lines = [
    "🧠 活动记忆状态",
    "",
    "总记录: " + s.total + " 条",
    "活动数: " + s.activityCount,
    "SKU数: " + s.skuCount,
    "最后同步: " + (s.lastSync || "无"),
    "",
    "事件分布:"
  ];
  Object.keys(s.eventTypes).sort().forEach(function (t) {
    lines.push("  • " + t + ": " + s.eventTypes[t]);
  });
  return lines.join("\n");
}

function recentList(n) {
  var recs = writer.recent(n || 20);
  if (recs.length === 0) return "🧠 暂无学习记录。\n\n发送 /活动 学习记录 同步学习后查看。";

  var lines = ["🧠 学习记录 (" + recs.length + ")", ""];
  recs.forEach(function (r, i) {
    lines.push((i + 1) + ". [" + r.eventType + "] " + (r.planId || r.batchId || "—"));
    lines.push("   " + (r.activity || "") + " @ " + (r.timestamp || "").substring(0, 19));
    if (r.outcome) lines.push("   结果: " + r.outcome);
    lines.push("");
  });
  return lines.join("\n");
}

function summary() {
  var s = writer.stats();
  if (s.total === 0) return "🧠 暂无学习数据。\n\n系统将从 history.json 同步活动事件。\n发送 /活动 学习记录 查看进度。";

  var recs = writer.recent(50);
  var successes = recs.filter(function (r) { return r.eventType && r.eventType.indexOf("success") >= 0; });
  var failures = recs.filter(function (r) { return r.eventType && (r.eventType.indexOf("failed") >= 0 || r.eventType.indexOf("blocked") >= 0 || r.eventType.indexOf("stopped") >= 0); });
  var enrollments = recs.filter(function (r) { return r.eventType && r.eventType.indexOf("enroll") >= 0; });
  var prices = recs.filter(function (r) { return r.eventType && r.eventType.indexOf("price") >= 0; });

  var lines = [
    "🧠 活动学习总结",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "📊 数据概览",
    "总事件: " + s.total + " | 活动: " + s.activityCount + " | SKU: " + s.skuCount,
    "成功: " + successes.length + " | 失败/阻断: " + failures.length,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "📈 报名分析",
    "报名事件: " + enrollments.length + " 条",
    "成功率: " + (enrollments.length > 0 ? Math.round(successes.length / Math.max(enrollments.length, 1) * 100) + "%" : "N/A"),
    "",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "💰 调价分析",
    "调价事件: " + prices.length + " 条",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "💡 经验总结"
  ];

  if (failures.length > successes.length) {
    lines.push("⚠️  阻断率高，建议检查活动配置和审批流程。");
  } else if (successes.length > 0) {
    lines.push("✅ 执行成功率较高，灰度运行正常。");
  }

  if (prices.length === 0) {
    lines.push("💰 暂无调价记录，PRICE_CHANGE_EXECUTE=false 保持安全。");
  }

  lines.push("");
  lines.push("---");
  lines.push("REVIEW_ONLY=true | 仅 synced to memory, no production impact");

  return lines.join("\n");
}

module.exports = { sync: sync, status: status, recentList: recentList, summary: summary };
