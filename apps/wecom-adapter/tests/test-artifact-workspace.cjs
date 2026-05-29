'use strict';

/**
 * test-artifact-workspace.cjs - P10.3 Artifact Workspace 测试
 *
 * 运行方式:
 *   NODE_OPTIONS="" node tests/test-artifact-workspace.cjs
 */

var path = require('path');
var fs = require('fs');
var crypto = require('crypto');

// ─── Test Framework ───────────────────────────────────────

var PASS = 0;
var FAIL = 0;
var tests = [];

function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

function assert(condition, msg) {
  if (!condition) throw new Error('ASSERT FAIL: ' + (msg || 'expected truthy'));
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error('ASSERT FAIL: ' + (msg || '') + '\n  expected: ' + JSON.stringify(expected) + '\n  actual:   ' + JSON.stringify(actual));
  }
}

function assertMatch(actual, pattern, msg) {
  if (!pattern.test(actual)) {
    throw new Error('ASSERT FAIL: ' + (msg || '') + '\n  expected pattern: ' + pattern + '\n  actual: ' + JSON.stringify(actual));
  }
}

function run() {
  console.log('=== P10.3 Artifact Workspace Tests ===\n');

  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    try {
      t.fn();
      PASS++;
      console.log('  PASS: ' + t.name);
    } catch (e) {
      FAIL++;
      console.log('  FAIL: ' + t.name);
      console.log('        ' + e.message.replace(/\n/g, '\n        '));
    }
  }

  console.log('\n=== Results: ' + PASS + '/' + (PASS + FAIL) + ' passed ===');
  if (FAIL > 0) process.exit(1);
}

// ─── Cleanup helper ────────────────────────────────────────

function cleanupWorkspace() {
  var root = path.resolve(__dirname, '..', '..', '..', 'workspace', 'artifacts');
  if (fs.existsSync(root)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ─── Module Import ─────────────────────────────────────────

var policy = require('../src/artifacts/artifact-policy');
var store = require('../src/artifacts/artifact-store');
var index = require('../src/artifacts/artifact-index');

// ─── Test: Policy ──────────────────────────────────────────

test('Policy: validateMissionId - valid IDs', function() {
  assert(policy.validateMissionId('P10.3').valid, 'P10.3 should be valid');
  assert(policy.validateMissionId('test_123').valid, 'test_123 should be valid');
  assert(policy.validateMissionId('my-mission-v1').valid, 'my-mission-v1 should be valid');
});

test('Policy: validateMissionId - invalid IDs', function() {
  assert(!policy.validateMissionId('').valid, 'empty should be invalid');
  assert(!policy.validateMissionId('../escape').valid, '../ should be invalid');
  assert(!policy.validateMissionId('test/foo').valid, '/ should be invalid');
  assert(!policy.validateMissionId('test\\bar').valid, '\\ should be invalid');
});

test('Policy: validateFilename - valid names', function() {
  assert(policy.validateFilename('plan.md').valid, 'plan.md should be valid');
  assert(policy.validateFilename('dispatch.json').valid, 'dispatch.json should be valid');
  assert(policy.validateFilename('patch.diff').valid, 'patch.diff should be valid');
  assert(policy.validateFilename('TEST-REPORT.json').valid, 'TEST-REPORT.json should be valid');
});

test('Policy: validateFilename - path traversal blocked', function() {
  assert(!policy.validateFilename('../etc/passwd').valid, '../ should be blocked');
  assert(!policy.validateFilename('../../secret.txt').valid, '../../ should be blocked');
  assert(!policy.validateFilename('/etc/passwd').valid, 'absolute should be blocked');
  assert(!policy.validateFilename('foo/bar.md').valid, 'subdir should be blocked');
  assert(!policy.validateFilename('foo\\bar.md').valid, 'backslash should be blocked');
});

test('Policy: validateFilename - invalid extensions', function() {
  assert(!policy.validateFilename('test.exe').valid, '.exe should be blocked');
  assert(!policy.validateFilename('test.sh').valid, '.sh should be blocked');
  assert(!policy.validateFilename('test.js').valid, '.js should be blocked');
  assert(!policy.validateFilename('test').valid, 'no ext should be blocked');
});

test('Policy: validateFilename - hidden files blocked', function() {
  assert(!policy.validateFilename('.env').valid, '.env should be blocked');
  assert(!policy.validateFilename('.gitignore').valid, '.gitignore should be blocked');
});

test('Policy: resolveArtifactPath - valid path', function() {
  var result = policy.resolveArtifactPath('P10.3', 'plan.md');
  assert(result.valid, 'path should be valid');
  // Normalize both for platform-independent comparison (Git Bash Windows: /tmp → C:\tmp)
  var root = path.normalize(process.env.ARTIFACT_WORKSPACE_ROOT || policy.getWorkspaceRoot());
  var fullPath = path.normalize(result.fullPath);
  assert(fullPath.indexOf(root) !== -1, 'path should contain workspace root: root=' + root + ' full=' + fullPath);
  assert(result.fullPath.endsWith('plan.md'), 'path should end with filename');
});

test('Policy: resolveArtifactPath - traversal blocked', function() {
  var result = policy.resolveArtifactPath('../P10.3', 'plan.md');
  assert(!result.valid, '../ in mission_id should be blocked');
});

test('Policy: validateContent - size limit', function() {
  var bigContent = 'x'.repeat(2 * 1024 * 1024);
  var result = policy.validateContent('big.md', bigContent);
  assert(!result.valid, '2MB should be rejected');
});

test('Policy: validateContent - valid JSON', function() {
  var result = policy.validateContent('data.json', '{"key": "value"}');
  assert(result.valid, 'valid JSON should pass');
});

test('Policy: validateContent - invalid JSON', function() {
  var result = policy.validateContent('data.json', '{invalid json}');
  assert(!result.valid, 'invalid JSON should be rejected');
});

test('Policy: generateMetadata', function() {
  var meta = policy.generateMetadata('P10.3', 'audit.md', 'workbuddy', '# Audit Report\n\nAll clear.');
  assertEqual(meta.mission_id, 'P10.3');
  assertEqual(meta.artifact_type, 'md');
  assertEqual(meta.filename, 'audit.md');
  assertEqual(meta.agent, 'workbuddy');
  assert(meta.created_at, 'created_at should exist');
  assert(meta.size > 0, 'size should be > 0');
  assertEqual(meta.sha256.length, 64, 'sha256 should be 64 chars');
});

// ─── Test: Store ───────────────────────────────────────────

test('Store: save and read artifact', function() {
  cleanupWorkspace();

  var result = store.saveArtifact({
    mission_id: 'P10.3',
    filename: 'plan.md',
    agent: 'workbuddy',
    content: '# Mission Plan\n\n- Step 1: Setup\n- Step 2: Deploy'
  });

  assert(result.success, 'save should succeed: ' + (result.error || ''));
  assert(result.metadata, 'should have metadata');
  assertEqual(result.metadata.mission_id, 'P10.3');
  assertEqual(result.metadata.filename, 'plan.md');
  assertEqual(result.metadata.agent, 'workbuddy');
  assert(result.metadata.sha256, 'should have sha256');

  // Read back
  var read = store.readArtifact('P10.3', 'plan.md');
  assert(read.success, 'read should succeed: ' + (read.error || ''));
  assert(read.content.indexOf('# Mission Plan') !== -1, 'content should match');
  assert(read.metadata, 'should have metadata');
});

test('Store: save JSON artifact', function() {
  var data = {
    test: 'data',
    scores: [95, 88, 92],
    passed: true
  };

  var result = store.saveArtifact({
    mission_id: 'P10.3',
    filename: 'test-report.json',
    agent: 'codex',
    content: JSON.stringify(data, null, 2)
  });

  assert(result.success, 'save JSON should succeed');
  assertEqual(result.metadata.artifact_type, 'json');

  var read = store.readArtifact('P10.3', 'test-report.json');
  assert(read.success, 'read JSON should succeed');

  var parsed = JSON.parse(read.content);
  assertEqual(parsed.test, 'data');
  assert(parsed.passed, 'parsed.passed should be true');
});

test('Store: save diff artifact', function() {
  var diffContent = 'diff --git a/foo.js b/foo.js\n--- a/foo.js\n+++ b/foo.js\n@@ -1,3 +1,4 @@\n+// new line\n var x = 1;';

  var result = store.saveArtifact({
    mission_id: 'P10.3',
    filename: 'patch.diff',
    agent: 'codex',
    content: diffContent
  });

  assert(result.success, 'save diff should succeed');
  assertEqual(result.metadata.artifact_type, 'diff');
});

test('Store: path traversal blocked', function() {
  var result = store.saveArtifact({
    mission_id: 'P10.3',
    filename: '../etc/passwd',
    agent: 'hacker',
    content: 'malicious'
  });

  assert(!result.success, 'path traversal should be blocked');
  assert(result.error.indexOf('路径穿越') !== -1, 'error should mention path traversal');
});

test('Store: invalid extension blocked', function() {
  var result = store.saveArtifact({
    mission_id: 'P10.3',
    filename: 'malware.exe',
    agent: 'hacker',
    content: 'virus'
  });

  assert(!result.success, 'invalid extension should be blocked');
});

test('Store: oversized file blocked', function() {
  var big = 'x'.repeat(2 * 1024 * 1024);
  var result = store.saveArtifact({
    mission_id: 'P10.3',
    filename: 'big.md',
    agent: 'test',
    content: big
  });

  assert(!result.success, 'oversized should be blocked');
});

test('Store: invalid JSON blocked', function() {
  var result = store.saveArtifact({
    mission_id: 'P10.3',
    filename: 'bad.json',
    agent: 'test',
    content: 'not valid json {{{'
  });

  assert(!result.success, 'invalid JSON should be blocked');
  assert(result.error.indexOf('JSON') !== -1, 'error should mention JSON');
});

test('Store: list artifacts', function() {
  var result = store.listArtifacts('P10.3');
  assert(result.success, 'list should succeed');
  assert(result.artifacts.length >= 3, 'should have at least 3 artifacts: got ' + result.artifacts.length);

  var filenames = result.artifacts.map(function(a) { return a.filename; });
  assert(filenames.indexOf('plan.md') !== -1, 'should have plan.md');
  assert(filenames.indexOf('test-report.json') !== -1, 'should have test-report.json');
  assert(filenames.indexOf('patch.diff') !== -1, 'should have patch.diff');
});

test('Store: empty mission returns empty list', function() {
  var result = store.listArtifacts('nonexistent_mission');
  assert(result.success, 'should succeed');
  assertEqual(result.artifacts.length, 0, 'should be empty');
});

// ─── Test: Index ───────────────────────────────────────────

test('Index: rebuild and query', function() {
  index.clearIndex();

  // Rebuild from disk
  index.rebuildIndex();

  var stats = index.getIndexStats();
  assert(stats.total_artifacts > 0, 'should have artifacts after rebuild');

  var byMission = index.listByMission('P10.3');
  assert(byMission.length > 0, 'should find artifacts for P10.3');
});

test('Index: list by agent', function() {
  index.clearIndex();
  index.rebuildIndex();

  var byAgent = index.listByAgent('workbuddy');
  assert(byAgent.length > 0, 'should find workbuddy artifacts');

  var byAgent2 = index.listByAgent('codex');
  assert(byAgent2.length > 0, 'should find codex artifacts');
});

test('Index: list by type', function() {
  index.clearIndex();
  index.rebuildIndex();

  var byType = index.listByType('md');
  assert(byType.length > 0, 'should find md artifacts');

  var byTypeJson = index.listByType('json');
  assert(byTypeJson.length > 0, 'should find json artifacts');
});

test('Index: search artifacts', function() {
  index.clearIndex();
  index.rebuildIndex();

  var search = index.searchArtifacts({ mission_id: 'P10.3', artifact_type: 'md' });
  assert(search.length > 0, 'should find md artifacts for P10.3');
});

test('Index: get stats', function() {
  var stats = index.getIndexStats();
  assert(stats.total_artifacts > 0, 'should have artifacts');
  assert(stats.missions['P10.3'] > 0, 'should have P10.3 count');
  assert(stats.timestamp, 'should have timestamp');
});

// ─── Test: Multi-mission ───────────────────────────────────

test('Multi-mission: separate workspaces', function() {
  store.saveArtifact({
    mission_id: 'P10.4',
    filename: 'dispatch.json',
    agent: 'workbuddy',
    content: JSON.stringify({ mission_id: 'P10.4', agent: 'workbuddy', capability: 'pm2.restart' })
  });

  var p103 = store.listArtifacts('P10.3');
  var p104 = store.listArtifacts('P10.4');

  assert(p103.artifacts.length >= 3, 'P10.3 should have its own artifacts');
  assert(p104.artifacts.length >= 1, 'P10.4 should have dispatch.json');

  // Check isolation
  var p103Names = p103.artifacts.map(function(a) { return a.filename; });
  assert(p103Names.indexOf('dispatch.json') === -1, 'P10.3 should not have dispatch.json');
});

// ─── Cleanup and Run ───────────────────────────────────────

try {
  run();
} finally {
  cleanupWorkspace();
}
