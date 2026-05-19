'use strict';

const path = require('path');
const fs = require('fs');

const MANUAL_DATA_PATH = path.resolve(__dirname, '../../logs/ads/ads-manual.json');

function loadManualData() {
  try {
    if (fs.existsSync(MANUAL_DATA_PATH)) {
      const raw = JSON.parse(fs.readFileSync(MANUAL_DATA_PATH, 'utf-8'));
      console.log('[ADS] Loaded manual data from ads-manual.json');
      return raw;
    }
  } catch (e) {
    console.error('[ADS] Failed to load manual data:', e.message);
  }
  return null;
}

function generateMockData() {
  const spend = Math.round((800 + Math.random() * 2000) * 100) / 100;
  const impressions = Math.round(50000 + Math.random() * 150000);
  const ctr = 0.015 + Math.random() * 0.04;
  const clicks = Math.round(impressions * ctr);
  const cvr = 0.02 + Math.random() * 0.06;
  const orders = Math.round(clicks * cvr);
  const avgOrderValue = 30 + Math.random() * 70;
  const gmv = Math.round(orders * avgOrderValue * 100) / 100;
  const roi = spend > 0 ? Math.round((gmv / spend) * 100) / 100 : 0;
  return {
    spend,
    roi,
    ctr: Math.round(ctr * 10000) / 10000,
    cvr: Math.round(cvr * 10000) / 10000,
    impressions,
    clicks,
    orders,
    gmv,
    source: 'mock',
    updatedAt: new Date().toISOString(),
  };
}

function fetchAdsData() {
  const manual = loadManualData();
  if (manual) {
    manual.updatedAt = manual.updatedAt || new Date().toISOString();
    manual.source = 'manual';
    return manual;
  }
  console.log('[ADS] No manual data found, using mock data');
  return generateMockData();
}

module.exports = { fetchAdsData, generateMockData, loadManualData };
