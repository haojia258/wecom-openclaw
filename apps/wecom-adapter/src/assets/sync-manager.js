// P50.5 Sync Manager — orchestrates NAS and Notion sync
var nas = require('./nas-adapter');
var notion = require('./notion-index-adapter');
var metadataDB = require('./asset-metadata-db');

var REVIEW_ONLY = true;

function getStatus() {
  return {
    nas: nas.getSyncStatus(),
    notion: notion.getSyncStatus(),
    primaryStorage: 'local',
    reviewOnly: REVIEW_ONLY
  };
}

function syncToNAS(assetId) {
  if (!nas.isEnabled()) return { success: false, reason: 'nas_disabled' };
  var asset = metadataDB.getAsset(assetId);
  if (!asset) return { success: false, reason: 'not_found' };
  return nas.uploadAsset(assetId, asset.local_path);
}

function syncToNotion(assetId) {
  if (!notion.isEnabled()) return { success: false, reason: 'notion_disabled' };
  var asset = metadataDB.getAsset(assetId);
  if (!asset) return { success: false, reason: 'not_found' };
  return notion.indexAsset(asset);
}

function syncAsset(assetId) {
  var results = { nas: syncToNAS(assetId), notion: syncToNotion(assetId) };
  return { assetId: assetId, results: results, requiresApproval: REVIEW_ONLY };
}

module.exports = { getStatus: getStatus, syncToNAS: syncToNAS, syncToNotion: syncToNotion, syncAsset: syncAsset };
