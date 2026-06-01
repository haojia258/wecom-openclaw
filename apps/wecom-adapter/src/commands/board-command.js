"use strict";
var boardDash = null;
try { boardDash = require("../board/board-dashboard"); } catch(e) {}
async function execute(ctx, args) {
  if (!boardDash) return "⚠️ Board module not available\n\nREVIEW_ONLY=true";
  var data = boardDash.render();
  return [
    "## 🏛️ AI 董事会 — 经营审议", "",
    "**经营速览:**",
    "GMV: ¥" + data.revenue.total.toLocaleString() + " | 利润: ¥" + data.profit.total.toLocaleString() + " (" + data.profit.margin + ")",
    "ROI: " + data.roi.value + "x | 风险: " + data.risk.level,
    "预算: ¥" + data.budget.remaining.toLocaleString() + " 剩余",
    "现金流: +¥" + data.cashflow.net.toLocaleString(), "",
    "---", "", "REVIEW_ONLY=true | P48 Audit Gate active", "",
    "💡 /目标 查看 OKR | /KPI 指标 | /Brain 建议"
  ].join("\n");
}
var desc = "AI 董事会会议：经营审议 / 投票 / 决议 (REVIEW_ONLY)";
module.exports = { execute: execute, desc: desc };
