// P50.1 Asset Metadata DB — JSON-based with SQL-like query interface
// Equivalent to SQLite tables: assets, asset_tags, asset_sources, asset_fingerprints, asset_audit
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var DB_DIR = path.join(__dirname, '..', '..', 'storage', 'openclaw-assets', 'metadata');
var TABLES = ['assets', 'asset_tags', 'asset_sources', 'asset_fingerprints', 'asset_audit'];

function tableFile(name) { return path.join(DB_DIR, name + '.json'); }

function readTable(name) {
  var f = tableFile(name);
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return []; }
}

function writeTable(name, rows) {
  fs.writeFileSync(tableFile(name), JSON.stringify(rows, null, 2), 'utf8');
}

function guid() { return 'ast-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex'); }

// Initialize — create empty tables if missing
function init() {
  TABLES.forEach(function (t) {
    if (!fs.existsSync(tableFile(t))) writeTable(t, []);
  });
}

// ═══════ Assets CRUD ═══════
function insertAsset(asset) {
  var rows = readTable('assets');
  var record = {
    asset_id: asset.asset_id || guid(),
    type: asset.type || 'unknown',
    title: asset.title || 'Untitled',
    platform: asset.platform || 'unknown',
    source_url: asset.source_url || '',
    local_path: asset.local_path || '',
    hash: asset.hash || '',
    fingerprint: asset.fingerprint || '',
    tags: asset.tags || [],
    score: asset.score || 0,
    risk_level: asset.risk_level || 'low',
    copyright_status: asset.copyright_status || 'unknown',
    review_status: asset.review_status || 'pending',
    size_bytes: asset.size_bytes || 0,
    width: asset.width || null,
    height: asset.height || null,
    duration: asset.duration || null,
    created_at: asset.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  rows.push(record);
  writeTable('assets', rows);

  // Insert tags
  if (asset.tags && asset.tags.length > 0) {
    var tagRows = readTable('asset_tags');
    asset.tags.forEach(function (tag) {
      tagRows.push({ tag_id: guid(), asset_id: record.asset_id, tag: tag });
    });
    writeTable('asset_tags', tagRows);
  }

  return record;
}

function updateAsset(assetId, updates) {
  var rows = readTable('assets');
  var idx = findIndex(rows, 'asset_id', assetId);
  if (idx === -1) return null;
  Object.keys(updates).forEach(function (k) { rows[idx][k] = updates[k]; });
  rows[idx].updated_at = new Date().toISOString();
  writeTable('assets', rows);
  return rows[idx];
}

function getAsset(assetId) {
  var rows = readTable('assets');
  return rows.find(function (r) { return r.asset_id === assetId; }) || null;
}

function deleteAsset(assetId) {
  var rows = readTable('assets');
  var idx = findIndex(rows, 'asset_id', assetId);
  if (idx === -1) return false;
  rows.splice(idx, 1);
  writeTable('assets', rows);
  // Clean tags
  var tags = readTable('asset_tags').filter(function (t) { return t.asset_id !== assetId; });
  writeTable('asset_tags', tags);
  // Clean fingerprints
  var fps = readTable('asset_fingerprints').filter(function (f) { return f.asset_id !== assetId; });
  writeTable('asset_fingerprints', fps);
  return true;
}

// ═══════ Query ═══════
function queryAssets(filters) {
  filters = filters || {};
  var rows = readTable('assets');

  if (filters.type) rows = rows.filter(function (r) { return r.type === filters.type; });
  if (filters.platform) rows = rows.filter(function (r) { return r.platform === filters.platform; });
  if (filters.risk_level) rows = rows.filter(function (r) { return r.risk_level === filters.risk_level; });
  if (filters.review_status) rows = rows.filter(function (r) { return r.review_status === filters.review_status; });
  if (filters.minScore) rows = rows.filter(function (r) { return r.score >= filters.minScore; });
  if (filters.maxScore) rows = rows.filter(function (r) { return r.score <= filters.maxScore; });
  if (filters.keyword) {
    var kw = filters.keyword.toLowerCase();
    rows = rows.filter(function (r) {
      return r.title.toLowerCase().indexOf(kw) >= 0 ||
             r.asset_id.indexOf(kw) >= 0 ||
             (r.tags && r.tags.some(function (t) { return t.toLowerCase().indexOf(kw) >= 0; }));
    });
  }
  if (filters.tag) {
    var tagAssets = readTable('asset_tags').filter(function (t) { return t.tag === filters.tag; }).map(function (t) { return t.asset_id; });
    rows = rows.filter(function (r) { return tagAssets.indexOf(r.asset_id) >= 0; });
  }

  // Sort by updated_at descending
  rows.sort(function (a, b) { return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(); });

  if (filters.limit) rows = rows.slice(0, filters.limit);
  return rows;
}

// ═══════ Tags ═══════
function getTags() {
  var rows = readTable('asset_tags');
  var counts = {};
  rows.forEach(function (r) { counts[r.tag] = (counts[r.tag] || 0) + 1; });
  return Object.keys(counts).map(function (k) { return { tag: k, count: counts[k] }; }).sort(function (a, b) { return b.count - a.count; });
}

// ═══════ Sources ═══════
function insertSource(source) {
  var rows = readTable('asset_sources');
  rows.push({ source_id: guid(), asset_id: source.asset_id, platform: source.platform, url: source.url, imported_at: new Date().toISOString() });
  writeTable('asset_sources', rows);
  return rows[rows.length - 1];
}

function getSources(assetId) {
  return readTable('asset_sources').filter(function (s) { return s.asset_id === assetId; });
}

// ═══════ Fingerprints ═══════
function insertFingerprint(fp) {
  var rows = readTable('asset_fingerprints');
  rows.push({
    fp_id: guid(),
    asset_id: fp.asset_id,
    algorithm: fp.algorithm || 'sha256',
    hash: fp.hash,
    similar_to: fp.similar_to || null,
    similarity: fp.similarity || null,
    created_at: new Date().toISOString()
  });
  writeTable('asset_fingerprints', rows);
  return rows[rows.length - 1];
}

function findByHash(hash) {
  var fps = readTable('asset_fingerprints');
  var match = fps.find(function (f) { return f.hash === hash; });
  if (!match) return null;
  return getAsset(match.asset_id);
}

function findSimilar(hash, threshold) {
  threshold = threshold || 0.9;
  var fps = readTable('asset_fingerprints');
  return fps.filter(function (f) { return f.hash === hash || (f.similarity && f.similarity >= threshold); });
}

// ═══════ Audit ═══════
function insertAuditLog(entry) {
  var rows = readTable('asset_audit');
  rows.push({
    audit_id: guid(),
    asset_id: entry.asset_id,
    action: entry.action,
    user_id: entry.user_id || 'system',
    details: entry.details || '',
    risk_level: entry.risk_level || 'INFO',
    timestamp: new Date().toISOString()
  });
  writeTable('asset_audit', rows);
  return rows[rows.length - 1];
}

function getAuditLogs(assetId) {
  var rows = readTable('asset_audit');
  if (assetId) rows = rows.filter(function (r) { return r.asset_id === assetId; });
  rows.sort(function (a, b) { return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(); });
  return rows;
}

// ═══════ Helpers ═══════
function findIndex(arr, key, val) {
  for (var i = 0; i < arr.length; i++) { if (arr[i][key] === val) return i; }
  return -1;
}

function countAssets() {
  return readTable('assets').length;
}

function stats() {
  var assets = readTable('assets');
  var typeCounts = {};
  assets.forEach(function (a) { typeCounts[a.type] = (typeCounts[a.type] || 0) + 1; });
  return { total: assets.length, byType: typeCounts, tags: getTags().length, sources: readTable('asset_sources').length };
}

// Init on load
init();

module.exports = {
  init: init, insertAsset: insertAsset, updateAsset: updateAsset, getAsset: getAsset, deleteAsset: deleteAsset,
  queryAssets: queryAssets, getTags: getTags, insertSource: insertSource, getSources: getSources,
  insertFingerprint: insertFingerprint, findByHash: findByHash, findSimilar: findSimilar,
  insertAuditLog: insertAuditLog, getAuditLogs: getAuditLogs, countAssets: countAssets, stats: stats
};
