// P55 KPI Metrics DB
var fs = require('fs'); var path = require('path'); var FILE = path.join(__dirname, '..', '..', 'storage', 'kpi', 'metrics.json');
function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return {}; } }
function save(d) { fs.writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf8'); }
function getHistory() { return load(); }
function record(m) { var d = load(); d[new Date().toISOString()] = m; save(d); return d; }
if (!fs.existsSync(FILE)) save({});
module.exports = { getHistory: getHistory, record: record };
