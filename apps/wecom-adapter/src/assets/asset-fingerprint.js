// P50.1 Asset Fingerprint — hash-based dedup and similarity detection
var crypto = require('crypto');
var fs = require('fs');
var metadataDB = require('./asset-metadata-db');

function generateFingerprint(filePath) {
  if (!fs.existsSync(filePath)) return null;
  var content = fs.readFileSync(filePath);
  return {
    algorithm: 'sha256',
    hash: crypto.createHash('sha256').update(content).digest('hex'),
    size: content.length
  };
}

// Dedup: check if hash already exists in the database
function isDuplicate(hash) {
  var existing = metadataDB.findByHash(hash);
  return existing ? existing : null;
}

// Register fingerprint in metadata
function registerFingerprint(assetId, hash, algorithm) {
  return metadataDB.insertFingerprint({
    asset_id: assetId,
    algorithm: algorithm || 'sha256',
    hash: hash
  });
}

// Find all assets with the same hash (duplicates)
function findDuplicates() {
  var fps = metadataDB.findSimilar('', 0); // get all
  var hashMap = {};
  fps.forEach(function (fp) {
    if (!hashMap[fp.hash]) hashMap[fp.hash] = [];
    hashMap[fp.hash].push(fp);
  });
  var duplicates = {};
  Object.keys(hashMap).forEach(function (h) {
    if (hashMap[h].length > 1) duplicates[h] = hashMap[h];
  });
  return duplicates;
}

module.exports = { generateFingerprint: generateFingerprint, isDuplicate: isDuplicate, registerFingerprint: registerFingerprint, findDuplicates: findDuplicates };
