'use strict';

const { fetchAdsData, generateMockData } = require('./fetch-ads-data');
const { normalize, validate } = require('./normalize-ads-data');
const { saveReport, loadLatestReport } = require('./save-ads-report');

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    console.log('  + ' + name);
    passed++;
  } else {
    console.log('  x ' + name);
    failed++;
  }
}

console.log('=== ads-worker tests ===\n');

console.log('1. Mock data generation:');
const mock = generateMockData();
assert('has spend', mock.spend > 0);
assert('has roi', mock.roi >= 0);
assert('has ctr', mock.ctr > 0 && mock.ctr < 1);
assert('has cvr', mock.cvr > 0 && mock.cvr < 1);
assert('has impressions', mock.impressions > 0);
assert('has clicks', mock.clicks > 0);
assert('has orders', mock.orders > 0);
assert('has gmv', mock.gmv > 0);
assert('has updatedAt', !!mock.updatedAt);
assert('source is mock', mock.source === 'mock');

console.log('\n2. Normalize:');
const norm = normalize(mock);
assert('spend is number', typeof norm.spend === 'number');
assert('all required fields present', validate(norm));
assert('updatedAt is string', typeof norm.updatedAt === 'string');

console.log('\n3. Save and load:');
const reportPath = saveReport(norm);
assert('report saved', reportPath.includes('ads-report_latest.json'));
const loaded = loadLatestReport();
assert('report loaded', loaded !== null);
assert('loaded has data.spend', loaded.data && loaded.data.spend > 0);

console.log('\n4. End-to-end fetch:');
const fetched = fetchAdsData();
assert('fetched data', fetched !== null);
assert('fetched has all fields', validate(fetched));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
