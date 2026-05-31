'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 数据目录（服务器真实路径）
 * 本地测试可通过 ctx.dataDir 覆盖
 */
const DATA_DIR = '/opt/wecom-openclaw/logs/doudian';

/**
 * 安全读取 JSON 文件
 * 文件不存在或解析失败时返回 null
 */
function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * 格式化金额：分 → 元，输出 ¥xxx
 */
function formatMoney(cents) {
  if (cents === null || cents === undefined || Number.isNaN(Number(cents))) return '数据暂缺';
  const yuan = Math.round(Number(cents) / 100);
  return `¥${yuan.toLocaleString()}`;
}

/**
 * 格式化毛利率
 */
function formatMargin(margin) {
  if (margin === null || margin === undefined || Number.isNaN(Number(margin))) return '数据暂缺';
  return `${Number(margin).toFixed(1)}%`;
}

/**
 * 读取运营数据，返回 { success, data, missing }
 * missing: 哪些文件缺失
 */
function loadOpsData(dataDir) {
  const dir = dataDir || DATA_DIR;
  const files = {
    orders: path.join(dir, 'orders_latest.json'),
    metrics: path.join(dir, 'fetch-metrics_latest.json'),
    risk: path.join(dir, 'check-risk_latest.json'),
    profit: path.join(dir, 'sku-profit_latest.json'),
  };

  const data = {};
  const missing = [];

  // orders_latest.json
  const orders = readJson(files.orders);
  if (orders && orders.metrics) {
    data.orders = orders.metrics;
  } else {
    missing.push('orders_latest.json');
  }

  // fetch-metrics_latest.json
  const metrics = readJson(files.metrics);
  if (metrics && metrics.compass && metrics.compass.metrics) {
    data.metrics = metrics.compass.metrics;
    data.summary = metrics.summary || {};
  } else {
    missing.push('fetch-metrics_latest.json');
  }

  // check-risk_latest.json
  const risk = readJson(files.risk);
  if (risk) {
    data.risk = risk;
  } else {
    missing.push('check-risk_latest.json');
  }

  // sku-profit_latest.json
  const profit = readJson(files.profit);
  if (profit && Array.isArray(profit.skus)) {
    data.profit = profit;
  } else {
    missing.push('sku-profit_latest.json');
  }

  return { success: missing.length === 0, data, missing };
}

/**
 * 生成运营摘要文本
 */
function buildSummary(data) {
  const lines = [];

  lines.push('📋 今日运营摘要');
  lines.push('');

  // GMV
  const gmv = data.orders && data.orders.settlementGMV !== undefined
    ? data.orders.settlementGMV
    : data.metrics && data.metrics.settlementGMV !== undefined
      ? data.metrics.settlementGMV
      : null;
  lines.push(`GMV：${formatMoney(gmv)}`);

  // 订单数
  const orders = data.orders && data.orders.payOrders !== undefined
    ? data.orders.payOrders
    : data.metrics && data.metrics.payOrders !== undefined
      ? data.metrics.payOrders
      : null;
  lines.push(`订单：${orders !== null ? `${orders} 单` : '数据暂缺'}`);

  // 风险等级
  const riskLevel = data.risk && data.risk.riskLevel
    ? data.risk.riskLevel
    : null;
  const riskMap = { low: '低', medium: '中', high: '高', critical: '极高' };
  lines.push(`风险：${riskLevel ? riskMap[riskLevel] || riskLevel : '数据暂缺'}`);

  // 利润（取第一个 SKU 的毛利作为示例，或计算总和）
  if (data.profit && data.profit.skus && data.profit.skus.length > 0) {
    const totalProfit = data.profit.skus.reduce((sum, sku) => sum + (sku.grossProfit || 0), 0);
    const avgMargin = data.profit.skus.length > 0
      ? data.profit.skus.reduce((sum, sku) => sum + (sku.margin || 0), 0) / data.profit.skus.length
      : null;
    lines.push(`利润：${formatMoney(totalProfit)}`);
    lines.push(`毛利率：${formatMargin(avgMargin)}`);
  } else {
    lines.push('利润：数据暂缺');
    lines.push('毛利率：数据暂缺');
  }

  // 建议
  lines.push('');
  lines.push('建议：');

  const suggestions = [];

  // 基于风险等级给建议
  if (riskLevel === 'high' || riskLevel === 'critical') {
    suggestions.push('风险等级较高，建议立即检查售后和投诉情况');
  }

  // 基于 GMV 给建议
  if (gmv === 0) {
    suggestions.push('GMV 为 0，建议检查店铺状态和商品上架情况');
  }

  // 基于体验分给建议
  const score = data.metrics && data.metrics.experienceScore;
  if (score && score < 70) {
    suggestions.push(`体验分 ${score}，低于 70 分将影响流量，建议优化售后服务`);
  }

  if (suggestions.length === 0) {
    suggestions.push('运营状态正常，继续保持');
    suggestions.push('建议定期查看数据趋势');
  }

  suggestions.forEach((s, i) => {
    lines.push(`${i + 1}. ${s}`);
  });

  return lines.join('\n');
}

/**
 * 命令入口
 * @param {Object} ctx - 上下文（可包含 mock, dataDir 等）
 */
async function execute(ctx) {
  const mock = ctx && ctx.mock;
  const dataDir = ctx && ctx.dataDir;

  if (mock) {
    return buildMockSummary();
  }

  const { success, data, missing } = loadOpsData(dataDir);

  if (!success) {
    // 部分数据缺失，但仍尝试生成摘要
    // 如果所有数据都缺失，返回 "数据暂缺"
    const hasAnyData = data.orders || data.metrics || data.risk || data.profit;
    if (!hasAnyData) {
      return '数据暂缺';
    }
  }

  return buildSummary(data);
}

/**
 * 模拟数据（用于测试）
 */
function buildMockSummary() {
  return [
    '📋 今日运营摘要',
    '',
    'GMV：¥1,234',
    '订单：12 单',
    '风险：低',
    '利润：¥240',
    '毛利率：36.4%',
    '',
    '建议：',
    '1. 运营状态正常，继续保持',
    '2. 建议定期查看数据趋势',
  ].join('\n');
}

module.exports = { execute, desc: '运营摘要' };
