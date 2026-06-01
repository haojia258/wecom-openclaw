// P46-P47 Web Console Server v0.5 — Auth + Deployment Center API
var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');
var PORT = process.env.WEB_CONSOLE_PORT || 3199;
var PUBLIC = path.join(__dirname, 'public');

var MIME = { '.html': 'text/html;charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

// P46 Auth modules
var verifyCode = require('./verify-code');
var sessionManager = require('./session-manager');
var auditLogger = require('./audit-logger');
var authGate = require('./auth-gate');

var server = http.createServer(function (req, res) {
  var parsedUrl = url.parse(req.url, true);
  var pathname = parsedUrl.pathname;

  // P46 Auth Gate — redirect unauthenticated users
  var gate = authGate.gatekeeper(req);
  if (!gate.allowed) {
    res.writeHead(302, { 'Location': gate.redirect });
    return res.end();
  }

  // ═══════ P46-P47 Auth API ═══════
  if (pathname === '/login' || pathname === '/login.html') return serveFile('/login.html', res);

  if (pathname === '/api/auth/request-code' && req.method === 'POST') return handleRequestCode(req, res);
  if (pathname === '/api/auth/verify-code' && req.method === 'POST') return handleVerifyCode(req, res);
  if (pathname === '/api/auth/me') return handleMe(req, res);
  if (pathname === '/api/auth/logout' && req.method === 'POST') return handleLogout(req, res);

  // ═══════ P48 Audit API ═══════
  if (pathname === '/api/audit/login') return serveJSON(getAuditLogins(), res);
  if (pathname === '/api/audit/deployments') return serveJSON(getAuditDeployments(), res);
  if (pathname === '/api/audit/dispatches') return serveJSON(getAuditDispatches(), res);
  if (pathname === '/api/audit/workers') return serveJSON(getAuditWorkers(), res);
  if (pathname === '/api/audit/dangerous') return serveJSON(getAuditDangerous(), res);
  if (pathname === '/api/audit/search') return handleAuditSearch(req, parsedUrl, res);

  // ═══════ P50.1 Asset Library API ═══════
  if (pathname === '/api/assets') return serveJSON(getAssets(parsedUrl.query), res);
  if (pathname === '/api/assets/stats') return serveJSON(getAssetStats(), res);
  if (pathname === '/api/assets/filters') return serveJSON(getAssetFilters(), res);
  if (pathname === '/api/assets/tags') return serveJSON(getAssetTags(), res);
  if (pathname === '/api/assets/import' && req.method === 'POST') return handleAssetImport(req, res);
  if (pathname === '/api/assets/delete' && req.method === 'POST') return handleAssetDelete(req, res);
  if (pathname === '/api/assets/audit') return serveJSON(getAssetAuditLogs(), res);

  // ═══════ P50.2-P50.5 Harvester API ═══════
  if (pathname === '/api/assets/tasks' && req.method === 'GET') return serveJSON(getHarvesterTasks(parsedUrl.query), res);
  if (pathname === '/api/assets/tasks' && req.method === 'POST') return handleCreateHarvesterTask(req, res);
  if (pathname === '/api/assets/sync') return serveJSON(getSyncStatus(), res);
  if (pathname === '/api/assets/sync/nas' && req.method === 'POST') return handleSyncNAS(req, res);
  if (pathname === '/api/assets/sync/notion' && req.method === 'POST') return handleSyncNotion(req, res);

  // ═══════ P51 Compass API ═══════
  if (pathname === '/api/compass/status') return serveJSON(getCompassStatus(), res);
  if (pathname === '/api/compass/import' && req.method === 'POST') return handleCompassImport(req, res);
  if (pathname === '/api/compass/validate' && req.method === 'POST') return handleCompassValidate(req, res);
  if (pathname === '/api/compass/mapping') return serveJSON(getCompassMapping(), res);
  if (pathname === '/api/compass/history') return serveJSON(getCompassHistory(), res);
  if (pathname === '/api/compass/audit') return serveJSON(getCompassAudit(), res);

  // ═══════ P52 Douyin Console API ═══════
  if (pathname === '/api/doudian-console/status') return serveJSON(getConsoleStatus(), res);
  if (pathname === '/api/doudian-console/login' && req.method === 'POST') return handleConsoleLogin(req, res);
  if (pathname === '/api/doudian-console/screenshot' && req.method === 'POST') return handleConsoleScreenshot(req, res);
  if (pathname === '/api/doudian-console/plan' && req.method === 'POST') return handleConsolePlan(req, res);
  if (pathname === '/api/doudian-console/product-create/preview' && req.method === 'POST') return handleConsolePreview('product_create', req, res);
  if (pathname === '/api/doudian-console/price-update/preview' && req.method === 'POST') return handleConsolePreview('price_update', req, res);
  if (pathname === '/api/doudian-console/order-ship/preview' && req.method === 'POST') return handleConsolePreview('order_ship', req, res);
  if (pathname === '/api/doudian-console/qianchuan-plan/preview' && req.method === 'POST') return handleConsolePreview('qianchuan', req, res);
  if (pathname === '/api/doudian-console/audit') return serveJSON(getConsoleAudit(), res);

  // ═══════ P53 Activity Center API ═══════
  if (pathname === '/api/activities/status') return serveJSON(getActStatus(), res);
  if (pathname === '/api/activities') return serveJSON(getActivities(), res);
  if (pathname === '/api/activities/profit' && req.method === 'POST') return serveJSON(getActProfits(), res);
  if (pathname === '/api/activities/risk' && req.method === 'POST') return serveJSON(getActRisks(), res);
  if (pathname === '/api/activities/recommend' && req.method === 'POST') return serveJSON(getActRecommend(), res);
  if (pathname === '/api/activities/enroll-plan' && req.method === 'POST') return handleActEnroll(req, res);
  if (pathname === '/api/activities/history') return serveJSON(getActHistory(), res);
  if (pathname === '/api/activities/audit') return serveJSON(getActAudit(), res);
  if (pathname === '/api/activities/auto-scan') return serveJSON(getActAutoScan(), res);
  if (pathname === '/api/activities/auto-plans') return serveJSON(getActAutoPlans(), res);

  // ═══════ P54 Autonomous Loop API ═══════
  if (pathname === '/api/autonomous/status') return serveJSON(getAutoStatus(), res);
  if (pathname === '/api/autonomous/today-plan') return serveJSON(getAutoTodayPlan(), res);
  if (pathname === '/api/autonomous/risks') return serveJSON(getAutoRisks(), res);
  if (pathname === '/api/autonomous/approvals') return serveJSON(getAutoApprovals(), res);
  if (pathname === '/api/autonomous/review' && req.method === 'POST') return serveJSON(getAutoReview(), res);
  if (pathname === '/api/autonomous/tomorrow-plan') return serveJSON(getAutoTomorrow(), res);
  if (pathname === '/api/autonomous/audit') return serveJSON(getAutoAudit(), res);

  // ═══════ P55-P59 Enterprise API ═══════
  if (pathname === '/api/kpi') return serveJSON(getKPIData(), res);
  if (pathname === '/api/kpi/history') return serveJSON(getKPIHistory(), res);
  if (pathname === '/api/goals') return serveJSON(getGoals(), res);
  if (pathname === '/api/goals' && req.method === 'POST') return handleCreateGoal(req, res);
  if (pathname === '/api/goals/plans') return serveJSON(getGoalPlans(), res);
  if (pathname === '/api/board') return serveJSON(getBoardData(), res);
  if (pathname === '/api/memory') return serveJSON(getMemoryData(), res);
  if (pathname === '/api/memory/search') return serveJSON(searchMemory(parsedUrl.query), res);
  if (pathname === '/api/brain') return serveJSON(getBrainData(), res);

  // ═══════ Phase D Cluster API ═══════
  if (pathname === '/api/cluster/status') return serveJSON(getClusterStatus(), res);
  if (pathname === '/api/cluster/nodes') return serveJSON(getClusterNodes(), res);
  if (pathname === '/api/cluster/workers') return serveJSON(getClusterWorkers(), res);
  if (pathname === '/api/cluster/queue') return serveJSON(getClusterQueue(), res);
  if (pathname === '/api/cluster/heartbeat') return serveJSON(getClusterHeartbeat(), res);
  if (pathname === '/api/cluster/audit') return serveJSON(getClusterAudit(), res);

  // ═══════ Index ═══════
  if (pathname === '/' || pathname === '/index.html') return serveFile('/index.html', res);

  // ═══════ Data API ═══════
  if (pathname === '/api/status') return serveJSON({ status: 'ok', version: 'v0.5', reviewOnly: true, authEnabled: true }, res);
  if (pathname === '/api/system') return serveJSON(collectSystemData(), res);
  if (pathname === '/api/approvals') return serveJSON(getApprovals(), res);

  // ═══════ HOTFIX-003 Smoke Test Gate ═══════
  if (pathname === '/api/smoke-test/status') return serveJSON(getSmokeTestStatus(), res);
  if (pathname === '/api/smoke-test/history') return serveJSON(getSmokeTestHistory(), res);

  // P43.1-P45.1 Deployment Center APIs
  if (pathname === '/api/branches') return serveJSON(getBranches(), res);
  if (pathname === '/api/prs') return serveJSON(getPRs(), res);
  if (pathname === '/api/tests') return serveJSON(getTests(), res);
  if (pathname === '/api/deployment-plans' && req.method === 'GET') return serveJSON(getDeploymentPlans(), res);
  if (pathname === '/api/deployment-plans' && req.method === 'POST') return handleCreateDeploymentPlan(req, res);
  if (pathname === '/api/rollback-registry') return serveJSON(getRollbackRegistry(), res);
  if (pathname === '/api/deploy-approvals') return serveJSON(getDeployApprovals(), res);

  serveFile(pathname, res);
});

function serveFile(filepath, res) {
  var fp = path.join(PUBLIC, filepath);
  if (!fs.existsSync(fp)) { res.writeHead(404); return res.end('Not Found'); }
  var ext = path.extname(fp);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
  fs.createReadStream(fp).pipe(res);
}

function serveJSON(data, res, statusCode, extraHeaders) {
  statusCode = statusCode || 200;
  var headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (extraHeaders) Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
}

// ═══════ P46 Auth Handlers ═══════

function handleRequestCode(req, res) {
  var body = '';
  req.on('data', function (chunk) { body += chunk.toString(); });
  req.on('end', function () {
    var data;
    try { data = JSON.parse(body); } catch (e) { return serveJSON({ error: 'Invalid JSON' }, res, 400); }

    var userId = data.userId;
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return serveJSON({ error: 'userId is required' }, res, 400);
    }
    userId = userId.trim();

    var result = verifyCode.createCode(userId);
    if (result.error === 'locked') {
      auditLogger.logLocked(userId, getClientIP(req), result.lockedUntil);
      return serveJSON(result, res, 429);
    }

    // In production, send code via WeCom API. For dev/test, return code in response.
    auditLogger.logEvent('code_requested', { userId: userId, ip: getClientIP(req), result: 'sent' });
    return serveJSON({
      success: true,
      message: 'Verification code sent to WeCom for ' + userId,
      expiresIn: Math.round(verifyCode.CODE_EXPIRY_MS / 1000) + 's',
      code: result.code  // Only in dev mode; remove in production
    }, res);
  });
}

function handleVerifyCode(req, res) {
  var body = '';
  req.on('data', function (chunk) { body += chunk.toString(); });
  req.on('end', function () {
    var data;
    try { data = JSON.parse(body); } catch (e) { return serveJSON({ error: 'Invalid JSON' }, res, 400); }

    var userId = data.userId;
    var inputCode = data.code;
    var rememberMe = !!data.rememberMe;

    if (!userId || !inputCode) {
      return serveJSON({ error: 'userId and code are required' }, res, 400);
    }
    userId = userId.trim();
    inputCode = String(inputCode).trim();

    var result = verifyCode.verifyCode(userId, inputCode);

    if (!result.verified) {
      if (result.reason === 'locked') {
        auditLogger.logLocked(userId, getClientIP(req), Date.now() + verifyCode.LOCKOUT_MS);
      } else {
        auditLogger.logLoginFailed(userId, getClientIP(req), result.reason, result.attempts || 0);
      }
      return serveJSON(result, res, 401);
    }

    // Create session
    var session = sessionManager.createSession(userId, rememberMe);
    auditLogger.logLoginSuccess(userId, getClientIP(req), session.token);

    var cookieMaxAge = rememberMe ? sessionManager.REMEMBER_TTL_MS : sessionManager.SESSION_TTL_MS;
    var cookieStr = 'wcom_session=' + session.token + '; Path=/; HttpOnly; Max-Age=' + Math.round(cookieMaxAge / 1000) + '; SameSite=Lax';

    serveJSON({
      verified: true,
      userId: session.userId,
      sessionExpires: session.expires,
      message: 'Login successful. Welcome, ' + userId + '!'
    }, res, 200, { 'Set-Cookie': cookieStr });
  });
}

function handleMe(req, res) {
  var token = authGate.getTokenFromCookies(req);
  if (!token) return serveJSON({ authenticated: false, reason: 'no_session' }, res, 401);

  var session = sessionManager.validateSession(token);
  if (!session.valid) return serveJSON({ authenticated: false, reason: session.reason }, res, 401);

  return serveJSON({
    authenticated: true,
    userId: session.userId,
    sessionExpires: session.expires,
    rememberMe: session.rememberMe
  }, res);
}

function handleLogout(req, res) {
  var token = authGate.getTokenFromCookies(req);
  if (!token) return serveJSON({ success: false, message: 'No active session' }, res);

  var result = sessionManager.destroySession(token);
  if (result.destroyed) {
    auditLogger.logLogout(result.userId, getClientIP(req), token);
  }

  // Clear cookie
  serveJSON({ success: true, message: 'Logged out successfully' }, res, 200, {
    'Set-Cookie': 'wcom_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax'
  });
}

function getClientIP(req) {
  return req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1';
}

// ═══════ Existing Data Functions ═══════

function collectSystemData() {
  return {
    node: process.version,
    uptime: Math.round(process.uptime()),
    platform: process.platform,
    reviewOnly: true,
    authEnabled: true,
    timestamp: new Date().toISOString()
  };
}

function getApprovals() {
  return [
    { id: 'appr-001', type: 'deploy_request', title: '部署 v1 Beta', status: 'pending', risk: 'high' },
    { id: 'appr-002', type: 'budget_change', title: '调整投流预算 +20%', status: 'pending', risk: 'medium' }
  ];
}

// ═══════ P43.1 Branch Monitor ═══════
function getBranches() {
  return {
    branches: [
      { name: 'main',    commit: 'abc1234', updated: Date.now() - 120000,        prStatus: 'Merged', prNumber: '#137', author: 'WorkBuddy' },
      { name: 'develop', commit: 'def5678', updated: Date.now() - 3600000,       prStatus: 'Open',   prNumber: '#140', author: 'Codex' },
      { name: 'feature/p43-deployment-center-enhancement', commit: 'g9h0i1j', updated: Date.now() - 600000, prStatus: 'Open', prNumber: '#141', author: 'WorkBuddy' },
      { name: 'feature/p40-system-center',  commit: 'k2l3m4n', updated: Date.now() - 7200000,       prStatus: 'Merged', prNumber: '#140', author: 'Codex' },
      { name: 'feature/p42-runtime',        commit: 'o5p6q7r', updated: Date.now() - 14400000,      prStatus: 'Merged', prNumber: '#139', author: 'WorkBuddy' },
    ],
    reviewOnly: true
  };
}

// ═══════ P43.2 PR Monitor ═══════
function getPRs() {
  return {
    prs: [
      { number: '#141', title: 'P43.1-P45.1 Deployment Center Enhancement',        author: 'WorkBuddy', status: 'Open',   branch: 'feature/p43-deployment-center-enhancement', target: 'develop', updated: Date.now() - 600000 },
      { number: '#140', title: 'P40-P42 System Center + Dispatch + Runtime',        author: 'Codex',     status: 'Merged', branch: 'feature/p40-system-center',         target: 'develop', updated: Date.now() - 7200000 },
      { number: '#139', title: 'P42 Runtime Monitor',                               author: 'WorkBuddy', status: 'Merged', branch: 'feature/p42-runtime',              target: 'develop', updated: Date.now() - 14400000 },
      { number: '#138', title: 'P41 Dispatch Center',                               author: 'Codex',     status: 'Merged', branch: 'feature/p41-dispatch',              target: 'develop', updated: Date.now() - 21600000 },
      { number: '#137', title: 'P17.1 Asset Foundation → main (Release Gate)',      author: 'WorkBuddy', status: 'Merged', branch: 'develop',                         target: 'main',    updated: Date.now() - 86400000 },
      { number: '#136', title: 'P16.9 Domain Gateway → develop',                    author: 'Codex',     status: 'Merged', branch: 'feature/p16-domain-gateway',       target: 'develop', updated: Date.now() - 90000000 },
      { number: '#135', title: 'P15.1 Dashboard Runtime → develop',                 author: 'WorkBuddy', status: 'Merged', branch: 'feature/p15-dashboard',            target: 'develop', updated: Date.now() - 93600000 },
      { number: '#134', title: 'P15 OSS Radar → develop',                           author: 'Codex',     status: 'Merged', branch: 'feature/p15-oss-radar',            target: 'develop', updated: Date.now() - 97200000 },
      { number: '#133', title: 'P11-P17 Merge Train → develop',                     author: 'WorkBuddy', status: 'Closed', branch: 'feature/p11-17-merge-train',       target: 'develop', updated: Date.now() - 172800000 },
    ],
    reviewOnly: true
  };
}

// ═══════ P43.3 Test Center ═══════
function getTests() {
  var now = Date.now();
  return {
    suites: [
      { name: 'Full Suite',         passed: 398, total: 398, command: 'npm test',           duration: '12.4s', status: 'pass',   lastRun: now - 60000 },
      { name: 'Web Console Tests',  passed: 45,  total: 45,  command: 'npm run test:web',   duration: '2.1s',  status: 'pass',   lastRun: now - 120000 },
      { name: 'Deployment Tests',   passed: 22,  total: 22,  command: 'npm run test:deploy',duration: '1.8s',  status: 'pass',   lastRun: now - 180000 },
    ],
    recentRuns: [
      { id: 'run-008', suite: 'Full Suite',         result: '398/398 PASS', duration: '12.4s',   timestamp: now - 60000,    status: 'pass' },
      { id: 'run-007', suite: 'Web Console Tests',  result: '45/45 PASS',   duration: '2.1s',    timestamp: now - 120000,   status: 'pass' },
      { id: 'run-006', suite: 'Deployment Tests',   result: '22/22 PASS',   duration: '1.8s',    timestamp: now - 180000,   status: 'pass' },
      { id: 'run-005', suite: 'Full Suite',         result: '398/398 PASS', duration: '11.9s',   timestamp: now - 900000,   status: 'pass' },
      { id: 'run-004', suite: 'Full Suite',         result: '397/398 PASS', duration: '14.2s',   timestamp: now - 3600000,  status: 'fail' },
      { id: 'run-003', suite: 'Full Suite',         result: '398/398 PASS', duration: '12.1s',   timestamp: now - 7200000,  status: 'pass' },
      { id: 'run-002', suite: 'Full Suite',         result: '396/398 PASS', duration: '13.5s',   timestamp: now - 10800000, status: 'fail' },
      { id: 'run-001', suite: 'Full Suite',         result: '398/398 PASS', duration: '12.3s',   timestamp: now - 14400000, status: 'pass' },
    ],
    reviewOnly: true
  };
}

// ═══════ P44.1 Deployment Plan ═══════
var deploymentPlans = [
  { id: 'dp-001', title: 'P40-P42 System Center Release',  targetBranch: 'main',    targetNode: '主服务器',  status: 'dispatched', created: Date.now() - 14400000,    approvedBy: 'Admin', approvedAt: Date.now() - 10800000 },
  { id: 'dp-002', title: 'P17.1 Asset Foundation Release', targetBranch: 'main',    targetNode: '主服务器',  status: 'approved',   created: Date.now() - 86400000,    approvedBy: 'Admin', approvedAt: Date.now() - 43200000 },
  { id: 'dp-003', title: 'P15 OSS Radar Hotfix',           targetBranch: 'develop', targetNode: '主服务器',  status: 'pending',    created: Date.now() - 3600000 },
  { id: 'dp-004', title: 'Node A Worker Update',           targetBranch: 'main',    targetNode: 'Node A',   status: 'pending',    created: Date.now() - 1800000 },
  { id: 'dp-005', title: 'Japan Proxy Rebuild',            targetBranch: 'develop', targetNode: '日本节点', status: 'draft',      created: Date.now() - 600000 },
];

function getDeploymentPlans() {
  return { plans: deploymentPlans, reviewOnly: true };
}

function handleCreateDeploymentPlan(req, res) {
  var body = '';
  req.on('data', function (chunk) { body += chunk.toString(); });
  req.on('end', function () {
    var plan;
    try { plan = JSON.parse(body); } catch (e) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid JSON' })); }
    if (!plan.title || !plan.targetBranch || !plan.targetNode) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Missing required fields: title, targetBranch, targetNode' }));
    }
    var newPlan = {
      id: 'dp-' + Date.now().toString(36),
      title: plan.title,
      targetBranch: plan.targetBranch,
      targetNode: plan.targetNode,
      status: 'pending',
      created: Date.now()
    };
    deploymentPlans.unshift(newPlan);
    res.writeHead(201, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ plan: newPlan, reviewOnly: true, message: 'Deployment plan created. Requires approval before dispatch.' }));
  });
}

// ═══════ P44.2 Rollback Registry ═══════
function getRollbackRegistry() {
  var now = Date.now();
  return {
    deployments: [
      { id: 'deploy-010', title: 'P40-P42 System Center Release',  branch: 'main',   node: '主服务器',  status: 'success',   deployedAt: now - 14400000,   artifact: 'v0.4.0-abc1234', rollbackPoint: 'v0.3.0-xyz7890' },
      { id: 'deploy-009', title: 'P17.1 Asset Foundation',        branch: 'main',   node: '主服务器',  status: 'success',   deployedAt: now - 86400000,   artifact: 'v0.3.0-xyz7890', rollbackPoint: 'v0.2.0-pqr3456' },
      { id: 'deploy-008', title: 'Web Console v1.0',              branch: 'main',   node: '主服务器',  status: 'success',   deployedAt: now - 172800000,  artifact: 'v0.2.0-pqr3456', rollbackPoint: 'v0.1.0-mno1234' },
      { id: 'deploy-007', title: 'P11-P17 Merge Train',           branch: 'main',   node: '主服务器',  status: 'success',   deployedAt: now - 259200000,  artifact: 'v0.1.0-mno1234', rollbackPoint: 'v0.0.9-ghi7890' },
      { id: 'deploy-006', title: 'P16 Dispatch → Node A',         branch: 'main',   node: 'Node A',   status: 'success',   deployedAt: now - 345600000,  artifact: 'v0.0.9-ghi7890', rollbackPoint: 'v0.0.8-def4567' },
      { id: 'deploy-005', title: 'P15.1 Dashboard Hotfix',        branch: 'develop',node: '主服务器',  status: 'failed',    deployedAt: now - 432000000,  artifact: 'v0.0.8-def4567', rollbackPoint: 'v0.0.7-abc1234' },
      { id: 'deploy-004', title: 'P12 WeChat Adapter v1',         branch: 'main',   node: '主服务器',  status: 'success',   deployedAt: now - 518400000,  artifact: 'v0.0.7-abc1234', rollbackPoint: 'v0.0.6-old0001' },
      { id: 'deploy-003', title: 'Worker Lock Fix (P0)',          branch: 'main',   node: '主服务器',  status: 'success',   deployedAt: now - 604800000,  artifact: 'v0.0.6-old0001', rollbackPoint: 'v0.0.5-old0002' },
      { id: 'deploy-002', title: 'Rate Limit Release Patch',      branch: 'main',   node: 'Node A',   status: 'success',   deployedAt: now - 691200000,  artifact: 'v0.0.5-old0002', rollbackPoint: 'v0.0.4-old0003' },
      { id: 'deploy-001', title: 'Initial OSS Radar v0.1',        branch: 'main',   node: '主服务器',  status: 'success',   deployedAt: now - 777600000,  artifact: 'v0.0.4-old0003', rollbackPoint: null },
    ],
    reviewOnly: true,
    policy: 'ROLLBACK_DISABLED — direct rollback forbidden. Create rollback approval request via /api/deploy-approvals.'
  };
}

// ═══════ P45.1 Approval Queue Integration ═══════
function getDeployApprovals() {
  var now = Date.now();
  return {
    approvals: [
      { id: 'da-001', type: 'deploy',  planId: 'dp-001', title: 'P40-P42 System Center → 主服务器',    status: 'dispatched', created: now - 14400000,  approvedBy: 'Admin', approvedAt: now - 10800000, risk: 'low' },
      { id: 'da-002', type: 'deploy',  planId: 'dp-002', title: 'P17.1 Asset Foundation → 主服务器',    status: 'approved',   created: now - 86400000,   approvedBy: 'Admin', approvedAt: now - 43200000, risk: 'medium' },
      { id: 'da-003', type: 'deploy',  planId: 'dp-003', title: 'P15 OSS Radar Hotfix → develop',        status: 'pending',    created: now - 3600000,  risk: 'medium' },
      { id: 'da-004', type: 'deploy',  planId: 'dp-004', title: 'Node A Worker Update → Node A',          status: 'pending',    created: now - 1800000,  risk: 'low' },
      { id: 'da-005', type: 'rollback',planId: null,      title: 'Rollback deploy-005 (P15.1 Hotfix)',   status: 'pending',    created: now - 600000,  risk: 'high', reason: 'deploy-005 failed, rollback to v0.0.7-abc1234' },
      { id: 'da-006', type: 'rollback',planId: null,      title: 'Rollback deploy-009 (Asset Foundation)', status: 'pending',   created: now - 300000,  risk: 'high', reason: 'Asset dedup regression detected' },
    ],
    flow: [
      { stage: 'pending',   label: 'Pending Review',   color: 'yellow' },
      { stage: 'approved',  label: 'Approved',          color: 'green' },
      { stage: 'dispatched',label: 'Dispatched',         color: 'blue' },
    ],
    policy: 'NO_DIRECT_EXEC — all deployment plans must go through pending→approved→dispatch. Direct execution is blocked.',
    reviewOnly: true
  };
}

// ═══════ P48 Audit Data ═══════
function getAuditLogins() {
  var now = Date.now();
  return {
    events: [
      { event_id: 'audit-001', event_type: 'login_success', user_id: 'haoji', status: 'success', risk_level: 'INFO', timestamp: now - 60000 },
      { event_id: 'audit-002', event_type: 'login_failed', user_id: 'codex', status: 'failed', risk_level: 'WARN', timestamp: now - 120000 },
      { event_id: 'audit-003', event_type: 'locked', user_id: 'workbuddy', status: 'locked', risk_level: 'WARN', timestamp: now - 180000 },
      { event_id: 'audit-004', event_type: 'logout', user_id: 'haoji', status: 'success', risk_level: 'INFO', timestamp: now - 300000 },
      { event_id: 'audit-005', event_type: 'login_success', user_id: 'deepseek', status: 'success', risk_level: 'INFO', timestamp: now - 600000 },
      { event_id: 'audit-006', event_type: 'code_requested', user_id: 'admin', status: 'info', risk_level: 'INFO', timestamp: now - 900000 },
    ],
    reviewOnly: true
  };
}

function getAuditDeployments() {
  var now = Date.now();
  return {
    events: [
      { event_id: 'audit-101', event_type: 'deployment_plan', resource: 'P40-P42 Release', user_id: 'workbuddy', status: 'planned', risk_level: 'INFO', timestamp: now - 14400000 },
      { event_id: 'audit-102', event_type: 'deployment_approved', resource: 'P40-P42 Release', user_id: 'Admin', status: 'approved', risk_level: 'INFO', timestamp: now - 10800000 },
      { event_id: 'audit-103', event_type: 'deployment_dispatched', resource: 'P40-P42 Release', user_id: 'workbuddy', status: 'dispatched', risk_level: 'INFO', timestamp: now - 7200000 },
      { event_id: 'audit-104', event_type: 'deployment_completed', resource: 'Web Console v1', user_id: 'codex', status: 'completed', risk_level: 'INFO', timestamp: now - 172800000 },
      { event_id: 'audit-105', event_type: 'deployment_failed', resource: 'P15.1 Hotfix', user_id: 'codex', status: 'failed', risk_level: 'HIGH', timestamp: now - 432000000 },
    ],
    reviewOnly: true
  };
}

function getAuditDispatches() {
  var now = Date.now();
  return {
    events: [
      { event_id: 'audit-201', event_type: 'dispatch_created', task_id: 'task-mptg89ev', source_node: '主服务器', target_node: 'Node A', status: 'created', timestamp: now - 600000 },
      { event_id: 'audit-202', event_type: 'dispatch_executed', task_id: 'task-mptcn6vg', source_node: '主服务器', target_node: '主服务器', status: 'executed', timestamp: now - 1200000 },
      { event_id: 'audit-203', event_type: 'dispatch_created', task_id: 'task-mpt7pfox', source_node: '主服务器', target_node: '日本节点', status: 'created', timestamp: now - 3600000 },
      { event_id: 'audit-204', event_type: 'dispatch_failed', task_id: 'task-mptdc8em', source_node: 'Node A', target_node: '日本节点', status: 'failed', timestamp: now - 7200000 },
    ],
    reviewOnly: true
  };
}

function getAuditWorkers() {
  var now = Date.now();
  return {
    events: [
      { event_id: 'audit-301', event_type: 'worker_received', task_id: 'task-mptg89ev', status: 'received', duration: '-', artifact_id: null, timestamp: now - 120000 },
      { event_id: 'audit-302', event_type: 'worker_started', task_id: 'task-mptg89ev', status: 'started', duration: '-', artifact_id: null, timestamp: now - 60000 },
      { event_id: 'audit-303', event_type: 'worker_completed', task_id: 'task-mptg89ev', status: 'completed', duration: '12.4s', artifact_id: 'art-oss-v1', timestamp: now },
      { event_id: 'audit-304', event_type: 'worker_failed', task_id: 'task-mptdc8em', status: 'failed', duration: '3.2s', artifact_id: null, timestamp: now - 86400000 },
    ],
    reviewOnly: true
  };
}

function getAuditDangerous() {
  var now = Date.now();
  return {
    events: [
      { event_id: 'audit-401', event_type: 'dangerous_action_blocked', action: 'deploy', user_id: 'workbuddy', status: 'blocked_pending_approval', risk_level: 'CRITICAL', approval_id: 'da-001', timestamp: now - 3600000 },
      { event_id: 'audit-402', event_type: 'dangerous_action_blocked', action: 'rollback', user_id: 'codex', status: 'blocked_pending_approval', risk_level: 'CRITICAL', approval_id: 'da-005', timestamp: now - 1800000 },
      { event_id: 'audit-403', event_type: 'dangerous_action_blocked', action: 'price_update', user_id: 'workbuddy', status: 'blocked_pending_approval', risk_level: 'HIGH', approval_id: null, timestamp: now - 600000 },
      { event_id: 'audit-404', event_type: 'dangerous_action_rejected', action: 'merge', user_id: 'codex', status: 'rejected', risk_level: 'CRITICAL', approval_id: 'da-003', timestamp: now - 300000 },
      { event_id: 'audit-405', event_type: 'dangerous_action_blocked', action: 'env_modify', user_id: 'deepseek', status: 'blocked_pending_approval', risk_level: 'CRITICAL', approval_id: null, timestamp: now - 900000 },
      { event_id: 'audit-406', event_type: 'dangerous_action_blocked', action: 'ads_execute', user_id: 'workbuddy', status: 'blocked_pending_approval', risk_level: 'HIGH', approval_id: null, timestamp: now - 1500000 },
      { event_id: 'audit-407', event_type: 'dangerous_action_blocked', action: 'product_publish', user_id: 'workbuddy', status: 'blocked_pending_approval', risk_level: 'HIGH', approval_id: null, timestamp: now - 7200000 },
    ],
    reviewOnly: true,
    policy: 'DANGEROUS_ACTION_BLOCKED — all dangerous actions require approval→audit→execute. Direct execution is forbidden.'
  };
}

function handleAuditSearch(req, parsedUrl, res) {
  var query = parsedUrl.query || {};
  var keyword = (query.keyword || '').toLowerCase();
  var userId = query.userId;
  var nodeId = query.nodeId;

  var all = []
    .concat(getAuditLogins().events)
    .concat(getAuditDeployments().events)
    .concat(getAuditDispatches().events)
    .concat(getAuditWorkers().events)
    .concat(getAuditDangerous().events);

  if (keyword) all = all.filter(function (e) { return JSON.stringify(e).toLowerCase().indexOf(keyword) >= 0; });
  if (userId) all = all.filter(function (e) { return e.user_id === userId; });
  if (nodeId) all = all.filter(function (e) { return e.source_node === nodeId || e.target_node === nodeId || e.node_id === nodeId; });

  return serveJSON({ results: all, total: all.length, search: query }, res);
}

// ═══════ P50.1 Asset Library Data ═══════
var nowAssets = Date.now();
var MOCK_ASSETS = [
  { asset_id: 'ast-001', type: 'text', title: 'ROI Report Q1', platform: 'douyin', source_url: '', hash: 'a1b2c3', tags: ['roi', 'q1', 'report'], score: 85, risk_level: 'low', copyright_status: 'clean', review_status: 'approved', size_bytes: 12288, created_at: new Date(nowAssets - 86400000).toISOString(), updated_at: new Date(nowAssets - 3600000).toISOString() },
  { asset_id: 'ast-002', type: 'image', title: 'Ad Creative Banner', platform: 'taobao', source_url: 'https://taobao.com/img/123', hash: 'd4e5f6', tags: ['banner', 'ad', 'summer'], score: 72, risk_level: 'medium', copyright_status: 'pending', review_status: 'pending', size_bytes: 245760, created_at: new Date(nowAssets - 172800000).toISOString(), updated_at: new Date(nowAssets - 7200000).toISOString() },
  { asset_id: 'ast-003', type: 'video', title: 'Product Video Clip', platform: 'douyin', source_url: 'https://douyin.com/v/456', hash: 'g7h8i9', tags: ['product', 'tutorial', 'video'], score: 90, risk_level: 'low', copyright_status: 'clean', review_status: 'approved', size_bytes: 15728640, created_at: new Date(nowAssets - 259200000).toISOString(), updated_at: new Date(nowAssets - 14400000).toISOString() },
  { asset_id: 'ast-004', type: 'text', title: 'CTR Dataset May', platform: 'jd', source_url: '', hash: 'j1k2l3', tags: ['ctr', 'data', 'may'], score: 78, risk_level: 'low', copyright_status: 'clean', review_status: 'approved', size_bytes: 46080, created_at: new Date(nowAssets - 345600000).toISOString(), updated_at: new Date(nowAssets - 28800000).toISOString() },
  { asset_id: 'ast-005', type: 'text', title: 'Strategy Doc v2', platform: 'other', source_url: '', hash: 'm4n5o6', tags: ['strategy', 'doc'], score: 88, risk_level: 'low', copyright_status: 'clean', review_status: 'approved', size_bytes: 8192, created_at: new Date(nowAssets - 432000000).toISOString(), updated_at: new Date(nowAssets - 43200000).toISOString() },
  { asset_id: 'ast-006', type: 'image', title: 'Campaign Banner', platform: 'pinduoduo', source_url: 'https://pinduoduo.com/img/789', hash: 'p7q8r9', tags: ['campaign', 'banner', 'promo'], score: 65, risk_level: 'medium', copyright_status: 'unknown', review_status: 'pending', size_bytes: 184320, created_at: new Date(nowAssets - 518400000).toISOString(), updated_at: new Date(nowAssets - 72000000).toISOString() },
  { asset_id: 'ast-007', type: 'audio', title: 'Tutorial Voiceover', platform: 'bilibili', source_url: 'https://bilibili.com/audio/abc', hash: 's1t2u3', tags: ['voiceover', 'tutorial', 'audio'], score: 75, risk_level: 'low', copyright_status: 'clean', review_status: 'approved', size_bytes: 2097152, created_at: new Date(nowAssets - 604800000).toISOString(), updated_at: new Date(nowAssets - 86400000).toISOString() },
  { asset_id: 'ast-008', type: 'text', title: 'Risk Assessment Report', platform: 'other', source_url: '', hash: 'v4w5x6', tags: ['risk', 'report', 'audit'], score: 82, risk_level: 'low', copyright_status: 'clean', review_status: 'approved', size_bytes: 14336, created_at: new Date(nowAssets - 691200000).toISOString(), updated_at: new Date(nowAssets - 108000000).toISOString() },
  { asset_id: 'ast-009', type: 'image', title: 'Summer Sale Image', platform: 'xiaohongshu', source_url: 'https://xiaohongshu.com/img/xyz', hash: 'y7z8a9', tags: ['summer', 'sale', 'product'], score: 75, risk_level: 'low', copyright_status: 'clean', review_status: 'approved', size_bytes: 327680, created_at: new Date(nowAssets - 777600000).toISOString(), updated_at: new Date(nowAssets - 144000000).toISOString() },
  { asset_id: 'ast-010', type: 'video', title: 'Live Stream Clip', platform: 'kuaishou', source_url: 'https://kuaishou.com/v/live', hash: 'b1c2d3', tags: ['live', 'clip', 'stream'], score: 92, risk_level: 'medium', copyright_status: 'pending', review_status: 'pending', size_bytes: 23068672, created_at: new Date(nowAssets - 864000000).toISOString(), updated_at: new Date(nowAssets - 172800000).toISOString() },
  { asset_id: 'ast-011', type: 'text', title: 'GMV Dashboard Config', platform: 'douyin', source_url: '', hash: 'e4f5g6', tags: ['gmv', 'dashboard', 'config'], score: 68, risk_level: 'low', copyright_status: 'clean', review_status: 'approved', size_bytes: 11264, created_at: new Date(nowAssets - 950400000).toISOString(), updated_at: new Date(nowAssets - 216000000).toISOString() },
  { asset_id: 'ast-012', type: 'image', title: 'Product Hero Shot', platform: 'taobao', source_url: 'https://taobao.com/img/hero', hash: 'h7i8j9', tags: ['hero', 'product', 'image'], score: 80, risk_level: 'low', copyright_status: 'clean', review_status: 'approved', size_bytes: 524288, created_at: new Date(nowAssets - 1036800000).toISOString(), updated_at: new Date(nowAssets - 259200000).toISOString() },
];

function getAssets(query) {
  var assets = MOCK_ASSETS.slice();
  query = query || {};
  if (query.type) assets = assets.filter(function (a) { return a.type === query.type; });
  if (query.platform) assets = assets.filter(function (a) { return a.platform === query.platform; });
  if (query.risk_level) assets = assets.filter(function (a) { return a.risk_level === query.risk_level; });
  if (query.keyword) {
    var kw = query.keyword.toLowerCase();
    assets = assets.filter(function (a) { return a.title.toLowerCase().indexOf(kw) >= 0 || a.tags.some(function (t) { return t.indexOf(kw) >= 0; }); });
  }
  if (query.tag) assets = assets.filter(function (a) { return a.tags.indexOf(query.tag) >= 0; });
  if (query.minScore) assets = assets.filter(function (a) { return a.score >= parseInt(query.minScore); });
  return { assets: assets, total: assets.length, filters: query };
}

function getAssetStats() {
  var assets = MOCK_ASSETS;
  var types = {}; assets.forEach(function (a) { types[a.type] = (types[a.type] || 0) + 1; });
  var platforms = {}; assets.forEach(function (a) { platforms[a.platform] = (platforms[a.platform] || 0) + 1; });
  var totalSize = assets.reduce(function (s, a) { return s + (a.size_bytes || 0); }, 0);
  return { total: assets.length, byType: types, byPlatform: platforms, totalSizeBytes: totalSize, totalSizeMB: (totalSize / 1048576).toFixed(1) };
}

function getAssetFilters() {
  var assets = MOCK_ASSETS;
  var types = [], platforms = [], riskLevels = [];
  var seenTypes = {}, seenPlatforms = {}, seenRisks = {};
  assets.forEach(function (a) {
    if (!seenTypes[a.type]) { types.push(a.type); seenTypes[a.type] = true; }
    if (!seenPlatforms[a.platform]) { platforms.push(a.platform); seenPlatforms[a.platform] = true; }
    if (!seenRisks[a.risk_level]) { riskLevels.push(a.risk_level); seenRisks[a.risk_level] = true; }
  });
  return { types: types, platforms: platforms, riskLevels: riskLevels };
}

function getAssetTags() {
  var tagCounts = {};
  MOCK_ASSETS.forEach(function (a) { a.tags.forEach(function (t) { tagCounts[t] = (tagCounts[t] || 0) + 1; }); });
  var tags = Object.keys(tagCounts).map(function (k) { return { tag: k, count: tagCounts[k] }; });
  tags.sort(function (a, b) { return b.count - a.count; });
  return { tags: tags };
}

function getAssetAuditLogs() {
  return {
    logs: [
      { audit_id: 'aa-001', asset_id: 'ast-003', action: 'import', user_id: 'workbuddy', risk_level: 'INFO', timestamp: new Date(nowAssets - 259200000).toISOString() },
      { audit_id: 'aa-002', asset_id: 'ast-005', action: 'import', user_id: 'codex', risk_level: 'INFO', timestamp: new Date(nowAssets - 432000000).toISOString() },
      { audit_id: 'aa-003', asset_id: 'ast-006', action: 'import', user_id: 'workbuddy', risk_level: 'INFO', timestamp: new Date(nowAssets - 518400000).toISOString() },
      { audit_id: 'aa-004', asset_id: 'ast-002', action: 'process', user_id: 'deepseek', risk_level: 'INFO', timestamp: new Date(nowAssets - 86400000).toISOString() },
      { audit_id: 'aa-005', asset_id: 'ast-001', action: 'export', user_id: 'haoji', risk_level: 'INFO', timestamp: new Date(nowAssets - 3600000).toISOString() },
    ],
    reviewOnly: true
  };
}

function handleAssetImport(req, res) {
  var body = '';
  req.on('data', function (chunk) { body += chunk.toString(); });
  req.on('end', function () {
    var data;
    try { data = JSON.parse(body); } catch (e) { return serveJSON({ error: 'Invalid JSON' }, res, 400); }
    if (!data.title || !data.type) return serveJSON({ error: 'title and type required' }, res, 400);
    var asset = {
      asset_id: 'ast-' + Date.now().toString(36),
      type: data.type, title: data.title, platform: data.platform || 'unknown', source_url: data.sourceUrl || '',
      hash: 'import-' + Date.now().toString(36), tags: data.tags || [],
      score: data.score || 50, risk_level: data.riskLevel || 'low',
      copyright_status: data.copyrightStatus || 'unknown', review_status: 'pending',
      size_bytes: data.sizeBytes || 0,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    MOCK_ASSETS.unshift(asset);
    serveJSON({ imported: true, asset: asset, reviewOnly: true, message: 'Asset imported. Requires approval for publishing.' }, res, 201);
  });
}

function handleAssetDelete(req, res) {
  var body = '';
  req.on('data', function (chunk) { body += chunk.toString(); });
  req.on('end', function () {
    var data;
    try { data = JSON.parse(body); } catch (e) { return serveJSON({ error: 'Invalid JSON' }, res, 400); }
    if (!data.assetId) return serveJSON({ error: 'assetId required' }, res, 400);
    // Check P48 dangerous-action-policy
    serveJSON({
      blocked: true,
      reason: 'dangerous_action_requires_approval',
      action: 'delete_asset',
      requiresApproval: true,
      reviewOnly: true,
      message: 'DELETE_BLOCKED: delete_asset requires approval via P48 Audit Gate. Cannot be executed directly.'
    }, res, 403);
  });
}

// ═══════ P50.2-P50.5 Harvester Data ═══════
var harvesterTasks = [
  { task_id: 'hvt-001', title: 'Douyin Product Images', type: 'manual', platform: 'douyin', status: 'done', progress: { collected: 12, total: 12, failed: 0 }, created_by: 'workbuddy', created_at: new Date(Date.now() - 86400000).toISOString(), rules: { collect_text: false, collect_image: true, max_items: 20 } },
  { task_id: 'hvt-002', title: 'Taobao Banner Ads', type: 'manual', platform: 'taobao', status: 'pending', progress: { collected: 0, total: 15, failed: 0 }, created_by: 'codex', created_at: new Date(Date.now() - 3600000).toISOString(), rules: { collect_text: true, collect_image: true, max_items: 15 } },
  { task_id: 'hvt-003', title: 'JD Product Reviews', type: 'scheduled', platform: 'jd', status: 'approved', progress: { collected: 0, total: 30, failed: 0 }, created_by: 'deepseek', created_at: new Date(Date.now() - 7200000).toISOString(), rules: { collect_text: true, collect_image: false, max_items: 30 } },
  { task_id: 'hvt-004', title: 'Kuaishou Live Clips', type: 'manual', platform: 'kuaishou', status: 'failed', progress: { collected: 2, total: 10, failed: 8 }, error: 'Network timeout', created_by: 'workbuddy', created_at: new Date(Date.now() - 14400000).toISOString(), rules: { collect_video: true, max_items: 10 } },
  { task_id: 'hvt-005', title: 'Xiaohongshu Notes', type: 'manual', platform: 'xiaohongshu', status: 'running', progress: { collected: 5, total: 25, failed: 0 }, created_by: 'workbuddy', created_at: new Date(Date.now() - 600000).toISOString(), rules: { collect_text: true, collect_image: true, max_items: 25 } }
];

function getHarvesterTasks(query) {
  var tasks = harvesterTasks.slice();
  query = query || {};
  if (query.status) tasks = tasks.filter(function (t) { return t.status === query.status; });
  if (query.platform) tasks = tasks.filter(function (t) { return t.platform === query.platform; });
  return { tasks: tasks, total: tasks.length, reviewOnly: true };
}

function handleCreateHarvesterTask(req, res) {
  var body = '';
  req.on('data', function (chunk) { body += chunk.toString(); });
  req.on('end', function () {
    var data;
    try { data = JSON.parse(body); } catch (e) { return serveJSON({ error: 'Invalid JSON' }, res, 400); }
    if (!data.title || !data.platform) return serveJSON({ error: 'title and platform required' }, res, 400);
    var task = {
      task_id: 'hvt-' + Date.now().toString(36),
      title: data.title, type: data.type || 'manual', platform: data.platform,
      status: 'pending',
      progress: { collected: 0, total: data.maxItems || 20, failed: 0 },
      rules: { collect_text: data.collectText !== false, collect_image: data.collectImage !== false, collect_audio: data.collectAudio || false, collect_video: data.collectVideo || false, max_items: data.maxItems || 20 },
      created_by: data.userId || 'system',
      created_at: new Date().toISOString(),
      approval_id: null
    };
    harvesterTasks.unshift(task);
    serveJSON({ task: task, reviewOnly: true, message: 'Harvester task created. Pending approval. REVIEW_ONLY=true.' }, res, 201);
  });
}

function getSyncStatus() {
  return {
    nas: { enabled: false, status: 'disabled', message: 'NAS adapter disabled (default). Local storage is primary.' },
    notion: { enabled: false, status: 'disabled', message: 'Notion adapter disabled (default). Local storage is primary.' },
    primaryStorage: 'local',
    reviewOnly: true
  };
}

function handleSyncNAS(req, res) {
  serveJSON({
    blocked: true,
    reason: 'sync_requires_approval',
    message: 'NAS sync requires approval. NAS adapter is currently disabled by default.',
    action: 'sync_nas',
    reviewOnly: true
  }, res, 403);
}

function handleSyncNotion(req, res) {
  serveJSON({
    blocked: true,
    reason: 'sync_requires_approval',
    message: 'Notion sync requires approval. Notion adapter is currently disabled by default.',
    action: 'sync_notion',
    reviewOnly: true
  }, res, 403);
}

// ═══════ P51 Compass Data ═══════
var compassHistory = [
  { id: 'cmp-001', importId: 'cmp-import-001', type: 'overview', typeName: '核心概览', rows: 30, sourceFile: 'compass-2026-05-30.xlsx', status: 'success', userId: 'workbuddy', timestamp: new Date(Date.now() - 86400000).toISOString() },
  { id: 'cmp-002', importId: 'cmp-import-002', type: 'products', typeName: '商品明细', rows: 145, sourceFile: 'compass-products-0531.csv', status: 'success', userId: 'codex', timestamp: new Date(Date.now() - 43200000).toISOString() },
  { id: 'cmp-003', importId: 'cmp-import-003', type: 'videos', typeName: '短视频明细', rows: 28, sourceFile: 'videos-detail.csv', status: 'failed', error: 'Missing headers: 完播率, 带货点击', userId: 'deepseek', timestamp: new Date(Date.now() - 3600000).toISOString() },
  { id: 'cmp-004', importId: 'cmp-import-004', type: 'live', typeName: '直播明细', rows: 12, sourceFile: 'live-0601.xlsx', status: 'pending', userId: 'workbuddy', timestamp: new Date(Date.now() - 600000).toISOString() },
];

var compassAuditLogs = [
  { event_type: 'compass_import_done', importId: 'cmp-import-001', type: 'overview', userId: 'workbuddy', status: 'success', timestamp: Date.now() - 86400000 },
  { event_type: 'compass_import_done', importId: 'cmp-import-002', type: 'products', userId: 'codex', status: 'success', timestamp: Date.now() - 43200000 },
  { event_type: 'compass_import_failed', importId: 'cmp-import-003', type: 'videos', userId: 'deepseek', status: 'failed', timestamp: Date.now() - 3600000 },
  { event_type: 'compass_validate_done', importId: 'cmp-import-004', type: 'live', userId: 'workbuddy', status: 'pending', timestamp: Date.now() - 600000 },
];

var compassTypes = [
  { type: 'overview', name: '核心概览', fieldCount: 8 },
  { type: 'transaction', name: '成交分析', fieldCount: 7 },
  { type: 'products', name: '商品明细', fieldCount: 15 },
  { type: 'videos', name: '短视频明细', fieldCount: 12 },
  { type: 'live', name: '直播明细', fieldCount: 10 },
  { type: 'audience', name: '人群画像', fieldCount: 8 },
  { type: 'service', name: '售后客服', fieldCount: 7 },
  { type: 'product_card', name: '商品卡', fieldCount: 6 },
];

function getCompassStatus() {
  return {
    status: 'active',
    featureGate: { COMPASS_IMPORT_ENABLED: true, COMPASS_BROWSER_EXPORT: false, COMPASS_AUTO_LOGIN: false, COMPASS_MAPPING_EDIT: false },
    types: compassTypes,
    totalImports: compassHistory.length,
    reviewOnly: true
  };
}

function getCompassMapping() {
  var map = {};
  compassTypes.forEach(function (t) {
    map[t.type] = { name: t.name, fieldCount: t.fieldCount };
  });
  return { mappings: map, featureGate: 'COMPASS_MAPPING_EDIT=false' };
}

function getCompassHistory() {
  return { history: compassHistory, total: compassHistory.length, reviewOnly: true };
}

function getCompassAudit() {
  return { events: compassAuditLogs, total: compassAuditLogs.length };
}

function handleCompassImport(req, res) {
  var body = '';
  req.on('data', function (chunk) { body += chunk.toString(); });
  req.on('end', function () {
    serveJSON({
      blocked: true,
      action: 'compass_import',
      requiresApproval: true,
      message: 'Compass import requires approval via P48 Audit Gate. Use /operations/compass to upload file and request approval.',
      reviewOnly: true
    }, res, 403);
  });
}

function handleCompassValidate(req, res) {
  var body = '';
  req.on('data', function (chunk) { body += chunk.toString(); });
  req.on('end', function () {
    var data;
    try { data = JSON.parse(body); } catch (e) { return serveJSON({ error: 'Invalid JSON' }, res, 400); }
    serveJSON({ valid: true, detectedType: data.type || 'overview', typeName: '核心概览', matchedFields: 8, missingFields: [], coverage: '100%' }, res);
  });
}

// ═══════ P52 Douyin Console Data ═══════
var consolePlans = [];
var consoleAuditLogs = [];
var consoleLoggedIn = false;
var consoleAccount = null;

function getConsoleStatus() {
  return {
    session: { loggedIn: consoleLoggedIn, account: consoleAccount, valid: consoleLoggedIn, reviewOnly: true },
    planner: { capabilities: ['product_create', 'price_update', 'order_ship', 'qianchuan', 'screenshot'], planned: consolePlans.length },
    message: 'REVIEW_ONLY — simulated console, no real browser session'
  };
}

function handleConsoleLogin(req, res) {
  var body = '';
  req.on('data', function (chunk) { body += chunk.toString(); });
  req.on('end', function () {
    var data;
    try { data = JSON.parse(body); } catch (e) { return serveJSON({ error: 'Invalid JSON' }, res, 400); }
    consoleLoggedIn = true;
    consoleAccount = data.account || 'doudian-merchant';
    serveJSON({ success: true, account: consoleAccount, expiresAt: Date.now() + 86400000, message: 'Login simulated (REVIEW_ONLY)' }, res);
  });
}

function handleConsoleScreenshot(req, res) {
  var body = '';
  req.on('data', function (chunk) { body += chunk.toString(); });
  req.on('end', function () {
    var data;
    try { data = JSON.parse(body); } catch (e) { data = {}; }
    var artifact = { id: 'scr-' + Date.now().toString(36), type: 'screenshot', page: data.page || 'Dashboard', capturedAt: new Date().toISOString(), size: { width: 1440, height: 900 }, message: 'Screenshot captured (REVIEW_ONLY simulated)' };
    serveJSON(artifact, res);
  });
}

function handleConsolePlan(req, res) {
  var body = '';
  req.on('data', function (chunk) { body += chunk.toString(); });
  req.on('end', function () {
    var data;
    try { data = JSON.parse(body); } catch (e) { return serveJSON({ error: 'Invalid JSON' }, res, 400); }
    var type = data.type;
    var plan = { planId: type.substring(0, 3) + '-' + Date.now().toString(36), type: type, action: type === 'product_create' ? 'product_publish' : type + '_execute', riskLevel: 'HIGH', status: 'pending_approval', data: data, approvalRequired: true };
    consolePlans.unshift(plan);
    serveJSON({ plan: plan, blocked: true, message: 'Plan created. Requires P48 approval before execution.', reviewOnly: true }, res);
  });
}

function handleConsolePreview(type, req, res) {
  serveJSON({
    planId: type.substring(0, 3) + '-' + Date.now().toString(36),
    action: type === 'product_create' ? 'product_publish' : type + '_execute',
    riskLevel: 'HIGH',
    status: 'pending_approval',
    previewAvailable: true,
    blocked: true,
    message: 'PREVIEW ONLY — ' + type.replace(/_/g, ' ') + ' plan requires P48 approval before execution.',
    policy: 'pending approval → approved → dispatch'
  }, res, 403);
}

function getConsoleAudit() {
  return { events: [{ event_type: 'doudian_plan_created', action: 'product_publish', userId: 'workbuddy', status: 'blocked_pending_approval', timestamp: Date.now() - 3600000 }, { event_type: 'doudian_login', userId: 'admin', status: 'success', timestamp: Date.now() - 7200000 }, { event_type: 'doudian_screenshot', page: 'Dashboard', userId: 'workbuddy', timestamp: Date.now() - 600000 }] };
}

// ═══════ P53 Activity Center Data ═══════
var activities = [
  { id: 'act-001', name: '618大促', type: 'promo', discount: 0.15, subsidy: 5000, startDate: '2026-06-15', endDate: '2026-06-19', status: 'upcoming', products: ['SKU-001', 'SKU-003'] },
  { id: 'act-002', name: '平台补贴', type: 'subsidy', discount: 0.1, subsidy: 3000, startDate: '2026-06-10', endDate: '2026-06-12', status: 'upcoming', products: ['SKU-002'] },
  { id: 'act-003', name: '商品卡活动', type: 'product_card', discount: 0.08, subsidy: 2000, startDate: '2026-06-05', endDate: '2026-06-09', status: 'running', products: ['SKU-001', 'SKU-005'] },
  { id: 'act-004', name: '节盟计划', type: 'festival', discount: 0.12, subsidy: 4000, startDate: '2026-06-20', endDate: '2026-06-22', status: 'upcoming', products: ['SKU-003', 'SKU-004'] },
  { id: 'act-005', name: '五一活动', type: 'promo', discount: 0.1, subsidy: 6000, startDate: '2026-05-01', endDate: '2026-05-05', status: 'done', products: ['SKU-002', 'SKU-003'] }
];

function getActStatus() { return { total: activities.length, upcoming: activities.filter(function (a) { return a.status === 'upcoming'; }).length, running: activities.filter(function (a) { return a.status === 'running'; }).length, reviewOnly: true }; }
function getActivities() { return { activities: activities, total: activities.length }; }
function getActProfits() { return { profits: activities.map(function (a) { var gmv = (a.products.length * 15000); return { activity: a.name, estimatedGMV: gmv, discountCost: Math.round(gmv * a.discount), subsidy: a.subsidy, netProfit: Math.round(gmv - gmv * a.discount + a.subsidy) }; }) }; }
function getActRisks() { return { risks: activities.map(function (a) { var s = a.discount > 0.15 ? 60 : a.discount > 0.1 ? 40 : 20; return { activity: a.name, riskScore: s, riskLevel: s >= 60 ? 'high' : s >= 30 ? 'medium' : 'low' }; }) }; }
function getActRecommend() { return { recommendations: activities.slice(0, 4).map(function (a, i) { return { activity: a.name, score: 100 - i * 15, shouldEnroll: i < 3, reason: i < 3 ? 'Recommended' : 'Not Recommended' }; }) }; }
function handleActEnroll(req, res) { serveJSON({ blocked: true, action: 'activity_enroll', requiresApproval: true, message: 'Enrollment requires P48 approval. Will NOT auto-enroll.', reviewOnly: true }, res, 403); }
function getActHistory() { return { history: activities.filter(function (a) { return a.status === 'done'; }) }; }
function getActAudit() { return { events: [{ event_type: 'activity_enrollment_planned', activity: '618大促', status: 'blocked', timestamp: Date.now() - 3600000 }] }; }

// ═══════ P54 Autonomous Loop Data ═══════
function getAutoStatus() {
  var h = new Date().getHours();
  var phase = h < 6 ? 'Collect' : h < 9 ? 'Schedule' : h < 22 ? 'Execute' : 'Review';
  return { phase: phase, schedule: [{ time: '00:00', action: '数据聚合' }, { time: '06:00', action: '今日计划' }, { time: '09:00', action: '风险检查' }, { time: '10:00', action: '审批生成' }, { time: '22:00', action: '晚间复盘' }, { time: '23:00', action: '明日方案' }], context: { P50: '12 assets', P51: '4 types imported', P52: 'connected', P53: '5 activities' }, reviewOnly: true };
}
function getAutoTodayPlan() { return { plan: { tasks: [{ id: 'op-1', title: '查看罗盘数据', type: 'analysis', priority: 'high' }, { id: 'op-2', title: '评估活动利润', type: 'analysis', priority: 'high' }, { id: 'op-3', title: '检查风险告警', type: 'risk', priority: 'high' }, { id: 'op-4', title: '审核素材库', type: 'asset', priority: 'medium' }, { id: 'op-5', title: '生成投流建议', type: 'ads', priority: 'medium' }, { id: 'op-6', title: '晚间复盘准备', type: 'review', priority: 'low' }], total: 6 }, content: { suggestions: [{ title: '夏季T恤产品展示', type: 'video', budget: 3000 }, { title: '618活动banner', type: 'image', budget: 1000 }] }, ads: { campaigns: [{ name: '618千川推广', budget: 8000, roi: '2.0x' }] }, reviewOnly: true }; }
function getAutoRisks() { return { alerts: [{ level: 'medium', message: 'SKU-004 库存仅12件，建议补货' }, { level: 'medium', message: '618大促 15%折扣 - 利润率可能承压' }, { level: 'low', message: '素材库 2项未审核' }, { level: 'low', message: '后台登录态即将过期' }], total: 4, riskLevel: 'medium' }; }
function getAutoApprovals() { return { tasks: [{ id: 'at-001', type: 'ads_execute', title: '618千川推广 ¥8000', risk: 'HIGH' }, { id: 'at-002', type: 'activity_enroll', title: '报名618大促', risk: 'HIGH' }, { id: 'at-003', type: 'product_publish', title: '上架夏季新品', risk: 'HIGH' }, { id: 'at-004', type: 'price_update', title: 'SKU-004调价', risk: 'HIGH' }], total: 4, reviewOnly: true }; }
function getAutoReview() { return { summary: { gmv: '¥158,000', orders: 320, roi: '1.8x', profit: '¥25,500' }, highlights: ['GMV 达标 ✓', '618活动利润可期'], actions: ['审批千川投流', '确认618报名', '补货 SKU-004'], tomorrowPrep: ['更新罗盘', '检查活动', '素材审核'] }; }
function getAutoTomorrow() { return { priorities: [{ task: '审批千川投流', type: 'approval', priority: 'critical' }, { task: '执行素材采集', type: 'asset', priority: 'high' }, { task: '确认618报名', type: 'activity', priority: 'high' }, { task: '复查SKU库存', type: 'risk', priority: 'medium' }], reviewOnly: true }; }
function getAutoAudit() { return { events: [{ event_type: 'autonomous_loop_started', phase: 'Execute', timestamp: Date.now() - 3600000 }, { event_type: 'autonomous_plan_generated', phase: 'Schedule', timestamp: Date.now() - 14400000 }] }; }

// ═══════ P55-P59 Enterprise Data ═══════
var nw = Date.now();
function getKPIData() { return { metrics: { gmv: { value: 158000, trend: '+2.5%', status: 'on_track' }, profit: { value: 25500, trend: '+3.1%', status: 'on_track' }, roi: { value: 1.8, status: 'stable' }, ctr: { value: 4.0, status: 'stable' }, cvr: { value: 8.9, status: 'improving' }, refundRate: { value: 3.2, status: 'improving' }, stockRisk: { value: 2, status: 'warning' }, activityRevenue: { value: 45000, status: 'tracking' }, assetScore: { value: 78, status: 'improving' } }, anomalies: [{ metric: 'stockRisk', message: 'SKU-004/005 库存<15', severity: 'medium' }], reviewOnly: true }; }
function getKPIHistory() { return { snapshots: ['2026-05-30', '2026-05-31', '2026-06-01'].map(function (d) { return { date: d, gmv: 150000 + Math.random() * 10000, roi: 1.7 + Math.random() * 0.3 }; }) }; }
var goals = [{ id: 'goal-001', title: '6月GMV目标 ¥160k', target: 160, unit: 'k¥', deadline: '2026-06-30', status: 'active', createdAt: new Date(nw - 86400000).toISOString() }];
function getGoals() { return { goals: goals, total: goals.length }; }
function handleCreateGoal(req, res) { var body = ''; req.on('data', function (c) { body += c; }); req.on('end', function () { var d; try { d = JSON.parse(body); } catch (e) { return serveJSON({ error: 'Invalid JSON' }, res, 400); } d.id = 'goal-' + Date.now().toString(36); d.status = 'active'; goals.unshift(d); serveJSON({ goal: d, reviewOnly: true }, res, 201); }); }
function getGoalPlans() { return { plans: [{ goal: '6月GMV目标', tasks: [{ task: '提升GMV', kpi: 'gmv', target: 160 }, { task: '降低退款率', kpi: 'refundRate', target: 2.5 }, { task: '优化ROI', kpi: 'roi', target: 2.0 }] }] }; }
function getBoardData() { return { revenue: { total: 158000, trend: '+2.5%' }, profit: { total: 25500, margin: '16.1%' }, roi: 1.8, risk: { level: 'medium', alerts: 4 }, budget: { allocated: 50000, spent: 32000, remaining: 18000 }, cashflow: { inflow: 158000, outflow: 132500, net: 25500 }, reviewOnly: true }; }
var memoryEntries = [{ id: 'mem-001', type: 'kpi', title: 'GMV Snapshot 06-01', data: { gmv: 158000 }, ts: new Date(nw - 3600000).toISOString() }, { id: 'mem-002', type: 'activity', title: '618 利润分析', ts: new Date(nw - 7200000).toISOString() }];
function getMemoryData() { return { entries: memoryEntries, total: memoryEntries.length }; }
function searchMemory(q) { return { entries: memoryEntries.filter(function (e) { return !q.keyword || JSON.stringify(e).toLowerCase().indexOf((q.keyword || '').toLowerCase()) >= 0; }) }; }
function getBrainData() {
  return { recommendations: [{ category: 'kpi', title: 'GMV 达标', action: 'maintain', priority: 'low' }, { category: 'risk', title: 'SKU-004 补货', action: 'restock', priority: 'high' }, { category: 'ads', title: '启动618千川', action: 'approve_then_execute', priority: 'high' }, { category: 'activity', title: '报名618大促', action: 'approve_then_enroll', priority: 'high' }], riskAlerts: [{ alert: 'SKU-004 库存仅12件', severity: 'high' }, { alert: '618 15%折扣', severity: 'medium' }], tomorrow: [{ task: '审批千川投流', pri: 'critical' }, { task: '确认618报名', pri: 'high' }], summary: '今日运营正常。GMV达标、ROI稳定。建议优先审批投流和活动报名。', reviewOnly: true };
}

// ═══════ Phase D Cluster Data ═══════
function getClusterStatus() { return { nodes: 3, online: 3, workers: 6, queue: { pending: 1, running: 1, completed: 1, failed: 0 }, failover: 'ready', reviewOnly: true }; }
function getClusterNodes() { return { nodes: [{ nodeId: 'main', hostname: '49.232.24.120', role: 'primary', cpu: 23, memory: 42, status: 'online', heartbeat: new Date().toISOString() }, { nodeId: 'node-a', hostname: 'node-a.internal', role: 'worker', cpu: 8, memory: 28, status: 'online', heartbeat: new Date().toISOString() }, { nodeId: 'japan', hostname: 'jp-node.internal', role: 'worker', cpu: 4, memory: 16, status: 'online', heartbeat: new Date().toISOString() }] }; }
function getClusterWorkers() { return { workers: [{ id: 'planner', type: 'planning', node: 'main', status: 'idle' }, { id: 'analysis', type: 'analysis', node: 'node-a', status: 'idle' }, { id: 'content', type: 'content', node: 'node-a', status: 'idle' }, { id: 'risk', type: 'risk', node: 'node-a', status: 'busy' }, { id: 'memory', type: 'memory', node: 'japan', status: 'idle' }, { id: 'review', type: 'review', node: 'japan', status: 'idle' }], total: 6 }; }
function getClusterQueue() { return { queue: [{ taskId: 't-001', type: 'analysis', status: 'running', node: 'node-a' }, { taskId: 't-002', type: 'content', status: 'pending', node: 'node-a' }, { taskId: 't-003', type: 'review', status: 'completed', node: 'japan' }], stats: { pending: 1, running: 1, completed: 1, failed: 0 } }; }
function getClusterHeartbeat() { return { heartbeats: [{ nodeId: 'main', alive: true, latency: '12ms' }, { nodeId: 'node-a', alive: true, latency: '28ms' }, { nodeId: 'japan', alive: true, latency: '45ms' }], interval: '15s' }; }
function getClusterAudit() { return { events: [{ event_type: 'node_online', nodeId: 'main', timestamp: Date.now() - 3600000 }, { event_type: 'task_dispatched', taskId: 't-001', timestamp: Date.now() - 60000 }] }; }

// ═══════ Activity Auto-Enroll ═══════
function getActAutoScan() {
  return { candidates: [{ activity: '平台补贴', profit: 13500, riskLevel: 'low', recommendedAction: 'generate_plan', stockOK: true }, { activity: '商城活动', profit: 12500, riskLevel: 'low', recommendedAction: 'generate_plan', stockOK: true }, { activity: '商品卡活动', profit: 8000, riskLevel: 'low', recommendedAction: 'generate_plan', stockOK: true }], count: 3, config: { AUTO_ACTIVITY_SCAN: true, AUTO_ACTIVITY_RECOMMEND: true, AUTO_ENROLL_PLAN: true, AUTO_ENROLL_EXECUTE: false }, scannedAt: new Date().toISOString() };
}
function getActAutoPlans() {
  return { plans: [{ activity: '平台补贴', planId: 'enr-auto001', profit: 13500, riskLevel: 'low', status: 'pending_approval', blocked: true }, { activity: '商城活动', planId: 'enr-auto002', profit: 12500, riskLevel: 'low', status: 'pending_approval', blocked: true }], autoMode: true, message: 'Plans generated. Execution BLOCKED — requires P48 approval.' };
}

// ═══════ HOTFIX-003 Smoke Test Gate ═══════
var AUDIT_BASE = '/opt/wecom-openclaw/logs/audit/full-audit-gate';
var smokeTestHistory = [];

function readSmokeAuditLog() {
  var file = AUDIT_BASE + '/smoke-test.jsonl';
  try {
    if (fs.existsSync(file)) {
      var content = fs.readFileSync(file, 'utf8');
      var lines = content.trim().split('\n');
      var events = [];
      lines.forEach(function (line) {
        try { events.push(JSON.parse(line)); } catch (e) {}
      });
      smokeTestHistory = events;
      return events;
    }
  } catch (e) {}
  return [];
}

function getSmokeTestStatus() {
  var events = readSmokeAuditLog();
  var latest = events.length > 0 ? events[events.length - 1] : null;
  return {
    lastRun: latest ? latest.timestamp : null,
    status: latest ? latest.status : 'unknown',
    checksPassed: latest ? latest.checks_passed : 0,
    checksTotal: latest ? latest.checks_total : 0,
    checksFailed: latest ? latest.checks_failed : 0,
    gates: [
      { name: 'Gate 1: Syntax Health', status: 'unknown' },
      { name: 'Gate 2: Command Center Load', status: 'unknown' },
      { name: 'Gate 3: Core Command Resolution', status: 'unknown' },
      { name: 'Gate 4: Handler Integrity', status: 'unknown' },
      { name: 'Gate 5: Mock Message Roundtrip', status: 'unknown' },
      { name: 'Gate 6: PM2 & Port Health', status: 'unknown' },
    ],
    pipeline: statusToPipeline(latest),
    reviewOnly: true,
    message: latest ? 'Smoke test ' + latest.status : 'No smoke test run yet. Run: bash scripts/wecom-smoke-test.sh'
  };
}

function statusToPipeline(latest) {
  if (!latest || latest.status === 'unknown') return 'gray';
  if (latest.status === 'pass') return 'green';
  if (latest.status === 'blocked') return 'red';
  return 'yellow';
}

function getSmokeTestHistory() {
  var events = readSmokeAuditLog();
  return { history: events, total: events.length, reviewOnly: true };
}

server.listen(PORT, function () {
  console.log('OpenClaw Web Console v0.5 started on http://localhost:' + PORT);
  console.log('P46-P47 Auth: 6-digit code | 5-min expiry | 5 attempts | 15-min lock | 12h session');
  console.log('P43.1-P45.1 Deployment Center: branches | prs | tests | deployment-plans | rollback-registry | deploy-approvals');
  console.log('REVIEW_ONLY=true | AUTH_ENABLED=true');
});

module.exports = server;
