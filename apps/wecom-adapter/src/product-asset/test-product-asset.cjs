'use strict';

var productAsset = require('./index');
var storage = require('./storage');
var loader = require('./asset-loader');
var matcher = require('./asset-matcher');
var path = require('path');
var fs = require('fs');

var passed = 0;
var failed = 0;

function assert(desc, condition, detail) {
  if (condition) { passed++; console.log('  ✅ ' + desc); }
  else { failed++; console.log('  ❌ ' + desc + (detail ? ' — ' + detail : '')); }
}

function summary() {
  console.log('\n' + '='.repeat(40));
  console.log('  Total: ' + (passed + failed) + ' | Passed: ' + passed + ' | Failed: ' + failed);
  if (failed > 0) process.exit(1);
}

// ═══ Clean up from previous runs ═══
var ASSET_DIR = path.resolve(__dirname, '../../storage/product-assets');
if (fs.existsSync(ASSET_DIR)) {
  fs.readdirSync(ASSET_DIR).forEach(function (f) { fs.unlinkSync(path.join(ASSET_DIR, f)); });
}
productAsset._reset();

// ═══ Test 1: Init ═══
console.log('\n── Test 1: Init ──');
var initResult = productAsset.init();
assert('init returns count', typeof initResult.count === 'number');
assert('init returns dir', initResult.dir.indexOf('product-assets') >= 0);

// ═══ Test 2: Create ═══
console.log('\n── Test 2: Create ──');
var a1 = productAsset.create({ name: 'ROI Report Q1', type: 'json', category: 'roi_report', tags: ['roi', 'q1'], taskType: 'roi', data: { roas: 3.2, ctr: 1.8 } });
assert('create returns record', !!a1 && !!a1.id);
assert('created asset has name', a1.name === 'ROI Report Q1');
assert('created asset reviewOnly=true', a1.reviewOnly === true);
assert('created asset requiresHumanApproval=true', a1.requiresHumanApproval === true);

var a2 = productAsset.create({ name: 'Ad Creative Banner', type: 'image', category: 'ad_creative', tags: ['banner', 'promo'], taskType: 'marketing', data: { width: 1200, height: 628 } });
assert('second asset created', !!a2 && a2.id !== a1.id);

var a3 = productAsset.create({ name: 'Product Video Clip', type: 'video', category: 'video_clip', tags: ['tutorial', 'product'], taskType: 'video', data: { duration: 30, resolution: '1080p' } });
assert('third asset created', !!a3);

var a4 = productAsset.create({ name: 'CTR Dataset May', type: 'json', category: 'ctr_data', tags: ['ctr', 'may'], taskType: 'ctr', data: { impressions: 50000, clicks: 1250 } });
assert('fourth asset created', !!a4);

var a5 = productAsset.create({ name: 'Strategy Doc v2', type: 'json', category: 'strategy_doc', tags: ['strategy', 'v2'], taskType: 'strategy', data: { goals: ['roi+', 'ctr+'] } });
assert('fifth asset created', !!a5);

// ═══ Test 3: CRUD ═══
console.log('\n── Test 3: CRUD ──');
var read1 = productAsset.read(a1.id);
assert('read returns asset', !!read1 && read1.name === 'ROI Report Q1');

var updated = productAsset.update(a1.id, { name: 'ROI Report Q1 Updated', tags: ['roi', 'q1', 'updated'] });
assert('update changes name', updated.name === 'ROI Report Q1 Updated');
assert('update increments version', updated.metadata.version === 2);
assert('update adds tag', updated.tags.indexOf('updated') >= 0);

var preRemove = productAsset.read(a1.id);
assert('pre-remove exists', !!preRemove);
var removed = productAsset.remove(a1.id);
assert('remove returns true', removed === true);
assert('post-remove is null', productAsset.read(a1.id) === null);

// Re-create for search tests
productAsset.create({ name: 'ROI Report Q1 (restored)', type: 'json', category: 'roi_report', tags: ['roi', 'q1'], taskType: 'roi', data: {} });

// ═══ Test 4: List & Search ═══
console.log('\n── Test 4: List & Search ──');
var all = productAsset.list();
assert('list returns assets', all.length >= 4);

var byType = productAsset.list({ type: 'json' });
assert('filter by type json', byType.length >= 3);

var byCat = productAsset.list({ category: 'roi_report' });
assert('filter by category roi_report', byCat.length >= 1);

var search1 = productAsset.search('roi');
assert('search finds roi', search1.length >= 1);

var search2 = productAsset.search('video');
assert('search finds video', search2.length >= 1);

// ═══ Test 5: Match ═══
console.log('\n── Test 5: Asset Matcher ──');
var roiTask = { type: 'roi', tags: ['roi'], category: 'roi_report' };
var roiMatches = productAsset.matchForTask(roiTask);
assert('match finds roi assets', roiMatches.length >= 1);
assert('match scores non-zero', roiMatches[0].score > 0);

var videoTask = { type: 'video', tags: ['tutorial'] };
var videoMatches = productAsset.matchForTask(videoTask);
assert('match finds video assets', videoMatches.length >= 1);

var report = matcher.matchReport(all, roiTask);
assert('matchReport has matches', report.matches >= 1);
assert('matchReport has topMatches', report.topMatches.length >= 1);

// ═══ Test 6: Stats ═══
console.log('\n── Test 6: Stats ──');
var st = productAsset.stats();
assert('stats has total', st.total >= 4);
assert('stats has byType', Object.keys(st.byType).length >= 2);

// ═══ Test 7: Persistence ═══
console.log('\n── Test 7: Persistence ──');
var ids = storage.listAssetIds(ASSET_DIR);
assert('storage lists assets on disk', ids.length >= 4);
assert('storage gets size', storage.getAssetSize(ids[0], ASSET_DIR) > 0);
assert('storage gets mtime', storage.getAssetMtime(ids[0], ASSET_DIR) !== null);

// ═══ Test 8: Validation ═══
console.log('\n── Test 8: Validation ──');
var validRecord = { id: 'x', name: 'Test', type: 'json', category: 'general', reviewOnly: true, requiresHumanApproval: true };
var valResult = loader.validate(validRecord);
assert('valid record passes', valResult.valid === true);

var invalidRecord = { id: null, name: '', type: 'bad', category: 'unknown', reviewOnly: false, requiresHumanApproval: false };
var invResult = loader.validate(invalidRecord);
assert('invalid record fails', invResult.valid === false);
assert('invalid has errors', invResult.errors.length >= 4);

// ═══ Summary ═══
summary();
