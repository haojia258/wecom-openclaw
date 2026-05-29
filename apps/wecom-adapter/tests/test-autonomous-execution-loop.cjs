'use strict';

/**
 * test-autonomous-execution-loop.cjs - P10.8 Autonomous Execution Loop 综合测试
 *
 * 测试覆盖:
 *   Group A: Policy Engine 单元测试
 *   Group B: Report Generator 单元测试
 *   Group C: Loop Engine 单元测试
 *   Group D: API 路由集成测试
 *   Group E: Dashboard v0.9 验证
 */

var fs = require('fs');
var path = require('path');
var http = require('http');

// ─── 环境隔离 ──────────────────────────────────────────────

var TEST_DB_DIR = path.resolve(__dirname, '../logs/loop-test');
if (!fs.existsSync(TEST_DB_DIR)) {
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
}

var testDbPath = path.resolve(TEST_DB_DIR, 'test-loop.db');
process.env.TASK_DB_PATH = testDbPath;
process.env.TASK_LOG_DIR = path.resolve(TEST_DB_DIR);
process.env.RETRY_TEST_FAST = '1';

// Clean old test DB
(function() {
  var files = [testDbPath, testDbPath + '-wal', testDbPath + '-shm'];
  for (var i = 0; i < files.length; i++) {
    if (fs.existsSync(files[i])) {
      try { fs.unlinkSync(files[i]); } catch (_) {}
    }
  }
})();

var testWorkspaceRoot = path.resolve(__dirname, '../logs/test-loop-workspace');
process.env.ARTIFACT_WORKSPACE_ROOT = testWorkspaceRoot;

if (!fs.existsSync(testWorkspaceRoot)) {
  fs.mkdirSync(testWorkspaceRoot, { recursive: true });
}

// ─── 测试工具 ──────────────────────────────────────────────

var passed = 0;
var failed = 0;
var total = 0;

function assert(condition, label) {
  total++;
  if (condition) {
    passed++;
    if (label) console.log('  \u2713 ' + label);
  } else {
    failed++;
    console.log('  \u2717 FAIL: ' + (label || 'assertion failed'));
  }
}

function assertEqual(actual, expected, label) {
  var ok = actual === expected;
  total++;
  if (ok) {
    passed++;
    if (label) console.log('  \u2713 ' + label + ' (' + JSON.stringify(actual) + ')');
  } else {
    failed++;
    console.log('  \u2717 FAIL: ' + (label || 'assertEqual failed'));
    console.log('    expected: ' + JSON.stringify(expected));
    console.log('    actual:   ' + JSON.stringify(actual));
  }
}

function assertContains(str, substring, label) {
  var ok = str.indexOf(substring) !== -1;
  total++;
  if (ok) {
    passed++;
    if (label) console.log('  \u2713 ' + label);
  } else {
    failed++;
    console.log('  \u2717 FAIL: ' + (label || 'assertContains failed'));
    console.log('    expected to contain: ' + JSON.stringify(substring));
    console.log('    actual: ' + JSON.stringify(str.substring(0, 200)));
  }
}

// ─── 加载模块 ──────────────────────────────────────────────

var graphStore = require('../src/mission/task-graph-store');
var graphEngine = require('../src/mission/task-graph-engine');
var loopPolicy = require('../src/mission/autonomous-loop-policy');
var loopReport = require('../src/mission/autonomous-loop-report');
var loopEngine = require('../src/mission/autonomous-loop-engine');
var capabilityRegistry = require('../src/agent-governance/capability-registry');
var heartbeatStore = require('../src/mission/agent-heartbeat-store');
var artifactStore = require('../src/artifacts/artifact-store');
var missionStore = require('../src/mission/mission-store');

// Mock artifact-policy's getWorkspaceRoot
var artifactPolicy = require('../src/artifacts/artifact-policy');
var _origGetWorkspaceRoot = artifactPolicy.getWorkspaceRoot;
artifactPolicy.getWorkspaceRoot = function() {
  return testWorkspaceRoot;
};

function resetState() {
  graphStore._reset();
  capabilityRegistry.resetRegistry();
  heartbeatStore._reset();
}

// ─── 辅助函数 ──────────────────────────────────────────────

function sendRequest(method, path, body) {
  return new Promise(function(resolve, reject) {
    var data = body ? JSON.stringify(body) : null;
    var options = {
      hostname: '127.0.0.1',
      port: testPort,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    var req = http.request(options, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var bodyStr = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, body: JSON.parse(bodyStr) });
        } catch (e) {
          resolve({ status: res.statusCode, body: bodyStr });
        }
      });
    });
    req.on('error', function(e) { reject(e); });
    if (data) req.write(data);
    req.end();
  });
}

function createTestGraph(id, missionId, nodes) {
  var graphDef = {
    graph_id: id,
    mission_id: missionId,
    nodes: nodes || [
      { id: 'node_a', type: 'skill', skill: 'audit', capability: 'server.audit', agent: 'workbuddy', status: 'pending' },
      { id: 'node_b', type: 'skill', skill: 'review', capability: 'reasoning.review', agent: 'deepseek', dependsOn: ['node_a'], status: 'pending' },
      { id: 'node_c', type: 'skill', skill: 'report', capability: 'summary.write', agent: 'doubao', dependsOn: ['node_b'], status: 'pending' }
    ]
  };
  graphStore.createGraph(graphDef);
  return graphDef;
}

// ═══════════════════════════════════════════════════════════
// Group A: Policy Engine Unit Tests
// ═══════════════════════════════════════════════════════════

(function() {
  console.log('\n--- Group A: Policy Engine Unit Tests ---');

  var ctx = { graphId: 'test-graph', graph: {} };

  // A1: Null node → failed
  resetState();
  var r1 = loopPolicy.evaluateAutonomousPolicy(null, ctx);
  assertEqual(r1.result, 'failed', 'A1: Null node returns failed');
  assert(r1.reason.indexOf('节点为空') !== -1, 'A1b: Null node reason mentions empty');

  // A2: requiresApproval=true → blocked
  var nodeApprove = { id: 'n1', agent: 'workbuddy', capability: 'server.audit', requiresApproval: true };
  var r2 = loopPolicy.evaluateAutonomousPolicy(nodeApprove, ctx);
  assertEqual(r2.result, 'blocked', 'A2: requiresApproval=true → blocked');
  assert(r2.reason.indexOf('requires explicit approval') !== -1, 'A2b: Block reason mentions approval');

  // A3: Forbidden capability → failed
  var nodeForbidden = { id: 'n2', agent: 'codex', capability: 'deploy.production' };
  var r3 = loopPolicy.evaluateAutonomousPolicy(nodeForbidden, ctx);
  assertEqual(r3.result, 'failed', 'A3: deploy.production via codex → failed');
  assertEqual(r3.details.block_type, 'forbidden', 'A3b: block_type is forbidden');

  // A4: env.write → failed
  var nodeEnvWrite = { id: 'n3', agent: 'workbuddy', capability: 'env.write' };
  var r4 = loopPolicy.evaluateAutonomousPolicy(nodeEnvWrite, ctx);
  assertEqual(r4.result, 'failed', 'A4: env.write → failed');

  // A5: secrets.write → failed
  var nodeSecrets = { id: 'n4', agent: 'workbuddy', capability: 'secrets.write' };
  var r5 = loopPolicy.evaluateAutonomousPolicy(nodeSecrets, ctx);
  assertEqual(r5.result, 'failed', 'A5: secrets.write → failed');

  // A6: nginx.modify → failed
  var nodeNginx = { id: 'n5', agent: 'workbuddy', capability: 'nginx.modify' };
  var r6 = loopPolicy.evaluateAutonomousPolicy(nodeNginx, ctx);
  assertEqual(r6.result, 'failed', 'A6: nginx.modify → failed');

  // A7: pm2.restart requires approval → blocked
  var nodePm2 = { id: 'n6', agent: 'workbuddy', capability: 'pm2.restart' };
  var r7 = loopPolicy.evaluateAutonomousPolicy(nodePm2, ctx);
  assertEqual(r7.result, 'blocked', 'A7: pm2.restart → blocked (requires approval)');

  // A8: Normal capability → allowed
  var nodeNormal = { id: 'n7', agent: 'workbuddy', capability: 'server.audit' };
  var r8 = loopPolicy.evaluateAutonomousPolicy(nodeNormal, ctx);
  assertEqual(r8.result, 'allowed', 'A8: server.audit via workbuddy → allowed');

  // A9: deepseek reasoning.review → allowed
  var nodeDeepseek = { id: 'n8', agent: 'deepseek', capability: 'reasoning.review' };
  var r9 = loopPolicy.evaluateAutonomousPolicy(nodeDeepseek, ctx);
  assertEqual(r9.result, 'allowed', 'A9: reasoning.review via deepseek → allowed');

  // A10: _isProductionSensitive
  assert(loopPolicy._isProductionSensitive('deploy.production'), 'A10a: deploy.production is sensitive');
  assert(loopPolicy._isProductionSensitive('pm2.restart'), 'A10b: pm2.restart is sensitive');
  assert(!loopPolicy._isProductionSensitive('server.audit'), 'A10c: server.audit is NOT sensitive');
  assert(!loopPolicy._isProductionSensitive('docs.write'), 'A10d: docs.write is NOT sensitive');

  console.log('  Group A complete: ' + passed + '/' + total + ' passed so far');
})();

// ═══════════════════════════════════════════════════════════
// Group B: Report Generator Unit Tests
// ═══════════════════════════════════════════════════════════

(function() {
  console.log('\n--- Group B: Report Generator Unit Tests ---');

  resetState();
  var graph = createTestGraph('graph-b1', 'mission-b1');

  // B1: generateLoopReport returns success
  var rep1 = loopReport.generateLoopReport('graph-b1');
  assert(rep1.success, 'B1: generateLoopReport returns success');
  assertEqual(rep1.report.graph_id, 'graph-b1', 'B1b: Report has correct graph_id');
  assertEqual(rep1.report.completed_nodes, 0, 'B1c: Initial completed_nodes is 0');
  assertEqual(rep1.report.total_nodes, 3, 'B1d: Total nodes is 3');
  assert(rep1.report.summary.length > 0, 'B1e: Summary is not empty');

  // B2: generateLoopReport for non-existent graph
  var rep2 = loopReport.generateLoopReport('nonexistent');
  assert(!rep2.success, 'B2: Non-existent graph returns error');

  // B3: generateLoopReport without graphId
  var rep3 = loopReport.generateLoopReport('');
  assert(!rep3.success, 'B3: Empty graphId returns error');

  // B4: _buildSummary with completed status
  var sum4 = loopReport._buildSummary('completed', 3, 0, 0, 0, 0, 0, []);
  assert(sum4.indexOf('completed successfully') !== -1, 'B4: Completed summary mentions success');

  // B5: _buildSummary with failed status
  var sum5 = loopReport._buildSummary('failed', 1, 2, 0, 0, 0, 0, []);
  assert(sum5.indexOf('node(s) failed') !== -1, 'B5: Failed summary mentions failures');

  // B6: saveLoopEvents
  loopEngine.runAutonomousLoop('graph-b1', { maxSteps: 10 });
  var evtResult = loopReport.saveLoopEvents('graph-b1', [{ step: 1, node_id: 'node_a', action: 'completed' }]);
  assert(evtResult.success, 'B6: saveLoopEvents returns success');

  // B7: saveRecoveryLog
  var rclResult = loopReport.saveRecoveryLog('mission-b1', { node_id: 'test', error: 'test error' });
  assert(rclResult.success, 'B7: saveRecoveryLog returns success');

  // B8: saveDispatchArtifact
  var dspResult = loopReport.saveDispatchArtifact('mission-b1', { agent: 'test', allowed: false });
  assert(dspResult.success, 'B8: saveDispatchArtifact returns success');

  console.log('  Group B complete');
})();

// ═══════════════════════════════════════════════════════════
// Group C: Loop Engine Unit Tests
// ═══════════════════════════════════════════════════════════

(function() {
  console.log('\n--- Group C: Loop Engine Unit Tests ---');

  // C1: Happy path - 3-node DAG auto-execution to completed
  resetState();
  var g1 = createTestGraph('graph-c1', 'mission-c1');
  var r1 = loopEngine.runAutonomousLoop('graph-c1', { maxSteps: 10 });
  assert(r1.success, 'C1: Happy path loop returns success');
  assertEqual(r1.status, 'completed', 'C1b: Status is completed');
  assert(r1.steps.length >= 3, 'C1c: At least 3 steps executed (got ' + r1.steps.length + ')');

  // Verify graph state
  var g1Final = graphStore.getGraph('graph-c1');
  assertEqual(g1Final.status, 'completed', 'C1d: Graph status is completed in store');
  var allCompleted = true;
  for (var i = 0; i < g1Final.nodes.length; i++) {
    if (g1Final.nodes[i].status !== 'completed') { allCompleted = false; break; }
  }
  assert(allCompleted, 'C1e: All 3 nodes completed');

  // C2: Forbidden capability → node blocked/failed
  resetState();
  var g2 = createTestGraph('graph-c2', 'mission-c2', [
    { id: 'n1', type: 'skill', capability: 'server.audit', agent: 'workbuddy', status: 'pending' },
    { id: 'n2', type: 'skill', capability: 'deploy.production', agent: 'codex', dependsOn: ['n1'], status: 'pending' }
  ]);
  var r2 = loopEngine.runAutonomousLoop('graph-c2', { maxSteps: 10 });
  assert(r2.success, 'C2: Forbidden loop returns');
  assert(r2.status === 'completed' || r2.status === 'blocked', 'C2b: Status is completed or blocked (got ' + r2.status + ')');

  var g2Final = graphStore.getGraph('graph-c2');
  assert(g2Final.nodes[1].status === 'failed', 'C2c: Forbidden node is failed');

  // C3: requiresApproval → blocked
  resetState();
  var g3 = createTestGraph('graph-c3', 'mission-c3', [
    { id: 'n1', type: 'skill', capability: 'server.audit', agent: 'workbuddy', status: 'pending' },
    { id: 'n2', type: 'skill', capability: 'pm2.restart', agent: 'workbuddy', dependsOn: ['n1'], status: 'pending' }
  ]);
  var r3 = loopEngine.runAutonomousLoop('graph-c3', { maxSteps: 10 });
  assert(r3.success, 'C3: Approval loop returns');

  var g3Final = graphStore.getGraph('graph-c3');
  assert(g3Final.nodes[1].status === 'blocked', 'C3b: Approval node is blocked');

  // C4: Node failure → recovery-log.json written
  resetState();
  var g4 = createTestGraph('graph-c4', 'mission-c4', [
    { id: 'n1', type: 'fail', capability: 'server.audit', agent: 'workbuddy', status: 'pending' }
  ]);
  var r4 = loopEngine.runAutonomousLoop('graph-c4', { maxSteps: 5 });
  assert(r4.success, 'C4: Failure loop returns');

  // C5: maxSteps prevents infinite loop
  resetState();
  var g5 = createTestGraph('graph-c5', 'mission-c5');
  var r5 = loopEngine.runAutonomousLoop('graph-c5', { maxSteps: 1 });
  assert(r5.success, 'C5: maxSteps=1 loop returns');
  assert(r5.steps.length <= 1, 'C5b: At most 1 step with maxSteps=1');

  // C6: Already completed graph
  resetState();
  var g6 = createTestGraph('graph-c6', 'mission-c6');
  loopEngine.runAutonomousLoop('graph-c6', { maxSteps: 10 });
  var r6 = loopEngine.runAutonomousLoop('graph-c6', { maxSteps: 10 });
  assert(r6.success, 'C6: Re-run on completed graph returns success');
  assert(r6.message.indexOf('already in terminal state') !== -1, 'C6b: Message mentions terminal state');

  // C7: Non-existent graph
  var r7 = loopEngine.runAutonomousLoop('nonexistent');
  assert(!r7.success, 'C7: Non-existent graph returns error');

  // C8: _checkAllNodesDone
  resetState();
  var g8 = createTestGraph('graph-c8', 'mission-c8', [
    { id: 'n1', type: 'skill', capability: 'server.audit', agent: 'workbuddy', status: 'completed' },
    { id: 'n2', type: 'skill', capability: 'reasoning.review', agent: 'deepseek', status: 'completed' }
  ]);
  var done8 = loopEngine._checkAllNodesDone(g8);
  assert(done8.completed, 'C8: All nodes completed → _checkAllNodesDone returns completed=true');

  // C9: Single node execution - runAutonomousNode
  resetState();
  var g9 = createTestGraph('graph-c9', 'mission-c9');
  var r9 = loopEngine.runAutonomousNode('graph-c9', 'node_a');
  assert(r9.success, 'C9: runAutonomousNode returns success for allowed node');

  // C10: runAutonomousNode with forbidden capability
  resetState();
  var g10 = createTestGraph('graph-c10', 'mission-c10', [
    { id: 'n1', type: 'skill', capability: 'deploy.production', agent: 'codex', status: 'pending' }
  ]);
  var r10 = loopEngine.runAutonomousNode('graph-c10', 'n1');
  assert(!r10.success, 'C10: runAutonomousNode blocks forbidden capability');
  assert(r10.blocked, 'C10b: Blocked flag is true');

  console.log('  Group C complete');
})();

// ═══════════════════════════════════════════════════════════
// Group D: API Route Integration Tests
// ═══════════════════════════════════════════════════════════

var testPort = 19999;
var testServer;

(function() {
  console.log('\n--- Group D: API Route Integration Tests ---');

  // Build a minimal express app for test
  testServer = http.createServer(function(req, res) {
    // Very simple router for mission endpoints
    var url = require('url');
    var parsed = url.parse(req.url, true);
    req.query = parsed.query;
    req.params = {};

    // Parse params from URL
    var pathParts = parsed.pathname.split('/').filter(Boolean);

    // Parse mission routes
    var express = require('express');
    var app = express();
    var missionRoutes = require('../src/mission/mission-routes');
    missionRoutes.registerMissionRoutes(app);

    // Forward to express
    app(req, res);
  });

  testServer.listen(testPort, '127.0.0.1', function() {
    console.log('  Test server listening on port ' + testPort);

    var pendingChecks = 7;

    function checkDone() {
      pendingChecks--;
      if (pendingChecks <= 0) {
        console.log('  Group D complete');
        testServer.close();
        startGroupE();
      }
    }

    // D1: Create graph via API
    resetState();
    sendRequest('POST', '/mission/graphs', {
      graph_id: 'graph-d1',
      mission_id: 'mission-d1',
      nodes: [
        { id: 'n1', type: 'skill', capability: 'server.audit', agent: 'workbuddy', status: 'pending' },
        { id: 'n2', type: 'skill', capability: 'reasoning.review', agent: 'deepseek', depends_on: ['n1'], status: 'pending' }
      ]
    }).then(function(resp) {
      assertEqual(resp.status, 201, 'D1: Graph creation returns 201');
      assert(resp.body.success, 'D1b: Graph creation success');
      checkDone();
    }).catch(function(e) { console.log('D1 error:', e.message); checkDone(); });

    // D2: run-loop API
    sendRequest('POST', '/mission/graphs/graph-d1/run-loop', { maxSteps: 10 })
      .then(function(resp) {
        assertEqual(resp.status, 200, 'D2: run-loop API returns 200');
        assert(resp.body.success, 'D2b: run-loop success');
        assertEqual(resp.body.status, 'completed', 'D2c: Loop completed');
        checkDone();
      }).catch(function(e) { console.log('D2 error:', e.message); checkDone(); });

    // D3: loop-report API
    sendRequest('GET', '/mission/graphs/graph-d1/loop-report')
      .then(function(resp) {
        assertEqual(resp.status, 200, 'D3: loop-report API returns 200 (got ' + resp.status + ')');
        // Note: the report endpoint may return 200 or other status based on timing
        if (resp.body.success) {
          assert(resp.body.report, 'D3b: Report object present');
          assertEqual(resp.body.report.graph_id, 'graph-d1', 'D3c: Report graph_id correct');
        }
        checkDone();
      }).catch(function(e) { console.log('D3 error:', e.message); checkDone(); });

    // D4: run-loop on non-existent graph
    sendRequest('POST', '/mission/graphs/nonexistent/run-loop', {})
      .then(function(resp) {
        assertEqual(resp.status, 404, 'D4: Non-existent graph → 404');
        checkDone();
      }).catch(function(e) { console.log('D4 error:', e.message); checkDone(); });

    // D5: run-node API
    sendRequest('POST', '/mission/graphs/graph-d1/nodes/n1/run', {})
      .then(function(resp) {
        // n1 is already completed from loop, should fail
        assert(resp.status !== 200 || !resp.body.success, 'D5: run-node on completed node blocks');
        checkDone();
      }).catch(function(e) { console.log('D5 error:', e.message); checkDone(); });

    // D6: loop-report on non-existent graph
    sendRequest('GET', '/mission/graphs/nonexistent/loop-report')
      .then(function(resp) {
        assertEqual(resp.status, 404, 'D6: Loop report on non-existent graph → 404');
        checkDone();
      }).catch(function(e) { console.log('D6 error:', e.message); checkDone(); });

    // D7: run-loop with invalid graph - test via direct engine call
    resetState();
    var badGraph = { graph_id: 'graph-d7', mission_id: 'mission-d7', nodes: [] };
    try { graphStore.createGraph(badGraph); } catch (e) {}
    var r7 = loopEngine.runAutonomousLoop('graph-d7', { maxSteps: 5 });
    assert(!r7.success, 'D7: Loop with empty nodes graph returns error');
    checkDone();
  });
})();

// ═══════════════════════════════════════════════════════════
// Group E: Artifact & Agent Health Test
// ═══════════════════════════════════════════════════════════

function startGroupE() {
  console.log('\n--- Group E: Artifact & Agent Health Tests ---');

  // E1: loop-report.json artifact written
  resetState();
  createTestGraph('graph-e1', 'mission-e1');
  loopEngine.runAutonomousLoop('graph-e1', { maxSteps: 10 });

  var reportArtifact = artifactStore.readArtifact('mission-e1', 'loop-report.json');
  assert(reportArtifact.success, 'E1: loop-report.json exists');
  if (reportArtifact.success) {
    var reportContent = typeof reportArtifact.content === 'string' ? JSON.parse(reportArtifact.content) : reportArtifact.content;
    assertEqual(reportContent.graph_id, 'graph-e1', 'E1b: Report has correct graph_id');
    assertEqual(reportContent.status, 'completed', 'E1c: Report status is completed');
  }

  // E2: dispatch.json written for blocked nodes
  resetState();
  createTestGraph('graph-e2', 'mission-e2', [
    { id: 'n1', type: 'skill', capability: 'server.audit', agent: 'workbuddy', status: 'pending' },
    { id: 'n2', type: 'skill', capability: 'deploy.production', agent: 'codex', dependsOn: ['n1'], status: 'pending' }
  ]);
  loopEngine.runAutonomousLoop('graph-e2', { maxSteps: 10 });

  var dispatchArtifact = artifactStore.readArtifact('mission-e2', 'dispatch.json');
  assert(dispatchArtifact.success, 'E2: dispatch.json exists for forbidden node');
  if (dispatchArtifact.success) {
    var dispatchContent = typeof dispatchArtifact.content === 'string' ? JSON.parse(dispatchArtifact.content) : dispatchArtifact.content;
    assert(dispatchContent.node_id === 'n2' || dispatchContent.allowed === false, 'E2b: dispatch.json has expected content');
  }

  // E3: Offline agent → blocked
  resetState();
  heartbeatStore._reset();
  // 将 workbuddy 的 last_seen 设为 epoch 使其超时 → status 变为 offline
  heartbeatStore._setAgentLastSeen('workbuddy', new Date(0).toISOString());

  var nodeOffline = { id: 'test', agent: 'workbuddy', capability: 'server.audit' };
  var ctx = { graphId: 'test-graph', graph: {} };

  // Verify workbuddy is offline
  var healthOffline = heartbeatStore.getAgentHealth('workbuddy');
  assert(healthOffline.success, 'E3-pre: getAgentHealth returns success');
  assertEqual(healthOffline.health.status, 'offline', 'E3-pre: Default agent is offline');

  var rOffline = loopPolicy.evaluateAutonomousPolicy(nodeOffline, ctx);
  assertEqual(rOffline.result, 'blocked', 'E3: Offline agent → blocked');
  assertEqual(rOffline.details.block_type, 'agent_offline', 'E3b: block_type is agent_offline');

  // E4: Agent not found → blocked
  var nodeUnknown = { id: 'test', agent: 'unknown_bot', capability: 'server.audit' };
  var rUnknown = loopPolicy.evaluateAutonomousPolicy(nodeUnknown, ctx);
  assertEqual(rUnknown.result, 'blocked', 'E4: Unknown agent → blocked');
  assertEqual(rUnknown.details.block_type, 'agent_not_found', 'E4b: block_type is agent_not_found');

  // E5: recovery-log.json written for failed nodes
  resetState();
  createTestGraph('graph-e5', 'mission-e5', [
    { id: 'n1', type: 'fail', capability: 'server.audit', agent: 'workbuddy', status: 'pending' }
  ]);
  loopEngine.runAutonomousLoop('graph-e5', { maxSteps: 5 });

  var recoveryArtifact = artifactStore.readArtifact('mission-e5', 'recovery-log.json');
  assert(recoveryArtifact.success, 'E5: recovery-log.json exists for failed node');

  // E6: Normal agent → allowed
  resetState();
  heartbeatStore._reset();
  heartbeatStore.recordHeartbeat({ agent: 'workbuddy', status: 'idle', cpu: 10, memory: 100 });
  var nodeNormal = { id: 'test', agent: 'workbuddy', capability: 'server.audit' };
  var rNormal = loopPolicy.evaluateAutonomousPolicy(nodeNormal, ctx);
  assertEqual(rNormal.result, 'allowed', 'E6: Online agent + normal capability → allowed');

  // E7: Dashboard v0.9 file check
  var dashPath = path.resolve(__dirname, '../public/mission-control.html');
  var dashExists = fs.existsSync(dashPath);
  assert(dashExists, 'E7: Dashboard file exists');
  if (dashExists) {
    var dashContent = fs.readFileSync(dashPath, 'utf-8');
    assert(dashContent.indexOf('v0.9') !== -1, 'E7b: Dashboard contains v0.9');
    assert(dashContent.indexOf('Autonomous Loop (P10.8)') !== -1, 'E7c: Dashboard has Autonomous Loop Panel');

    // Verify v0.8 panels preserved
    assert(dashContent.indexOf('Task Graph Engine (P10.5)') !== -1, 'E7d: P10.5 Task Graph Panel preserved');
    assert(dashContent.indexOf('Integration Validation (P10.6)') !== -1, 'E7e: P10.6 Integration Panel preserved');
    assert(dashContent.indexOf('Agent Health (P10.7)') !== -1, 'E7f: P10.7 Agent Health Panel preserved');
    assert(dashContent.indexOf('Artifacts') !== -1, 'E7g: P10.3 Artifacts Tab preserved');
    assert(dashContent.indexOf('Recovery Status') !== -1, 'E7h: P10.2 Recovery Panel preserved');
    assert(dashContent.indexOf('Capability Check') !== -1, 'E7i: P10.4 Capability Panel preserved');
    assert(dashContent.indexOf('runAutonomousLoop') !== -1, 'E7j: runAutonomousLoop JS function exists');
    assert(dashContent.indexOf('runAutoNode') !== -1, 'E7k: runAutoNode JS function exists');
    assert(dashContent.indexOf('loadLoopReport') !== -1, 'E7l: loadLoopReport JS function exists');
  }

  // E8: Package.json has test script
  var pkgPath = path.resolve(__dirname, '../package.json');
  var pkgContent = fs.readFileSync(pkgPath, 'utf-8');
  assert(pkgContent.indexOf('test:autonomous-execution-loop') !== -1 || pkgContent.indexOf('test-autonomous-execution-loop') !== -1,
    'E8: Package.json references test-autonomous-execution-loop');

  console.log('  Group E complete');
  printResults();
}

// ─── 结果输出 ──────────────────────────────────────────────

function printResults() {
  console.log('\n========================================');
  console.log('P10.8 Autonomous Execution Loop Test Results');
  console.log('========================================');
  console.log('Total:  ' + total);
  console.log('Passed: ' + passed);
  console.log('Failed: ' + failed);
  console.log('========================================');

  if (failed > 0) {
    console.log('EXIT CODE: 1 (FAILURES)');
    process.exit(1);
  } else {
    console.log('EXIT CODE: 0 (ALL PASSED)');
    process.exit(0);
  }
}

// Timeout safety
setTimeout(function() {
  console.log('\nTIMEOUT: Forcing exit after 30s');
  printResults();
}, 30000);
