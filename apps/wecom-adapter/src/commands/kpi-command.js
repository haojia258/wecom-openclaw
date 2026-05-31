'use strict';

/**
 * kpi-command.js — P13.1 KPI Engine 命令处理器
 *
 * /KPI   → 今日 KPI 仪表板
 * /周报  → 本周趋势报告
 * /月报  → 月度汇总报告
 */

var { generateDailyReport } = require('../skills/kpi-engine/kpi-engine');
var { formatWeeklyReport, formatMonthlyReport } = require('../skills/kpi-engine/trend-analyzer');
var { formatBoardReport } = require('../skills/kpi-engine/board-report');

var desc = 'KPI 运营仪表板 /KPI | /周报 | /月报';

async function execute(ctx, args) {
  var cmd = (ctx && ctx.cmd) || '';

  if (cmd === '/周报') {
    return formatWeeklyReport();
  }

  if (cmd === '/月报') {
    return formatMonthlyReport();
  }

  // Default: /KPI → board report
  return formatBoardReport();
}

module.exports = { execute: execute, desc: desc };
