"use strict";
/**
 * P61 — Activity Skill Registry
 * 8 capabilities registered as skills.
 */
var path = require("path");
var { SkillResult, SkillError } = require("./skill-layer");

// ═══ Lazy-load activity modules ═══
function load(n) { try { return require(path.join(__dirname, "..", "..", "activities", n)); } catch (e) { return null; } }

var REGISTRY = [
  { name: "recommendActivity",    desc: "推荐可报名活动",       category: "activity" },
  { name: "analyzeActivityProfit", desc: "分析活动利润",        category: "activity" },
  { name: "analyzeActivityRisk",  desc: "分析活动风险",        category: "activity" },
  { name: "createEnrollmentPlan", desc: "创建报名计划",        category: "activity" },
  { name: "getApprovalStatus",    desc: "获取审批状态",        category: "activity" },
  { name: "getExecutionStatus",   desc: "获取执行状态",        category: "activity" },
  { name: "createPricePlan",      desc: "创建调价计划",        category: "activity" },
  { name: "getExecutionCenter",   desc: "活动执行中心总览",    category: "activity" }
];

// ═══════════════════════════════════════════════
// SKILL IMPLEMENTATIONS
// ═══════════════════════════════════════════════

function recommendActivity() {
  var rec = load("activity-recommender");
  var store = load("activity-store");
  if (!rec || !store) return SkillError("recommendActivity", "依赖模块未加载");
  var all = store.getAll();
  var r = rec.recommend(all);
  return SkillResult("recommendActivity", { total: r.length, recommendations: r.slice(0, 5) });
}

function analyzeActivityProfit(args) {
  var profit = load("activity-profit-engine");
  var store = load("activity-store");
  if (!profit || !store) return SkillError("analyzeActivityProfit", "依赖模块未加载");
  var all = store.getAll();
  var results = all.map(function (a) { return profit.calculate(a); });
  return SkillResult("analyzeActivityProfit", { total: results.length, profits: results.slice(0, 10) });
}

function analyzeActivityRisk(args) {
  var risk = load("activity-risk-engine");
  var store = load("activity-store");
  if (!risk || !store) return SkillError("analyzeActivityRisk", "依赖模块未加载");
  var all = store.getAll();
  var results = all.map(function (a) { return risk.assess(a, 0.05); });
  return SkillResult("analyzeActivityRisk", { total: results.length, risks: results.slice(0, 10) });
}

function createEnrollmentPlan(args) {
  var enrollment = load("enrollment-planner");
  var auto = load("activity-auto-enroll");
  var store = load("activity-store");
  if (!enrollment || !auto || !store) return SkillError("createEnrollmentPlan", "依赖模块未加载");
  var candidates = auto.scanLowRisk();
  if (!candidates || candidates.length === 0) return SkillError("createEnrollmentPlan", "无低风险活动");
  var plan = enrollment.createPlan(candidates[0], candidates[0].products || []);
  return SkillResult("createEnrollmentPlan", { plan: plan, blocked: plan.blocked !== false });
}

function getApprovalStatus(args) {
  var action = load("approval-action");
  if (!action) return SkillError("getApprovalStatus", "审批模块未加载");
  var plans = action.loadPlans();
  var summary = { total: plans.length, pending: plans.filter(function (p) { return p.status === "pending_approval"; }).length, approved: plans.filter(function (p) { return p.status === "approved"; }).length, rejected: plans.filter(function (p) { return p.status === "rejected"; }).length };
  return SkillResult("getApprovalStatus", summary);
}

function getExecutionStatus(args) {
  var execution = load("execution-center");
  if (!execution) return SkillError("getExecutionStatus", "执行中心未加载");
  var dash = execution.dashboard();
  return SkillResult("getExecutionStatus", { dashboard: dash });
}

function createPricePlan(args) {
  var guard = load("price-guard");
  var exec = load("price-executor");
  if (!guard || !exec) return SkillError("createPricePlan", "调价模块未加载");
  return SkillResult("createPricePlan", { ready: guard.getConfig().PRICE_CHANGE_EXECUTE === false, message: "PRICE_CHANGE_EXECUTE=false, 调价处于只读模式" });
}

function getExecutionCenter(args) {
  var ec = load("execution-center");
  if (!ec) return SkillError("getExecutionCenter", "执行中心未加载");
  return SkillResult("getExecutionCenter", { dashboard: ec.dashboard(), historyCount: ec.historyList ? ec.historyList(20) : "N/A" });
}

// ═══════════════════════════════════════════════
// INVOKE
// ═══════════════════════════════════════════════
var HANDLERS = {
  recommendActivity: recommendActivity,
  analyzeActivityProfit: analyzeActivityProfit,
  analyzeActivityRisk: analyzeActivityRisk,
  createEnrollmentPlan: createEnrollmentPlan,
  getApprovalStatus: getApprovalStatus,
  getExecutionStatus: getExecutionStatus,
  createPricePlan: createPricePlan,
  getExecutionCenter: getExecutionCenter
};

function invoke(skillName, args) {
  var fn = HANDLERS[skillName];
  if (!fn) return SkillError(skillName, "未知技能: " + skillName);
  try { return fn(args); } catch (e) { return SkillError(skillName, e.message); }
}

function listSkills() {
  return REGISTRY.map(function (r) { return { name: r.name, desc: r.desc, category: r.category }; });
}

function status() {
  var results = REGISTRY.map(function (r) {
    try { var s = invoke(r.name); return { name: r.name, available: s.status === "success", error: s.error }; }
    catch (e) { return { name: r.name, available: false, error: e.message }; }
  });
  var available = results.filter(function (r) { return r.available; }).length;
  return SkillResult("activity", { total: REGISTRY.length, available: available, skills: results });
}

module.exports = { invoke: invoke, listSkills: listSkills, status: status, REGISTRY: REGISTRY };
