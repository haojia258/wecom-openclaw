"use strict";
var agent = null;
try { agent = require("./activity-planner-agent"); } catch(e) {}

var NL_TRIGGERS = [
  "今天有什么活动", "值得参加", "帮我选", "最适合", "利润最高", "风险最低",
  "是否需要调价", "活动建议", "怎么报名", "哪个活动", "推荐活动",
  "有什么活动", "活动分析", "智能推荐", "智能建议", "agent"
];

function isActivityQuery(text) {
  if (!text) return false;
  var lower = text.toLowerCase();
  return NL_TRIGGERS.some(function (t) { return lower.indexOf(t) >= 0; });
}

function route(text) {
  if (!agent) return "⚠️ Activity Planner Agent 未加载";
  return agent.advise(text);
}

module.exports = { route: route, isActivityQuery: isActivityQuery, NL_TRIGGERS: NL_TRIGGERS };
