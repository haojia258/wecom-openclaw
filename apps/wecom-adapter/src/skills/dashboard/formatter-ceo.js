'use strict';

/**
 * formatter-ceo.js — CEO 总览大屏格式化
 *
 * /总控 → GMV / 利润 / ROI / 风险 / Loop 状态 / 今日 Mission
 *
 * 只读展示，不执行任何写操作。
 */

function formatNumber(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(Math.round(n));
}

function formatCurrency(n) {
  if (n >= 10000) return '¥' + (n / 10000).toFixed(1) + '万';
  return '¥' + Math.round(n);
}

function phaseIcon(status) {
  if (status === 'completed') return '✅';
  if (status === 'running') return '🔄';
  if (status === 'failed') return '❌';
  if (status === 'blocked') return '🚫';
  return '⏳';
}

/**
 * @param {object} data - 来自 data-loader.loadDashboardData()
 * @returns {string} 企业微信 Markdown
 */
function formatCEO(data) {
  var kpi = data.kpi || {};
  var mission = data.mission || {};
  var loop = data.loop || {};
  var commerce = data.commerce || {};

  var lines = [];

  // 标题
  lines.push('# 📊 AI One-Person Company OS v3 — 总控大屏');
  lines.push('');

  // KPI 指标卡片
  lines.push('## 💰 核心指标');
  lines.push('');
  lines.push('| 指标 | 数值 |');
  lines.push('|------|------|');
  lines.push('| GMV | **' + formatCurrency(kpi.gmv || 0) + '** |');
  lines.push('| 利润 | **' + formatCurrency(kpi.profit || 0) + '** |');
  lines.push('| ROI | **' + (kpi.roi || 0).toFixed(2) + '** |');
  lines.push('| 退款率 | **' + (kpi.refundRate || 0).toFixed(1) + '%** |');
  lines.push('| 库存风险 | **' + (commerce.inventoryRisk || 0) + '** |');
  lines.push('| 活动增量收益 | **+' + formatCurrency(commerce.campaignGain || 0) + '** |');
  lines.push('');

  // 自治循环状态
  lines.push('## 🔄 自治循环');
  lines.push('');
  var phases = loop.phases || {};
  var phaseOrder = ['observe', 'analyze', 'strategy', 'board', 'execute', 'learn'];
  var phaseNames = {
    observe: 'Observe',
    analyze: 'Analyze',
    strategy: 'Strategy',
    board: 'Board',
    execute: 'Execute',
    learn: 'Learn',
  };

  phaseOrder.forEach(function (key) {
    var phase = phases[key] || { status: 'pending' };
    lines.push(phaseIcon(phase.status) + ' ' + phaseNames[key]);
  });

  lines.push('');
  lines.push('> 今日循环: ' + (loop.daily ? loop.daily.loops : 0) + '/' + (loop.daily ? loop.daily.maxLoops : 1));

  lines.push('');

  // 今日 Mission
  lines.push('## 🎯 今日 Mission');
  lines.push('');
  lines.push('| 状态 | 数量 |');
  lines.push('|------|------|');
  lines.push('| 已创建 | **' + (mission.created || 0) + '** |');
  lines.push('| 成功 | **' + (mission.success || 0) + '** |');
  lines.push('| 失败 | **' + (mission.failed || 0) + '** |');
  lines.push('| 成功率 | **' + (mission.successRate || 0) + '%** |');
  lines.push('');

  // 预算摘要
  var budget = data.budget || {};
  if (budget.totalLimit > 0) {
    lines.push('## 💵 预算');
    lines.push('');
    lines.push('| 指标 | 数值 |');
    lines.push('|------|------|');
    lines.push('| 总预算 | **' + formatCurrency(budget.totalLimit) + '** |');
    lines.push('| 已使用 | **' + formatCurrency(budget.totalUsed) + '** |');
    lines.push('| 剩余 | **' + formatCurrency(budget.remaining) + '** |');
    lines.push('| 使用率 | **' + (budget.usageRate || 0) + '%** |');
    lines.push('');
  }

  // 安全声明
  lines.push('---');
  lines.push('> 🔒 REVIEW_ONLY — 本报告为只读展示，不执行任何写操作');
  lines.push('> 数据来源: KPI Engine · Mission Generator · Company Loop · Budget Engine');

  return lines.join('\n');
}

module.exports = { formatCEO: formatCEO };
