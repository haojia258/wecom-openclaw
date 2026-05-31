'use strict';

/**
 * asset-audit.js — P17.1 Asset Audit
 *
 * Audit trail for asset operations. REVIEW_ONLY.
 */

var _log = [];

function record(action, detail) {
  var entry = {
    timestamp: new Date().toISOString(),
    action: action,
    detail: detail || {},
    reviewOnly: true
  };
  _log.push(entry);
  return entry;
}

function assetRegistered(asset) {
  return record('asset_registered', { assetId: asset.id, name: asset.name, type: asset.type });
}

function assetUpdated(assetId, changes) {
  return record('asset_updated', { assetId: assetId, changes: Object.keys(changes) });
}

function assetRemoved(assetId) {
  return record('asset_removed', { assetId: assetId });
}

function productLinked(productId, assetId) {
  return record('product_asset_linked', { productId: productId, assetId: assetId });
}

function dedupFound(duplicates) {
  return record('dedup_detected', { count: duplicates.length });
}

function list(filter) {
  if (!filter) return _log.slice();
  return _log.filter(function (e) {
    if (filter.action && e.action !== filter.action) return false;
    if (filter.since && e.timestamp < filter.since) return false;
    return true;
  });
}

function stats() {
  var a = {};
  _log.forEach(function (e) { a[e.action] = (a[e.action] || 0) + 1; });
  return { total: _log.length, byAction: a };
}

function clear() { _log = []; }

module.exports = {
  record: record, assetRegistered: assetRegistered, assetUpdated: assetUpdated,
  assetRemoved: assetRemoved, productLinked: productLinked, dedupFound: dedupFound,
  list: list, stats: stats, clear: clear
};
