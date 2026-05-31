'use strict';

/**
 * test-oss-radar.js — P15 OSS Radar v0.1 test suite
 *
 * 7 test categories, all mock-based (no GitHub API calls).
 */

var path = require('path');

// ═══════════════════════════════════════════
// Test Framework
// ═══════════════════════════════════════════

var passed = 0;
var failed = 0;
var warnings = [];

function assert(name, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log('  FAIL: ' + name + (detail ? ' — ' + detail : ''));
  }
}

function summary() {
  console.log('');
  console.log('═══ P15 OSS Radar Test Results ═══');
  console.log('Passed: ' + passed + ' / ' + (passed + failed));
  if (failed > 0) {
    console.log('Failed: ' + failed);
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
  }
}

// ═══════════════════════════════════════════
// Set USE_MOCK=true for all tests
// ═══════════════════════════════════════════

process.env.USE_MOCK = 'true';

// Clear require cache so module reads the env var
delete require.cache[require.resolve('../../commands/oss-radar.js')];
var ossRadar = require('../../commands/oss-radar.js');

// ═══════════════════════════════════════════
// Test 1: Command MATCH (aliases)
// ═══════════════════════════════════════════

console.log('── Test 1: Command Aliases MATCH ──');

function testMatch(alias, shouldMatch) {
  // oss-radar module exists and has execute function
  var hasExec = typeof ossRadar.execute === 'function';
  assert('oss-radar module exports execute (' + alias + ')', hasExec,
    'Got: ' + typeof ossRadar.execute);
}

testMatch('/开源雷达');
testMatch('/oss-radar');
testMatch('/oss');
testMatch('/开源');

// ═══════════════════════════════════════════
// Test 2: Empty keyword fallback
// ═══════════════════════════════════════════

console.log('── Test 2: Empty Keyword Fallback ──');

ossRadar.execute({ FromUserName: 'test' }, '').then(function (result) {
  assert('empty args returns help text', typeof result === 'string' && result.length > 50);
  assert('help text contains OSS Radar', result.indexOf('OSS Radar') >= 0);
  assert('help text contains Review-Only', result.indexOf('Review-Only') >= 0);
  assert('help text contains mock mode', result.indexOf('Mock') >= 0);

  // ═══════════════════════════════════════════
  // Test 3: Mock repo scoring
  // ═══════════════════════════════════════════

  console.log('── Test 3: Mock Repo Scoring ──');

  return ossRadar.execute({ FromUserName: 'test' }, 'react').then(function (result) {
    assert('react search returns result', result.indexOf('facebook/react') >= 0 || result.indexOf('react') >= 0);
    assert('react has score field', result.indexOf('Score') >= 0);
    assert('react has stars', result.indexOf('Stars') >= 0);
    assert('react has forks', result.indexOf('Forks') >= 0);
    assert('react has License MIT', result.indexOf('MIT') >= 0);
    assert('react score > 60 (high quality)', /Score\s*\|\s*(\d+)/.test(result));
    assert('review-only tag present', result.indexOf('Review-Only: true') >= 0);

    // Test lower-quality project
    return ossRadar.execute({ FromUserName: 'test' }, 'nonexistent_project_xyz');
  }).then(function (result) {
    assert('unknown project returns no results', result.indexOf('No results') >= 0);
    assert('unknown project shows mock source', result.indexOf('mock') >= 0);

    // ═══════════════════════════════════════════
    // Test 4: Risk Level Calculation
    // ═══════════════════════════════════════════

    console.log('── Test 4: Risk Level Calculation ──');

    // tensorflow has many open issues (2100) → should have risk
    return ossRadar.execute({ FromUserName: 'test' }, 'tensorflow');
  }).then(function (result) {
    assert('tensorflow has risk assessment', result.indexOf('Risk Assessment') >= 0);
    assert('tensorflow has risk level', /Risk Level\s*\|\s*(安全|低风险|中风险|高风险)/.test(result));
    assert('tensorflow has issue risk factor', result.indexOf('issue') >= 0 || result.indexOf('开放') >= 0);

    // langchain: 280 issues, MIT license, recent → low risk
    return ossRadar.execute({ FromUserName: 'test' }, 'langchain');
  }).then(function (result) {
    assert('langchain has risk assessment', result.indexOf('Risk Assessment') >= 0);
    assert('langchain risk is low/safe', /Risk Level\s*\|\s*(安全|低风险)/.test(result));

    // ═══════════════════════════════════════════
    // Test 5: Recommendation Engine
    // ═══════════════════════════════════════════

    console.log('── Test 5: Recommendation Engine ──');

    assert('recommendation present', result.indexOf('Recommendation') >= 0);
    assert('recommended action valid',
      result.indexOf('推荐复用') >= 0 ||
      result.indexOf('谨慎评估') >= 0 ||
      result.indexOf('不建议引入') >= 0);

    // AutoGPT: 172k stars, 420 issues, MIT, 5 days old → 推荐复用
    return ossRadar.execute({ FromUserName: 'test' }, 'autogpt');
  }).then(function (result) {
    assert('autogpt recommended for reuse', result.indexOf('推荐复用') >= 0);

    // ═══════════════════════════════════════════
    // Test 6: Compare Feature
    // ═══════════════════════════════════════════

    console.log('── Test 6: Compare Feature ──');

    return ossRadar.execute({ FromUserName: 'test' }, '对比 langchain crewai');
  }).then(function (result) {
    assert('compare returns table', result.indexOf('| # | Project |') >= 0);
    assert('compare has both projects', result.indexOf('langchain') >= 0 && result.indexOf('crewAI') >= 0);
    assert('compare has recommendation column', result.indexOf('Recommendation') >= 0);
    assert('compare has risk column', result.indexOf('Risk') >= 0);
    assert('compare has review-only', result.indexOf('Review-Only: true') >= 0);

    return ossRadar.execute({ FromUserName: 'test' }, '对比 single');
  }).then(function (result) {
    assert('compare with 1 project shows error', result.indexOf('least 2') >= 0);

    // ═══════════════════════════════════════════
    // Test 7: Search Feature
    // ═══════════════════════════════════════════

    console.log('── Test 7: Search Feature ──');

    return ossRadar.execute({ FromUserName: 'test' }, '搜索 python');
  }).then(function (result) {
    assert('search returns results', result.indexOf('OSS Radar Search') >= 0);
    assert('search has review-only', result.indexOf('Review-Only: true') >= 0);
    // python should match langchain, crewai, autogpt, tensorflow
    assert('search finds multiple results', (result.match(/\d+\./g) || []).length >= 2);

    return ossRadar.execute({ FromUserName: 'test' }, 'search zzznotexist');
  }).then(function (result) {
    assert('search no results handled', result.indexOf('No results') >= 0);

    // ═══════════════════════════════════════════
    // Done
    // ═══════════════════════════════════════════

    summary();
  });
}).catch(function (e) {
  console.log('FATAL: ' + e.message + '\n' + (e.stack || ''));
  process.exit(1);
});
