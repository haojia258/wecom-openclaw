// P51 Compass History — track all imports
var fs = require('fs');
var path = require('path');

var HISTORY_FILE = path.join(__dirname, '..', '..', 'storage', 'compass', 'import-history.json');

function load() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch (e) { return []; }
}

function save(entries) { fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2), 'utf8'); }

function add(entry) {
  var history = load();
  history.unshift({ id: 'cmp-' + Date.now().toString(36), timestamp: new Date().toISOString(), ...entry });
  save(history);
  return history[0];
}

function getAll() { return load(); }

function getById(id) { return load().find(function (e) { return e.id === id; }) || null; }

function deleteById(id) {
  var h = load();
  var idx = h.findIndex(function (e) { return e.id === id; });
  if (idx === -1) return false;
  h.splice(idx, 1);
  save(h);
  return true;
}

// Init
if (!fs.existsSync(HISTORY_FILE)) save([]);

module.exports = { add: add, getAll: getAll, getById: getById, deleteById: deleteById };
