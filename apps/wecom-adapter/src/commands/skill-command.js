"use strict";
var registry = null;
try { registry = require("../skills/activity/skill-registry"); } catch(e) {}

async function execute(ctx, args) {
  args = (args || "").trim();

  if (!registry) return "⚠️ Skill Layer 未加载";

  // /技能 activity
  if (args.indexOf("activity") >= 0 && args.indexOf("status") >= 0) {
    var s = registry.status();
    if (s.status === "error") return "⚠️ " + s.error;
    var lines = ["🎯 Activity Skill Layer", "", "总数: " + s.data.total + " | 可用: " + s.data.available, ""];
    s.data.skills.forEach(function (sk) {
      lines.push((sk.available ? "✅" : "❌") + " " + sk.name + (sk.error ? " — " + sk.error : ""));
    });
    return lines.join("\n");
  }

  if (args.indexOf("activity") >= 0) {
    var list = registry.listSkills();
    var lines = ["🎯 Activity Skills (" + list.length + ")", ""];
    list.forEach(function (s) { lines.push("• " + s.name + " — " + s.desc); });
    lines.push("", "发送 /技能 activity status 检查可用性");
    return lines.join("\n");
  }

  return "🎯 技能命令:\n/技能 activity — 活动能力列表\n/技能 activity status — 可用性检查";
}

var desc = "Skill Layer: 活动域能力注册与调用 (REVIEW_ONLY)";
module.exports = { execute: execute, desc: desc };
