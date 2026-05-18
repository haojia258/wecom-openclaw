'use strict';

/**
 * /ping 命令
 * v1.0 - 系统诊断：版本、时间、数据文件状态、最近同步时间
 */

const fs = require('fs');
const config = require('../lib/config');

async function execute(ctx) {
  const lines = ['📡 OpenClaw 系统诊断'];
  lines.push('');

  // 版本
  lines.push('【版本】');
  lines.push('wecom-adapter: ' + config.VERSION);
  lines.push('Node.js: ' + process.version);
  lines.push('');

  // 当前时间
  lines.push('【时间】');
  lines.push(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
  lines.push('');

  // 数据文件状态
  const filesToCheck = [
    { label: '罗盘(GMV)',       path: config.COMPASS_FILE },
    { label: '订单',           path: config.ORDERS_FILE },
    { label: 'SKU利润',       path: config.SKU_PROFIT_FILE },
    { label: '售后/退款',     path: config.AFTERSALES_FILE },
    { label: '运营建议',       path: config.OPS_ADVICE_FILE },
    { label: '同步报告',       path: config.SYNC_REPORT_FILE },
  ];

  let latestTime = 0;
  lines.push('【数据文件】');
  for (const f of filesToCheck) {
    try {
      const stat = fs.statSync(f.path);
      const mtime = stat.mtime;
      if (mtime > latestTime) latestTime = mtime;
      const ts = mtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      lines.push('✅ ' + f.label + ': ' + ts);
    } catch (e) {
      lines.push('❌ ' + f.label + ': 不存在');
    }
  }
  lines.push('');

  // 最近同步时间
  lines.push('【最近同步】');
  if (latestTime > 0) {
    lines.push(new Date(latestTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
  } else {
    lines.push('暂无数据');
  }
  lines.push('');

  // 进程信息
  lines.push('【进程】');
  lines.push('PID: ' + process.pid);
  const used = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const total = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
  lines.push('内存: ' + used + 'MB / ' + total + 'MB');

  return lines.join('\n');
}

module.exports = { execute };
