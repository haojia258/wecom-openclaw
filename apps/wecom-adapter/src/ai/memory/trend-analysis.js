'use strict';

function direction(values) {
  const arr = values.filter((v) => typeof v === 'number');
  if (arr.length < 3) return 'insufficient';
  const a = arr.slice(-3);
  if (a[0] < a[1] && a[1] < a[2]) return 'up';
  if (a[0] > a[1] && a[1] > a[2]) return 'down';
  return 'mixed';
}

function analyzeTrends(snapshots = []) {
  const gmvTrend = direction(snapshots.map((s) => s.gmv));
  const aftersaleTrend = direction(snapshots.map((s) => s.aftersaleRate));
  const roiTrend = direction(snapshots.map((s) => s.roi));
  const skuTrend = direction(snapshots.map((s) => s.skuMargin));
  const riskTrend = direction(snapshots.map((s) => s.riskLevel));

  const items = [];
  if (gmvTrend === 'down') items.push('最近3次 GMV连续下降');
  if (gmvTrend === 'up') items.push('最近3次 GMV连续上升');
  if (aftersaleTrend === 'up') items.push('售后率连续升高（恶化）');
  if (roiTrend === 'down') items.push('ROI连续恶化');
  if (skuTrend === 'down') items.push('SKU利润率连续下降');
  if (riskTrend === 'up') items.push('风险等级连续升高');

  return {
    gmvTrend,
    aftersaleTrend,
    roiTrend,
    skuTrend,
    riskTrend,
    summary: items.length ? items : ['趋势数据不足或波动不连续'],
  };
}

module.exports = { analyzeTrends };
