/**
 * test-oss-radar.cjs — OSS Radar tests
 * Tests scoring, search mock, compare mock, report generation
 */
'use strict';

var tests = [];
var passed = 0;
var failed = 0;
var errors = [];

function test(name, fn) { tests.push({ name: name, fn: fn }); }

function assert(condition, message) {
  if (!condition) { throw new Error(message || 'Assertion failed'); }
}

// ==================== SCORE TESTS ====================

test('S1: scoreRepo returns object with score and level', function () {
  var scoring = require('../src/skills/oss-radar/score.js');
  var repo = { stargazers_count: 5000, forks_count: 1000, open_issues_count: 50,
    updated_at: new Date().toISOString() };
  var result = scoring.scoreRepo(repo);
  assert(typeof result.score === 'number');
  assert(result.score >= 0 && result.score <= 100);
  assert(['A', 'B', 'C', 'D'].indexOf(result.level) !== -1);
  assert(typeof result.breakdown === 'object');
});

test('S2: high stars = high score', function () {
  var scoring = require('../src/skills/oss-radar/score.js');
  var low = scoring.scoreRepo({ stargazers_count: 10, forks_count: 1,
    open_issues_count: 0, updated_at: new Date().toISOString() });
  var high = scoring.scoreRepo({ stargazers_count: 100000, forks_count: 20000,
    open_issues_count: 10, updated_at: new Date().toISOString() });
  assert(high.score > low.score);
});

test('S3: abandoned project gives low score', function () {
  var scoring = require('../src/skills/oss-radar/score.js');
  var r = scoring.scoreRepo({ stargazers_count: 3, forks_count: 0,
    open_issues_count: 10, updated_at: '2021-01-01T00:00:00Z' });
  assert(r.level === 'D');
  assert(r.score < 30);
});

test('S4: old project scores lower', function () {
  var scoring = require('../src/skills/oss-radar/score.js');
  var recent = scoring.scoreRepo({ stargazers_count: 1000, forks_count: 100,
    open_issues_count: 10, updated_at: new Date().toISOString() });
  var old = scoring.scoreRepo({ stargazers_count: 1000, forks_count: 100,
    open_issues_count: 10, updated_at: '2020-01-01T00:00:00Z' });
  assert(recent.score >= old.score);
});

// ==================== REPORT TESTS ====================

test('R1: generateReport returns markdown string', function () {
  var report = require('../src/skills/oss-radar/report.js');
  var data = { results: [
    { name: 'test/repo', stars: 100, forks: 20, language: 'JS', score: 75, level: 'A' }
  ]};
  var md = report.generateReport(data, 'Test Report');
  assert(md.indexOf('# Test Report') !== -1);
  assert(md.indexOf('test/repo') !== -1);
  assert(md.indexOf('75') !== -1);
  assert(md.indexOf('A') !== -1);
});

test('R2: empty results shows message', function () {
  var report = require('../src/skills/oss-radar/report.js');
  var md = report.generateReport({ results: [] }, 'Empty');
  assert(md.indexOf('No results') !== -1);
});

test('R3: report includes query if present', function () {
  var report = require('../src/skills/oss-radar/report.js');
  var md = report.generateReport({ query: 'langgraph', results: [] }, 'Search');
  assert(md.indexOf('langgraph') !== -1);
});

// ==================== GITHUB CLIENT TESTS ====================

test('G1: github-client exports functions', function () {
  var github = require('../src/skills/oss-radar/github-client.js');
  assert(typeof github.searchRepos === 'function');
  assert(typeof github.getRepo === 'function');
});

// ==================== SOURCE SAFETY ====================

test('F1: no child_process in source', function () {
  var files = [
    '../src/skills/oss-radar/github-client.js',
    '../src/skills/oss-radar/score.js',
    '../src/skills/oss-radar/search.js',
    '../src/skills/oss-radar/compare.js',
    '../src/skills/oss-radar/report.js',
    '../src/commands/oss-radar.js'
  ];
  var found = false;
  files.forEach(function (f) {
    var src = require('fs').readFileSync(require.resolve(f), 'utf-8');
    if (src.indexOf('child_process') !== -1) found = true;
  });
  assert(found === false);
});

test('F2: no exec/spawn in source', function () {
  var files = [
    '../src/skills/oss-radar/github-client.js',
    '../src/skills/oss-radar/score.js',
    '../src/skills/oss-radar/search.js',
    '../src/skills/oss-radar/compare.js',
    '../src/skills/oss-radar/report.js',
    '../src/commands/oss-radar.js'
  ];
  var found = false;
  files.forEach(function (f) {
    var src = require('fs').readFileSync(require.resolve(f), 'utf-8');
    if (src.indexOf('exec(') !== -1) found = true;
    if (src.indexOf('spawn(') !== -1) found = true;
  });
  assert(found === false);
});

// ==================== RUN ====================
console.log('Running ' + tests.length + ' OSS Radar tests...\n');

tests.forEach(function (t) {
  try {
    t.fn();
    passed++;
    process.stdout.write('.');
  } catch (e) {
    failed++;
    errors.push({ name: t.name, error: e.message });
    process.stdout.write('F');
  }
});

console.log('\n\n' + '='.repeat(50));
console.log('Total:  ' + tests.length);
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('='.repeat(50));

if (failed > 0) {
  console.log('\nFAILED:');
  errors.forEach(function (e) { console.log('  ' + e.name + ': ' + e.error); });
  process.exit(1);
}
console.log('\nAll tests passed!\n');
process.exit(0);
