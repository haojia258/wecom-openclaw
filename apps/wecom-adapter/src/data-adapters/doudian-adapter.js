'use strict';

const { normalizeCommon } = require('./normalize-utils');

function normalizeDoudianJson(raw = {}) {
  const map = {
    spend: ['adCost', 'cost', 'data.adCost'],
    roi: ['payRoi', 'roi', 'data.payRoi'],
    ctr: ['clickRate', 'ctr', 'data.clickRate'],
    cvr: ['payConvRate', 'cvr', 'data.payConvRate'],
    impressions: ['showCnt', 'impressions', 'data.showCnt'],
    clicks: ['clickCnt', 'clicks', 'data.clickCnt'],
    orders: ['payOrderCnt', 'orders', 'data.payOrderCnt'],
    gmv: ['payGmv', 'gmv', 'data.payGmv'],
    updatedAt: ['updateTime', 'updatedAt', 'data.updateTime'],
    source: ['source'],
  };

  return normalizeCommon(raw, 'doudian', map);
}

module.exports = {
  normalizeDoudianJson,
};
