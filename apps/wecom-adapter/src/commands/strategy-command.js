'use strict';

/**
 * strategy-command.js — P13.3 Strategy Planner Commands
 *
 * /策略     — 策略总览 + 核心决策
 * /经营规划 — 7天详细计划（日维度）
 */

var planner = require('../skills/strategy-planner/strategy-planner');

// ─── /策略 ─────────────────────────────────────────────────

function handleStrategy() {
  var plan = planner.generate7DayPlan();
  var strategies = plan.strategies;
  var summary = plan.summary;

  var lines = [
    '🎯 **经营策略总览 — ' + plan.title.split('—')[1].trim() + '**',
    '',
    '**风险评估**: ' + getRiskEmoji(summary.riskLevel) + ' ' + summary.riskLevel,
    '**高优先项**: ' + summary.highPriorityActions.length + ' 项',
    '**7天预算**: ¥' + summary.total7DayBudget.toLocaleString(),
    '',
    '---',
    '',
    '**核心策略**:',
  ];

  strategies.forEach(function (s, idx) {
    var icon = getDomainEmoji(s.domain);
    var priorityTag = s.priority === 'high' ? ' 🔴' : s.priority === 'normal' ? ' 🟡' : '';
    lines.push('');
    lines.push((idx + 1) + '. ' + icon + ' **' + s.domain.toUpperCase() + '**: ' + s.action + priorityTag);
    lines.push('   > ' + s.detail);
  });

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('**7天概览**:');

  plan.days.forEach(function (day) {
    var videoLabel = day.video.template;
    var adsBudget = '¥' + day.ads.dailyBudget;
    var intensity = isWeekend(day) ? ' 🔥' : '';
    lines.push('- **' + day.label + '**' + intensity + ': 视频=' + videoLabel + ' | 投流=' + adsBudget + ' | 活动=' + day.campaign.actions[0].action);
  });

  lines.push('');
  lines.push('💡 `/经营规划` 查看每日详细计划 | `/预算` 查看预算分配');

  return lines.join('\n');
}

// ─── /经营规划 ─────────────────────────────────────────────

function handleBusinessPlan() {
  var plan = planner.generate7DayPlan();

  var lines = [
    '📋 **7天经营规划 — ' + plan.title.split('—')[1].trim() + '**',
    '',
    'Plan ID: `' + plan.planId + '`',
    '生成时间: ' + plan.generatedAt.split('T')[0],
    '',
  ];

  plan.days.forEach(function (day) {
    var weekendTag = isWeekend(day) ? ' 🔥' : '';
    lines.push('---');
    lines.push('');
    lines.push('## Day ' + day.day + ': ' + day.label + weekendTag);
    lines.push('');

    // 活动
    lines.push('### 🎪 活动');
    day.campaign.actions.forEach(function (a) {
      lines.push('- **' + a.action + '** (' + a.intensity + '): ' + a.detail);
    });

    // 投流
    lines.push('');
    lines.push('### 💰 投流');
    lines.push('- 日预算: ¥' + day.ads.dailyBudget);
    lines.push('- 平台: ' + day.ads.platforms.join(', '));
    lines.push('- 出价: ' + day.ads.bidding);
    lines.push('- 换素材: ' + (day.ads.creativeRefresh ? '是' : '否'));

    // 视频
    lines.push('');
    lines.push('### 🎬 视频');
    lines.push('- 数量: ' + day.video.count + ' 条');
    lines.push('- 模板: ' + day.video.template);
    lines.push('- 发布: ' + day.video.publishSlots.join('/'));
    if (day.video.reviewDay) lines.push('- 📊 复盘日: 分析播放/转化数据');

    // 库存
    lines.push('');
    lines.push('### 📦 库存');
    var invAlert = day.inventory.alert ? '⚠️ **预警**: 库存偏低，建议补货' : '✅ 库存安全';
    lines.push('- ' + invAlert);
    day.inventory.items.forEach(function (item) {
      var sEmoji = item.status === 'critical' ? '🔴' : item.status === 'warning' ? '🟡' : '🟢';
      lines.push('  ' + sEmoji + ' ' + item.sku + ' (' + item.role + '): ' + item.stock + ' 件');
    });

    // 预算
    lines.push('');
    lines.push('### 💵 当日预算分配');
    var ba = day.budget_allocation;
    lines.push('- 总计: ¥' + ba.dailyTotal);
    lines.push('- 投流: ¥' + ba.ads + ' | 活动: ¥' + ba.campaign + ' | AI: ¥' + ba.ai + ' | 其他: ¥' + ba.other);
  });

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('⚠️ 以上为 **REVIEW_ONLY** 规划。所有执行需人工审批。');
  lines.push('💡 `/策略` 策略总览 | `/预算` 预算详情 | `/董事会` 审批决策');

  return lines.join('\n');
}

// ─── 工具函数 ──────────────────────────────────────────────

function getRiskEmoji(level) {
  switch (level) {
    case 'high': return '🔴';
    case 'medium': return '🟡';
    case 'low': return '🟢';
    default: return '🟢';
  }
}

function getDomainEmoji(domain) {
  switch (domain) {
    case 'growth': return '📈';
    case 'profit': return '💰';
    case 'risk': return '🛡️';
    case 'budget': return '💵';
    default: return '📋';
  }
}

function isWeekend(day) {
  return day.isWeekend;
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  handleStrategy: handleStrategy,
  handleBusinessPlan: handleBusinessPlan,
};

if (require.main === module) {
  var args = process.argv.slice(2);
  var sub = args[0] || 'strategy';
  if (sub === 'plan' || sub === 'business') console.log(handleBusinessPlan());
  else console.log(handleStrategy());
}
