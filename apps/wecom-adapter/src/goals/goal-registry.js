var fs = require('fs'); var path = require('path'); var FILE = path.join(__dirname, '..', '..', 'storage', 'goals', 'goals.json');
function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return []; } }
function save(d) { fs.writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf8'); }
function add(g) { var all = load(); g.id = 'goal-' + Date.now().toString(36); g.status = 'active'; g.createdAt = new Date().toISOString(); all.unshift(g); save(all); return g; }
function getAll() { return load(); }
if (!fs.existsSync(FILE)) save([]);
module.exports = { add: add, getAll: getAll };
