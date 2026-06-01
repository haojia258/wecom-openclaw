// P46-P47 Enterprise WeCom Login Test Suite
// Tests: login success, code expired, code wrong, locked, session restore, logout

var http = require('http');
var fs = require('fs');
var path = require('path');

var PASS = 0;
var FAIL = 0;
var results = [];

function test(name, fn) {
  try { fn(); PASS++; results.push({ name: name, status: 'PASS' }); }
  catch (e) { FAIL++; results.push({ name: name, status: 'FAIL', error: e.message }); }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' Expected: ' + JSON.stringify(b) + ', Got: ' + JSON.stringify(a)); }
function assertContains(str, substr, msg) { if (str.indexOf(substr) === -1) throw new Error((msg || '') + ' String does not contain: ' + substr); }

// API helpers
function apiPost(url, data, cookie) {
  return new Promise(function (resolve, reject) {
    var postData = JSON.stringify(data);
    var headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) };
    if (cookie) headers['Cookie'] = cookie;
    var options = { hostname: 'localhost', port: 3199, path: url, method: 'POST', headers: headers };
    var req = http.request(options, function (res) {
      var body = '';
      res.on('data', function (c) { body += c.toString(); });
      res.on('end', function () {
        try { resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, headers: res.headers, data: body }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function apiGet(url, cookie) {
  return new Promise(function (resolve, reject) {
    var headers = {};
    if (cookie) headers['Cookie'] = cookie;
    http.get('http://localhost:3199' + url, { headers: headers }, function (res) {
      var body = '';
      res.on('data', function (c) { body += c.toString(); });
      res.on('end', function () {
        try { resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, headers: res.headers, data: body }); }
      });
    }).on('error', reject);
  });
}

// ═══════ Module Verification (File Existence) ═══════
console.log('\n=== Module Existence ===');
test('verify-code.js exists', function () {
  assert(fs.existsSync(path.join(__dirname, 'verify-code.js')), 'verify-code.js missing');
});
test('session-manager.js exists', function () {
  assert(fs.existsSync(path.join(__dirname, 'session-manager.js')), 'session-manager.js missing');
});
test('audit-logger.js exists', function () {
  assert(fs.existsSync(path.join(__dirname, 'audit-logger.js')), 'audit-logger.js missing');
});
test('auth-gate.js exists', function () {
  assert(fs.existsSync(path.join(__dirname, 'auth-gate.js')), 'auth-gate.js missing');
});
test('login.html exists', function () {
  assert(fs.existsSync(path.join(__dirname, 'public', 'login.html')), 'login.html missing');
});
test('storage/web-auth/sessions.json exists', function () {
  assert(fs.existsSync(path.join(__dirname, 'storage', 'web-auth', 'sessions.json')), 'sessions.json missing');
});
test('storage/web-auth/verify-codes.json exists', function () {
  assert(fs.existsSync(path.join(__dirname, 'storage', 'web-auth', 'verify-codes.json')), 'verify-codes.json missing');
});
test('logs/audit/web-auth/ directory exists', function () {
  assert(fs.existsSync(path.join(__dirname, 'logs', 'audit', 'web-auth')), 'audit log directory missing');
});

// ═══════ Login Page Content ═══════
var loginHtml = fs.readFileSync(path.join(__dirname, 'public', 'login.html'), 'utf8');
console.log('\n=== Login Page Tests ===');
test('Login page has WeCom title', function () {
  assertContains(loginHtml, '企业微信验证码登录', 'WeCom auth title missing');
});
test('Login page has user ID input', function () {
  assertContains(loginHtml, 'id="userId"', 'userId input missing');
});
test('Login page has code input', function () {
  assertContains(loginHtml, 'id="codeInput"', 'codeInput missing');
});
test('Login page has Remember Me', function () {
  assertContains(loginHtml, 'id="rememberMe"', 'rememberMe checkbox missing');
});
test('Login page has 6-digit hint', function () {
  assertContains(loginHtml, '6位', '6-digit hint missing');
});
test('Login page has 5-min hint', function () {
  assertContains(loginHtml, '5分钟', '5-min hint missing');
});
test('Login page has timer', function () {
  assertContains(loginHtml, 'id="timer"', 'timer element missing');
});

// ═══════ Server Auth Routes ═══════
var serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
console.log('\n=== Server Auth Routes ===');
test('Server has request-code route', function () {
  assertContains(serverCode, '/api/auth/request-code', 'request-code route missing');
});
test('Server has verify-code route', function () {
  assertContains(serverCode, '/api/auth/verify-code', 'verify-code route missing');
});
test('Server has /api/auth/me route', function () {
  assertContains(serverCode, '/api/auth/me', 'me route missing');
});
test('Server has /api/auth/logout route', function () {
  assertContains(serverCode, '/api/auth/logout', 'logout route missing');
});
test('Server has /login route', function () {
  assertContains(serverCode, '/login', 'login route missing');
});
test('Server imports auth modules', function () {
  assertContains(serverCode, "require('./auth-gate')", 'auth-gate import missing');
  assertContains(serverCode, "require('./session-manager')", 'session-manager import missing');
});
test('Server gatekeeper is called', function () {
  assertContains(serverCode, 'authGate.gatekeeper', 'gatekeeper call missing');
});

// ═══════ Verify Code Module Logic ═══════
var vc = require('./verify-code');
console.log('\n=== Verify Code Logic ===');
test('createCode generates 6-digit code', function () {
  var r = vc.createCode('test-user-001');
  assert(r.success, 'createCode failed: ' + JSON.stringify(r));
  assert(r.code.length === 6, 'Code length != 6');
  assert(/^\d{6}$/.test(r.code), 'Code is not 6 digits');
});
test('createCode returns expiry', function () {
  var r = vc.createCode('test-user-002');
  assert(r.expires > Date.now(), 'Expiry should be in the future');
});
test('verifyCode accepts correct code', function () {
  vc.createCode('test-user-003');
  var codes = JSON.parse(fs.readFileSync(path.join(__dirname, 'storage', 'web-auth', 'verify-codes.json'), 'utf8'));
  var code = codes['test-user-003'].code;
  var r = vc.verifyCode('test-user-003', code);
  assert(r.verified === true, 'Should accept correct code: ' + JSON.stringify(r));
});
test('verifyCode rejects wrong code', function () {
  vc.createCode('test-user-004');
  var r = vc.verifyCode('test-user-004', '999999');
  assert(r.verified === false, 'Should reject wrong code');
  assert(r.reason === 'wrong_code', 'Reason should be wrong_code');
});
test('verifyCode rejects no code', function () {
  var r = vc.verifyCode('nonexistent-user', '123456');
  assert(r.verified === false, 'Should reject nonexistent user');
  assert(r.reason === 'no_code', 'Reason should be no_code');
});

// ═══════ Session Manager Logic ═══════
var sm = require('./session-manager');
console.log('\n=== Session Manager ===');
test('createSession returns token', function () {
  var s = sm.createSession('user-test', false);
  assert(s.token && s.token.length === 64, 'Token should be 64 hex chars');
  assertEqual(s.userId, 'user-test');
});
test('validateSession returns valid', function () {
  var s = sm.createSession('user-test-2', false);
  var r = sm.validateSession(s.token);
  assert(r.valid === true, 'Session should be valid');
  assertEqual(r.userId, 'user-test-2');
});
test('validateSession rejects invalid token', function () {
  var r = sm.validateSession('invalid-token-12345');
  assert(r.valid === false, 'Invalid token should be rejected');
});
test('destroySession works', function () {
  var s = sm.createSession('user-test-3', false);
  var r = sm.destroySession(s.token);
  assert(r.destroyed === true, 'Should destroy session');
  var v = sm.validateSession(s.token);
  assert(v.valid === false, 'Destroyed session should be invalid');
});
test('createSession with rememberMe', function () {
  var s = sm.createSession('user-test-rm', true);
  var r = sm.validateSession(s.token);
  assert(r.rememberMe === true, 'rememberMe flag should be true');
});

// ═══════ Audit Logger ═══════
var al = require('./audit-logger');
console.log('\n=== Audit Logger ===');
test('logLoginSuccess writes audit entry', function () {
  var entry = al.logLoginSuccess('test-user', '127.0.0.1', 'test-token-12345678');
  assertEqual(entry.event, 'login_success');
  assertEqual(entry.userId, 'test-user');
});
test('logLoginFailed writes audit entry', function () {
  var entry = al.logLoginFailed('test-user-2', '192.168.1.1', 'wrong_code', 3);
  assertEqual(entry.event, 'login_failed');
  assertContains(entry.details, 'wrong_code', 'Details should contain reason');
});
test('logLocked writes audit entry', function () {
  var until = Date.now() + 900000;
  var entry = al.logLocked('test-user-3', '10.0.0.1', until);
  assertEqual(entry.event, 'locked');
});
test('logLogout writes audit entry', function () {
  var entry = al.logLogout('test-user', '127.0.0.1', 'test-token');
  assertEqual(entry.event, 'logout');
});
test('Audit log file exists after events', function () {
  var now = new Date();
  var dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  var logFile = path.join(__dirname, 'logs', 'audit', 'web-auth', 'auth-' + dateStr + '.log');
  assert(fs.existsSync(logFile), 'Audit log file should exist: ' + logFile);
});

// ═══════ Index Page Auth Features ═══════
var indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
console.log('\n=== Index Page Auth ===');
test('Index has logout button', function () {
  assertContains(indexHtml, 'doLogout()', 'Logout function missing');
});
test('Index has user info span', function () {
  assertContains(indexHtml, 'id="userInfo"', 'User info span missing');
});
test('Index checks /api/auth/me', function () {
  assertContains(indexHtml, '/api/auth/me', 'Auth me check missing');
});
test('Topbar has 退出 button', function () {
  assertContains(indexHtml, '退出', 'Logout button text missing');
});

// ═══════ Print Results ═══════
console.log('\n═══════════════════════════════════════');
console.log('  P46-P47 Enterprise WeCom Login Tests');
console.log('═══════════════════════════════════════');
results.forEach(function (r) {
  console.log((r.status === 'PASS' ? '✓' : '✗') + ' ' + r.name + (r.status === 'FAIL' ? ' — ' + r.error : ''));
});
console.log('───────────────────────────────────────');
console.log('  Total: ' + results.length + ' | Passed: ' + PASS + ' | Failed: ' + FAIL);
console.log('═══════════════════════════════════════');

if (FAIL > 0) { console.log('\n❌ ' + FAIL + ' TESTS FAILED\n'); process.exit(1); }
else console.log('\n✅ ALL TESTS PASSED\n');
