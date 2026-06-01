"use strict";
/**
 * P60.5 — Postcheck Guard + 回滚预案
 *
 * 真实灰度报名后自动复盘:
 *  1. 读取 real_enroll_success / real_enroll_failed 审计
 *  2. 对比执行前后截图
 *  3. 展示活动/SKU/Provider/执行时间/结果
 *  4. 检查执行中心一致性
 *  5. 检查调价动作
 *  6. 检查重复执行痕迹
 *  7. 生成人工回滚步骤 (不自动回滚)
 *  8. 写入 postcheck_completed 审计
 */

var fs = require("fs");
var path = require("path");

var STORE_DIR = path.join(__dirname, "..", "..", "storage", "activities");
var HISTORY_FILE = path.join(STORE_DIR, "history.json");
var SCR_DIR = path.join(__dirname, "..", "..", "..", "artifacts", "doudian-console", "screenshots");

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); }
  catch (e) { return []; }
}
function writeHistory(entry) {
  var h = readHistory();
  entry.createdAt = new Date().toISOString();
  h.unshift(entry);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2), "utf8");
}

function findScreenshot(ssId) {
  if (!ssId) return null;
  var fp = path.join(SCR_DIR, ssId + ".json");
  try { return JSON.parse(fs.readFileSync(fp, "utf8")); }
  catch (e) { return null; }
}

function riskIcon(level) {
  return level === "HIGH" ? "🔴" : level === "medium" ? "🟡" : "✅";
}

// ═══════════════════════════════════════════════
// POSTCHECK
// ═══════════════════════════════════════════════
function postcheck(planId) {
  var hist = readHistory();
  var planEvents = hist.filter(function (h) { return h.planId === planId; });
  if (planEvents.length === 0) return "❌ 未找到计划 " + planId + " 的任何审计记录。";

  // 查找执行事件
  var success = planEvents.find(function (h) { return h.eventType === "real_enroll_success"; });
  var failed = planEvents.find(function (h) { return h.eventType === "real_enroll_failed"; });
  var blocked = planEvents.find(function (h) { return h.eventType === "real_enroll_blocked"; });
  var confirmed = planEvents.find(function (h) { return h.eventType === "real_enroll_confirmed"; });
  var requested = planEvents.find(function (h) { return h.eventType === "real_enroll_requested"; });

  if (!success && !failed && !blocked) {
    return "📊 计划 " + planId + " 尚未进入真实执行阶段。\n\n" +
      "审计事件: " + planEvents.map(function (e) { return e.eventType; }).join(", ") + "\n\n" +
      "发送 /活动 真实报名预览 " + planId + " 开始执行。";
  }

  var outcome = success ? "SUCCESS" : failed ? "FAILED" : "BLOCKED";
  var outcomeIcon = success ? "✅" : failed ? "❌" : "⛔";

  // 读取截图
  var ssBefore = null, ssAfter = null;
  if (requested && requested.screenshotBefore) ssBefore = findScreenshot(requested.screenshotBefore);
  if (success && success.screenshotAfter) ssAfter = findScreenshot(success.screenshotAfter);
  if (failed && failed.screenshotAfter) ssAfter = findScreenshot(failed.screenshotAfter);

  var lines = [
    "🔍 真实报名复盘报告 — " + planId,
    "",
    "═══════════════════════════════",
    "📋 基本信息",
    "═══════════════════════════════",
    "结果: " + outcomeIcon + " " + outcome,
    "活动: " + (success ? success.activity : failed ? failed.activity : "N/A"),
    "SKU: " + (success ? (success.skus || []).join(", ") : failed ? (failed.skus || []).join(", ") : "N/A"),
    "Provider: " + (success ? success.providerUsed : "N/A"),
    "执行时间: " + (success ? success.createdAt : failed ? failed.createdAt : "N/A"),
    ""
  ];

  // ═══ 截图对比 ═══
  lines.push("═══════════════════════════════");
  lines.push("📸 截图对比");
  lines.push("═══════════════════════════════");
  lines.push("执行前: " + (ssBefore ? "✅ " + ssBefore.id + " (" + ssBefore.capturedAt + ")" : "❌ 缺失"));
  lines.push("执行后: " + (ssAfter ? "✅ " + ssAfter.id + " (" + ssAfter.capturedAt + ")" : "❌ 缺失"));

  if (ssBefore && ssAfter) {
    var bTime = new Date(ssBefore.capturedAt).getTime();
    var aTime = new Date(ssAfter.capturedAt).getTime();
    var diff = Math.round((aTime - bTime) / 1000);
    lines.push("间隔: " + diff + "s");
  } else if (outcome === "BLOCKED") {
    lines.push("说明: 报名未执行，无执行后截图。");
  }
  lines.push("");

  // ═══ 执行中心一致性 ═══
  lines.push("═══════════════════════════════");
  lines.push("🔄 执行中心一致性检查");
  lines.push("═══════════════════════════════");

  var ec = null; try { ec = require("./execution-center"); } catch (e) {}
  if (ec) {
    var dash = ec.dashboard();
    var hasPlanInDash = dash.indexOf(planId) >= 0;
    lines.push("执行中心引用: " + (hasPlanInDash ? "✅ 已记录" : "⚠️ 未在仪表盘找到"));

    // 通过 plan 状态检查
    var action = null; try { action = require("./approval-action"); } catch (e) {}
    if (action) {
      var plans = action.loadPlans();
      var plan = plans.find(function (p) { return p.planId === planId; });
      if (plan) {
        lines.push("Plan 执行状态: " + (plan.executionStatus || "NOT_EXECUTED"));
        lines.push("Plan 阻断: " + (plan.blocked !== false ? "是" : "否"));
        var statusMatch = false;
        if (success && plan.executionStatus === "EXECUTED_REAL") statusMatch = true;
        if (failed && plan.executionStatus === "NOT_EXECUTED") statusMatch = true;
        if (blocked && plan.executionStatus === "NOT_EXECUTED") statusMatch = true;
        lines.push("一致性: " + (statusMatch ? "✅ PASS" : "⚠️ MISMATCH"));
      } else {
        lines.push("⚠️ Plan 不在审批库中（可能已清理）");
      }
    }
  } else {
    lines.push("⚠️ 执行中心模块不可用");
  }
  lines.push("");

  // ═══ 调价检查 ═══
  lines.push("═══════════════════════════════");
  lines.push("💰 调价动作检查");
  lines.push("═══════════════════════════════");

  var priceEvents = hist.filter(function (h) {
    return h.planId === planId && h.eventType && h.eventType.indexOf("price_") >= 0;
  });
  if (priceEvents.length > 0) {
    lines.push("⚠️  检测到 " + priceEvents.length + " 条调价记录:");
    priceEvents.forEach(function (pe) {
      lines.push("  • " + pe.eventType + " @" + (pe.createdAt || "N/A"));
    });
    lines.push("");
    lines.push("⚠️  回滚时需检查抖店后台价格是否一致。");
  } else {
    lines.push("✅ 无调价动作");
  }
  lines.push("");

  // ═══ 重复执行检查 ═══
  lines.push("═══════════════════════════════");
  lines.push("🔁 重复执行检查");
  lines.push("═══════════════════════════════");

  var execAttempts = planEvents.filter(function (e) {
    return ["real_enroll_requested", "real_enroll_confirmed", "real_enroll_success", "real_enroll_failed"].indexOf(e.eventType) >= 0;
  });
  var requestCount = execAttempts.filter(function (e) { return e.eventType === "real_enroll_requested"; }).length;
  var confirmCount = execAttempts.filter(function (e) { return e.eventType === "real_enroll_confirmed"; }).length;
  var successCount = execAttempts.filter(function (e) { return e.eventType === "real_enroll_success"; }).length;
  var failedCount = execAttempts.filter(function (e) { return e.eventType === "real_enroll_failed"; }).length;

  lines.push("请求: " + requestCount + " | 确认: " + confirmCount +
    " | 成功: " + successCount + " | 失败: " + failedCount);

  var isDuplicate = successCount + failedCount > 1;
  lines.push("重复: " + (isDuplicate ? "⚠️ 检测到多次执行" : "✅ 单次执行"));
  if (isDuplicate) {
    lines.push("⚠️  可能存在重复报名，需人工核实抖店后台。");
  }
  lines.push("");

  // ═══ 人工回滚指引 ═══
  lines.push("═══════════════════════════════");
  lines.push("🔄 人工回滚指引");
  lines.push("═══════════════════════════════");
  lines.push("");
  lines.push("⚠️  **回滚不会自动执行，请按以下步骤人工操作:**");
  lines.push("");

  var steps = [];
  steps.push("1️⃣  登录抖店后台 (https://fxg.jinritemai.com)");
  steps.push("2️⃣  进入「活动管理」→「已报名活动」");
  steps.push("3️⃣  查找活动: " + (success ? success.activity : failed ? failed.activity : planId));
  steps.push("4️⃣  核实报名状态是否与报告一致");
  steps.push("");

  if (success) {
    steps.push("5️⃣  **如需取消报名:**");
    steps.push("   a. 在抖店后台点击「取消报名」");
    steps.push("   b. 确认取消原因");
    steps.push("   c. 截图保留取消记录");
    steps.push("6️⃣  检查关联 SKU 是否恢复了原价");
  } else if (failed) {
    steps.push("5️⃣  **失败检查:**");
    steps.push("   a. 核实是否产生了部分报名（部分 SKU 成功）");
    steps.push("   b. 检查错误原因: " + (failed.error || "N/A"));
    steps.push("6️⃣  确认无残留数据后重新提交");
  } else {
    steps.push("5️⃣  **阻断检查:**");
    steps.push("   a. 确认阻断原因是否已修复");
    steps.push("   b. 修复后重新发送 /活动 真实报名预览");
  }

  steps.push("");
  steps.push("7️⃣  **审计记录:**");
  steps.push("   回滚完成后发送 /活动 真实报名复盘 " + planId + " 再次验证。");
  steps.push("");
  steps.push("⛔ 禁止: 直接修改数据库 / 跳过审批 / 批量操作");

  lines = lines.concat(steps);
  lines.push("");
  lines.push("---");
  lines.push("⚠️  此报告仅供人工决策参考，不自动执行任何回滚操作。");

  // ═══ 写入审计 ═══
  writeHistory({
    eventType: "postcheck_completed",
    planId: planId,
    outcome: outcome,
    screenshotBefore: ssBefore ? ssBefore.id : null,
    screenshotAfter: ssAfter ? ssAfter.id : null,
    priceEvents: priceEvents.length,
    executionAttempts: execAttempts.length,
    isDuplicate: isDuplicate
  });

  return lines.join("\n");
}

// ═══════════════════════════════════════════════
// ROLLBACK PLAN
// ═══════════════════════════════════════════════
function rollbackPlan(planId) {
  var hist = readHistory();
  var planEvents = hist.filter(function (h) { return h.planId === planId; });
  if (planEvents.length === 0) return "❌ 未找到计划 " + planId + " 的任何审计记录。";

  var success = planEvents.find(function (h) { return h.eventType === "real_enroll_success"; });
  var failed = planEvents.find(function (h) { return h.eventType === "real_enroll_failed"; });

  if (!success && !failed) {
    // Has blocked events but no success/failed
    var lines2 = [
      "📋 计划 " + planId + " 报名已被阻断，尚未真实执行。",
      "",
      "当前事件: " + planEvents.map(function (e) { return e.eventType; }).join(", "),
      "",
      "🔄 回滚指引",
      "────────────────────────────────",
      "",
      "由于报名未实际执行，回滚步骤简化为:",
      "",
      "| 步骤 | 操作 | 位置 |",
      "|------|------|------|",
      "| 1 | 确认抖店后台无残留报名 | fxg.jinritemai.com |",
      "| 2 | 查看活动管理 → 已报名活动 | 左侧菜单 |",
      "| 3 | 检查是否意外报名 | — |",
      "| 4 | 如有意外 → 取消报名 | 活动详情页 |",
      "| 5 | 发送 /活动 真实报名复盘 " + planId + " 验证 | — |",
      "",
      "⏱️  预估耗时: 2-5 分钟",
      "",
      "---",
      "⛔ 不自动执行回滚 | 不修改 .env/nginx/deploy"
    ];
    writeHistory({
      eventType: "rollback_plan_viewed",
      planId: planId,
      outcome: "blocked",
      hasPriceEvents: 0
    });
    return lines2.join("\n");
  }

  var lines = [
    "🔄 回滚预案 — " + planId,
    "",
    "═══════════════════════════════",
    "⚠️  以下为人工回滚指引，不会自动执行",
    "═══════════════════════════════",
    "",
    "📋 执行摘要",
    "────────────────────────────────",
    "结果: " + (success ? "✅ SUCCESS" : "❌ FAILED"),
    "活动: " + (success ? success.activity : failed.activity),
    "SKU: " + (success ? (success.skus || []).join(", ") : failed ? (failed.skus || []).join(", ") : "N/A"),
    "时间: " + (success ? success.createdAt : failed.createdAt),
    "",
    "🔄 回滚步骤",
    "────────────────────────────────",
    ""
  ];

  if (success) {
    lines.push("**场景: 报名成功 → 需要取消**");
    lines.push("");
    lines.push("| 步骤 | 操作 | 位置 |");
    lines.push("|------|------|------|");
    lines.push("| 1 | 登录抖店后台 | fxg.jinritemai.com |");
    lines.push("| 2 | 活动管理 → 已报名活动 | 左侧菜单 |");
    lines.push("| 3 | 找到 " + success.activity + " | 活动列表 |");
    lines.push("| 4 | 点击「退出活动」 | 活动详情页 |");
    lines.push("| 5 | 确认退出原因 | 弹窗确认 |");
    lines.push("| 6 | 截图保留退出记录 | — |");
    lines.push("| 7 | 发送 /活动 真实报名复盘 " + planId + " | 验证清除 |");
    lines.push("");
    lines.push("⏱️  预估耗时: 5-10 分钟");
  } else {
    lines.push("**场景: 报名失败 → 清理残留**");
    lines.push("");
    lines.push("| 步骤 | 操作 | 位置 |");
    lines.push("|------|------|------|");
    lines.push("| 1 | 登录抖店后台 | fxg.jinritemai.com |");
    lines.push("| 2 | 活动管理 → 已报名活动 | 检查是否部分报名 |");
    lines.push("| 3 | 若有残留 → 退出活动 | 活动详情页 |");
    lines.push("| 4 | 检查失败原因并修复 | " + (failed.error || "N/A") + " |");
    lines.push("| 5 | 修复后重新执行灰度 | /活动 真实报名预览 |");
    lines.push("");
    lines.push("⏱️  预估耗时: 5-15 分钟");
  }

  // 检查关联调价
  var priceEvents = hist.filter(function (h) {
    return h.eventType && h.eventType.indexOf("price_") >= 0 &&
      (h.planId === planId || (h.metadata && h.metadata.planId === planId));
  });
  if (priceEvents.length > 0) {
    lines.push("");
    lines.push("⚠️  关联调价动作: " + priceEvents.length + " 条");
    lines.push("回滚时需同时检查抖店后台价格是否恢复。");
    priceEvents.forEach(function (pe) {
      lines.push("  • " + pe.eventType + " @" + (pe.createdAt || "N/A"));
    });
  }

  lines.push("");
  lines.push("---");
  lines.push("⛔ 不修改 .env/nginx/deploy | 不自动取消报名 | 不修改库存");

  writeHistory({
    eventType: "rollback_plan_viewed",
    planId: planId,
    outcome: success ? "success" : "failed",
    hasPriceEvents: priceEvents.length > 0
  });

  return lines.join("\n");
}

module.exports = { postcheck: postcheck, rollbackPlan: rollbackPlan };
