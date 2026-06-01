// P51 Compass JSON Writer — output standardized OpenClaw JSON to logs/doudian/imported/
var fs = require('fs');
var path = require('path');

var OUTPUT_DIR = path.join(__dirname, '..', '..', 'logs', 'doudian', 'imported');
var FILE_NAMES = { overview: 'compass-overview', transaction: 'compass-transaction', products: 'compass-products',
  videos: 'compass-videos', live: 'compass-live', audience: 'compass-audience', service: 'compass-service', product_card: 'compass-product-card' };

function write(type, data, importId) {
  var output = {
    importId: importId,
    type: type,
    generatedAt: new Date().toISOString(),
    rows: data.length,
    data: data
  };

  var baseName = FILE_NAMES[type] || 'compass-' + type;
  var fileName = baseName + '_latest.json';
  var filePath = path.join(OUTPUT_DIR, fileName);

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf8');

  return { success: true, file: fileName, path: filePath, rows: data.length, type: type };
}

function writeAll(typedData, importId) {
  var results = {};
  Object.keys(typedData).forEach(function (type) { results[type] = write(type, typedData[type], importId); });
  return results;
}

function readLatest(type) {
  var baseName = FILE_NAMES[type] || 'compass-' + type;
  var filePath = path.join(OUTPUT_DIR, baseName + '_latest.json');
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

module.exports = { write: write, writeAll: writeAll, readLatest: readLatest, OUTPUT_DIR: OUTPUT_DIR };
