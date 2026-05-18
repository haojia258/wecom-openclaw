'use strict';

/**
 * /利润 命令
 * v1.0 - 读取 SKU 利润数据，展示利润率和主推建议
 */

const fs = require('fs');
const config = require('../lib/config');

async function execute(ctx) {
  const lines = ['📈 商品利润分析'];
  lines.push('');

  let data = null;
  try {
    const raw = fs.readFileSync(config.SKU_PROFIT_FILE, 'utf8');
    data = JSON.parse(raw);
    const mtime = fs.statSync(config.SKU_PROFIT_FILE).mtime;
    lines.push('【数据时间】');
    lines.push(mtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
    lines.push('');
  } catch (e) {
    lines.push('⚠️ SKU 利润数据缺失');
    lines.push('（文件: ' + config.SKU_PROFIT_FILE + '）');
    return lines.join('\n');
  }

  if (!data.skus || data.skus.length === 0) {
    lines.push('暂无 SKU 利润数据');
    return lines.join('\n');
  }

  // SKU 利润对比
  lines.push('【SKU 利润对比】');
  const sorted = data.skus.slice().sort(function(a, b) { return b.margin - a.margin; });
  for (const sku of sorted) {
    const icon = sku.name === (data.analysis && data.analysis.recommended) ? '⭐' : '  ';
    lines.push(icon + sku.name + ': 售价¥' + sku.sellingPrice + ' | 毛利¥' + sku.grossProfit + ' | 毛利率' + sku.marginStr);
  }
  lines.push('');

  // 主推建议
  if (data.analysis) {
    lines.push('【主推建议】');
    lines.push('推荐: ' + data.analysis.recommended);
    lines.push('理由: ' + data.analysis.reason);
    lines.push('');
  }

  // 低价提醒
  const lowMargin = data.skus.filter(function(s) { return s.margin < 20; });
  if (lowMargin.length > 0) {
    lines.push('⚠️ 以下 SKU 毛利率偏低（<20%），建议关注：');
    for (const s of lowMargin) {
      lines.push('  - ' + s.name + ': ' + s.marginStr);
    }
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = { execute, desc: '利润分析' };
