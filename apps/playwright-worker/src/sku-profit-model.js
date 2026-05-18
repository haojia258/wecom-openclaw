#!/usr/bin/env node
/**
 * sku-profit-model.js v2
 * SKU 利润计算模型（纯计算，无需浏览器）
 *
 * 已知成本:
 *   - 桶成本: 2.5 元/桶
 *   - 每箱 6 桶
 *   - 运费: 6 元/箱
 *   - 6 桶装售价: 33 元（基准）
 *
 * 用法:
 *   node src/sku-profit-model.js
 *   COST_PER_BUCKET=2.5 BUCKETS_PER_BOX=6 SHIPPING_PER_BOX=6 \
 *     PRICE_6=33 PRICE_12=58 PRICE_18=79 node src/sku-profit-model.js
 */

const { writeDoudianJSON, log, now, today } = require('./lib');

// === 配置（可通过环境变量覆盖）===
const COST_PER_BUCKET = parseFloat(process.env.COST_PER_BUCKET) || 2.5;
const BUCKETS_PER_BOX = parseInt(process.env.BUCKETS_PER_BOX, 10) || 6;
const SHIPPING_PER_BOX = parseFloat(process.env.SHIPPING_PER_BOX) || 6;

const PRICE_6 = parseFloat(process.env.PRICE_6) || 33;
const PRICE_12 = parseFloat(process.env.PRICE_12) || 58;
const PRICE_18 = parseFloat(process.env.PRICE_18) || 79;

function calcSKU(name, bucketCount, sellingPrice) {
  const boxes = Math.ceil(bucketCount / BUCKETS_PER_BOX);
  const totalCost = bucketCount * COST_PER_BUCKET;
  const totalShipping = boxes * SHIPPING_PER_BOX;
  const revenue = sellingPrice;
  const grossProfit = revenue - totalCost - totalShipping;
  const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  return {
    name,
    bucketCount,
    boxes,
    sellingPrice: revenue,
    cost: round2(totalCost),
    shipping: round2(totalShipping),
    grossProfit: round2(grossProfit),
    margin: round2(margin),
    marginStr: `${margin.toFixed(1)}%`,
  };
}

function round2(v) { return Math.round(v * 100) / 100; }

function main() {
  log('sku-profit', 'INFO', '=== sku-profit-model v2 启动 ===');
  const startTime = Date.now();

  const skus = [
    calcSKU('6-pack', 6, PRICE_6),
    calcSKU('12-pack', 12, PRICE_12),
    calcSKU('18-pack', 18, PRICE_18),
  ];

  // 按毛利率排序
  const byMargin = [...skus].sort((a, b) => b.margin - a.margin);
  const bestMargin = byMargin[0];

  // 按毛利额排序
  const byProfit = [...skus].sort((a, b) => b.grossProfit - a.grossProfit);
  const bestProfit = byProfit[0];

  // 性价比分析：对比单桶成本
  const perBucket = skus.map(s => ({
    name: s.name,
    pricePerBucket: round2(s.sellingPrice / s.bucketCount),
    margin: s.marginStr,
  }));

  const output = {
    type: 'sku-profit-model',
    version: 2,
    timestamp: now(),
    date: today(),
    duration_ms: Date.now() - startTime,
    config: {
      costPerBucket: COST_PER_BUCKET,
      bucketsPerBox: BUCKETS_PER_BOX,
      shippingPerBox: SHIPPING_PER_BOX,
    },
    skus,
    analysis: {
      bestMargin: { name: bestMargin.name, margin: bestMargin.marginStr },
      bestProfit: { name: bestProfit.name, profit: bestProfit.grossProfit },
      recommended: bestMargin.name,
      reason: `${bestMargin.name} 毛利率最高 (${bestMargin.marginStr})，建议主推`,
    },
    perBucketPrice: perBucket,
    pricingStrategy: {
      '6-pack': { current: PRICE_6, suggested: 33, note: '引流款， competitive entry price' },
      '12-pack': { current: PRICE_12, suggested: 58, note: ` vs 2x6-pack=${PRICE_6 * 2}，折扣约 ${((1 - PRICE_12 / (PRICE_6 * 2)) * 100).toFixed(0)}%` },
      '18-pack': { current: PRICE_18, suggested: 79, note: ` vs 3x6-pack=${PRICE_6 * 3}，折扣约 ${((1 - PRICE_18 / (PRICE_6 * 3)) * 100).toFixed(0)}%` },
    },
  };

  writeDoudianJSON('sku-profit', output);

  // 控制台报告
  console.log('\n========== SKU 利润模型 v2 ==========');
  console.log(`成本/桶: ¥${COST_PER_BUCKET} | 运费/箱: ¥${SHIPPING_PER_BOX} (${BUCKETS_PER_BOX}桶/箱)`);
  console.log('');
  skus.forEach(s => {
    console.log(`${s.name}: 售价¥${s.sellingPrice} | 成本¥${s.cost}+运费¥${s.shipping} | 毛利¥${s.grossProfit} (${s.marginStr})`);
  });
  console.log('');
  console.log(`推荐主推: ${output.analysis.recommended} (${output.analysis.reason})`);
  console.log('======================================\n');

  log('sku-profit', 'OK', `v2 完成，耗时 ${Date.now() - startTime}ms`);
}

main();
