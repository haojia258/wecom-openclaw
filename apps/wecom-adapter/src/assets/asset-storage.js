// P50.1 Asset Storage — file-level operations for /opt/openclaw-assets
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', '..', 'storage', 'openclaw-assets');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

// Map type to raw subdirectory
function rawDir(assetType) {
  var map = { text: 'text', image: 'image', audio: 'audio', video: 'video' };
  return path.join(ROOT, 'raw', map[assetType] || 'text');
}

// Store a file from buffer or existing path
function storeAsset(assetType, sourcePathOrBuffer, filename) {
  ensureDir(rawDir(assetType));
  var ext = path.extname(filename || 'file.bin');
  var hash = crypto.createHash('sha256');
  var destName, destPath, content;

  if (Buffer.isBuffer(sourcePathOrBuffer)) {
    content = sourcePathOrBuffer;
    hash.update(content);
    destName = hash.digest('hex').substring(0, 16) + ext;
    destPath = path.join(rawDir(assetType), destName);
    fs.writeFileSync(destPath, content);
  } else {
    content = fs.readFileSync(sourcePathOrBuffer);
    hash.update(content);
    destName = hash.digest('hex').substring(0, 16) + ext;
    destPath = path.join(rawDir(assetType), destName);
    fs.copyFileSync(sourcePathOrBuffer, destPath);
  }

  var sha256 = crypto.createHash('sha256').update(fs.readFileSync(destPath)).digest('hex');
  var stats = fs.statSync(destPath);

  return {
    local_path: destPath,
    hash: sha256,
    size_bytes: stats.size,
    filename: destName
  };
}

// Move an asset from raw to processed
function moveToProcessed(assetId, assetType, category, localPath) {
  var destDir = path.join(ROOT, 'processed', category);
  ensureDir(destDir);
  var destPath = path.join(destDir, path.basename(localPath));
  if (fs.existsSync(localPath)) {
    fs.copyFileSync(localPath, destPath);
    return destPath;
  }
  return null;
}

// Delete file from storage
function deleteFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

// Export directory
function getExportDir() {
  var dir = path.join(ROOT, 'export');
  ensureDir(dir);
  return dir;
}

// Read file as buffer
function readFile(filePath) {
  if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
  return null;
}

// Get total storage size
function getStorageSize() {
  var total = 0;
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(function (f) {
      var fp = path.join(dir, f);
      if (fs.statSync(fp).isDirectory()) walk(fp);
      else total += fs.statSync(fp).size;
    });
  }
  walk(ROOT);
  return total;
}

module.exports = { storeAsset: storeAsset, moveToProcessed: moveToProcessed, deleteFile: deleteFile, getExportDir: getExportDir, readFile: readFile, getStorageSize: getStorageSize, ROOT: ROOT };
