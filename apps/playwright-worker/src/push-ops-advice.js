#!/usr/bin/env node
/**
 * push-ops-advice.js
 * 读取所有数据源 → 生成企微 markdown → 推送 → 保存日志
 * 容错：某个 JSON 不存在时显示"暂无数据"，不报错退出
 *
 * 推送结果必须打印：
 *   - webhook host
 *   - HTTP status
 *   - 企业微信返回 body
 * 如果 errcode 非 0，脚本必须 exit 1
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { sendMarkdown } = require('./wecom-bot');

// 与 lib.js 保持一致，统一使用 DOUDIAN_OUTPUT_DIR
const { DOUDIAN_OUTPUT_DIR } = require('./lib');
const OPS_DIR = path.join(__dirname, '..', 'logs', 'ops');

// ——— 确保目录存在 ———
if (!fs.existsSync(DOUDIAN_OUTPUT_DIR)) fs.mkdirSync(DOUDIAN_OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(OPS_DIR))            fs.mkdirSync(OPS_DIR,            { recursive: true });

// ——— 安全读取 JSON ———
function safeLoadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.warn('[push-ops-advice] 读取失败:', filePath, e.message);
    return null;
  }
}

// ——— 加载所有数据源 ———
function loadAllData() {
  const doudian = DOUDIAN_OUTPUT_DIR;
  const files = {
    metrics:    path.join(doudian, 'fetch-metrics_latest.json'),
    aftersales: path.join(doudian, 'aftersales_latest.json'),
    orders:     path.join(doudian, 'orders_latest.json'),
    profit:     path.join(doudian, 'sku-profit_latest.json'),
    products:   path.join(doudian, 'check-products_latest.json'),
    activity:   path.join(doudian, 'check-activity_latest.json'),
    risk:       path.join(doudian, 'check-risk_latest.json'),
  };

  const data = {};
  const status = {};
  Object.entries(files).forEach(([key, fp]) => {
    data[key] = safeLoadJSON(fp);
    status[key] = data[key] ? 'ok' : 'missing';
    console.log(`[push-ops-advice] ${key}: ${status[key]} (${path.basename(fp)})`);
  });

  return { data, status, files };
}

// ——— 生成企微 Markdown 内容 ———
function buildMarkdown(data) {
  const { metrics, orders, aftersales, profit, products, activity, risk } = data;

  const lines = [];
  lines.push('# 抖店运营日报');
  lines.push('');

  // ——— 今日概况 ———
  lines.push('## 今日概况');
  const gmv       = metrics && metrics.summary ? (metrics.summary.todayGMV || 0) : '暂无数据';
  const orderCnt  = orders && orders.total ? orders.total : '暂无数据';
  const afterCnt  = aftersales && aftersales.total ? aftersales.total : '暂无数据';
  const riskLevel = risk && risk.risk ? (risk.risk.overallRisk || 'unknown') : '暂无数据';

  lines.push('- 订单数：' + (typeof orderCnt === 'number' ? orderCnt + ' 单' : orderCnt));
  lines.push('- 成交金额：' + (typeof gmv === 'number' ? '¥' + gmv : gmv));
  lines.push('- 售后单数：' + (typeof afterCnt === 'number' ? afterCnt + ' 单' : afterCnt));
  lines.push('- 高风险项：' + riskLevel);
  lines.push('');

  // ——— SKU 利润 ———
  lines.push('## SKU 利润');
  if (profit && profit.skus && profit.skus.length > 0) {
    profit.skus.forEach(sku => {
      const margin = sku.marginStr || (sku.margin !== undefined ? sku.margin + '%' : '未知');
      const cost   = sku.cost ? '¥' + sku.cost : '成本未知';
      lines.push('- ' + (sku.name || '未命名SKU') + '：毛利率 ' + margin + '，成本 ' + cost);
    });
  } else {
    lines.push('- 暂无数据');
  }
  lines.push('');

  // ——— 风险提醒 ———
  lines.push('## 风险提醒');

  // 商品状态
  let productIssues = '正常';
  if (products && products.issues && products.issues.length > 0) {
    const descs = products.issues.map(i => i.detail || i.type).join('；');
    productIssues = '⚠️ ' + descs;
  } else if (products && products.products) {
    const offShelf = products.products.filter(p => p.status === 'off-shelf' || p.status === 'sold-out');
    productIssues = offShelf.length > 0 ? '⚠️ ' + offShelf.length + ' 个商品下架/售罄' : '正常';
  }
  lines.push('- 商品状态：' + productIssues);

  // 活动状态
  let activityInfo = '暂无数据';
  if (activity && activity.activities && activity.activities.length > 0) {
    activityInfo = '可报名 ' + activity.activities.length + ' 个活动';
    if (activity.issues && activity.issues.length > 0) {
      activityInfo += '；⚠️ ' + activity.issues.map(i => i.detail).join('；');
    }
  } else if (activity && activity.issues && activity.issues.length > 0) {
    activityInfo = '⚠️ ' + activity.issues.map(i => i.detail).join('；');
  }
  lines.push('- 活动状态：' + activityInfo);

  // 售后状态
  let aftersalesInfo = '正常';
  if (aftersales && aftersales.total > 0) {
    aftersalesInfo = '⚠️ 售后/退款 ' + aftersales.total + ' 单';
    if (aftersales.refundAmount) aftersalesInfo += '，金额 ¥' + aftersales.refundAmount;
  }
  lines.push('- 售后状态：' + aftersalesInfo);

  // 店铺风险
  let riskInfo = '低';
  if (risk && risk.risk) {
    riskInfo = risk.risk.overallRisk || 'unknown';
    if (risk.risk.items && risk.risk.items.length > 0) {
      riskInfo += '（' + risk.risk.items.map(i => i.desc || i.type).join('；') + '）';
    }
  }
  lines.push('- 店铺风险：' + riskInfo);
  lines.push('');

  // ——— 今日建议 ———
  lines.push('## 今日建议');
  const suggestions = [];

  // 从 metrics 生成建议
  if (metrics && metrics.summary) {
    const s = metrics.summary;
    if (s.pendingShip > 0) suggestions.push('优先处理 ' + s.pendingShip + ' 个待发货订单');
    if (s.experienceScore > 0 && s.experienceScore < 70) suggestions.push('店铺体验分 ' + s.experienceScore + '，低于70分红线，需优化');
  }

  // 从 profit 生成建议
  if (profit && profit.analysis && profit.analysis.bestMargin) {
    suggestions.push('主推 ' + profit.analysis.bestMargin.name + '（毛利率最高）');
  }

  // 从 products 生成建议
  if (products && products.issues) {
    products.issues.forEach(iss => {
      if (iss.type === 'stock-low' || iss.type === 'stock_low') {
        suggestions.push('补充库存：' + (iss.detail || ''));
      }
    });
  }

  // 从 activity 生成建议
  if (activity && activity.activities && activity.activities.length > 0) {
    activity.activities.slice(0, 2).forEach(a => {
      suggestions.push('考虑报名活动：' + a.name);
    });
  }

  // 默认建议
  if (suggestions.length === 0) {
    suggestions.push('检查今日订单状态，及时发货');
    suggestions.push('关注商品评价，及时回复差评');
    suggestions.push('确认补货计划');
  }

  suggestions.forEach((s, i) => lines.push((i + 1) + '. ' + s));
  lines.push('');

  // ——— 数据生成时间 ———
  lines.push('> 数据生成时间：' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

  return lines.join('\n');
}

// ——— 主流程 ———
async function main() {
  console.log('[push-ops-advice] 开始...');
  const startTime = Date.now();

  const { data, status } = loadAllData();
  const markdown = buildMarkdown(data);
  const now = new Date().toISOString().replace(/[:.]/g, '-');

  // 保存 markdown
  const mdPath = path.join(OPS_DIR, 'ops_advice_latest.md');
  fs.writeFileSync(mdPath, markdown, 'utf-8');
  console.log('[push-ops-advice] markdown 已保存:', mdPath);

  // 保存 JSON（含完整数据和元数据）
  const output = {
    type: 'ops-advice-push',
    timestamp: new Date().toISOString(),
    dataStatus: status,
    markdownFile: mdPath,
    dataSource: {
      metrics:    status.metrics    === 'ok' ? 'metrics_latest.json'    : 'missing',
      orders:     status.orders     === 'ok' ? 'orders_latest.json'     : 'missing',
      aftersales: status.aftersales === 'ok' ? 'aftersales_latest.json' : 'missing',
      profit:     status.profit     === 'ok' ? 'sku-profit_latest.json' : 'missing',
      products:   status.products   === 'ok' ? 'check-products_latest.json' : 'missing',
      activity:   status.activity   === 'ok' ? 'check-activity_latest.json' : 'missing',
      risk:       status.risk       === 'ok' ? 'check-risk_latest.json'     : 'missing',
    }
  };
  const jsonPath = path.join(OPS_DIR, 'ops_advice_latest.json');
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log('[push-ops-advice] JSON 已保存:', jsonPath);

  // 推送到企微
  console.log('[push-ops-advice] 开始推送企微机器人...');
  const result = await sendMarkdown(markdown);

  // 必须打印的诊断信息
  console.log(`[push-ops-advice] webhookHost: ${result.webhookHost || 'N/A'}`);
  console.log(`[push-ops-advice] httpStatus:  ${result.httpStatus || 'N/A'}`);
  console.log(`[push-ops-advice] responseBody: ${result.responseBody || result.error || 'N/A'}`);

  if (result.success) {
    console.log('[push-ops-advice] ✅ 推送成功（attempt=' + result.attempt + '）');
    console.log('[push-ops-advice] errcode=' + result.errcode + ' errmsg=' + result.errmsg);
  } else if (result.skipped) {
    console.log('[push-ops-advice] ⚠️ 推送跳过（webhook 未配置），内容已保存到文件');
  } else {
    console.error('[push-ops-advice] ❌ 推送失败（已重试 ' + (result.retries || 0) + ' 次）');
    console.error('[push-ops-advice] 错误:', result.error);
  }

  // errcode 非 0 必须 exit 1
  if (result.errcode !== undefined && result.errcode !== 0) {
    console.error(`[push-ops-advice] errcode=${result.errcode} 非 0，脚本退出码 1`);
    process.exit(1);
  }

  console.log('[push-ops-advice] 完成，耗时', Date.now() - startTime, 'ms');
  return { result, markdown, mdPath, jsonPath };
}

main().catch(err => {
  console.error('[push-ops-advice] 致命错误:', err.message);
  // 写错误日志
  const errLog = path.join(OPS_DIR, 'push_error.log');
  fs.appendFileSync(errLog, new Date().toISOString() + ' FATAL: ' + err.message + '\n' + err.stack + '\n\n');
  process.exit(1);
});
