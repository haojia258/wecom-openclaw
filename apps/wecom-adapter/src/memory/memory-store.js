var fs = require('fs'); var path = require('path'); var FILE = path.join(__dirname, '..', '..', 'storage', 'memory', 'history.json');
function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return []; } }
function save(d) { fs.writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf8'); }
function store(entry) { var all = load(); entry.id = 'mem-' + Date.now().toString(36); entry.timestamp = new Date().toISOString(); all.unshift(entry); save(all); return entry; }
function search(kw) { var all = load(); if (!kw) return all.slice(0, 50); kw = kw.toLowerCase(); return all.filter(function (e) { return JSON.stringify(e).toLowerCase().indexOf(kw) >= 0; }).slice(0, 50); }
if (!fs.existsSync(FILE)) save([]);
module.exports = { store: store, search: search };
