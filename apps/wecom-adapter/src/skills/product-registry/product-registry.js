'use strict';

/**
 * product-registry.js — P17.1 Product Registry
 *
 * Maps products to assets. REVIEW_ONLY.
 */

var _products = new Map();

function register(product) {
  var id = product.id || 'prd-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
  var entry = {
    id: id,
    name: product.name || 'unnamed',
    sku: product.sku || null,
    category: product.category || 'general',
    status: product.status || 'active',
    assetIds: product.assetIds || [],
    createdBy: product.createdBy || 'system',
    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: product.updatedAt || new Date().toISOString()
  };
  _products.set(id, entry);
  return entry;
}

function get(id) {
  return _products.get(id) || null;
}

function list(filter) {
  var results = [];
  _products.forEach(function (v) {
    if (!filter) { results.push(v); return; }
    if (filter.category && v.category !== filter.category) return;
    if (filter.status && v.status !== filter.status) return;
    results.push(v);
  });
  return results;
}

function linkAsset(productId, assetId) {
  var p = _products.get(productId);
  if (!p) return null;
  if (p.assetIds.indexOf(assetId) < 0) p.assetIds.push(assetId);
  p.updatedAt = new Date().toISOString();
  return p;
}

function getProductAssets(productId) {
  var p = _products.get(productId);
  return p ? p.assetIds : [];
}

function stats() {
  var s = { total: _products.size, withAssets: 0, totalAssets: 0 };
  _products.forEach(function (v) {
    if (v.assetIds.length > 0) s.withAssets++;
    s.totalAssets += v.assetIds.length;
  });
  return s;
}

function clear() { _products.clear(); }

module.exports = {
  register: register, get: get, list: list,
  linkAsset: linkAsset, getProductAssets: getProductAssets,
  stats: stats, clear: clear
};
