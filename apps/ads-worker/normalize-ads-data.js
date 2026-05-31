'use strict';

const REQUIRED_FIELDS = ['spend', 'roi', 'ctr', 'cvr', 'impressions', 'clicks', 'orders', 'gmv'];

function validate(data) {
  if (!data || typeof data !== 'object') return false;
  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null) return false;
  }
  return true;
}

function normalize(raw) {
  const data = raw.data || raw;
  return {
    spend: Number(data.spend) || 0,
    roi: Number(data.roi) || 0,
    ctr: Number(data.ctr) || 0,
    cvr: Number(data.cvr) || 0,
    impressions: Number(data.impressions) || 0,
    clicks: Number(data.clicks) || 0,
    orders: Number(data.orders) || 0,
    gmv: Number(data.gmv) || 0,
    updatedAt: data.updatedAt || new Date().toISOString(),
    source: data.source || 'unknown',
  };
}

module.exports = { normalize, validate, REQUIRED_FIELDS };
