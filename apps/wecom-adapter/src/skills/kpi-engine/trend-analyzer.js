'use strict';

/**
 * trend-analyzer.js — P13.1 趋势分析引擎
 *
 * 从 KPI 快照计算周/月趋势。
 * REVIEW_ONLY — 只读分析。
 */

// ─── 模拟周度数据 ──────────────────────────────────────────

function getWeeklyData() {
  var days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  return days.map(function (day, i) {
    var baseGmv = 6800 + Math.round(Math.sin(i * 0.5) * 1200);
    var baseProfit = baseGmv * 0.28 + Math.round(Math.random() * 500);
    return {
      day: day,
      gmv: baseGmv,
      profit: baseProfit,
      roi: (2.0 + Math.random() * 0.8),
      orders: 15 + Math.round(Math.random() * 10),
      refund_rate: (3.5 + Math.random() * 2.0),
      campaign_gain: Math.round(Math.random() * 800),
    };
  });
}

// ─── 模拟月度数据 ──────────────────────────────────────────

function getMonthlyData() {
  return [1, 2, 3, 4].map(function (week) {
    var baseGmv = 45000 + Math.round(Math.sin(week * 0.8) * 8000);
    return {
      week: '第' + week + '周',
      gmv: baseGmv,
      profit: Math.round(baseGmv * 0.28),
      roi: (2.0 + (week * 0.15)),
      orders: 100 + Math.round(Math.random() * 30),
      refund_rate: (4.0 - week * 0.3),
      campaign_gain: Math.round(2500 + Math.random() * 1500),
    };
  });
}

// ─── 趋势计算 ──────────────────────────────────────────────

function calculateTrends(data, keyField) {
  if (data.length < 2) return { direction: 'stable', change: 0, percent: 0 };

  var first = data[0];
  var last = data[data.length - 1];
  var firstVal = typeof first === 'object' ? first[keyField] : first;
  var lastVal = typeof last === 'object' ? last[keyField] : last;

  if (firstVal === 0) return { direction: 'stable', change: 0, percent: 0 };

  var change = lastVal - firstVal;
  var percent = Math.round((change / Math.abs(firstVal)) * 1000) / 10;

  return {
    direction: percent > 5 ? 'up' : percent < -5 ? 'down' : 'stable',
    change: change,
    percent: percent,
  };
}

// ─── 格式化 ────────────────────────────────────────────────

function formatWeeklyReport() {
  var data = getWeeklyData();
  var lines = [];

  lines.push('# 📈 本周 KPI 周报');
  lines.push('');
  lines.push('> 生成时间: ' + new Date().toISOString());
  lines.push('');

  // 日度明细
  lines.push('## 📊 日度明细');
  lines.push('');
  lines.push('| 日期 | GMV | 利润 | ROI | 订单 | 退款率 | 活动收益 |');
  lines.push('|------|-----|------|-----|------|--------|----------|');

  data.forEach(function (d) {
    lines.push('| ' + d.day + ' | ¥' + d.gmv.toLocaleString() + ' | ¥' + d.profit.toLocaleString() + ' | ' + d.roi.toFixed(2) + ' | ' + d.orders + ' | ' + d.refund_rate.toFixed(1) + '% | ¥' + d.campaign_gain + ' |');
  });

  lines.push('');

  // 周度汇总
  var totalGmv = data.reduce(function (s, d) { return s + d.gmv; }, 0);
  var totalProfit = data.reduce(function (s, d) { return s + d.profit; }, 0);
  var avgRoi = data.reduce(function (s, d) { return s + d.roi; }, 0) / data.length;
  var totalOrders = data.reduce(function (s, d) { return s + d.orders; }, 0);
  var totalCampaign = data.reduce(function (s, d) { return s + d.campaign_gain; }, 0);

  lines.push('## 📊 周度汇总');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('|------|-----|');
  lines.push('| 周度GMV | **¥' + totalGmv.toLocaleString() + '** |');
  lines.push('| 周度利润 | **¥' + totalProfit.toLocaleString() + '** |');
  lines.push('| 平均ROI | **' + avgRoi.toFixed(2) + '** |');
  lines.push('| 总订单 | **' + totalOrders + '** |');
  lines.push('| 活动收益 | **¥' + totalCampaign.toLocaleString() + '** |');
  lines.push('');

  // 趋势分析
  var gmvTrend = calculateTrends(data.map(function (d) { return d.gmv; }));
  var profitTrend = calculateTrends(data.map(function (d) { return d.profit; }));
  var roiTrend = calculateTrends(data.map(function (d) { return d.roi; }));

  var trendIcon = function (d) { return d === 'up' ? '📈' : d === 'down' ? '📉' : '➡️'; };

  lines.push('## 📈 趋势分析');
  lines.push('');
  lines.push('| 指标 | 方向 | 变化 |');
  lines.push('|------|------|------|');
  lines.push('| GMV | ' + trendIcon(gmvTrend.direction) + ' ' + gmvTrend.direction + ' | ' + (gmvTrend.percent > 0 ? '+' : '') + gmvTrend.percent + '% |');
  lines.push('| 利润 | ' + trendIcon(profitTrend.direction) + ' ' + profitTrend.direction + ' | ' + (profitTrend.percent > 0 ? '+' : '') + profitTrend.percent + '% |');
  lines.push('| ROI | ' + trendIcon(roiTrend.direction) + ' ' + roiTrend.direction + ' | ' + (roiTrend.percent > 0 ? '+' : '') + roiTrend.percent + '% |');
  lines.push('');

  lines.push('---');
  lines.push('> 🔒 REVIEW_ONLY — P13.1 Trend Analyzer | /KPI 查看日度 | /月报 查看月度');

  return lines.join('\n');
}

function formatMonthlyReport() {
  var data = getMonthlyData();
  var lines = [];

  lines.push('# 📅 本月 KPI 月报');
  lines.push('');
  lines.push('> 生成时间: ' + new Date().toISOString());
  lines.push('');

  // 周度明细
  lines.push('## 📊 周度明细');
  lines.push('');
  lines.push('| 周期 | GMV | 利润 | ROI | 订单 | 退款率 | 活动收益 |');
  lines.push('|------|-----|------|-----|------|--------|----------|');

  data.forEach(function (d) {
    lines.push('| ' + d.week + ' | ¥' + d.gmv.toLocaleString() + ' | ¥' + d.profit.toLocaleString() + ' | ' + d.roi.toFixed(2) + ' | ' + d.orders + ' | ' + d.refund_rate.toFixed(1) + '% | ¥' + d.campaign_gain.toLocaleString() + ' |');
  });

  lines.push('');

  // 月度汇总
  var totalGmv = data.reduce(function (s, d) { return s + d.gmv; }, 0);
  var totalProfit = data.reduce(function (s, d) { return s + d.profit; }, 0);
  var avgRoi = data.reduce(function (s, d) { return s + d.roi; }, 0) / data.length;

  lines.push('## 📊 月度汇总');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('|------|-----|');
  lines.push('| 月度GMV | **¥' + totalGmv.toLocaleString() + '** |');
  lines.push('| 月度利润 | **¥' + totalProfit.toLocaleString() + '** |');
  lines.push('| 平均ROI | **' + avgRoi.toFixed(2) + '** |');
  lines.push('| 毛利率 | **' + (totalProfit / totalGmv * 100).toFixed(1) + '%** |');
  lines.push('');

  // 环比
  if (data.length >= 2) {
    var firstWeek = data[0].gmv;
    var lastWeek = data[data.length - 1].gmv;
    var wowGrowth = ((lastWeek - firstWeek) / firstWeek * 100).toFixed(1);

    lines.push('## 📈 环比分析');
    lines.push('');
    lines.push('| 指标 | 变化 |');
    lines.push('|------|------|');
    lines.push('| GMV 周环比 | **' + (wowGrowth > 0 ? '+' : '') + wowGrowth + '%** |');
    lines.push('| 月度GMV达标率 | **' + (totalGmv > 200000 ? '🟢 达标' : totalGmv > 150000 ? '🟡 接近' : '🔴 未达标') + '** |');
    lines.push('');

    // 增长评分
    var growthScore = totalGmv > 200000 ? 85 : totalGmv > 150000 ? 60 : 35;
    lines.push('| 增长评分 | **' + growthScore + '/100** |');
    lines.push('');
  }

  lines.push('---');
  lines.push('> 🔒 REVIEW_ONLY — P13.1 Trend Analyzer | /KPI 查看日度 | /周报 查看周度');

  return lines.join('\n');
}

// ─── 公共 API ──────────────────────────────────────────────

module.exports = {
  getWeeklyData: getWeeklyData,
  getMonthlyData: getMonthlyData,
  calculateTrends: calculateTrends,
  formatWeeklyReport: formatWeeklyReport,
  formatMonthlyReport: formatMonthlyReport,
};
