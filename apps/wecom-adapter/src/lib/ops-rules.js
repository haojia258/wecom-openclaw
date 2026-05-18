'use strict';

/**
 * ops-rules.js - 本地运营规则引擎
 * v1.0 - 保守、可解释，数据缺失不编造
 * GPT 作为增强层，不可用时本地规则完整返回
 */

const config = require('./config');
const rules = require('../config/rules');

// 安全读取 JSON
function readJson(filePath) {
  try {
    const fs = require('fs');
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

// 主函数：对所有数据执行本地规则分析
function analyze(data) {
  const result = {
    summary: '',
    risks: [],
    skuAdvice: '',
    activityAdvice: '',
    inventoryAdvice: '',
    priorityAction: '',
  };

  const compass = data.compass;
  const orders = data.orders;
  const aftersales = data.aftersales;
  const skuProfit = data.skuProfit;
  const report = data.report;

  // ─── 1. GMV 判断 ──────────────────────────
  let gmv = null;
  if (compass) {
    if (compass['近1天'] && compass['近1天']['结算金额'] !== undefined) {
      gmv = compass['近1天']['结算金额'];
    } else if (compass.summary && compass.summary.todayGMV !== undefined) {
      gmv = compass.summary.todayGMV;
    }
  }
  if (report && report.summary && report.summary.totalGMV !== undefined) {
    gmv = gmv || report.summary.totalGMV;
  }

  if (gmv === 0 && rules.GMV_ZERO_ALERT) {
    result.risks.push('今日 GMV 为 0，检查商品是否在线、推广是否暂停');
  } else if (gmv === null) {
    result.risks.push('GMV 数据缺失，无法判断');
  } else if (gmv < rules.GMV_LOW_THRESHOLD) {
    result.risks.push('今日 GMV 偏低（¥' + gmv + '），建议关注流量和转化');
  }

  // ─── 2. 订单判断 ──────────────────────────
  let orderCount = null;
  if (orders && orders.total !== undefined) {
    orderCount = orders.total;
  }
  if (report && report.summary && report.summary.totalOrders !== undefined) {
    orderCount = orderCount || report.summary.totalOrders;
  }

  if (orderCount === 0 && rules.ORDER_ZERO_ALERT) {
    result.risks.push('今日暂无新订单，建议检查流量和商品曝光');
  } else if (orderCount === null) {
    result.risks.push('订单数数据缺失，无法判断');
  }

  // 待发货
  let pendingShip = 0;
  if (report && report.summary && report.summary.pendingShip !== undefined) {
    pendingShip = report.summary.pendingShip;
  } else if (orders && orders.orders) {
    pendingShip = orders.orders.filter(function(o) {
      return (o.order_status || '').includes('待发货');
    }).length;
  }
  if (pendingShip > 0 && rules.PENDING_SHIP_ALERT) {
    result.risks.push('有 ' + pendingShip + ' 笔待发货订单，优先处理避免超时');
  }

  // ─── 3. 售后/退款风险 ─────────────────────
  let refundRate = null;
  let refundCount = 0;
  if (report && report.summary) {
    refundCount = report.summary.totalRefunds || 0;
    if (report.summary.refundRate) {
      refundRate = parseFloat(report.summary.refundRate.replace('%', '')) / 100;
    }
  }
  if (aftersales && aftersales.total !== undefined) {
    refundCount = aftersales.total;
  }

  if (refundRate !== null) {
    if (refundRate > rules.REFUND_RATE_HIGH) {
      result.risks.push('🔴 退款率过高（' + (refundRate * 100).toFixed(1) + '%），建议排查商品质量和描述');
    } else if (refundRate > rules.REFUND_RATE_MEDIUM) {
      result.risks.push('🟡 退款率偏高（' + (refundRate * 100).toFixed(1) + '%），关注最近退款原因');
    }
  } else if (refundCount > 0) {
    result.risks.push('售后/退款数: ' + refundCount + '，需关注退款原因（GMV/订单数据缺失，退款率未计算）');
  } else if (refundCount === 0 && aftersales !== null) {
    // 有售后文件但退款数为0，不提示
  } else {
    result.risks.push('售后/退款数据缺失，无法判断');
  }

  // ─── 4. 体验分风险 ───────────────────────
  let expScore = null;
  if (compass) {
    if (compass['近1天'] && compass['近1天']['体验分'] !== undefined) {
      expScore = compass['近1天']['体验分'];
    } else if (compass.summary && compass.summary.experienceScore !== undefined) {
      expScore = compass.summary.experienceScore;
    }
  }

  if (expScore !== null && expScore > 0) {
    if (expScore < rules.EXPERIENCE_SCORE_CRITICAL) {
      result.risks.push('🔴 体验分严重偏低（' + expScore + '），可能导致流量降权！');
    } else if (expScore < rules.EXPERIENCE_SCORE_LOW) {
      result.risks.push('🟡 体验分偏低（' + expScore + '），重点关注物流时效和售后响应');
    }
  } else {
    result.risks.push('体验分数据缺失，无法判断');
  }

  // ─── 5. SKU 利润建议 ─────────────────────
  if (skuProfit && skuProfit.analysis && skuProfit.analysis.recommended) {
    result.skuAdvice = '主推 SKU: ' + skuProfit.analysis.recommended;
    if (skuProfit.analysis.reason) {
      result.skuAdvice += '（' + skuProfit.analysis.reason + '）';
    }
  } else if (skuProfit && skuProfit.skus && skuProfit.skus.length > 0) {
    const best = skuProfit.skus.slice().sort(function(a, b) { return b.margin - a.margin; })[0];
    result.skuAdvice = '主推 SKU: ' + best.name + '（毛利率最高 ' + best.marginStr + '）';
  } else {
    result.skuAdvice = 'SKU 利润数据缺失，无法给出建议';
  }

  // ─── 6. 活动建议 ─────────────────────────
  if (gmv !== null && gmv > rules.ACTIVITY_SUGGEST_GMV) {
    result.activityAdvice = 'GMV 较高（¥' + gmv + '），建议关注平台活动并报名';
  } else if (orderCount !== null && orderCount > rules.ACTIVITY_SUGGEST_ORDERS) {
    result.activityAdvice = '订单量较高（' + orderCount + ' 笔），建议关注平台活动并报名';
  } else if (gmv === null && orderCount === null) {
    result.activityAdvice = 'GMV/订单数据缺失，无法判断是否建议参加活动';
  } else {
    result.activityAdvice = '当前 GMV 和订单量偏低，暂不建议参加活动，先优化转化';
  }

  // ─── 7. 补货建议（预留，当前无库存数据）───
  result.inventoryAdvice = '补货建议：暂无库存数据，暂不判断（后续接入库存数据后可启用）';

  // ─── 8. 今日最优先动作 ─────────────────
  // 风险按优先级排序：体验分严重 > 退款率高 > 体验分偏低 > 待发货 > GMV=0 > 订单=0
  const priority = [];
  for (const r of result.risks) {
    if (r.includes('严重偏低') || r.includes('流量降权')) {
      priority.unshift(r);  // 最高优先级，放最前
    } else if (r.includes('过高')) {
      priority.unshift(r);
    } else {
      priority.push(r);
    }
  }
  if (priority.length > 0) {
    result.priorityAction = priority[0];
  } else {
    result.priorityAction = '暂无高风险，维持日常运营';
  }

  // ─── 9. 今日运营摘要 ─────────────────────
  const parts = [];
  if (gmv !== null) {
    parts.push('GMV: ¥' + gmv);
  } else {
    parts.push('GMV: 数据缺失');
  }
  if (orderCount !== null) {
    parts.push('订单: ' + orderCount + ' 笔');
  } else {
    parts.push('订单: 数据缺失');
  }
  result.summary = '今日运营概况：' + parts.join(' | ');

  return result;
}

// 读取所有数据并分析（给 command 用）
function analyzeFromDisk() {
  const data = {
    compass:    readJson(config.COMPASS_FILE),
    orders:     readJson(config.ORDERS_FILE),
    aftersales: readJson(config.AFTERSALES_FILE),
    skuProfit:  readJson(config.SKU_PROFIT_FILE),
    report:     readJson(config.SYNC_REPORT_FILE),
  };
  return analyze(data);
}

module.exports = { analyze, analyzeFromDisk };
