"use strict";
/**
 * P64 — Activity Strategy Engine v1
 *
 * 5 因子策略评分:
 *  1. historicalScore    — 历史表现 (来自 activity-memory)
 *  2. roiScore           — 投入产出比
 *  3. riskPenalty        — 风险惩罚
 *  4. priceImpactScore   — 调价敏感度
 *  5. finalStrategyScore — 加权综合分
 *
 * 无历史数据 → 退化为 P62 智能建议
 */

var path = require("path");

var registry = null; try { registry = require("../skills/activity/skill-registry"); } catch (e) {}
var writer = null; try { writer = require("../memory/activity-memory-writer"); } catch (e) {}
var agent = null; try { agent = require("../agents/activity-planner-agent"); } catch (e) {}

// ═══════════════════════════════════════════════
// DATA SOURCES
// ═══════════════════════════════════════════════
function getMemory() {
  try { return require("../memory/activity-memory-writer"); } catch (e) { return null; }
}

function getHistoryStats(activityName) {
  if (!writer) return { total: 0, successRate: 0, avgProfit: 0 };
  var recs = writer.recent(200);
  var matched = recs.filter(function (r) { return r.activity === activityName; });
  if (matched.length === 0) return { total: 0, successRate: 0, avgProfit: 0 };

  var successes = matched.filter(function (r) { return r.eventType && r.eventType.indexOf("success") >= 0; }).length;
  return {
    total: matched.length,
    successRate: Math.round(successes / matched.length * 100),
    recentEvents: matched.slice(0, 5).map(function (r) { return r.eventType; })
  };
}

// ═══════════════════════════════════════════════
// 5 SCORING FACTORS
// ═══════════════════════════════════════════════

/** historicalScore: 0-100, based on past success rate */
function historicalScore(activityName) {
  var stats = getHistoryStats(activityName);
  if (stats.total === 0) return { score: 50, factor: "neutral", detail: "无历史数据" };
  return {
    score: stats.successRate,
    factor: stats.successRate >= 80 ? "strong" : stats.successRate >= 50 ? "moderate" : "weak",
    detail: stats.total + " 条历史, 成功率 " + stats.successRate + "%"
  };
}

/** roiScore: 0-100, based on profit margin */
function roiScore(profitData) {
  var margin = profitData.profitMargin || 0;
  if (margin >= 50) return { score: 95, factor: "strong", detail: "利润率 " + margin + "%" };
  if (margin >= 20) return { score: 75, factor: "moderate", detail: "利润率 " + margin + "%" };
  if (margin > 0) return { score: 55, factor: "weak", detail: "利润率 " + margin + "%" };
  return { score: 10, factor: "negative", detail: "亏损" };
}

/** riskPenalty: 0-50 penalty */
function riskPenalty(riskData) {
  var level = (riskData.riskLevel || "").toLowerCase();
  if (level === "low") return { penalty: 0, factor: "strong", detail: "低风险" };
  if (level === "medium") return { penalty: 15, factor: "moderate", detail: "中等风险" };
  if (level === "high") return { penalty: 35, factor: "weak", detail: "高风险" };
  return { penalty: 25, factor: "unknown", detail: "未知风险" };
}

/** priceImpactScore: 0-100, based on discount depth */
function priceImpactScore(profitData) {
  var discountRate = profitData.discountRate || profitData.discount || 0;
  if (discountRate <= 0.05) return { score: 90, factor: "strong", detail: "低折扣(" + Math.round(discountRate * 100) + "%)" };
  if (discountRate <= 0.1) return { score: 75, factor: "moderate", detail: "中折扣(" + Math.round(discountRate * 100) + "%)" };
  if (discountRate <= 0.2) return { score: 50, factor: "weak", detail: "高折扣(" + Math.round(discountRate * 100) + "%)" };
  return { score: 30, factor: "negative", detail: "极高折扣(" + Math.round(discountRate * 100) + "%)" };
}

/** finalStrategyScore: weighted average */
function finalScore(hist, roi, risk, price) {
  var raw = hist.score * 0.25 + roi.score * 0.35 - risk.penalty + price.score * 0.2;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// ═══════════════════════════════════════════════
// SCORE A SINGLE ACTIVITY
// ═══════════════════════════════════════════════
function scoreActivity(activity, profitData, riskData) {
  var hist = historicalScore(activity);
  var roi = roiScore(profitData);
  var risk = riskPenalty(riskData);
  var price = priceImpactScore(profitData);
  var final = finalScore(hist, roi, risk, price);

  return {
    activity: activity,
    finalStrategyScore: final,
    factors: {
      historical: hist,
      roi: roi,
      risk: risk,
      priceImpact: price
    },
    explanation: buildExplanation(hist, roi, risk, price, final)
  };
}

function buildExplanation(hist, roi, risk, price, final) {
  var parts = [];
  if (final >= 80) parts.push("✅ 强烈推荐");
  else if (final >= 60) parts.push("👍 推荐");
  else if (final >= 40) parts.push("⏸️ 观望");
  else parts.push("❌ 不推荐");

  if (hist.factor === "strong") parts.push("历史表现优秀");
  if (roi.factor === "strong") parts.push("利润率高");
  if (risk.factor === "weak") parts.push("风险需关注");
  if (price.factor === "weak" || price.factor === "negative") parts.push("折扣深度大");
  return parts.join(" · ");
}

// ═══════════════════════════════════════════════
// TOP-LEVEL: STRATEGY RECOMMEND
// ═══════════════════════════════════════════════
function recommend() {
  if (!registry) return agent ? agent.advise("智能建议") : "⚠️ Skill Layer 未加载";

  var recResult = registry.invoke("recommendActivity");
  var profitResult = registry.invoke("analyzeActivityProfit");
  var riskResult = registry.invoke("analyzeActivityRisk");

  if (recResult.status !== "success") return fallback();

  var recs = recResult.data.recommendations || [];
  if (recs.length === 0) return fallback();

  var profits = profitResult.data ? profitResult.data.profits || [] : [];
  var risks = riskResult.data ? riskResult.data.risks || [] : [];

  var scored = recs.map(function (rec) {
    var p = profits.find(function (x) { return x.activity === rec.activity; }) || {};
    var r = risks.find(function (x) { return x.activity === rec.activity; }) || {};
    return scoreActivity(rec.activity, p, r);
  });

  scored.sort(function (a, b) { return b.finalStrategyScore - a.finalStrategyScore; });

  var histCount = writer ? writer.stats().total : 0;

  var lines = [
    "🎯 策略推荐 TOP3",
    "",
    (histCount > 0 ? "📊 基于 " + histCount + " 条历史学习数据" : "⚠️ 无历史数据，基于纯利润/风险分析"),
    "",
    "═══════════════════════════════"
  ];

  scored.slice(0, 3).forEach(function (s, i) {
    var medal = ["🥇", "🥈", "🥉"][i];
    var bar = "█".repeat(Math.round(s.finalStrategyScore / 5));
    lines.push("");
    lines.push(medal + " " + s.activity + " — " + s.finalStrategyScore + "/100");
    lines.push("  " + bar);
    lines.push("");
    lines.push("  历史: " + s.factors.historical.detail);
    lines.push("  利润: " + s.factors.roi.detail + " | ROI分: " + s.factors.roi.score);
    lines.push("  风险: " + s.factors.risk.detail + " | 惩罚: -" + s.factors.risk.penalty);
    lines.push("  价格: " + s.factors.priceImpact.detail + " | 影响分: " + s.factors.priceImpact.score);
    lines.push("  💡 " + s.explanation);
  });

  lines.push("");
  lines.push("═══════════════════════════════");
  lines.push("");
  lines.push("📋 下一步:");
  lines.push("• /活动 策略详情 <activityId> — 查看详细评分");
  lines.push("• /活动 报名计划 — 生成报名计划");
  lines.push("• /活动 策略回测 — 验证历史准确性");
  lines.push("");
  lines.push("---");
  lines.push("REVIEW_ONLY=true | 仅策略建议，不执行任何操作");

  return lines.join("\n");
}

// ═══════════════════════════════════════════════
// DETAIL
// ═══════════════════════════════════════════════
function detail(activityId) {
  if (!registry) return "⚠️ Skill Layer 未加载";

  var store = null; try { store = require("../activities/activity-store"); } catch (e) {}
  if (!store) return "⚠️ Store 未加载";

  var all = store.getAll();
  var activity = all.find(function (a) { return a.id === activityId || a.name === activityId; });
  if (!activity) return "❌ 未找到活动: " + activityId;

  var profit = null; try { profit = require("../activities/activity-profit-engine"); } catch (e) {}
  var risk = null; try { risk = require("../activities/activity-risk-engine"); } catch (e) {}

  var p = profit ? profit.calculate(activity) : {};
  var r = risk ? risk.assess(activity, 0.05) : {};
  var s = scoreActivity(activity.name, p, r);
  var stats = getHistoryStats(activity.name);

  var lines = [
    "🔍 策略详情 — " + activity.name,
    "",
    "ID: " + activity.id,
    "类型: " + (activity.type || "N/A"),
    "补贴: ¥" + (activity.subsidy || 0),
    "折扣: " + Math.round((activity.discount || 0) * 100) + "%",
    "日期: " + (activity.startDate || "?") + " ~ " + (activity.endDate || "?"),
    "",
    "═══════════════════════════════",
    "📊 综合策略分: " + s.finalStrategyScore + "/100",
    "═══════════════════════════════",
    "",
    "🧠 历史表现 (权重 25%)",
    "  得分: " + s.factors.historical.score + " | " + s.factors.historical.detail,
    "",
    "💰 利润率 (权重 35%)",
    "  得分: " + s.factors.roi.score + " | " + s.factors.roi.detail,
    "",
    "⚠️ 风险惩罚",
    "  惩罚: -" + s.factors.risk.penalty + " | " + s.factors.risk.detail,
    "",
    "🏷️ 价格影响 (权重 20%)",
    "  得分: " + s.factors.priceImpact.score + " | " + s.factors.priceImpact.detail,
    "",
    "📜 历史学习记录: " + stats.total + " 条",
    (stats.total > 0 ? stats.recentEvents.map(function (e) { return "  • " + e; }).join("\n") : "  无"),
    "",
    "💡 " + s.explanation,
    "",
    "---",
    "REVIEW_ONLY=true"
  ];

  return lines.join("\n");
}

// ═══════════════════════════════════════════════
// BACKTEST
// ═══════════════════════════════════════════════
function backtest() {
  if (!writer) return "⚠️ Memory Writer 未加载";

  var stats = writer.stats();
  if (stats.total === 0) return "📊 暂无历史数据用于回测。\n\n系统将从活动执行事件中积累学习数据。";

  var recs = writer.recent(100);
  var successes = recs.filter(function (r) { return r.eventType && r.eventType.indexOf("success") >= 0; });
  var failures = recs.filter(function (r) { return r.eventType && (r.eventType.indexOf("failed") >= 0 || r.eventType.indexOf("blocked") >= 0 || r.eventType.indexOf("stopped") >= 0); });
  var totalExec = successes.length + failures.length;

  var lines = [
    "📊 策略回测",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "📈 数据量",
    "总事件: " + stats.total,
    "涉及活动: " + stats.activityCount + " | SKU: " + stats.skuCount,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "🎯 执行效果",
    "总执行: " + totalExec,
    "成功: " + successes.length + " | 失败/阻断: " + failures.length,
    "成功率: " + (totalExec > 0 ? Math.round(successes.length / totalExec * 100) + "%" : "N/A"),
    "",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "📋 事件分布"
  ];

  Object.keys(stats.eventTypes).sort().forEach(function (t) {
    lines.push("  " + t + ": " + stats.eventTypes[t]);
  });

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("💡 回测结论");

  if (totalExec === 0) {
    lines.push("尚无执行数据，无法评估策略准确性。");
  } else if (successes.length > failures.length) {
    lines.push("✅ 策略建议与执行结果一致度较高，策略模型有效。");
  } else {
    lines.push("⚠️ 阻断/失败率较高，建议审查活动筛选条件和审批流程。");
  }

  lines.push("");
  lines.push("---");
  lines.push("REVIEW_ONLY=true");

  return lines.join("\n");
}

function fallback() { return agent ? agent.advise("智能建议") : "⚠️ 无可用数据，请先导入活动。"; }

module.exports = {
  recommend: recommend, detail: detail, backtest: backtest,
  scoreActivity: scoreActivity, historicalScore: historicalScore,
  roiScore: roiScore, riskPenalty: riskPenalty, priceImpactScore: priceImpactScore, finalScore: finalScore,
  fallback: fallback
};
