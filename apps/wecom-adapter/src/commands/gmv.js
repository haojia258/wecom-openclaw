'use strict';

/**
 * /今日GMV 命令
 * 数据来源: fetch-metrics_latest.json (电商罗盘)
 */

const fs = require('fs');
const DATA_DIR = '/opt/wecom-openclaw/logs/doudian/';
const DATA_FILE = DATA_DIR + 'fetch-metrics_latest.json';

async function execute(ctx) {
  let data = null;
  let dataError = null;

  try {
    if (!fs.existsSync(DATA_FILE)) {
      return '📊 今日GMV\n\n暂无数据（数据文件不存在）\n请先执行 fetch-doudian-metrics 抓取任务';
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    data = JSON.parse(raw);
  } catch (e) {
    dataError = e.message;
    console.error('[gmv] 读取数据文件失败:', e.message);
  }

  const lines = ['📊 今日GMV'];

  // 优先从 summary 取（含 orders 汇总），fallback 到 compass.metrics
  const metrics = (data && data.summary) || (data && data.compass && data.compass.metrics) || null;
  const compassMetrics = (data && data.compass && data.compass.metrics) || null;

  if (metrics) {
    lines.push('');
    lines.push('【今日】');
    lines.push('结算GMV: ¥' + (metrics.todayGMV || metrics.settlementGMV || 0).toFixed(2));
    lines.push('成交订单数: ' + (metrics.payOrders || 0));
    if (compassMetrics) {
      if (compassMetrics.visitorCount != null) lines.push('曝光人数: ' + compassMetrics.visitorCount);
      if (compassMetrics.totalTraffic != null) lines.push('总流量: ' + compassMetrics.totalTraffic);
    }
    lines.push('体验分: ' + (metrics.experienceScore || compassMetrics && compassMetrics.experienceScore || '-'));
  }

  // 近7天 from orders_latest metrics
  const ordersFile = DATA_DIR + 'orders_latest.json';
  try {
    if (fs.existsSync(ordersFile)) {
      const ordersData = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
      const om = ordersData.metrics || {};
      lines.push('');
      lines.push('【近7天】');
      lines.push('结算金额: ¥' + (om.settlementGMV7d || om.settlementGMV || 0).toFixed(2));
      lines.push('成交订单数: ' + (om.payOrders7d || om.payOrders || 0));
      lines.push('曝光人数: ' + (om.exposureCount7d || om.exposureCount || 0));
    }
  } catch (e) {
    // silently skip
  }

  if (!metrics) {
    lines.length = 0;
    lines.push('📊 今日GMV');
    lines.push('');
    lines.push('暂无数据或数据格式不正确');
    lines.push('请先执行数据抓取任务');
    if (dataError) {
      lines.push('');
      lines.push('（调试: ' + dataError.slice(0, 60) + '）');
    }
  }

  // 更新时间
  if (data) {
    const ts = data.timestamp || '';
    if (ts) {
      lines.push('');
      lines.push('📅 数据时间: ' + ts.replace('T', ' ').slice(0, 19));
    }
  }

  return lines.join('\n');
}

module.exports = { execute };
