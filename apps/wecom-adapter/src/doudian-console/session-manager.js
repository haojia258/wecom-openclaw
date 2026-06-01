// P52 Douyin Console Session Manager
var fs = require('fs'); var path = require('path');
var SESSIONS_FILE = path.join(__dirname, '..', '..', 'storage', 'doudian-console', 'sessions.json');
var REVIEW_ONLY = true;
function load() { try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); } catch (e) { return {}; } }
function save(d) { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(d, null, 2), 'utf8'); }
function getStatus() {
  var s = load();
  return { loggedIn: !!s.active, account: s.active ? s.active.account : null, expiresAt: s.active ? s.active.expiresAt : null, valid: s.active ? Date.now() < s.active.expiresAt : false, reviewOnly: true, message: 'REVIEW_ONLY — simulated login, no real browser session' };
}
function login(account) {
  var s = load();
  s.active = { account: account || 'doudian-merchant', expiresAt: Date.now() + 24 * 60 * 60 * 1000, token: '***REDACTED***', loginAt: new Date().toISOString() };
  save(s);
  return { success: true, account: s.active.account, expiresAt: s.active.expiresAt, message: 'Login simulated (REVIEW_ONLY). No real browser session created.' };
}
function logout() { var s = load(); delete s.active; save(s); return { success: true }; }
if (!fs.existsSync(SESSIONS_FILE)) save({});
module.exports = { getStatus: getStatus, login: login, logout: logout };
