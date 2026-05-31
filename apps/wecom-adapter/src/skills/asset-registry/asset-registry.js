'use strict';

/**
 * asset-registry.js — P17.1 Asset Registry
 *
 * Central registry for all digital assets (images, videos, documents, etc.)
 * REVIEW_ONLY=true — no production mutation.
 */

var _store = new Map();

function generateId(prefix) {
  return (prefix || 'ast') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
}

function register(asset) {
  var id = asset.id || generateId('ast');
  var entry = {
    id: id,
    name: asset.name || 'unnamed',
    type: asset.type || 'unknown',
    category: asset.category || 'general',
    tags: asset.tags || [],
    productId: asset.productId || null,
    url: asset.url || null,
    size: asset.size || 0,
    format: asset.format || null,
    checksum: asset.checksum || null,
    status: asset.status || 'active',
    createdBy: asset.createdBy || 'system',
    createdAt: asset.createdAt || new Date().toISOString(),
    updatedAt: asset.updatedAt || new Date().toISOString(),
    metadata: asset.metadata || {}
  };
  _store.set(id, entry);
  return entry;
}

function get(id) {
  return _store.get(id) || null;
}

function list(filter) {
  var results = [];
  _store.forEach(function (v) {
    if (!filter) { results.push(v); return; }
    var match = true;
    if (filter.type && v.type !== filter.type) match = false;
    if (filter.category && v.category !== filter.category) match = false;
    if (filter.productId && v.productId !== filter.productId) match = false;
    if (filter.status && v.status !== filter.status) match = false;
    if (filter.tag) {
      var hasTag = v.tags.some(function (t) { return t === filter.tag; });
      if (!hasTag) match = false;
    }
    if (match) results.push(v);
  });
  return results;
}

function update(id, changes) {
  var entry = _store.get(id);
  if (!entry) return null;
  Object.keys(changes).forEach(function (k) {
    if (k !== 'id' && k !== 'createdAt') entry[k] = changes[k];
  });
  entry.updatedAt = new Date().toISOString();
  _store.set(id, entry);
  return entry;
}

function remove(id) {
  return _store.delete(id);
}

function count() {
  return _store.size;
}

function stats() {
  var s = { total: _store.size, byType: {}, byCategory: {}, byStatus: {} };
  _store.forEach(function (v) {
    s.byType[v.type] = (s.byType[v.type] || 0) + 1;
    s.byCategory[v.category] = (s.byCategory[v.category] || 0) + 1;
    s.byStatus[v.status] = (s.byStatus[v.status] || 0) + 1;
  });
  return s;
}

function search(query) {
  var q = (query || '').toLowerCase();
  var results = [];
  _store.forEach(function (v) {
    if (v.name.toLowerCase().indexOf(q) >= 0 ||
        v.id.toLowerCase().indexOf(q) >= 0 ||
        v.tags.some(function (t) { return t.toLowerCase().indexOf(q) >= 0; })) {
      results.push(v);
    }
  });
  return results;
}

function clear() {
  _store.clear();
}

module.exports = {
  register: register,
  get: get,
  list: list,
  update: update,
  remove: remove,
  count: count,
  stats: stats,
  search: search,
  clear: clear
};
