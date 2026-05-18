#!/usr/bin/env node
/**
 * generate-ops-advice.js v2
 * 运营建议生成器 — 整合所有 5 个 MVP 模块 + 订单/售后数据
 * 读取: metrics + orders + aftersales + SKU profit + products + activity + risk
 * 输出: issues / opportunities / suggestedActions / riskAlerts / tomorrowFocus
 */

const { log, outputJSON, now, today, getSubDir, DOUDIAN_OUTPUT_DIR,
        writeDoudianJSON
      } = require('./lib');
const path = require('path');
const fs = require('fs');

// ———— 加载 logs/output/ 下时间戳文件 ———
function loadOutputJSON(prefix) {
  const dir = getSubDir('output');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .sort().reverse();
  if (files.length === 0) return null;
  return JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf-8'));
}

// ———— 加载 logs/doudian/ 下 *_latest.json ———
function loadDoudianJSON(prefix) {
  const dir = DOUDIAN_OUTPUT_DIR;
  if (!fs.existsSync(dir)) return null;
  const file = path.join(dir, prefix + '_latest.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

// ———— 优先 output/，兜底 doudian/ ———
function loadAny(outputPrefix, doudianPrefix) {
  let data = loadOutputJSON(outputPrefix);
  if (data) return { data: data, source: 'output/' + outputPrefix + '_*.json' };
  if (doudianPrefix) {
    data = loadDoudianJSON(doudianPrefix);
    if (data) return { data: data, source: 'doudian/' + doudianPrefix + '_latest.json' };
  }
  return { data: null, source: 'not_found' };
}

// ———— 核心：生成建议 ———
function generateAdvice(data) {
  const { metrics, orders, aftersales, profit, products, activity, risk } = data;
  const advice = {
    todayIssues: [],
    opportunities: [],
    suggestedActions: [],
    riskAlerts: [],
    tomorrowFocus: [],
  };

  // 1. metrics 分析
  if (metrics && metrics.summary) {
    const s = metrics.summary;
    const todayGMV = s.todayGMV || 0;
    const yesterdayGMV = s.yesterdayGMV || 0;
    const experienceScore = s.experienceScore || 0;
    const visitorCount = s.visitorCount || s.totalTraffic || 0;
    const payOrders = s.payOrders || 0;
    const pendingShip = s.pendingShip || 0;

    if (todayGMV === 0 && payOrders === 0) {
      advice.todayIssues.push('今日GMV为0，请检查是否有订单或数据延迟');
    } else if (yesterdayGMV > 0 && todayGMV < yesterdayGMV * 0.5) {
      advice.todayIssues.push('今日GMV(¥' + todayGMV + ')低于昨日(¥' + yesterdayGMV + ')50%，需关注');
    } else if (yesterdayGMV > 0) {
      const chg = ((todayGMV - yesterdayGMV) / yesterdayGMV * 100).toFixed(1);
      advice.opportunities.push('今日GMV=¥' + todayGMV + '，昨日=¥' + yesterdayGMV + '，变化' + chg + '%');
    }

    if (experienceScore > 0 && experienceScore < 70) {
      advice.todayIssues.push('店铺体验分' + experienceScore + '，低于70分红线，需优化发货/售后');
    } else if (experienceScore >= 70) {
      advice.opportunities.push('店铺体验分' + experienceScore + '，处于健康水平');
    }

    if (visitorCount > 0 && todayGMV === 0) {
      advice.todayIssues.push('有' + visitorCount + '访客但0成交，检查商品页面和价格');
    }
    if (pendingShip > 0) {
      advice.todayIssues.push(pendingShip + '个订单待发货，请及时处理');
      advice.suggestedActions.push('优先处理' + pendingShip + '个待发货订单');
    }
  }

  // 2. orders 分析
  if (orders && orders.total > 0) {
    advice.opportunities.push('近期订单总数: ' + orders.total);
  }

  // 3. aftersales 分析
  if (aftersales && aftersales.total > 0) {
    advice.riskAlerts.push('售后/退款数: ' + aftersales.total + '，需关注退款原因');
    advice.suggestedActions.push('检查售后订单，优化商品描述减少退款');
  }

  // 4. SKU profit 分析
  if (profit && profit.skus) {
    const best = profit.analysis ? profit.analysis.bestMargin : null;
    if (best) {
      advice.suggestedActions.push('主推' + best.name + '（毛利率最高 ' + best.margin + '）');
    }
    profit.skus.forEach(function(sku) {
      if (sku.margin < 20) {
        advice.todayIssues.push(sku.name + ' 毛利率仅' + sku.marginStr + '，低于20%警戒线');
      }
    });
  }

  // 5. products 分析
  if (products && products.issues) {
    products.issues.forEach(function(issue) {
      if (issue.type === 'off-shelf' || issue.type === 'off-shelf') {
        advice.riskAlerts.push('商品下架: ' + issue.detail);
      }
      if (issue.type === 'stock-low' || issue.type === 'stock_low') {
        advice.todayIssues.push('库存不足: ' + issue.detail);
        advice.suggestedActions.push('补充库存: ' + issue.detail);
      }
      if (issue.type === 'violation') {
        advice.riskAlerts.push('违规提醒: ' + issue.detail);
      }
    });
  }
  // 也兼容 products.issues[] 中的 { type: 'off-shelf', severity, detail }
  if (products && products.products) {
    products.products.forEach(function(p) {
      if (p.status === 'sold-out' || p.status === 'off-shelf') {
        advice.riskAlerts.push('商品已下架: ' + p.name);
      }
    });
  }

  // 6. activity 分析
  if (activity && activity.activities) {
    advice.opportunities.push('可报名活动: ' + activity.activities.length + '个');
    activity.activities.slice(0, 3).forEach(function(a) {
      advice.suggestedActions.push('考虑报名: ' + a.name);
    });
  }
  if (activity && activity.issues) {
    activity.issues.forEach(function(iss) {
      if (iss.type === 'deadline') {
        advice.riskAlerts.push('活动截止提醒: ' + iss.detail);
      }
    });
  }

  // 7. risk 分析
  if (risk && risk.risk) {
    if (risk.risk.overallRisk && risk.risk.overallRisk !== 'low' && risk.risk.overallRisk !== 'unknown') {
      advice.riskAlerts.push('店铺风险等级: ' + risk.risk.overallRisk);
    }
  }

  // 默认建议
  if (advice.suggestedActions.length === 0) {
    advice.suggestedActions.push('检查今日订单状态，及时发货');
    advice.suggestedActions.push('关注商品评价，及时回复差评');
  }
  if (advice.tomorrowFocus.length === 0) {
    advice.tomorrowFocus.push('确认补货计划');
    advice.tomorrowFocus.push('检查是否有新活动可报名');
    advice.tomorrowFocus.push('复盘今日GMV表现');
  }

  return advice;
}

// ———— Main ———
function main() {
  log('ops-advice', 'INFO', 'Generating operations advice...');
  const startTime = Date.now();

  // 加载所有数据源
  const m  = loadAny('fetch-metrics', 'fetch-metrics');
  const o  = loadAny('orders', 'orders');
  const a  = loadAny('aftersales', 'aftersales');
  const p  = loadAny('sku-profit', 'sku-profit');
  const pr = loadAny('check-products', 'check-products');
  const ac = loadAny('check-activity', 'check-activity');
  const r  = loadAny('check-risk', 'check-risk');

  const data = {
    metrics: m.data,
    orders: o.data,
    aftersales: a.data,
    profit: p.data,
    products: pr.data,
    activity: ac.data,
    risk: r.data,
  };

  const advice = generateAdvice(data);

  const output = {
    type: 'ops-advice',
    timestamp: now(),
    date: today(),
    duration_ms: Date.now() - startTime,
    dataSource: {
      metrics: m.source,
      orders: o.source,
      aftersales: a.source,
      profit: p.source,
      products: pr.source,
      activity: ac.source,
      risk: r.source,
    },
    ...advice,
  };

  outputJSON('ops-advice', output);
  writeDoudianJSON('ops-advice', output);
  log('ops-advice', 'OK', 'Done in ' + (Date.now() - startTime) + 'ms');
  console.log(JSON.stringify(output, null, 2));
}

main();
