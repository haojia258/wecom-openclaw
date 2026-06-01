// P43.1-P45.1 Deployment Center Test Suite
// Tests: Deployment Page | Branch Monitor | PR Monitor | Rollback Registry | Approval Queue

var http = require('http');
var fs = require('fs');
var path = require('path');

var PASS = 0;
var FAIL = 0;
var results = [];

function test(name, fn) {
  try {
    fn();
    PASS++;
    results.push({ name: name, status: 'PASS' });
  } catch (e) {
    FAIL++;
    results.push({ name: name, status: 'FAIL', error: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' Expected: ' + JSON.stringify(b) + ', Got: ' + JSON.stringify(a));
}

function assertContains(str, substr, msg) {
  if (str.indexOf(substr) === -1) throw new Error((msg || '') + ' String does not contain: ' + substr);
}

function assertNotEmpty(arr, msg) {
  if (!arr || arr.length === 0) throw new Error((msg || '') + ' Array is empty');
}

// API helpers
function apiGet(url) {
  return new Promise(function (resolve, reject) {
    http.get('http://localhost:3199' + url, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk.toString(); });
      res.on('end', function () {
        try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
      });
    }).on('error', reject);
  });
}

function apiPost(url, data) {
  return new Promise(function (resolve, reject) {
    var postData = JSON.stringify(data);
    var options = {
      hostname: 'localhost', port: 3199, path: url, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    var req = http.request(options, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk.toString(); });
      res.on('end', function () {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); } catch (e) { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ═══════ HTML Analysis ═══════
var html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

// ═══ Module 1: Deployment Page ═══
console.log('\n=== Module 1: Deployment Page Tests ===');
test('Deployment page exists in HTML', function () {
  assertContains(html, 'id="deploy"', 'Deployment page container missing');
  assertContains(html, 'Deployment Center', 'Deployment Center title missing');
  assertContains(html, '部署中心', 'Chinese title missing');
});

test('Deployment page has render function', function () {
  assertContains(html, 'function renderDeploy()', 'renderDeploy function missing');
});

test('Deployment page has all 6 module render functions', function () {
  assertContains(html, 'function renderBranches()', 'renderBranches missing');
  assertContains(html, 'function renderPRs()', 'renderPRs missing');
  assertContains(html, 'function renderTestCenter()', 'renderTestCenter missing');
  assertContains(html, 'function renderDeploymentPlans()', 'renderDeploymentPlans missing');
  assertContains(html, 'function renderRollbackRegistry()', 'renderRollbackRegistry missing');
  assertContains(html, 'function renderDeployApprovals()', 'renderDeployApprovals missing');
});

test('Deployment page has data structures', function () {
  assertContains(html, 'branches:', 'branches data missing');
  assertContains(html, 'prs:', 'prs data missing');
  assertContains(html, 'testSuites:', 'testSuites data missing');
  assertContains(html, 'testRuns:', 'testRuns data missing');
  assertContains(html, 'deploymentPlans:', 'deploymentPlans data missing');
  assertContains(html, 'rollbacks:', 'rollbacks data missing');
  assertContains(html, 'deployApprovals:', 'deployApprovals data missing');
});

// ═══ Module 2: Branch Monitor ═══
console.log('\n=== Module 2: Branch Monitor Tests ===');
test('Branch Monitor title present', function () {
  assertContains(html, 'Branch Monitor', 'Branch Monitor title missing');
});

test('Branch Monitor has table with columns', function () {
  assertContains(html, 'branchBody', 'Branch table body missing');
  assertContains(html, 'Commit', 'Commit column missing');
  assertContains(html, 'PR 状态', 'PR status column missing');
});

test('Branch data has main branch', function () {
  assertContains(html, "name:'main'", 'main branch missing');
});

test('Branch data has develop branch', function () {
  assertContains(html, "name:'develop'", 'develop branch missing');
});

test('Branch data has feature branches', function () {
  assertContains(html, 'feature/p43-deployment-center-enhancement', 'feature branch missing');
  assertContains(html, 'feature/p40-system-center', 'feature/p40-system-center missing');
  assertContains(html, 'feature/p42-runtime', 'feature/p42-runtime missing');
});

test('Branch data includes prStatus field', function () {
  assertContains(html, 'prStatus:', 'prStatus field missing');
});

// ═══ Module 3: PR Monitor ═══
console.log('\n=== Module 3: PR Monitor Tests ===');
test('PR Monitor title present', function () {
  assertContains(html, 'PR Monitor', 'PR Monitor title missing');
});

test('PR Monitor has filter dropdown', function () {
  assertContains(html, 'prFilter', 'PR filter missing');
  assertContains(html, 'Open', 'Open filter option missing');
  assertContains(html, 'Merged', 'Merged filter option missing');
  assertContains(html, 'Closed', 'Closed filter option missing');
});

test('PR Monitor has table body', function () {
  assertContains(html, 'prBody', 'PR table body missing');
});

test('PR data has entries with required fields', function () {
  assertContains(html, "title:'P43.1-P45.1 Deployment Center Enhancement'", 'P43 PR entry missing');
  assertContains(html, "title:'P40-P42 System Center + Dispatch + Runtime'", 'P40-P42 PR entry missing');
});

test('PR data covers Open/Merged/Closed statuses', function () {
  assertContains(html, "status:'Open'", 'Open status missing in PR data');
  assertContains(html, "status:'Merged'", 'Merged status missing in PR data');
  assertContains(html, "status:'Closed'", 'Closed status missing in PR data');
});

// ═══ Module 4: Rollback Registry ═══
console.log('\n=== Module 4: Rollback Registry Tests ===');
test('Rollback Registry title present', function () {
  assertContains(html, 'Rollback Registry', 'Rollback Registry title missing');
});

test('Rollback Registry has table body', function () {
  assertContains(html, 'rollbackBody', 'Rollback table body missing');
});

test('Rollback policy: direct rollback forbidden', function () {
  assertContains(html, '禁止直接回滚', 'Policy text missing: forbid direct rollback');
});

test('Rollback data has 10 entries', function () {
  var matches = html.match(/id:'deploy-\d+'/g);
  assert(matches && matches.length >= 10, 'Expected 10+ rollback entries, got ' + (matches ? matches.length : 0));
});

test('Rollback entries have artifact fields', function () {
  assertContains(html, 'artifact:', 'artifact field missing');
  assertContains(html, 'rollbackPoint:', 'rollbackPoint field missing');
});

test('Rollback has requestRollback function', function () {
  assertContains(html, 'function requestRollback(', 'requestRollback function missing');
});

test('Rollback entry with failed status exists', function () {
  assertContains(html, "status:'failed'", 'Failed status in rollback data missing');
});

test('Rollback approval only, no direct execution', function () {
  assertContains(html, '回滚审批', 'Rollback approval text missing');
});

// ═══ Module 5: Approval Queue ═══
console.log('\n=== Module 5: Approval Queue Tests ===');
test('Approval Queue title present', function () {
  assertContains(html, 'Approval Queue', 'Approval Queue title missing');
  assertContains(html, '部署审批队列', 'Chinese approval queue title missing');
});

test('Approval flow: pending→approved→dispatch', function () {
  assertContains(html, 'pending→approved→dispatch', 'Approval flow missing or wrong order');
});

test('NO_DIRECT_EXEC policy present', function () {
  assertContains(html, 'NO_DIRECT_EXEC', 'NO_DIRECT_EXEC policy missing');
});

test('Approval Queue has table body', function () {
  assertContains(html, 'deployApprBody', 'Deploy approval table body missing');
});

test('Deploy approval data has required fields', function () {
  assertContains(html, "type:'deploy'", 'deploy type approval missing');
  assertContains(html, "type:'rollback'", 'rollback type approval missing');
});

test('Approvals have all statuses: pending, approved, dispatched', function () {
  assertContains(html, "status:'pending'", 'pending status missing in approvals');
  assertContains(html, "status:'approved'", 'approved status missing in approvals');
  assertContains(html, "status:'dispatched'", 'dispatched status missing in approvals');
});

// ═══ Module 6: Cross-cutting ═══
console.log('\n=== Module 6: Cross-Cutting Concern Tests ===');
test('REVIEW_ONLY present in HTML', function () {
  assertContains(html, 'REVIEW_ONLY', 'REVIEW_ONLY not found in HTML');
});

test('No direct execute, deploy button labeled as review-only', function () {
  assertContains(html, '仅生成审批', 'review-only label missing on deployment plan create');
});

test('createDeploymentPlan function exists', function () {
  assertContains(html, 'function createDeploymentPlan()', 'createDeploymentPlan function missing');
});

test('Test Center section exists', function () {
  assertContains(html, 'Test Center', 'Test Center title missing');
  assertContains(html, 'testCards', 'Test cards container missing');
  assertContains(html, 'testBody', 'Test records table body missing');
});

test('Test data has 398/398 full suite', function () {
  assertContains(html, 'passed:398', 'Full suite 398 passed count missing');
  assertContains(html, 'total:398', 'Full suite 398 total count missing');
});

test('Test data has 45/45 web console', function () {
  assertContains(html, 'passed:45', 'Web console 45 passed count missing');
  assertContains(html, 'total:45', 'Web console 45 total count missing');
});

// ═══════ Print Results ═══════
console.log('\n═══════════════════════════════════════');
console.log('  P43.1-P45.1 Deployment Center Tests');
console.log('═══════════════════════════════════════');
results.forEach(function (r) {
  console.log((r.status === 'PASS' ? '✓' : '✗') + ' ' + r.name + (r.status === 'FAIL' ? ' — ' + r.error : ''));
});
console.log('───────────────────────────────────────');
console.log('  Total: ' + results.length + ' | Passed: ' + PASS + ' | Failed: ' + FAIL);
console.log('═══════════════════════════════════════');

if (FAIL > 0) process.exit(1);
else console.log('\n✅ ALL TESTS PASSED\n');
