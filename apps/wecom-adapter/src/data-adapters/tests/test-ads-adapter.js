'use strict';

const assert = require('assert');
const { normalizeAdsJson } = require('../ads-adapter');
const { normalizeDoudianJson } = require('../doudian-adapter');

const ads = normalizeAdsJson({
  metrics: { spend: '123.4', roi: '1.8', ctr: '0.032', cvr: '0.015', impressions: '10000', clicks: '320', orders: '48', gmv: '2200' },
  timestamp: '2026-05-19T00:00:00.000Z',
});
assert.strictEqual(ads.source, 'ads');
assert.strictEqual(ads.spend, 123.4);
assert.strictEqual(ads.orders, 48);
assert.strictEqual(ads.missingFields.includes('source'), true);

const doudian = normalizeDoudianJson({
  data: { adCost: 88, payRoi: 2.1, clickRate: 0.04, payConvRate: 0.02, showCnt: 5000, clickCnt: 200, payOrderCnt: 35, payGmv: 4600, updateTime: '2026-05-19 10:00:00' },
});
assert.strictEqual(doudian.source, 'doudian');
assert.strictEqual(doudian.gmv, 4600);
assert.strictEqual(Array.isArray(doudian.missingFields), true);

const partial = normalizeAdsJson({ clicks: 10 });
assert.strictEqual(partial.clicks, 10);
assert(partial.missingFields.includes('spend'));

console.log('test-ads-adapter passed');
