'use strict';

/**
 * cost-activity-command.js — /活动筛选 /成本核算 命令处理器
 *
 * REVIEW_ONLY 模式：只计算、只展示、只生成审批单。
 * 不执行 real_activity_signup / real_price_change。
 */

var { runCostCalculation, runActivityScreening, runApprovalRequest } = require('../skills/dashboard/cost-activity-handler');

var desc = '全成本核算与活动利润筛选 /活动筛选 | /成本核算';

async function execute(ctx, args) {
  var cmd = (ctx && ctx.cmd) || '';

  if (cmd === '/成本核算' || cmd === '/保本价' || cmd === '/商品成本') {
    var costResult = runCostCalculation();
    return costResult.success ? costResult.report : (costResult.report || '❌ 核算失败');
  }

  if (cmd === '/活动筛选' || cmd === '/活动利润' || cmd === '/活动报名建议' || cmd === '/算活动') {
    var screenResult = runActivityScreening();
    return screenResult.success ? screenResult.report : (screenResult.report || '❌ 筛选失败');
  }

  // 默认：帮助
  return [
    '📊 酸辣粉全成本核算与活动筛选',
    '',
    '可用命令:',
    '/成本核算  — 计算单品全成本、保本价、建议活动价',
    '/活动筛选  — 筛选可赚钱活动、生成参加建议',
    '/活动报名  — 生成报名审批单（需 CEO 审批）',
    '',
    '> 🔒 REVIEW_ONLY — 仅计算展示，不执行报名/改价',
    '> real_activity_signup / real_price_change 必须 CEO 审批',
  ].join('\n');
}

module.exports = { execute: execute, desc: desc };
