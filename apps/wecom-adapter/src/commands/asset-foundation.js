'use strict';

/**
 * asset-foundation.js — P17.1 Asset Foundation command handler
 *
 * REVIEW_ONLY=true — no production mutation.
 *
 * Commands:
 *   /素材状态              — asset system overview
 *   /素材统计              — asset statistics
 *   /素材搜索 <query>      — search assets
 */

var desc = '素材资产管理: 状态/统计/搜索 (REVIEW_ONLY)';

var assetRegistry, productRegistry, collector, tagEngine, dedupEngine, audit;

function ensureModules() {
  if (!assetRegistry) {
    try { assetRegistry = require('../skills/asset-registry/asset-registry.js'); } catch (e) {}
    try { productRegistry = require('../skills/product-registry/product-registry.js'); } catch (e) {}
    try { collector = require('../skills/asset-collector/asset-collector.js'); } catch (e) {}
    try { tagEngine = require('../skills/tag-engine/tag-engine.js'); } catch (e) {}
    try { dedupEngine = require('../skills/dedup-engine/dedup-engine.js'); } catch (e) {}
    try { audit = require('../skills/asset-audit/asset-audit.js'); } catch (e) {}
  }
}

function ensureMockData() {
  if (!assetRegistry || !productRegistry || !collector) return;
  if (assetRegistry.count() > 0) return; // Already loaded
  collector.collectMockAssets(assetRegistry);
  collector.collectMockProducts(productRegistry, assetRegistry);
  if (audit) audit.record('mock_data_loaded', { assetCount: assetRegistry.count(), productCount: productRegistry.list().length });
}

async function execute(ctx, args) {
  ensureModules();
  if (!assetRegistry) return 'Asset Foundation not available.';

  ensureMockData();
  args = (args || '').trim();

  if (!args || args === '状态') return handleStatus();
  if (args === '统计') return handleStats();
  return handleSearch(args);
}

function handleStatus() {
  var as = assetRegistry.stats();
  var ps = productRegistry ? productRegistry.stats() : { total: 0 };
  var al = assetRegistry.list();
  var dups = dedupEngine ? dedupEngine.dedupReport(al) : null;
  var au = audit ? audit.stats() : { total: 0 };

  var lines = ['# Asset Foundation Status', ''];
  lines.push('REVIEW_ONLY=true', '');

  lines.push('## Asset Registry');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push('| Total Assets | ' + as.total + ' |');
  Object.keys(as.byType).sort().forEach(function (t) {
    lines.push('| ' + t + ' | ' + as.byType[t] + ' |');
  });
  lines.push('| Active | ' + (as.byStatus.active || 0) + ' |');
  lines.push('');

  lines.push('## Product Registry');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push('| Total Products | ' + ps.total + ' |');
  lines.push('| Products with Assets | ' + (ps.withAssets || 0) + ' |');
  lines.push('| Total Product-Asset Links | ' + (ps.totalAssets || 0) + ' |');
  lines.push('');

  if (dups) {
    lines.push('## Dedup Report');
    lines.push('');
    lines.push('| Type | Count |');
    lines.push('|------|-------|');
    lines.push('| Name duplicates | ' + dups.byName.length + ' |');
    lines.push('| Unique assets | ' + dups.uniqueCount + ' |');
    lines.push('');
  }

  lines.push('## Audit');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push('| Total events | ' + au.total + ' |');
  lines.push('');

  lines.push('Review-Only: true');

  return lines.join('\n');
}

function handleStats() {
  var al = assetRegistry.list();
  var tags = tagEngine ? tagEngine.tagStats(al) : {};
  var as = assetRegistry.stats();

  var lines = ['# Asset Statistics', '', 'REVIEW_ONLY=true', ''];

  lines.push('## Tag Distribution');
  lines.push('');
  lines.push('| Tag | Count |');
  lines.push('|-----|-------|');
  Object.keys(tags).sort(function (a, b) { return tags[b] - tags[a]; }).forEach(function (t) {
    lines.push('| ' + t + ' | ' + tags[t] + ' |');
  });
  lines.push('');

  lines.push('## Category Distribution');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('|----------|-------|');
  Object.keys(as.byCategory).sort().forEach(function (c) {
    lines.push('| ' + c + ' | ' + as.byCategory[c] + ' |');
  });
  lines.push('');

  lines.push('Review-Only: true');
  return lines.join('\n');
}

function handleSearch(query) {
  var results = assetRegistry.search(query);
  if (results.length === 0) {
    return '# Asset Search: "' + query + '"\n\nNo results found.\n\nReview-Only: true';
  }

  var lines = ['# Asset Search: "' + query + '"', '', 'REVIEW_ONLY=true', ''];
  lines.push('| # | Name | Type | Tags | Product |');
  lines.push('|---|------|------|------|---------|');
  results.slice(0, 10).forEach(function (r, i) {
    var tags = (r.tags || []).join(', ');
    var product = r.productId || '-';
    lines.push('| ' + (i + 1) + ' | ' + r.name + ' | ' + r.type + ' | ' + tags + ' | ' + product + ' |');
  });
  lines.push('');
  lines.push('Results: ' + results.length + ' (showing top 10)');
  lines.push('');
  lines.push('Review-Only: true');

  return lines.join('\n');
}

module.exports = { execute: execute, desc: desc };
