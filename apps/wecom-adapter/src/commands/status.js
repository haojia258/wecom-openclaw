'use strict';

/**
 * /状态 命令
 */

const fs = require('fs');
const DATA_DIR = '/opt/wecom-openclaw/logs/doudian/';

async function execute(ctx) {
  const lines = ['🖥️ 系统状态'];

  // 内存
  try {
    const totalMem = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
    const usedMem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    lines.push('');
    lines.push('【进程内存】');
    lines.push('Heap Used: ' + usedMem + ' MB');
    lines.push('Heap Total: ' + totalMem + ' MB');
  } catch (e) {
    lines.push('');
    lines.push('（内存信息获取失败）');
  }

  // 服务状态
  lines.push('');
  lines.push('【服务】');
  lines.push('wecom-adapter: 运行中');
  lines.push('端口: ' + (process.env.WECOM_ADAPTER_PORT || 3001));

  // 数据文件时间
  lines.push('');
  lines.push('【数据文件】');
  const files = [
    ['fetch-metrics_latest.json', '罗盘指标'],
    ['orders_latest.json', '订单数据'],
    ['sku-profit_latest.json', 'SKU利润'],
    ['check-risk_latest.json', '风险检测'],
    ['aftersales_latest.json', '售后数据'],
  ];
  for (const [f, label] of files) {
    try {
      const stat = fs.statSync(DATA_DIR + f);
      const mtime = stat.mtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      lines.push(label + ' (' + f + '): ' + mtime);
    } catch (e) {
      lines.push(label + ' (' + f + '): ❌ 不存在');
    }
  }

  lines.push('');
  lines.push('🕐 ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
  return lines.join('\n');
}

module.exports = { execute };
