var fs = require('fs'); var path = require('path');
var STORE_DIR = path.join(__dirname, '..', '..', 'storage', 'activities');
var FILES = ['activities.json', 'enrollment-plans.json', 'profit-analysis.json', 'risk-analysis.json', 'history.json'];

function ensureDir() { if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true }); }
function ensureFile(fname, init) {
  var fp = path.join(STORE_DIR, fname);
  if (!fs.existsSync(fp)) fs.writeFileSync(fp, JSON.stringify(init || [], null, 2), 'utf8');
  return fp;
}
function initAll() { ensureDir(); FILES.forEach(function (f) { ensureFile(f); }); return true; }
function load(fname) {
  var fp = path.join(STORE_DIR, fname);
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (e) { return []; }
}
function save(fname, data) { ensureDir(); var fp = path.join(STORE_DIR, fname); fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8'); }
function guid() { return 'act-' + Date.now().toString(36); }
function add(a) { var all = load('activities.json'); all.unshift({ id: guid(), ...a, createdAt: new Date().toISOString() }); save('activities.json', all); return all[0]; }
function getAll() { return load('activities.json'); }
function getById(id) { return load('activities.json').find(function (a) { return a.id === id; }) || null; }
function getEnrollmentPlans() { return load('enrollment-plans.json'); }
function saveEnrollmentPlan(plan) { var all = load('enrollment-plans.json'); all.unshift(plan); save('enrollment-plans.json', all); return plan; }

initAll();
module.exports = { add: add, getAll: getAll, getById: getById, getEnrollmentPlans: getEnrollmentPlans, saveEnrollmentPlan: saveEnrollmentPlan, initAll: initAll, STORE_DIR: STORE_DIR };
