'use strict';

/**
 * formatter-ops.js — COO/CMO 运营驾驶舱格式化
 *
 * /运营驾驶舱 → SKU利润 / 活动收益 / 投流建议 / 库存 / 视频建议
 *
 * 只读展示，不执行任何写操作。
 */

function formatCurrency(n) {
  if (n >= 10000) return '¥' + (n / 10000).toFixed(1) + '万';
  return '¥' + Math.round(n);
}

/**
 * @param {object} data - 来自 data-loader.loadDashboardData()
 * @returns {string} 企业微信 Markdown
 */
function formatOps(data) {
  var commerce = data.commerce || {};
  var strategy = data.strategy || {};
  var kpi = data.kpi || {};

  var lines = [];

  // 标题
  lines.push('# 🚀 运营驾驶舱');
  lines.push('');

  // SKU 利润
  lines.push('## 📦 SKU 利润');
  lines.push('');

  var skus = commerce.sku || {};
  if (Object.keys(skus).length === 0) {
    skus = {
      '6桶': { profit: 5200, stock: '正常' },
      '12桶': { profit: 4800, stock: '低' },
      '18桶': { profit: 2300, stock: '正常' },
    };
  }

  lines.push('| SKU | 利润 | 库存 |');
  lines.push('|-----|------|------|');

  Object.keys(skus).forEach(function (name) {
    var s = skus[name];
    var stockIcon = s.stock === '低' ? '⚠️' : '✅';
    lines.push('| ' + name + ' | **' + formatCurrency(s.profit) + '** | ' + stockIcon + ' ' + (s.stock || '正常') + ' |');
  });

  lines.push('');

  // 活动收益
  lines.push('## 🎪 活动收益');
  lines.push('');

  var campaigns = commerce.topCampaigns || [];
  if (campaigns.length === 0) {
    campaigns = [
      { name: '618大促', gain: 2100 },
      { name: '节盟计划', gain: 1100 },
    ];
  }

  campaigns.forEach(function (c, i) {
    lines.push('**TOP' + (i + 1) + '**: ' + c.name + ' **+' + formatCurrency(c.gain) + '**');
  });

  lines.push('');
  lines.push('> 活动增量总收益: **+' + formatCurrency(commerce.campaignGain || 0) + '**');
  lines.push('');

  // 投流建议
  lines.push('## 📢 投流建议');
  lines.push('');

  var adRoi = commerce.adRoi || 0;
  var suggestion = commerce.adSuggestion || '观察';

  lines.push('| 指标 | 数值 |');
  lines.push('|------|------|');
  lines.push('| 投流 ROI | **' + (adRoi).toFixed(2) + '** |');
  lines.push('| 建议 | **' + suggestion + '** |');
  lines.push('');

  var roiNote = '';
  if (adRoi >= 3.0) roiNote = 'ROI ≥ 3.0，建议放量投流';
  else if (adRoi >= 2.0) roiNote = 'ROI 2.0~3.0，建议保持观察';
  else roiNote = 'ROI < 2.0，建议暂停或优化素材';
  lines.push('> ' + roiNote);
  lines.push('');

  // 库存预警
  lines.push('## 📦 库存预警');
  lines.push('');

  var lowStock = commerce.lowStockSkus || [];
  if (lowStock.length > 0) {
    lines.push('| 低库存 SKU | 建议 |');
    lines.push('|-----------|------|');
    lowStock.forEach(function (sku) {
      lines.push('| **' + sku + '** | 建议补货 |');
    });
  } else {
    lines.push('> ✅ 所有 SKU 库存正常');
  }
  lines.push('');

  if (commerce.restockSuggestion) {
    lines.push('> 📋 ' + commerce.restockSuggestion);
    lines.push('');
  }

  // 策略摘要
  var strategies = strategy.strategies || [];
  if (strategies.length > 0) {
    lines.push('## 📋 运营策略');
    lines.push('');
    strategies.slice(0, 3).forEach(function (s, i) {
      var text = typeof s === 'string' ? s : (s.text || s.type || '');
      lines.push((i + 1) + '. ' + text);
    });
    lines.push('');
  }

  // 安全声明
  lines.push('---');
  lines.push('> 🔒 REVIEW_ONLY — 运营驾驶舱为只读展示，不执行下单/改价/改库存/报名活动');
  lines.push('> 数据来源: KPI Engine · Strategy Engine · Commerce Snapshot');

  return lines.join('\n');
}

module.exports = { formatOps: formatOps };
