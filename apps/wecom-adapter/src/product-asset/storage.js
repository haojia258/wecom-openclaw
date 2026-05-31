'use strict';

// P13 Product Asset System — Storage Layer
const fs = require('fs');
const path = require('path');

/**
 * Save a single asset to disk as JSON
 */
function saveAsset(assetId, record, assetDir) {
  if (!fs.existsSync(assetDir)) {
    fs.mkdirSync(assetDir, { recursive: true });
  }
  var filePath = path.join(assetDir, assetId + '.json');
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
  return filePath;
}

/**
 * Load a single asset from disk
 */
function loadAsset(assetId, assetDir) {
  var filePath = path.join(assetDir, assetId + '.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

/**
 * List all asset IDs in directory (without loading full data)
 */
function listAssetIds(assetDir) {
  if (!fs.existsSync(assetDir)) return [];
  return fs.readdirSync(assetDir)
    .filter(function (f) { return f.endsWith('.json'); })
    .map(function (f) { return f.replace('.json', ''); });
}

/**
 * Delete an asset file from disk
 */
function deleteAsset(assetId, assetDir) {
  var filePath = path.join(assetDir, assetId + '.json');
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * Get asset file size
 */
function getAssetSize(assetId, assetDir) {
  var filePath = path.join(assetDir, assetId + '.json');
  if (!fs.existsSync(filePath)) return 0;
  return fs.statSync(filePath).size;
}

/**
 * Get asset last modified time
 */
function getAssetMtime(assetId, assetDir) {
  var filePath = path.join(assetDir, assetId + '.json');
  if (!fs.existsSync(filePath)) return null;
  return fs.statSync(filePath).mtime.toISOString();
}

module.exports = {
  saveAsset: saveAsset,
  loadAsset: loadAsset,
  listAssetIds: listAssetIds,
  deleteAsset: deleteAsset,
  getAssetSize: getAssetSize,
  getAssetMtime: getAssetMtime
};
