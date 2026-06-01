"use strict";
var store = require("./activity-store");
var profit = require("./activity-profit-engine");
var risk = require("./activity-risk-engine");
var recommender = require("./activity-recommender");
var enrollment = require("./enrollment-planner");
var autoEnroll = require("./activity-auto-enroll");
var renderer = require("./activity-renderer");
var ec = null; try { ec = require("./execution-center"); } catch(e) {}
var pCheck = null; try { pCheck = require("./providers/provider-check"); } catch(e) {}
var realEnroll = null; try { realEnroll = require("./real-enrollment-gate"); } catch(e) {}
var postcheck = null; try { postcheck = require("./postcheck-guard"); } catch(e) {}
var batch = null; try { batch = require("./batch-enrollment-gate"); } catch(e) {}
var strategy = null; try { strategy = require("./strategy-engine"); } catch(e) {}
var strategyBatch = null; try { strategyBatch = require("./batch-strategy-executor"); } catch(e) {}

function safeReply(fn) {
  try { return fn(); } catch(e) { return "⚠️ 系统错误: " + e.message; }
}

function handle(cmd) {
  var n = (cmd || "").replace(/^\//, "").trim();

  // /活动 状态
  if (n.indexOf("活动 状态") >= 0 || n === "活动") {
    return safeReply(function () {
      var all = store.getAll();
      var config = autoEnroll.getConfig();
      return "📊 活动状态\n" +
        "总数：" + all.length +
        " 即将开始：" + all.filter(function (a) { return a.status === "upcoming"; }).length +
        " 进行中：" + all.filter(function (a) { return a.status === "running"; }).length +
        " 已完成：" + all.filter(function (a) { return a.status === "done"; }).length +
        "\n\n半自动模式：" + (config.AUTO_ACTIVITY_SCAN ? "✅ 启用" : "❌ 关闭") +
        " 自动执行：" + (config.AUTO_ENROLL_EXECUTE ? "⚠️ 开启" : "✅ 关闭(P48阻断)") +
        "\nREVIEW_ONLY=" + config.REVIEW_ONLY;
    });
  }

  // /活动 列表
  if (n.indexOf("活动 列表") >= 0) {
    return safeReply(function () {
      var all = store.getAll();
      if (all.length === 0) return "📋 暂无活动，请先导入活动数据。";
      return "📋 活动列表 (" + all.length + ")\n" + all.map(function (a) {
        return "• " + a.name + " [" + a.type + "] " + a.status + " | ¥" + (a.subsidy || 0) + " | " + (a.startDate || "?") + "~" + (a.endDate || "?");
      }).join("\n");
    });
  }

  // /活动 利润
  if (n.indexOf("活动 利润") >= 0) {
    return safeReply(function () {
      var all = store.getAll();
      if (all.length === 0) return "💰 暂无活动数据，无法计算利润。";
      var lines = ["💰 活动利润"];
      all.forEach(function (a) {
        var p = profit.calculate(a);
        lines.push("\n" + a.name +
          "\n  预估GMV：¥" + p.estimatedGMV.toLocaleString() +
          "\n  净利润：¥" + (p.netProfit || 0).toLocaleString() +
          "\n  利润率：" + (p.profitMargin || "N/A") + "%" +
          "\n  建议：" + p.recommendation);
      });
      return lines.join("\n");
    });
  }

  // /活动 风险
  if (n.indexOf("活动 风险") >= 0) {
    return safeReply(function () {
      var all = store.getAll();
      if (all.length === 0) return "⚠️ 暂无活动数据，无法评估风险。";
      var lines = ["⚠️ 活动风险"];
      all.forEach(function (a) {
        var r = risk.assess(a, 0.05);
        var icon = r.riskLevel === "low" ? "✅" : r.riskLevel === "medium" ? "⚠️" : "🔴";
        lines.push("\n" + a.name + " — " + icon + " " + r.riskLevel.toUpperCase() + " (评分：" + r.riskScore + ")");
      });
      return lines.join("\n");
    });
  }

  // /活动 推荐
  if (n.indexOf("活动 推荐") >= 0) {
    return safeReply(function () {
      var all = store.getAll();
      var recs = recommender.recommend(all);
      return renderer.recommendations(recs);
    });
  }

  // /活动 报名计划
  if (n.indexOf("活动 报名计划") >= 0) {
    return safeReply(function () {
      var all = store.getAll();
      var candidates = autoEnroll.scanLowRisk().filter(function (c) { return c.recommendedAction === "generate_plan"; });
      if (candidates.length === 0) return "📝 暂无可生成报名计划。";
      var plan = enrollment.createPlan(candidates[0], candidates[0].products || []);
      return renderer.enrollPlan(plan);
    });
  }

  // /活动 复盘
  if (n.indexOf("活动 复盘") >= 0) {
    return safeReply(function () {
      var hist = store.getHistory ? store.getHistory() : [];
      var done = hist.filter(function (h) { return h.eventType === "review_completed"; });
      if (done.length === 0) return "📊 暂无活动复盘记录。\n已完成的活动会出现在这里。";
      return "📊 活动复盘 (" + done.length + " 条)\n" + done.map(function (h) { return "• " + h.activity + " — " + (h.summary || ""); }).join("\n");
    });
  }

  // /活动 执行中心
  if (n.indexOf("活动 执行中心") >= 0) {
    return safeReply(function () {
      if (!ec) return "⚠️ 执行中心模块未加载";
      return ec.dashboard();
    });
  }

  // /活动 执行历史
  if (n.indexOf("活动 执行历史") >= 0) {
    return safeReply(function () {
      if (!ec) return "⚠️ 执行中心模块未加载";
      return ec.historyList(20);
    });
  }

  // /活动 provider状态
  if (n.indexOf("活动 provider状态") >= 0 || n.indexOf("provider状态") >= 0) {
    return safeReply(function () {
      if (!pCheck) return "⚠️ Provider 检查模块未加载";
      return pCheck.status();
    });
  }

  // /活动 provider自检
  if (n.indexOf("活动 provider自检") >= 0 || n.indexOf("provider自检") >= 0) {
    return safeReply(function () {
      if (!pCheck) return "⚠️ Provider 检查模块未加载";
      return pCheck.selfCheck();
    });
  }

  // /活动 真实报名预览
  if (n.indexOf("活动 真实报名预览") >= 0 || n.indexOf("真实报名预览") >= 0) {
    return safeReply(function () {
      if (!realEnroll) return "⚠️ 真实报名模块未加载";
      var pid = n.replace(/.*预览\s*/, "").trim();
      var r = realEnroll.preview(pid);
      return r.error || r.message;
    });
  }

  // /活动 真实报名确认
  if (n.indexOf("活动 真实报名确认") >= 0 || n.indexOf("真实报名确认") >= 0) {
    return safeReply(function () {
      if (!realEnroll) return "⚠️ 真实报名模块未加载";
      var rest = n.replace(/.*确认\s*/, "").trim();
      var parts = rest.split(/\s+/);
      var pid = parts[0] || "";
      var token = parts[1] || "";
      var r = realEnroll.confirm(pid, token);
      return r.error || r.message;
    });
  }

  // /活动 真实报名状态
  if (n.indexOf("活动 真实报名状态") >= 0 || n.indexOf("真实报名状态") >= 0) {
    return safeReply(function () {
      if (!realEnroll) return "⚠️ 真实报名模块未加载";
      var pid = n.replace(/.*状态\s*/, "").trim();
      return realEnroll.status(pid);
    });
  }

  // /活动 真实报名复盘
  if (n.indexOf("活动 真实报名复盘") >= 0 || n.indexOf("真实报名复盘") >= 0) {
    return safeReply(function () {
      if (!postcheck) return "⚠️ 复盘模块未加载";
      var pid = n.replace(/.*复盘\s*/, "").trim();
      return postcheck.postcheck(pid);
    });
  }

  // /活动 回滚预案
  if (n.indexOf("活动 回滚预案") >= 0 || n.indexOf("回滚预案") >= 0) {
    return safeReply(function () {
      if (!postcheck) return "⚠️ 复盘模块未加载";
      var pid = n.replace(/.*回滚预案\s*/, "").trim();
      return postcheck.rollbackPlan(pid);
    });
  }

  // /活动 批量真实报名预览
  if (n.indexOf("活动 批量真实报名预览") >= 0 || n.indexOf("批量真实报名预览") >= 0) {
    return safeReply(function () {
      if (!batch) return "⚠️ 批量报名模块未加载";
      var pids = n.replace(/.*预览\s*/, "").trim().split(/\s+/).filter(Boolean);
      var r = batch.preview(pids);
      return r.error || r.message;
    });
  }

  // /活动 批量真实报名确认
  if (n.indexOf("活动 批量真实报名确认") >= 0 || n.indexOf("批量真实报名确认") >= 0) {
    return safeReply(function () {
      if (!batch) return "⚠️ 批量报名模块未加载";
      var rest = n.replace(/.*确认\s*/, "").trim();
      var parts = rest.split(/\s+/);
      var bid = parts[0] || "";
      var token = parts[1] || "";
      var r = batch.confirm(bid, token);
      return r.error || r.message;
    });
  }

  // /活动 批量真实报名状态
  if (n.indexOf("活动 批量真实报名状态") >= 0 || n.indexOf("批量真实报名状态") >= 0) {
    return safeReply(function () {
      if (!batch) return "⚠️ 批量报名模块未加载";
      var bid = n.replace(/.*状态\s*/, "").trim();
      return batch.status(bid);
    });
  }

  // /活动 批量策略报名预览 (must be before 策略推荐 and 批量真实报名预览)
  if (n.indexOf("活动 批量策略报名预览") >= 0 || n.indexOf("批量策略报名预览") >= 0) {
    return safeReply(function () {
      if (!strategyBatch) return "⚠️ 策略批量模块未加载";
      var pids = n.replace(/.*预览\s*/, "").trim().split(/\s+/).filter(Boolean);
      var r = strategyBatch.preview(pids);
      return r.error || r.message;
    });
  }

  // /活动 批量策略报名确认
  if (n.indexOf("活动 批量策略报名确认") >= 0 || n.indexOf("批量策略报名确认") >= 0) {
    return safeReply(function () {
      if (!strategyBatch) return "⚠️ 策略批量模块未加载";
      var rest = n.replace(/.*确认\s*/, "").trim();
      var parts = rest.split(/\s+/);
      var r = strategyBatch.confirm(parts[0] || "", parts[1] || "");
      return r.error || r.message;
    });
  }

  // /活动 批量策略报名状态
  if (n.indexOf("活动 批量策略报名状态") >= 0 || n.indexOf("批量策略报名状态") >= 0) {
    return safeReply(function () {
      if (!strategyBatch) return "⚠️ 策略批量模块未加载";
      return strategyBatch.status(n.replace(/.*状态\s*/, "").trim());
    });
  }

  // /活动 策略推荐
  if (n.indexOf("活动 策略推荐") >= 0 || n.indexOf("策略推荐") >= 0) {
    return safeReply(function () {
      if (!strategy) return "⚠️ 策略引擎未加载";
      return strategy.recommend();
    });
  }

  // /活动 策略详情
  if (n.indexOf("活动 策略详情") >= 0 || n.indexOf("策略详情") >= 0) {
    return safeReply(function () {
      if (!strategy) return "⚠️ 策略引擎未加载";
      var aid = n.replace(/.*详情\s*/, "").trim();
      return strategy.detail(aid);
    });
  }

  // /活动 策略回测
  if (n.indexOf("活动 策略回测") >= 0 || n.indexOf("策略回测") >= 0) {
    return safeReply(function () {
      if (!strategy) return "⚠️ 策略引擎未加载";
      return strategy.backtest();
    });
  }

  // P62 Agent - /活动 智能建议
  if (n.indexOf("活动 智能建议") >= 0 || n === "活动 agent" || n.indexOf("活动 agent") >= 0) {
    return safeReply(function () {
      var agent=null; try{agent=require("../agents/activity-planner-agent")}catch(e){}
      if(!agent) return "⚠️ Agent未加载";
      return agent.advise(n.replace(/.*(?:智能建议|agent)\s*/, "").trim()||"智能建议");
    });
  }

  // P63 Learning - /活动 学习记录/学习总结/记忆状态
  if (n.indexOf("活动 学习记录") >= 0) {
    return safeReply(function () {
      var h=null; try{h=require("../memory/activity-learning-hook")}catch(e){}
      if(!h) return "⚠️ 学习模块未加载";
      h.sync(); return h.recentList(20);
    });
  }
  if (n.indexOf("活动 学习总结") >= 0) {
    return safeReply(function () {
      var h=null; try{h=require("../memory/activity-learning-hook")}catch(e){}
      if(!h) return "⚠️ 学习模块未加载";
      h.sync(); return h.summary();
    });
  }
  if (n.indexOf("活动 记忆状态") >= 0) {
    return safeReply(function () {
      var h=null; try{h=require("../memory/activity-learning-hook")}catch(e){}
      if(!h) return "⚠️ 学习模块未加载";
      h.sync(); return h.status();
    });
  }

  // Default help
  return "⚠️ 未知命令: /" + n + "\n\n发送: /活动 状态 | /活动 列表 | /活动 利润 | /活动 风险 | /活动 推荐 | /活动 报名计划 | /活动 复盘 | /活动 执行中心 | /活动 执行历史 | /活动 provider状态 | /活动 provider自检 | /活动 真实报名预览 <id> | ... | /活动 策略推荐 | /活动 策略详情 <id> | /活动 策略回测 | /活动 学习记录 | /活动 学习总结 | /活动 记忆状态";
}

module.exports = { handle: handle };
