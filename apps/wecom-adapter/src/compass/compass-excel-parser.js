// P51 Compass Excel Parser — parse Compass-exported Excel/CSV
var fs = require('fs');
var path = require('path');

// Simulated CSV/Excel parser (in production, use xlsx/sheetjs)
function parse(filePath) {
  var ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv' || ext === '.txt') return parseCSV(filePath);
  // Excel files: simulate parsing (production uses xlsx/sheetjs)
  return parseCSV(filePath); // fallback
}

function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) return { error: 'File not found: ' + filePath };

  var content = fs.readFileSync(filePath, 'utf8');
  var lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return { error: 'File too short (need header + data)' };

  var headers = lines[0].split(',').map(function (h) { return h.replace(/^"|"$/g, '').trim(); });
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var values = lines[i].split(',').map(function (v) { return v.replace(/^"|"$/g, '').trim(); });
    var row = {};
    headers.forEach(function (h, j) { row[h] = safeNumber(values[j]); });
    rows.push(row);
  }
  return { headers: headers, rows: rows, rowCount: rows.length, sourceFile: path.basename(filePath) };
}

function safeNumber(val) {
  if (!val || val === '') return val;
  var num = parseFloat(val);
  return isNaN(num) ? val : num;
}

// Preview: return first N rows without modifying
function preview(filePath, limit) {
  var parsed = parse(filePath);
  if (parsed.error) return parsed;
  return {
    headers: parsed.headers,
    preview: parsed.rows.slice(0, limit || 5),
    totalRows: parsed.rowCount,
    sourceFile: parsed.sourceFile
  };
}

module.exports = { parse: parse, preview: preview };
