'use strict';

/**
 * /订单 命令
 * v1.0 - 读取订单数据，展示订单概况
 */

const fs = require('fs');
const config = require('../lib/config');

async function execute(ctx) {
  const lines = ['📦 订单概况'];
  lines.push('');

  // 1. 读取 sync_report (有汇总数据)
  let report = null;
  try {
    const raw = fs.readFileSync(config.SYNC_REPORT_FILE, 'utf8');
    report = JSON.parse(raw);
    const mtime = fs.statSync(config.SYNC_REPORT_FILE).mtime;
    lines.push('【数据时间】');
    lines.push(mtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
    lines.push('');
  } catch (e) {
    lines.push('⚠️ 同步报告数据缺失');
    lines.push('');
  }

  // 2. 汇总数据
  if (report && report.summary) {
    const s = report.summary;
    lines.push('【今日汇总】');
    lines.push('订单总数: ' + (s.totalOrders !== undefined ? s.totalOrders : '数据缺失'));
    lines.push('GMV: ¥' + (s.totalGMV !== undefined ? s.totalGMV : '数据缺失'));
    lines.push('退款数: ' + (s.totalRefunds !== undefined ? s.totalRefunds : '数据缺失'));
    if (s.refundRate) lines.push('退款率: ' + s.refundRate);
    lines.push('');
  } else {
    lines.push('【今日汇总】');
    lines.push('数据缺失，无法判断');
    lines.push('');
  }

  // 3. 读取订单明细
  let orders = [];
  try {
    const raw = fs.readFileSync(config.ORDERS_FILE, 'utf8');
    const data = JSON.parse(raw);
    orders = data.orders || [];
  } catch (e) {
    lines.push('⚠️ 订单明细数据缺失');
    return lines.join('\n');
  }

  if (orders.length === 0) {
    lines.push('【订单明细】');
    lines.push('今日暂无订单');
    return lines.join('\n');
  }

  // 4. 按状态分组
  const statusCount = {};
  let totalPay = 0;
  for (const o of orders) {
    const st = o.order_status || '未知';
    statusCount[st] = (statusCount[st] || 0) + 1;
    totalPay += (o.pay_amount || 0);
  }

  lines.push('【订单状态分布】');
  for (const [st, cnt] of Object.entries(statusCount)) {
    lines.push(st + ': ' + cnt + '笔');
  }
  lines.push('');

  // 5. 待发货提醒
  const pending = (statusCount['待发货'] || 0) + (statusCount['待付款'] || 0);
  if (pending > 0) {
    lines.push('⚠️ 有 ' + pending + ' 笔订单待处理，请优先处理！');
  }

  return lines.join('\n');
}

module.exports = { execute, desc: '订单概况' };
