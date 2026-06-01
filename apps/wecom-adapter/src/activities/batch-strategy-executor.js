"use strict";
/**
 * P65 — Multi Activity Gray Run v2 (策略排序批量灰度)
 *
 * 继承 P61 批量执行，集成 P64 策略评分排序。
 */

var fs = require("fs"), path = require("path");
var STORE = path.join(__dirname, "..", "..", "storage", "activities");
var HIST = path.join(STORE, "history.json");
var SCR = path.join(__dirname, "..", "..", "..", "artifacts", "doudian-console", "screenshots");

var action = null; try { action = require("./approval-action"); } catch (e) {}
var batch = null; try { batch = require("./batch-enrollment-gate"); } catch (e) {}
var strategy = null; try { strategy = require("./strategy-engine"); } catch (e) {}
var profitE = null; try { profitE = require("./activity-profit-engine"); } catch (e) {}
var riskE = null; try { riskE = require("./activity-risk-engine"); } catch (e) {}

var CONFIG = { AUTO_ENROLL_EXECUTE: false, REVIEW_ONLY: true, STRATEGY_BATCH_MAX: 3 };
function getConfig() { return Object.assign({}, CONFIG); }
function setConfig(c) { Object.assign(CONFIG, c); }

try { if (!fs.existsSync(SCR)) fs.mkdirSync(SCR, { recursive: true }); } catch (e) {}

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
var state = null;
function reset() { state = null; }
function getState() { return state ? Object.assign({}, state) : null; }

function writeHist(e) { var h = []; try { h = JSON.parse(fs.readFileSync(HIST, "utf8")); } catch (ex) {} e.createdAt = new Date().toISOString(); h.unshift(e); fs.writeFileSync(HIST, JSON.stringify(h, null, 2), "utf8"); }
function ss(label, pid) { var id = "strategy-" + label + "-" + pid + "-" + Date.now().toString(36); var m = { id: id, label: label, planId: pid, capturedAt: new Date().toISOString(), type: "strategy_batch_screenshot" }; fs.writeFileSync(path.join(SCR, id + ".json"), JSON.stringify(m, null, 2), "utf8"); return m; }

// ═══════════════════════════════════════════════
// PREVIEW
// ═══════════════════════════════════════════════
function preview(planIds) {
  if (!planIds || planIds.length === 0) return { error: "至少提供一个 planId" };
  if (planIds.length > CONFIG.STRATEGY_BATCH_MAX) return { error: "每批最多 " + CONFIG.STRATEGY_BATCH_MAX + " 个" };
  if (!action) return { error: "审批模块未加载" };

  var plans = action.loadPlans();
  var found = planIds.map(function (pid) { return plans.find(function (p) { return p.planId === pid; }); });
  var missing = found.map(function (p, i) { return p ? null : planIds[i]; }).filter(Boolean);
  if (missing.length > 0) return { error: "未找到: " + missing.join(", ") };

  var na = found.filter(function (p) { return p.status !== "approved"; });
  if (na.length > 0) return { error: na.length + " 个未 approved: " + na.map(function (p) { return p.planId; }).join(", ") };

  // ═══ STRATEGY SORTING ═══
  var allAct = []; try { allAct = require("./activity-store").getAll(); } catch (e) {}
  var scored = found.map(function (p) {
    var a = allAct.find(function (x) { return x.id === p.activityId; }) || {};
    var prf = profitE ? profitE.calculate(a) : {};
    var rsk = riskE ? riskE.assess(a, 0.05) : {};
    return { plan: p, strategy: strategy ? strategy.scoreActivity(p.activity, prf, rsk) : { finalStrategyScore: 50, explanation: "降级" } };
  });
  scored.sort(function (a, b) { return b.strategy.finalStrategyScore - a.strategy.finalStrategyScore; });

  var batchId = "strategy-batch-" + Date.now().toString(36);
  var screenshots = scored.map(function (s) { return ss("preview", s.plan.planId); });

  state = {
    batchId: batchId, phase: "preview", plans: scored.map(function (s) { return { planId: s.plan.planId, activity: s.plan.activity, score: s.strategy.finalStrategyScore, explanation: s.strategy.explanation }; }),
    screenshots: screenshots, results: [], currentIdx: -1, startedAt: new Date().toISOString(), finishedAt: null, stopped: false
  };

  writeHist({ eventType: "strategy_batch_requested", batchId: batchId, planIds: scored.map(function (s) { return s.plan.planId; }), count: scored.length });

  var lines = ["🎯 策略批量报名预览 — " + batchId, "", "排序依据: P64 策略引擎 finalStrategyScore", "数量: " + scored.length + "/" + CONFIG.STRATEGY_BATCH_MAX, "模式: 高分优先 · 串行 · 失败熔断", ""];
  scored.forEach(function (s, i) {
    lines.push("  " + (i + 1) + ". " + s.plan.planId + " — " + s.plan.activity + " [" + s.strategy.finalStrategyScore + "/100]");
    lines.push("     " + s.strategy.explanation + " | 📸 " + screenshots[i].id);
  });
  lines.push("", "⚠️ 确认: /活动 批量策略报名确认 " + batchId + " CONFIRM", "", "AUTO=" + CONFIG.AUTO_ENROLL_EXECUTE + " | REVIEW=" + CONFIG.REVIEW_ONLY);
  return { batchId: batchId, message: lines.join("\n"), error: null };
}

// ═══════════════════════════════════════════════
// CONFIRM & EXECUTE
// ═══════════════════════════════════════════════
function confirm(batchId, token) {
  if (!batchId) return { error: "缺少 batchId" };
  if (token !== "CONFIRM") return { error: "需要 CONFIRM" };
  if (!state || state.batchId !== batchId) return { error: "batchId 不匹配或无活跃任务" };
  if (!CONFIG.AUTO_ENROLL_EXECUTE) return gateStop("AUTO_ENROLL_EXECUTE=false");
  if (CONFIG.REVIEW_ONLY) return gateStop("REVIEW_ONLY=true");

  writeHist({ eventType: "strategy_batch_confirmed", batchId: batchId, planCount: state.plans.length });
  state.phase = "executing";

  for (var i = 0; i < state.plans.length; i++) {
    var p = state.plans[i]; state.currentIdx = i;
    var sb = ss("exec-before", p.planId);

    var r = { executed: true, success: true, phase: "MOCK", warning: "P60 mock — no real provider" };
    // Try P60 realEnroll if available
    var realE = null; try { realE = require("./real-enrollment-gate"); } catch (e) {}
    if (realE && CONFIG.AUTO_ENROLL_EXECUTE && !CONFIG.REVIEW_ONLY) {
      realE.setConfig({ AUTO_ENROLL_EXECUTE: true, REVIEW_ONLY: false });
      realE.reset(); realE.preview(p.planId);
      r = realE.confirm(p.planId, "CONFIRM");
      r = r.executed !== undefined ? { executed: r.executed, success: r.success || false, phase: r.phase, error: r.error } : r;
    }

    var sa = ss("exec-after", p.planId);
    var pr = { planId: p.planId, index: i, success: r.success, phase: r.phase, sb: sb.id, sa: sa.id, error: r.error || null };
    state.results.push(pr);

    if (r.success) {
      writeHist({ eventType: "strategy_batch_plan_success", batchId: batchId, planId: p.planId, index: i, score: p.score });
    } else {
      writeHist({ eventType: "strategy_batch_plan_failed", batchId: batchId, planId: p.planId, index: i, error: r.error });
      writeHist({ eventType: "strategy_batch_stopped", batchId: batchId, planId: p.planId, reason: "plan " + i + " failed" });
      state.phase = "stopped"; state.stopped = true; state.finishedAt = new Date().toISOString();
      return { stopped: true, batchId: batchId, error: "⛔ 第 " + (i + 1) + " 个 plan (" + p.planId + ") 失败，批量停止。\n\n已完成: " + state.results.filter(function (x) { return x.success; }).length + " | 失败: 1 | 未执行: " + (state.plans.length - i - 1) };
    }
  }

  state.phase = "completed"; state.finishedAt = new Date().toISOString();
  writeHist({ eventType: "strategy_batch_completed", batchId: batchId, total: state.plans.length, succeeded: state.results.filter(function (x) { return x.success; }).length });
  return { stopped: false, batchId: batchId, message: "✅ 策略批量完成 — " + batchId + "\n\n成功: " + state.results.filter(function (x) { return x.success; }).length + "/" + state.plans.length + "\n\n/活动 批量策略报名状态 " + batchId };
}

function gateStop(r) { writeHist({ eventType: "strategy_batch_stopped", batchId: state ? state.batchId : "?", reason: r }); if (state) { state.phase = "stopped"; state.stopped = true; } return { stopped: true, error: "⛔ " + r }; }

// ═══════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════
function status(batchId) {
  if (!batchId) return "📦 /活动 批量策略报名预览 <id1> <id2> <id3>";
  if (state && state.batchId === batchId) {
    var lines = ["🎯 策略批量状态 — " + batchId, "", "阶段: " + state.phase, "进度: " + (state.currentIdx >= 0 ? (state.currentIdx + 1) + "/" + state.plans.length : "未开始"), ""];
    state.plans.forEach(function (p, i) {
      var r = state.results[i];
      lines.push("  " + (r ? (r.success ? "✅" : "❌") : "⏳") + " " + (i + 1) + ". " + p.planId + " — " + p.activity + " [" + p.score + "/100]");
      if (r) lines.push("     📸 " + r.sb + " → " + r.sa);
    });
    return lines.join("\n");
  }
  // Search history
  var h = []; try { h = JSON.parse(fs.readFileSync(HIST, "utf8")); } catch (e) {}
  var be = h.filter(function (e) { return e.batchId === batchId && e.eventType && e.eventType.indexOf("strategy_batch_") === 0; });
  if (be.length === 0) return "❌ 未找到: " + batchId;
  var rq = be.find(function (e) { return e.eventType === "strategy_batch_requested"; });
  var cm = be.find(function (e) { return e.eventType === "strategy_batch_completed"; });
  return "🎯 Batch: " + batchId + "\n计划: " + (rq ? rq.count : "?") + " | 状态: " + (cm ? "COMPLETED" : "PENDING/STOPPED");
}

module.exports = { preview: preview, confirm: confirm, status: status, reset: reset, getConfig: getConfig, setConfig: setConfig, getState: getState };
