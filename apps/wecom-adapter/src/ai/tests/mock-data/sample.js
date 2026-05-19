'use strict';

module.exports = {
  healthy: {
    gmv: { ratio: 0.95 },
    orders: { count: 320 },
    aftersale: { rate: 0.06 },
    skuProfit: { avgMargin: 0.22 },
    activity: { roi: 2.1 },
    risk: { level: 0.3 },
  },
  risky: {
    gmv: { ratio: 0.5 },
    orders: { count: 160 },
    aftersale: { rate: 0.18 },
    skuProfit: { avgMargin: 0.1 },
    activity: { roi: 1.1 },
    risk: { level: 0.85 },
  },
};
