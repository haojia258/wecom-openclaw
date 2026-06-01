// P46-P47 Integration Test — starts server, tests full auth flow
var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = 3198; // Use different port for integration test
var server = require('./server.js');
// Override port
server.close();
server.listen(PORT, function () {
  console.log('Test server on port ' + PORT);
  runTests();
});

function apiPost(url, data) {
  return new Promise(function (resolve) {
    var postData = JSON.stringify(data);
    var options = { hostname: 'localhost', port: PORT, path: url, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } };
    var req = http.request(options, function (res) {
      var body = '';
      res.on('data', function (c) { body += c.toString(); });
      res.on('end', function () {
        try { resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.write(postData);
    req.end();
  });
}

function apiGet(url) {
  return new Promise(function (resolve) {
    http.get('http://localhost:' + PORT + url, function (res) {
      var body = '';
      res.on('data', function (c) { body += c.toString(); });
      res.on('end', function () { resolve({ status: res.statusCode, data: body }); });
    });
  });
}

var PASS = 0, FAIL = 0;
function test(name, cond, msg) {
  if (cond) { PASS++; console.log('  ✓ ' + name); }
  else { FAIL++; console.log('  ✗ ' + name + ' — ' + (msg || 'FAILED')); }
}

async function runTests() {
  console.log('\n═══════════════════════════════════════');
  console.log('  P46-P47 Auth Integration Tests');
  console.log('═══════════════════════════════════════\n');

  // 1. Login page served
  console.log('1. Login Page');
  var r = await apiGet('/login');
  test('Login page loads (200)', r.status === 200, 'Got ' + r.status);
  test('Contains WeCom title', r.data.indexOf('企业微信验证码登录') > 0);

  // 2. Request code
  console.log('\n2. Request Verification Code');
  r = await apiPost('/api/auth/request-code', { userId: 'haoji' });
  test('Code request succeeds', r.data.success === true, JSON.stringify(r.data));
  test('Returns 6-digit code', r.data.code && r.data.code.length === 6);
  test('Returns expiry', r.data.expiresIn && r.data.expiresIn.length > 0);

  // 3. Verify with correct code
  console.log('\n3. Verify Correct Code');
  r = await apiPost('/api/auth/request-code', { userId: 'codex' });
  var code = r.data.code;
  r = await apiPost('/api/auth/verify-code', { userId: 'codex', code: code, rememberMe: false });
  test('Login success', r.data.verified === true, JSON.stringify(r.data));
  test('Returns userId', r.data.userId === 'codex');
  var cookies = r.headers['set-cookie'];
  var hasCookie = cookies && (Array.isArray(cookies) ? cookies[0] : cookies).indexOf('wcom_session=') === 0;
  test('Sets session cookie', hasCookie);

  // 4. Verify with wrong code
  console.log('\n4. Wrong Verification Code');
  r = await apiPost('/api/auth/request-code', { userId: 'wrong-test' });
  r = await apiPost('/api/auth/verify-code', { userId: 'wrong-test', code: '000000' });
  test('Wrong code rejected', r.data.verified === false, JSON.stringify(r.data));
  test('Reason is wrong_code', r.data.reason === 'wrong_code');
  test('Shows remaining attempts', r.data.message.indexOf('attempts') > -1 || r.data.message.indexOf('remaining') > -1 || r.data.message.indexOf('次') > -1);

  // 5. Lockout
  console.log('\n5. Lockout Test (5 wrong attempts)');
  r = await apiPost('/api/auth/request-code', { userId: 'lock-test-user' });
  var attemptsResult = '';
  for (var i = 0; i < 5; i++) {
    r = await apiPost('/api/auth/verify-code', { userId: 'lock-test-user', code: '999999' });
    if (i === 4) attemptsResult = r.data.reason;
  }
  test('Account locked after 5 attempts', attemptsResult === 'locked', 'Got: ' + attemptsResult);

  // 6. Remember Me
  console.log('\n6. Remember Me');
  r = await apiPost('/api/auth/request-code', { userId: 'remember-test' });
  r = await apiPost('/api/auth/verify-code', { userId: 'remember-test', code: r.data.code, rememberMe: true });
  test('Login with rememberMe succeeds', r.data.verified === true);

  // 7. Auth gate redirect
  console.log('\n7. Auth Gate Redirect');
  r = await apiGet('/');
  test('Root redirects without cookie', r.status >= 300 && r.status < 400, 'Status: ' + r.status);

  // 8. Status endpoint (public, no redirect)
  console.log('\n8. Public Endpoint');
  r = await apiGet('/api/status');
  test('/api/status is public', r.status === 200 && r.data.indexOf('ok') > 0);

  // 9. Logout
  console.log('\n9. Logout');
  r = await apiPost('/api/auth/request-code', { userId: 'logout-test' });
  r = await apiPost('/api/auth/verify-code', { userId: 'logout-test', code: r.data.code });
  // Get session cookie from verify response
  var cookies = r.headers['set-cookie'];
  var sessionCookie = Array.isArray(cookies) ? cookies[0] : cookies;
  // Logout with session cookie
  var postData = JSON.stringify({});
  var options = { hostname: 'localhost', port: PORT, path: '/api/auth/logout', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData), 'Cookie': sessionCookie } };
  r = await new Promise(function (resolve) {
    var req = http.request(options, function (res) {
      var body = '';
      res.on('data', function (c) { body += c.toString(); });
      res.on('end', function () { resolve({ status: res.statusCode, data: JSON.parse(body) }); });
    });
    req.write(postData);
    req.end();
  });
  test('Logout succeeds', r.data.success === true, JSON.stringify(r.data));

  // 10. /login page content
  console.log('\n10. Login Page Content');
  r = await apiGet('/login');
  test('Has Remember Me', r.data.indexOf('rememberMe') > 0);
  test('Has timer', r.data.indexOf('timer') > 0);
  test('Has 6-digit hint', r.data.indexOf('6位') > 0);

  // Results
  console.log('\n───────────────────────────────────────');
  console.log('  Total: ' + (PASS + FAIL) + ' | Passed: ' + PASS + ' | Failed: ' + FAIL);
  console.log('═══════════════════════════════════════');
  if (FAIL > 0) { console.log('\n❌ ' + FAIL + ' INTEGRATION TESTS FAILED\n'); server.close(); process.exit(1); }
  else console.log('\n✅ ALL INTEGRATION TESTS PASSED\n');
  server.close();
  process.exit(0);
}
