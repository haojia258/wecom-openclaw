'use strict';

// P13 Product Asset System v1.0 — Core Module
const storage = require('./storage');
const loader = require('./asset-loader');
const matcher = require('./asset-matcher');
const path = require('path');

const ASSET_DIR = path.resolve(__dirname, '../../storage/product-assets');

let _assets = {};
let _loaded = false;

/**
 * Initialize the product asset library from disk
 */
function init() {
  _assets = loader.scanDirectory(ASSET_DIR);
  _loaded = true;
  return { count: Object.keys(_assets).length, dir: ASSET_DIR };
}

/**
 * Create a new product asset record
 */
function create(product) {
  if (!_loaded) init();
  var id = 'asset-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
  var record = {
    id: id,
    name: product.name || 'untitled',
    type: product.type || 'json',       // json | image | video
    category: product.category || 'general',
    tags: product.tags || [],
    taskType: product.taskType || 'asset',
    data: product.data || {},
    metadata: {
      size: product.size || 0,
      format: product.format || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    },
    reviewOnly: true,
    requiresHumanApproval: true
  };

  _assets[id] = record;
  storage.saveAsset(id, record, ASSET_DIR);
  return record;
}

/**
 * Read an asset by ID
 */
function read(id) {
  if (!_loaded) init();
  return _assets[id] || null;
}

/**
 * Update an asset
 */
function update(id, updates) {
  if (!_loaded) init();
  var record = _assets[id];
  if (!record) throw new Error('Asset not found: ' + id);

  if (updates.name) record.name = updates.name;
  if (updates.type) record.type = updates.type;
  if (updates.category) record.category = updates.category;
  if (updates.tags) record.tags = updates.tags;
  if (updates.data) record.data = Object.assign(record.data, updates.data);

  record.metadata.updatedAt = new Date().toISOString();
  record.metadata.version += 1;
  _assets[id] = record;
  storage.saveAsset(id, record, ASSET_DIR);
  return record;
}

/**
 * Delete an asset (soft — marks as archived)
 */
function remove(id) {
  if (!_loaded) init();
  var record = _assets[id];
  if (!record) return false;
  record._archived = true;
  record.metadata.updatedAt = new Date().toISOString();
  storage.saveAsset(id, record, ASSET_DIR);
  delete _assets[id];
  return true;
}

/**
 * List all assets (optionally filtered)
 */
function list(filter) {
  if (!_loaded) init();
  var result = Object.values(_assets);
  if (filter) {
    if (filter.type) result = result.filter(function (a) { return a.type === filter.type; });
    if (filter.category) result = result.filter(function (a) { return a.category === filter.category; });
    if (filter.taskType) result = result.filter(function (a) { return a.taskType === filter.taskType; });
    if (filter.tag) result = result.filter(function (a) { return a.tags.indexOf(filter.tag) >= 0; });
  }
  return result;
}

/**
 * Search assets by keyword
 */
function search(keyword) {
  if (!_loaded) init();
  var kw = (keyword || '').toLowerCase();
  return Object.values(_assets).filter(function (a) {
    return a.name.toLowerCase().indexOf(kw) >= 0 ||
      a.id.toLowerCase().indexOf(kw) >= 0 ||
      a.tags.some(function (t) { return t.toLowerCase().indexOf(kw) >= 0; }) ||
      a.category.toLowerCase().indexOf(kw) >= 0;
  });
}

/**
 * Match assets for a given task (delegates to matcher)
 */
function matchForTask(task) {
  if (!_loaded) init();
  var assets = Object.values(_assets);
  return matcher.match(assets, task);
}

/**
 * Stats
 */
function stats() {
  if (!_loaded) init();
  var all = Object.values(_assets);
  var byType = {};
  var byCat = {};
  all.forEach(function (a) {
    byType[a.type] = (byType[a.type] || 0) + 1;
    byCat[a.category] = (byCat[a.category] || 0) + 1;
  });
  return { total: all.length, byType: byType, byCategory: byCat };
}

/**
 * Clear in-memory state (for testing)
 */
function _reset() {
  _assets = {};
  _loaded = false;
}

/**
 * Assign agent for task type via Agent Registry (if available)
 */
function assignAgent(task) {
  try {
    var reg = require('../agent-runtime/agent-capability-registry');
    return reg.selectBestAgent(task);
  } catch (e) {
    return null;
  }
}

/**
 * Send artifact to Task Graph
 */
function sendToTaskGraph(graphId, taskId, artifact) {
  try {
    var tg = require('../agent-runtime/task-graph');
    tg.attachArtifact(graphId, taskId, artifact);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  init: init,
  create: create,
  read: read,
  update: update,
  remove: remove,
  list: list,
  search: search,
  matchForTask: matchForTask,
  stats: stats,
  assignAgent: assignAgent,
  sendToTaskGraph: sendToTaskGraph,
  _reset: _reset
};
