'use strict';

const { appendSnapshot } = require('./memory-store');

function toNumber(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function createSnapshot(input = {}, scores = {}) {
  return {
    ts: new Date().toISOString(),
    gmv: toNumber(input?.gmv?.value ?? input?.gmv, null),
    orders: toNumber(input?.orders?.count ?? input?.orders, null),
    aftersaleRate: toNumber(input?.aftersale?.rate, null),
    roi: toNumber(input?.activity?.roi, null),
    skuMargin: toNumber(input?.skuProfit?.avgMargin, null),
    riskLevel: toNumber(input?.risk?.level, null),
    totalScore: toNumber(scores?.totalScore?.score, null),
  };
}

function persistSnapshot(input, scores, options = {}) {
  const snapshot = createSnapshot(input, scores);
  return appendSnapshot(snapshot, options);
}

module.exports = {
  createSnapshot,
  persistSnapshot,
};
