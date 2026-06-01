"use strict";
var agent = null;
try { agent = require("../agents/activity-planner-agent"); } catch(e) {}

async function execute(ctx, args) {
  args = (args || "").trim();

  if (!agent) return "⚠️ Activity Planner Agent 未加载";

  // Remove command prefix
  var text = args.replace(/^agent\s*/, "").replace(/^智能建议\s*/, "").trim();
  if (!text) text = "智能建议";

  return agent.advise(text);
}

var desc = "Activity Planner Agent: 自然语言活动分析建议 (REVIEW_ONLY)";
module.exports = { execute: execute, desc: desc };
