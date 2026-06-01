// P50.1 Asset Registry — main entry point for asset management
var path = require('path');
var metadataDB = require('./asset-metadata-db');
var storage = require('./asset-storage');
var classifier = require('./asset-classifier');
var fingerprint = require('./asset-fingerprint');
var search = require('./asset-search');
var audit = require('./asset-audit');

// Import a new asset
function importAsset(sourcePath, filename, options) {
  options = options || {};
  var assetType = options.type || classifier.detectType(filename || sourcePath);
  var platform = options.platform || classifier.detectPlatform(options.sourceUrl || '');
  var title = options.title || filename || path.basename(sourcePath);

  // Step 1: Store the file
  var stored = storage.storeAsset(assetType, sourcePath, filename);

  // Step 2: Generate fingerprint
  var fp = fingerprint.generateFingerprint(stored.local_path);

  // Step 3: Check for duplicates
  var dup = fp ? fingerprint.isDuplicate(fp.hash) : null;
  if (dup && !options.allowDuplicate) {
    return { imported: false, reason: 'duplicate', existingId: dup.asset_id, hash: fp.hash };
  }

  // Step 4: Score and classify
  var score = classifier.scoreAsset(assetType, stored.size_bytes, !!options.sourceUrl);
  var risk = classifier.assessRisk(options.copyrightStatus || 'unknown', 'pending', platform);
  var tags = classifier.suggestTags(assetType, title, platform);
  if (options.tags) tags = tags.concat(options.tags);

  // Step 5: Insert metadata
  var asset = metadataDB.insertAsset({
    type: assetType,
    title: title,
    platform: platform,
    source_url: options.sourceUrl || '',
    local_path: stored.local_path,
    hash: fp ? fp.hash : '',
    fingerprint: fp ? fp.hash : '',
    tags: tags,
    score: score,
    risk_level: risk,
    copyright_status: options.copyrightStatus || 'unknown',
    review_status: 'pending',
    size_bytes: stored.size_bytes,
    width: options.width || null,
    height: options.height || null,
    duration: options.duration || null
  });

  // Step 6: Register fingerprint
  if (fp) fingerprint.registerFingerprint(asset.asset_id, fp.hash);

  // Step 7: Register source
  if (options.sourceUrl) {
    metadataDB.insertSource({ asset_id: asset.asset_id, platform: platform, url: options.sourceUrl });
  }

  // Step 8: Audit
  audit.logImport(asset.asset_id, options.userId || 'system', 'Imported: ' + title);

  return { imported: true, asset: asset, hash: fp ? fp.hash : null };
}

// Delete an asset (dangerous action)
function deleteAsset(assetId, userId) {
  var asset = metadataDB.getAsset(assetId);
  if (!asset) return { deleted: false, reason: 'not_found' };

  // Delete file
  storage.deleteFile(asset.local_path);

  // Delete metadata
  metadataDB.deleteAsset(assetId);

  // Audit
  audit.logDelete(assetId, userId, 'Deleted: ' + asset.title);

  return { deleted: true, asset: asset };
}

// Stats
function getStats() {
  return metadataDB.stats();
}

// Storage size
function getStorageSize() {
  return storage.getStorageSize();
}

module.exports = {
  importAsset: importAsset, deleteAsset: deleteAsset, search: search.search,
  getFilters: search.getFilters, getStats: getStats, getStorageSize: getStorageSize,
  auditLogs: audit.getLogs, findDuplicates: fingerprint.findDuplicates
};
