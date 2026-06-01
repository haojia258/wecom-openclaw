"use strict";
/**
 * P62 — Activity Planner Agent v1
 *
 * 自然语言 → Skill 调用 → 综合决策建议
 * Agent 只建议，不执行。所有输出标记 REVIEW_ONLY=true。
 */

var path = require("path");
var registry = null;
try { registry = require("../skills/activity/skill-registry"); } catch (e) {}

// ═══════════════════════════════════════════════
// NL INTENT → SKILL MAPPING
// ═══════════════════════════════════════════════
var INTENTS = [
  { keywords: ["值得参加", "适合报名", "推荐活动", "有什么活动", "活动推荐", "选一个", "智能建议", "agent", "建议"], skills: ["recommendActivity", "analyzeActivityProfit", "analyzeActivityRisk"] },
  { keywords: ["利润最高", "利润对比", "哪个赚钱", "利润率", "高利润"], skills: ["analyzeActivityProfit", "recommendActivity"] },
  { keywords: ["风险最低", "风险小", "安全", "低风险", "哪个安全"], skills: ["analyzeActivityRisk", "recommendActivity"] },
  { keywords: ["调价", "降价", "改价", "价格", "是否需要调价"], skills: ["createPricePlan", "analyzeActivityProfit"] },
  { keywords: ["审批", "报名状态", "报名计划", "approval"], skills: ["getApprovalStatus", "createEnrollmentPlan"] },
  { keywords: ["执行", "进度", "执行状态", "execution"], skills: ["getExecutionStatus", "getExecutionCenter"] }
];

function detectIntent(text) {
  text = (text || "").toLowerCase();
  var best = null, bestScore = 0;
  INTENTS.forEach(function (intent) {
    var score = 0;
    intent.keywords.forEach(function (kw) { if (text.indexOf(kw) >= 0) score += kw.length; });
    if (score > bestScore) { bestScore = score; best = intent; }
  });
  return best || { skills: ["recommendActivity", "analyzeActivityProfit", "analyzeActivityRisk"] };
}

// ═══════════════════════════════════════════════
// PLANNER — Orchestrate skill results
// ═══════════════════════════════════════════════
function plan(text) {
  if (!registry) return { error: "Skill Layer 未加载" };

  var intent = detectIntent(text);
  var results = {};

  intent.skills.forEach(function (s) {
    try { results[s] = registry.invoke(s); }
    catch (e) { results[s] = { status: "error", error: e.message }; }
  });

  return { intent: intent, results: results, text: text };
}

// ═══════════════════════════════════════════════
// RENDER — Convert plan to Markdown
// ═══════════════════════════════════════════════
function render(planData) {
  if (planData.error) return "⚠️ " + planData.error;

  var r = planData.results;
  var lines = [
    "🎯 活动智能建议",
    "",
    "查询: " + (planData.text.length > 40 ? planData.text.substring(0, 40) + "..." : planData.text),
    "调用技能: " + planData.intent.skills.join(", "),
    "",
    "━━━━━━━━━━━━━━━━━━━━━━"
  ];

  // ═══ TOP 3 推荐 ═══
  if (r.recommendActivity && r.recommendActivity.status === "success") {
    var recs = r.recommendActivity.data.recommendations || [];
    if (recs.length > 0) {
      lines.push("");
      lines.push("🏆 推荐活动 TOP3");
      lines.push("");
      recs.slice(0, 3).forEach(function (rec, i) {
        var medal = ["🥇", "🥈", "🥉"][i];
        lines.push(medal + " " + rec.activity);
        lines.push("   GMV: ¥" + (rec.estimatedGMV || 0).toLocaleString());
        lines.push("   净利润: ¥" + (rec.netProfit || 0).toLocaleString());
        lines.push("   推荐指数: " + (rec.score || 0));
        if (rec.shouldEnroll !== undefined) lines.push("   建议: " + (rec.shouldEnroll ? "✅ 推荐报名" : "⏸️ 观望"));
        lines.push("");
      });
    } else {
      lines.push("暂无推荐活动。");
    }
  }

  // ═══ 利润对比 ═══
  if (r.analyzeActivityProfit && r.analyzeActivityProfit.status === "success") {
    var profits = r.analyzeActivityProfit.data.profits || [];
    if (profits.length > 0) {
      var sorted = profits.slice().sort(function (a, b) { return (b.netProfit || 0) - (a.netProfit || 0); });
      lines.push("━━━━━━━━━━━━━━━━━━━━━━");
      lines.push("💰 利润排行 TOP5");
      lines.push("");
      sorted.slice(0, 5).forEach(function (p, i) {
        lines.push((i + 1) + ". " + (p.activity || "N/A") + " — ¥" + (p.netProfit || 0).toLocaleString() + " (" + (p.profitMargin || "N/A") + "%)");
      });
      lines.push("");
    }
  }

  // ═══ 风险评估 ═══
  if (r.analyzeActivityRisk && r.analyzeActivityRisk.status === "success") {
    var risks = r.analyzeActivityRisk.data.risks || [];
    if (risks.length > 0) {
      var byRisk = { low: [], medium: [], high: [] };
      risks.forEach(function (rk) { (byRisk[rk.riskLevel] || []).push(rk.activity); });
      lines.push("━━━━━━━━━━━━━━━━━━━━━━");
      lines.push("⚠️ 风险评估");
      lines.push("");
      if (byRisk.low.length > 0) lines.push("✅ LOW (" + byRisk.low.length + "): " + byRisk.low.slice(0, 3).join(", "));
      if (byRisk.medium.length > 0) lines.push("🟡 MEDIUM (" + byRisk.medium.length + "): " + byRisk.medium.slice(0, 3).join(", "));
      if (byRisk.high.length > 0) lines.push("🔴 HIGH (" + byRisk.high.length + "): " + byRisk.high.slice(0, 3).join(", "));
      lines.push("");
    }
  }

  // ═══ 调价建议 ═══
  if (r.createPricePlan) {
    lines.push("━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("💰 调价建议");
    lines.push("");
    if (r.createPricePlan.status === "success") {
      lines.push("PRICE_CHANGE_EXECUTE=false — 调价处于只读模式");
      var topProfit = [];
      if (r.analyzeActivityProfit && r.analyzeActivityProfit.data && r.analyzeActivityProfit.data.profits) {
        topProfit = r.analyzeActivityProfit.data.profits.slice().sort(function (a, b) { return (b.netProfit || 0) - (a.netProfit || 0); });
      }
      if (topProfit.length > 0) {
        var best = topProfit[0];
        lines.push("建议: 关注 " + (best.activity || "N/A") + " (净利润 ¥" + (best.netProfit || 0).toLocaleString() + ")，评估是否需要微调价格以提升竞争力。");
      }
    } else {
      lines.push("调价模块不可用");
    }
    lines.push("");
  }

  // ═══ 审批状态 ═══
  if (r.getApprovalStatus && r.getApprovalStatus.status === "success") {
    var ap = r.getApprovalStatus.data;
    if (ap.pending > 0) {
      lines.push("━━━━━━━━━━━━━━━━━━━━━━");
      lines.push("✋ 审批待办");
      lines.push("");
      lines.push("待审批: " + ap.pending + " | 已审批: " + ap.approved + " | 已拒绝: " + ap.rejected);
      lines.push("发送 /审批 活动 查看详情");
      lines.push("");
    }
  }

  // ═══ 下一步建议 ═══
  lines.push("━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("📋 下一步建议");
  lines.push("");
  lines.push("• /活动 推荐 — 查看完整推荐");
  lines.push("• /活动 报名计划 — 生成报名计划");
  lines.push("• /活动 执行中心 — 查看执行状态");
  lines.push("• /活动 智能建议 — 重新分析");
  lines.push("");
  lines.push("---");
  lines.push("⚠️ Agent 仅提供建议，不执行任何真实操作。");
  lines.push("REVIEW_ONLY=true | AUTO_ENROLL_EXECUTE=false");

  return lines.join("\n");
}

// ═══════════════════════════════════════════════
// MAIN — plan + render
// ═══════════════════════════════════════════════
function advise(text) {
  var p = plan(text);
  if (p.error) return "⚠️ " + p.error;
  return render(p);
}

module.exports = { plan: plan, render: render, advise: advise, detectIntent: detectIntent, INTENTS: INTENTS };
