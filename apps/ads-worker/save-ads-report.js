'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../logs/ads');
const REPORT_PATH = path.join(DATA_DIR, 'ads-report_latest.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('[ADS] Created directory:', DATA_DIR);
  }
}

function saveReport(data) {
  ensureDir();
  const report = {
    data: {
      spend: data.spend,
      roi: data.roi,
      ctr: data.ctr,
      cvr: data.cvr,
      impressions: data.impressions,
      clicks: data.clicks,
      orders: data.orders,
      gmv: data.gmv,
    },
    source: data.source || 'unknown',
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
  console.log('[ADS] Report saved:', REPORT_PATH);
  return REPORT_PATH;
}

function loadLatestReport() {
  try {
    if (fs.existsSync(REPORT_PATH)) {
      return JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('[ADS] Failed to load report:', e.message);
  }
  return null;
}

module.exports = { saveReport, loadLatestReport, REPORT_PATH };
