'use strict';

const { fetchAdsData } = require('./fetch-ads-data');
const { normalize } = require('./normalize-ads-data');
const { saveReport } = require('./save-ads-report');
const cron = require('node-cron');

function runCollection() {
  console.log('[ADS] === Starting collection ===', new Date().toISOString());
  try {
    const raw = fetchAdsData();
    const normalized = normalize(raw);
    const reportPath = saveReport(normalized);
    console.log('[ADS] Collection done, report:', reportPath);
    return true;
  } catch (e) {
    console.error('[ADS] Collection FAILED:', e.message);
    return false;
  }
}

function startCron() {
  const task = cron.schedule('*/30 * * * *', () => {
    runCollection();
  });
  console.log('[ADS] Cron started: every 30 minutes');
  return task;
}

const args = process.argv.slice(2);
if (args.includes('--once') || args.includes('-1')) {
  const ok = runCollection();
  process.exit(ok ? 0 : 1);
} else if (args.includes('--daemon') || !args.length) {
  console.log('[ADS] ads-worker starting in daemon mode...');
  runCollection();
  startCron();
} else if (args.includes('--help') || args.includes('-h')) {
  console.log('ads-worker - ads data collection worker');
  console.log('');
  console.log('Usage:');
  console.log('  node index.js          daemon mode (cron every 30min)');
  console.log('  node index.js --once   single run then exit');
  console.log('  node index.js --help   show help');
}

module.exports = { runCollection, startCron };
