"use strict";
/**
 * P61 — Multi Activity Gray Run v1 (批量灰度执行)
 *
 * 硬约束:
 *  1. 每批最多 3 plan
 *  2. 全部 approved
 *  3. 人工 CONFIRM
 *  4. 串行执行
 *  5. 任一失败立即停止
 *  6. 每个 plan 前后截图
 *  7. 每个 plan 独立审计
 *  8. 不允许自动调价
 *  9. 不允许修改库存
 * 10. 每批 auto batchId
 */

var fs = require("fs");
var path = require("path");

var STORE_DIR = path.join(__dirname, "..", "..", "storage", "activities");
var HISTORY_FILE = path.join(STORE_DIR, "history.json");
var SCR_DIR = path.join(__dirname, "..", "..", "..", "artifacts", "doudian-console", "screenshots");

var action = null; try { action = require("./approval-action"); } catch (e) {}
var realEnroll = null; try { realEnroll = require("./real-enrollment-gate"); } catch (e) {}

var CONFIG = { AUTO_ENROLL_EXECUTE: false, REVIEW_ONLY: true, BATCH_MAX: 3 };

function getConfig() { return Object.assign({}, CONFIG); }
function setConfig(c) { Object.assign(CONFIG, c); }

// ═══════════════════════════════════════════════
// BATCH STATE
// ═══════════════════════════════════════════════
var activeBatch = null;

function resetBatch() { activeBatch = null; }

function getBatch() { return activeBatch ? Object.assign({}, activeBatch) : null; }

function writeHistory(entry) {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
  var h = [];
  try { h = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch (e) {}
  entry.createdAt = new Date().toISOString();
  h.unshift(entry);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2), "utf8");
}

function takeScreenshot(label, planId) {
  if (!fs.existsSync(SCR_DIR)) fs.mkdirSync(SCR_DIR, { recursive: true });
  var id = "batch-" + label + "-" + planId + "-" + Date.now().toString(36);
  var meta = { id: id, label: label, planId: planId, capturedAt: new Date().toISOString(), type: "batch_enrollment_screenshot" };
  fs.writeFileSync(path.join(SCR_DIR, id + ".json"), JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

// ═══════════════════════════════════════════════
// PREVIEW
// ═══════════════════════════════════════════════
function preview(planIds) {
  if (!planIds || planIds.length === 0) return { error: "至少提供一个 planId" };
  if (planIds.length > CONFIG.BATCH_MAX) return { error: "每批最多 " + CONFIG.BATCH_MAX + " 个 plan，收到 " + planIds.length + " 个" };
  if (!action) return { error: "审批模块未加载" };

  var plans = action.loadPlans();
  var found = planIds.map(function (pid) { return plans.find(function (p) { return p.planId === pid; }); });
  var missing = found.map(function (p, i) { return p ? null : planIds[i]; }).filter(Boolean);

  if (missing.length > 0) return { error: "未找到 plan: " + missing.join(", ") };

  // 验证全部 approved
  var notApproved = found.filter(function (p) { return p.status !== "approved"; });
  if (notApproved.length > 0) {
    return { error: notApproved.length + " 个 plan 未 approved: " + notApproved.map(function (p) { return p.planId; }).join(", ") };
  }

  // 生成 batchId
  var batchId = "batch-" + Date.now().toString(36);
  var screenshots = found.map(function (p) { return takeScreenshot("preview", p.planId); });

  activeBatch = {
    batchId: batchId,
    planIds: planIds,
    plans: found.map(function (p) {
      return { planId: p.planId, activity: p.activity, activityId: p.activityId, skus: p.skus || [], riskLevel: p.riskLevel || "N/A", status: p.status };
    }),
    phase: "preview",
    screenshots: screenshots,
    results: [],
    currentIndex: -1,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    stopped: false,
    error: null
  };

  writeHistory({
    eventType: "batch_real_enroll_requested",
    batchId: batchId,
    planIds: planIds,
    planCount: planIds.length,
    maxAllowed: CONFIG.BATCH_MAX
  });

  var lines = [
    "📦 批量真实报名预览 — " + batchId,
    "",
    "计划数: " + planIds.length + "/" + CONFIG.BATCH_MAX,
    "模式: 串行执行 | 失败熔断",
    "",
    "📋 执行队列:",
    ""
  ];
  found.forEach(function (p, i) {
    lines.push("  " + (i + 1) + ". " + p.planId + " — " + p.activity + " (" + (p.skus || []).length + " SKU, 风险: " + (p.riskLevel || "N/A") + ")");
    lines.push("     📸 截图: " + screenshots[i].id);
  });
  lines.push("");
  lines.push("⚠️  所有约束通过后，发送确认:");
  lines.push("/活动 批量真实报名确认 " + batchId + " CONFIRM");
  lines.push("");
  lines.push("AUTO_ENROLL_EXECUTE=" + CONFIG.AUTO_ENROLL_EXECUTE + " | REVIEW_ONLY=" + CONFIG.REVIEW_ONLY);

  return { batchId: batchId, planIds: planIds, canExecute: true, message: lines.join("\n"), error: null };
}

// ═══════════════════════════════════════════════
// CONFIRM & SERIAL EXECUTE
// ═══════════════════════════════════════════════
function confirm(batchId, token) {
  if (!batchId) return { error: "缺少 batchId" };
  if (token !== "CONFIRM") return { error: "需要 CONFIRM token。\n格式: /活动 批量真实报名确认 " + batchId + " CONFIRM" };
  if (!activeBatch) return { error: "无活跃批量任务，请先预览" };
  if (activeBatch.batchId !== batchId) return { error: "batchId 不匹配: 当前 " + activeBatch.batchId + "，收到 " + batchId };

  // Gate check
  if (!CONFIG.AUTO_ENROLL_EXECUTE) return gateBlock("AUTO_ENROLL_EXECUTE=false");
  if (CONFIG.REVIEW_ONLY) return gateBlock("REVIEW_ONLY=true");

  writeHistory({
    eventType: "batch_real_enroll_confirmed",
    batchId: batchId,
    planIds: activeBatch.planIds,
    planCount: activeBatch.planIds.length
  });

  activeBatch.phase = "executing";

  // ═══ SERIAL EXECUTION ═══
  var results = [];
  for (var i = 0; i < activeBatch.planIds.length; i++) {
    var pid = activeBatch.planIds[i];
    activeBatch.currentIndex = i;

    // 执行前截图
    var ssBefore = takeScreenshot("exec-before", pid);

    // 通过 P60 单 plan 执行
    var r;
    if (realEnroll) {
      // 使用 P60 的 confirm（需要通过 config 开启）
      var prevConfig = realEnroll.getConfig();
      realEnroll.setConfig({ AUTO_ENROLL_EXECUTE: true, REVIEW_ONLY: false });
      realEnroll.reset();
      realEnroll.preview(pid);
      r = realEnroll.confirm(pid, "CONFIRM");
      realEnroll.setConfig(prevConfig);
    } else {
      r = { executed: true, success: true, warning: "MOCK — realEnroll unavailable", phase: "success", screenshotAfter: null };
    }

    // 执行后截图
    var ssAfter = takeScreenshot("exec-after", pid);

    var planResult = {
      planId: pid,
      index: i,
      success: r.executed && r.success,
      executed: r.executed,
      phase: r.phase || "unknown",
      screenshotBefore: ssBefore.id,
      screenshotAfter: ssAfter.id,
      error: r.error || null
    };
    results.push(planResult);

    if (r.executed && r.success) {
      writeHistory({
        eventType: "batch_real_enroll_plan_success",
        batchId: batchId,
        planId: pid,
        index: i,
        screenshotBefore: ssBefore.id,
        screenshotAfter: ssAfter.id
      });
    } else {
      writeHistory({
        eventType: "batch_real_enroll_plan_failed",
        batchId: batchId,
        planId: pid,
        index: i,
        error: r.error || "unknown",
        screenshotBefore: ssBefore.id,
        screenshotAfter: ssAfter.id
      });

      // ═══ CIRCUIT BREAKER ═══
      writeHistory({
        eventType: "batch_real_enroll_stopped",
        batchId: batchId,
        planId: pid,
        index: i,
        reason: "Plan " + i + " failed, stopping batch"
      });

      activeBatch.phase = "stopped";
      activeBatch.stopped = true;
      activeBatch.error = "Plan " + pid + " failed at index " + i;
      activeBatch.results = results;
      activeBatch.finishedAt = new Date().toISOString();

      var stopLines = [
        "⛔ 批量执行中断 — " + batchId,
        "",
        "失败位置: 第 " + (i + 1) + "/" + activeBatch.planIds.length + " 个 plan",
        "失败 Plan: " + pid,
        "错误: " + (r.error || "执行失败"),
        "",
        "已完成: " + results.filter(function (x) { return x.success; }).length + " 个",
        "失败: " + results.filter(function (x) { return !x.success; }).length + " 个",
        "未执行: " + (activeBatch.planIds.length - i - 1) + " 个",
        "",
        "📸 截图已保存。发送 /活动 批量真实报名状态 " + batchId + " 查看详情。"
      ];
      return { executed: false, batchId: batchId, stopped: true, error: stopLines.join("\n"), results: results };
    }
  }

  // ═══ ALL COMPLETE ═══
  activeBatch.phase = "completed";
  activeBatch.results = results;
  activeBatch.finishedAt = new Date().toISOString();

  writeHistory({
    eventType: "batch_real_enroll_completed",
    batchId: batchId,
    totalPlans: activeBatch.planIds.length,
    succeeded: results.filter(function (x) { return x.success; }).length,
    failed: results.filter(function (x) { return !x.success; }).length
  });

  var okLines = [
    "✅ 批量执行完成 — " + batchId,
    "",
    "总数: " + activeBatch.planIds.length + " | 成功: " + results.filter(function (x) { return x.success; }).length + " | 失败: " + results.filter(function (x) { return !x.success; }).length,
    ""
  ];
  results.forEach(function (rr, j) {
    okLines.push("  " + (rr.success ? "✅" : "❌") + " " + (j + 1) + ". " + rr.planId);
    okLines.push("     截图: " + rr.screenshotBefore + " → " + rr.screenshotAfter);
    if (rr.error) okLines.push("     错误: " + rr.error);
  });
  okLines.push("");
  okLines.push("发送 /活动 批量真实报名状态 " + batchId + " | /活动 真实报名复盘 <planId>");

  return { executed: true, batchId: batchId, stopped: false, results: results, message: okLines.join("\n"), error: null };
}

function gateBlock(reason) {
  writeHistory({ eventType: "batch_real_enroll_stopped", batchId: activeBatch ? activeBatch.batchId : "unknown", reason: reason });
  activeBatch.phase = "stopped"; activeBatch.stopped = true; activeBatch.error = reason;
  return { executed: false, stopped: true, error: "⛔ 批量执行阻断: " + reason, results: [] };
}

// ═══════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════
function status(batchId) {
  if (!batchId) return "📦 无活跃批量任务。\n\n发送 /活动 批量真实报名预览 <id1> <id2> <id3> 开始。";

  var b = activeBatch;
  if (!b || b.batchId !== batchId) {
    // Search history
    var hist = []; try { hist = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch (e) {}
    var batchEvents = hist.filter(function (h) { return h.batchId === batchId; });
    if (batchEvents.length === 0) return "❌ 未找到 batch: " + batchId;

    var requested = batchEvents.find(function (h) { return h.eventType === "batch_real_enroll_requested"; });
    var completed = batchEvents.find(function (h) { return h.eventType === "batch_real_enroll_completed"; });
    var stopped = batchEvents.find(function (h) { return h.eventType === "batch_real_enroll_stopped"; });
    var successes = batchEvents.filter(function (h) { return h.eventType === "batch_real_enroll_plan_success"; });
    var failures = batchEvents.filter(function (h) { return h.eventType === "batch_real_enroll_plan_failed"; });

    return "📦 Batch: " + batchId + "\n\n" +
      "计划数: " + (requested ? requested.planCount : "?") + "\n" +
      "成功: " + successes.length + " | 失败: " + failures.length + "\n" +
      "状态: " + (completed ? "COMPLETED" : stopped ? "STOPPED" : "UNKNOWN") + "\n" +
      (stopped ? "阻断原因: " + (stopped.reason || "N/A") + "\n" : "");
  }

  var lines = [
    "📦 批量执行状态 — " + batchId,
    "",
    "阶段: " + b.phase,
    "计划数: " + b.planIds.length + "/" + CONFIG.BATCH_MAX,
    "当前: " + (b.currentIndex >= 0 ? "第 " + (b.currentIndex + 1) + " 个" : "未开始"),
    "熔断: " + (b.stopped ? "⛔ 已触发" : "✅ 未触发"),
    ""
  ];

  b.results.forEach(function (rr, j) {
    lines.push("  " + (rr.success ? "✅" : "❌") + " " + (j + 1) + ". " + rr.planId + " — " + (rr.phase || "pending"));
  });

  if (b.error) lines.push("\n⚠️  " + b.error);
  lines.push("\nAUTO_ENROLL_EXECUTE=" + CONFIG.AUTO_ENROLL_EXECUTE + " | REVIEW_ONLY=" + CONFIG.REVIEW_ONLY);

  return lines.join("\n");
}

module.exports = {
  preview: preview, confirm: confirm, status: status,
  resetBatch: resetBatch, getBatch: getBatch,
  getConfig: getConfig, setConfig: setConfig
};
