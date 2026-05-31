'use strict';

/**
 * test-asset-foundation.js — P17.1 Product Asset Foundation test suite
 */

var passed = 0;
var failed = 0;

function assert(name, condition, detail) {
  if (condition) { passed++; }
  else {
    failed++;
    console.log('  FAIL: ' + name + (detail ? ' — ' + detail : ''));
  }
}

function summary() {
  console.log('');
  console.log('═══ P17.1 Asset Foundation Test Results ═══');
  console.log('Passed: ' + passed + ' / ' + (passed + failed));
  if (failed > 0) { console.log('Failed: ' + failed); process.exit(1); }
  else { console.log('✅ All tests passed!'); }
}

// ═══════════════════════════════════════════
// Test 1: Asset Registry
// ═══════════════════════════════════════════

console.log('── Test 1: Asset Registry ──');

var assetReg = require('../../skills/asset-registry/asset-registry.js');
assetReg.clear();

var a1 = assetReg.register({ name: 'test-image.png', type: 'image', category: 'test', tags: ['test'] });
assert('register returns asset with id', !!a1.id);
assert('register preserves name', a1.name === 'test-image.png');
assert('register sets status active', a1.status === 'active');

var a2 = assetReg.register({ name: 'test-video.mp4', type: 'video', category: 'demo', tags: ['demo'] });
assert('count is 2', assetReg.count() === 2);

var got = assetReg.get(a1.id);
assert('get by id works', got && got.name === 'test-image.png');

assert('get nonexistent returns null', assetReg.get('nonexistent') === null);

var listAll = assetReg.list();
assert('list all returns 2', listAll.length === 2);

var filtered = assetReg.list({ type: 'image' });
assert('filter by type', filtered.length === 1 && filtered[0].name === 'test-image.png');

var filtered2 = assetReg.list({ tag: 'demo' });
assert('filter by tag', filtered2.length === 1 && filtered2[0].name === 'test-video.mp4');

var updated = assetReg.update(a1.id, { name: 'renamed.png', tags: ['test', 'renamed'] });
assert('update returns updated asset', updated && updated.name === 'renamed.png');
assert('update preserves id', updated.id === a1.id);

var removed = assetReg.remove(a2.id);
assert('remove returns true', removed === true);
assert('count after remove is 1', assetReg.count() === 1);

var searchResults = assetReg.search('renamed');
assert('search by name finds 1', searchResults.length === 1);
assert('search empty returns 0', assetReg.search('zzz').length === 0);

var stats = assetReg.stats();
assert('stats has total', stats.total === 1);
assert('stats byType', stats.byType.image === 1);

// ═══════════════════════════════════════════
// Test 2: Product Registry
// ═══════════════════════════════════════════

console.log('── Test 2: Product Registry ──');

assetReg.clear();
var prodReg = require('../../skills/product-registry/product-registry.js');
prodReg.clear();

var p1 = prodReg.register({ name: 'Product A', sku: 'SKU-001', category: 'food' });
var p2 = prodReg.register({ name: 'Product B', sku: 'SKU-002', category: 'drink' });
assert('product count is 2', prodReg.list().length === 2);

// Register some assets with productId
var a3 = assetReg.register({ name: 'A-img.png', type: 'image', productId: p1.id });
var a4 = assetReg.register({ name: 'A-img2.png', type: 'image', productId: p1.id });

// Link asset to product
var linked = prodReg.linkAsset(p1.id, a3.id);
assert('link returns product', !!linked);
assert('link adds asset to product', prodReg.getProductAssets(p1.id).length === 1);

var pstats = prodReg.stats();
assert('product stats total 2', pstats.total === 2);
assert('product stats withAssets >= 1', pstats.withAssets >= 1);

// ═══════════════════════════════════════════
// Test 3: Tag Engine
// ═══════════════════════════════════════════

console.log('── Test 3: Tag Engine ──');

var tagEng = require('../../skills/tag-engine/tag-engine.js');

var tags1 = tagEng.autoTag({ name: 'banner-hero', format: 'jpg', category: 'marketing' });
assert('autoTag for jpg adds image', tags1.indexOf('image') >= 0);
assert('autoTag adds visual', tags1.indexOf('visual') >= 0);
assert('autoTag adds banner', tags1.indexOf('banner') >= 0);
assert('autoTag adds category', tags1.indexOf('marketing') >= 0);

var tags2 = tagEng.autoTag({ name: 'logo', format: 'svg', category: 'brand' });
assert('autoTag svg adds image', tags2.indexOf('image') >= 0);
assert('autoTag adds brand+logo', tags2.indexOf('brand') >= 0 && tags2.indexOf('logo') >= 0);

var allTags = tagEng.getAllTags([
  { tags: ['a', 'b'] }, { tags: ['b', 'c'] }
]);
assert('getAllTags deduplicates', allTags.length === 3 && allTags.indexOf('b') >= 0);

var tstats = tagEng.tagStats([
  { tags: ['x', 'y'] }, { tags: ['x', 'z'] }
]);
assert('tagStats counts correctly', tstats.x === 2 && tstats.y === 1 && tstats.z === 1);

// ═══════════════════════════════════════════
// Test 4: Dedup Engine
// ═══════════════════════════════════════════

console.log('── Test 4: Dedup Engine ──');

var dedup = require('../../skills/dedup-engine/dedup-engine.js');

var dups = dedup.findByName([
  { name: 'a.jpg' }, { name: 'b.png' }, { name: 'a.jpg' }
]);
assert('findByName detects 1 duplicate', dups.length === 1);

var dups2 = dedup.findByChecksum([
  { checksum: 'abc' }, { checksum: 'def' }, { checksum: 'abc' }
]);
assert('findByChecksum detects 1 duplicate', dups2.length === 1);

var report = dedup.dedupReport([
  { name: 'x.jpg', checksum: '111' },
  { name: 'y.png', checksum: '222' },
  { name: 'x.jpg', checksum: '111' }
]);
assert('dedupReport total=3', report.total === 3);
assert('dedupReport byName count=1', report.byName.length === 1);
assert('dedupReport uniqueCount=2', report.uniqueCount === 2);

// ═══════════════════════════════════════════
// Test 5: Asset Collector (Mock Data)
// ═══════════════════════════════════════════

console.log('── Test 5: Asset Collector ──');

assetReg.clear();
prodReg.clear();

var collector = require('../../skills/asset-collector/asset-collector.js');
var result = collector.collectMockAssets(assetReg);
assert('collectMockAssets returns count 10', result.count === 10);
assert('registry has 10 assets', assetReg.count() === 10);

var prodResult = collector.collectMockProducts(prodReg, assetReg);
assert('collectMockProducts returns 2', prodResult === 2);

var mockAssets = collector.getMockAssets();
assert('getMockAssets returns 10', mockAssets.length === 10);
assert('mock contains duplicate name', mockAssets.filter(function (a) { return a.name === 'hero-banner-main.jpg'; }).length === 2);

// ═══════════════════════════════════════════
// Test 6: Audit Module
// ═══════════════════════════════════════════

console.log('── Test 6: Audit Module ──');

var audit = require('../../skills/asset-audit/asset-audit.js');
audit.clear();

var rec = audit.record('test_action', { key: 'val' });
assert('record returns entry', !!rec && rec.action === 'test_action');
assert('record has reviewOnly=true', rec.reviewOnly === true);

audit.assetRegistered({ id: 'ast-1', name: 'test', type: 'image' });
audit.assetUpdated('ast-1', { name: 'new' });
audit.productLinked('prd-1', 'ast-1');

assert('audit count is 4', audit.list().length === 4);

var audStats = audit.stats();
assert('audit stats total', audStats.total === 4);
assert('audit stats byAction', Object.keys(audStats.byAction).length >= 2);

// ═══════════════════════════════════════════
// Test 7: Mock Data Integration
// ═══════════════════════════════════════════

console.log('── Test 7: Mock Data Integration ──');

assetReg.clear();
prodReg.clear();
audit.clear();

collector.collectMockAssets(assetReg);
collector.collectMockProducts(prodReg, assetReg);

var all = assetReg.list();
var dupsReport = dedup.dedupReport(all);
assert('mock data has duplicates', dupsReport.byName.length >= 1);

var images = assetReg.list({ type: 'image' });
assert('mock has images', images.length >= 5);

var video = assetReg.list({ type: 'video' });
assert('mock has video', video.length >= 1);

var products = prodReg.list();
assert('mock has 2 products', products.length === 2);

// Product-asset linking
var pAssets = prodReg.getProductAssets('prd-mock-001');
assert('product 001 has assets', pAssets.length >= 2);

// Tag engine on mock data
var allTags = tagEng.getAllTags(all);
assert('mock data has tags', allTags.length >= 5);

summary();
