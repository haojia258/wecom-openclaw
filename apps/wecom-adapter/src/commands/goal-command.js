"use strict";
var goalReg = null;
try { goalReg = require("../goals/goal-registry"); } catch(e) {}

async function execute(ctx, args) {
  args = (args || "").trim();
  if (!goalReg) return "⚠️ Goal module not loaded";
  var goals = goalReg.getAll();
  if (goals.length === 0) return "🎯 暂无目标\n\n/目标 创建 <标题> <值>";
  var lines = ["## 🎯 目标管理", ""];
  goals.forEach(function(g) { lines.push("- " + (g.id || "") + ": " + g.title + " (目标: " + (g.target || "--") + ", 状态: " + (g.status || "active") + ")"); });
  lines.push("", "REVIEW_ONLY=true");
  return lines.join("\n");
}
var desc = "目标管理：设置/查看/追踪企业目标 (REVIEW_ONLY)";
module.exports = { execute: execute, desc: desc };
