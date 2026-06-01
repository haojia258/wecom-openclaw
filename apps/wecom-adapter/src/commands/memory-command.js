"use strict";
var memStore = null;
try { memStore = require("../memory/memory-store"); } catch(e) {}

async function execute(ctx, args) {
  args = (args || "").trim();
  if (!memStore) return "⚠️ Memory module not loaded";
  var entries = memStore.search(args || "");
  if (entries.length === 0) return "🧠 记忆库为空";
  var lines = ["## 🧠 记忆库", ""];
  entries.slice(0, 10).forEach(function(e) { lines.push("- " + (e.id || "") + ": " + (e.title || JSON.stringify(e).substring(0, 60))); });
  return lines.join("\n");
}
var desc = "记忆库：历史数据索引/搜索/回溯 (REVIEW_ONLY)";
module.exports = { execute: execute, desc: desc };
