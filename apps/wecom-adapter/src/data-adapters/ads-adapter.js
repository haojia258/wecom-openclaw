'use strict';

const { normalizeCommon } = require('./normalize-utils');

function normalizeAdsJson(raw = {}) {
  const map = {
    spend: ['spend', 'cost', 'metrics.spend', 'metrics.cost'],
    roi: ['roi', 'metrics.roi', 'performance.roi'],
    ctr: ['ctr', 'metrics.ctr', 'performance.ctr'],
    cvr: ['cvr', 'metrics.cvr', 'performance.cvr'],
    impressions: ['impressions', 'metrics.impressions'],
    clicks: ['clicks', 'metrics.clicks'],
    orders: ['orders', 'metrics.orders', 'conversion.orders'],
    gmv: ['gmv', 'metrics.gmv', 'conversion.gmv'],
    updatedAt: ['updatedAt', 'updated_at', 'timestamp', 'meta.updatedAt'],
    source: ['source'],
  };

  return normalizeCommon(raw, 'ads', map);
}

module.exports = {
  normalizeAdsJson,
};
