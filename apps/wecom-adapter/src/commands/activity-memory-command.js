"use strict";
var hook = null;
try { hook = require("../memory/activity-learning-hook"); } catch(e) {}

async function execute(ctx, args) {
  args = (args || "").trim();
  if (!hook) return "⚠️ Learning Hook 未加载";

  if (args.indexOf("学习记录") >= 0) {
    hook.sync();
    return hook.recentList(20);
  }
  if (args.indexOf("学习总结") >= 0) {
    hook.sync();
    return hook.summary();
  }
  if (args.indexOf("记忆状态") >= 0) {
    hook.sync();
    return hook.status();
  }
  return "🧠 活动学习命令:\n/活动 学习记录 — 最近20条\n/活动 学习总结 — 经验总结\n/活动 记忆状态 — 总览";
}
var desc = "Activity Learning Hook: 活动事件学习同步 (REVIEW_ONLY)";
module.exports = { execute: execute, desc: desc };
