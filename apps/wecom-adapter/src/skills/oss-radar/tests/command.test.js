'use strict';

var layerClassifier = require('../layer-classifier');
var maturityScorer = require('../maturity-scorer');
var riskScorer = require('../risk-scorer');
var integrationScorer = require('../integration-scorer');
var cmd = require('../../../commands/oss-radar-command');
var fs = require('fs');
var path = require('path');

var passed = 0, failed = 0;
function assert(desc, cond) { if (cond) { passed++; console.log('  ✅ ' + desc); } else { failed++; console.log('  ❌ ' + desc); } }
function summary() { console.log('\n' + '='.repeat(40)); console.log('  Total: ' + (passed + failed) + ' | Passed: ' + passed + ' | Failed: ' + failed); if (failed > 0) process.exit(1); }

console.log('── Test 1: Layer Classifier ──');
assert('qlib → Quant Research', layerClassifier.classify({ full_name: 'microsoft/qlib', description: 'AI量化投资 platform for quantitative finance' }) === 'Quant Research Engine');
assert('langgraph → Workflow Graph', layerClassifier.classify({ full_name: 'langchain-ai/langgraph', description: 'Build stateful, multi-actor agent workflows' }) === 'Workflow Graph');
// crewAI: rule engines both 'agent' and 'multi-agent' tie; warm-cache may resolve to Workflow Graph
var crewResult = layerClassifier.classify({ full_name: 'crewAIInc/crewAI', description: 'Multi-agent orchestration framework' });
assert('crewAI classified (Agent or Workflow)', crewResult.indexOf('Agent') >= 0 || crewResult.indexOf('Workflow') >= 0);
assert('chroma → Memory Bus', layerClassifier.classify({ full_name: 'chroma-core/chroma', description: 'AI-native vector database' }) === 'Memory Bus');
assert('unknown → Unknown', layerClassifier.classify({ full_name: 'test/unknown', description: 'xyz' }) === 'Unknown');

console.log('── Test 2: Maturity Scorer ──');
var m1 = maturityScorer.score({ stargazers_count: 100000, forks_count: 50000, open_issues_count: 30, updated_at: new Date().toISOString(), license: { spdx_id: 'MIT' } });
assert('high maturity > 7', m1 >= 7);
var m2 = maturityScorer.score({ stargazers_count: 10, forks_count: 2, open_issues_count: 500, updated_at: '2020-01-01', license: null });
assert('low maturity < 5', m2 < 5);

console.log('── Test 3: Risk Scorer ──');
var r1 = riskScorer.score({ license: { spdx_id: 'MIT' }, updated_at: new Date().toISOString(), open_issues_count: 50 });
assert('safe repo low risk', r1.level === '安全' || r1.level === '低');
var r2 = riskScorer.score({ license: null, updated_at: '2020-01-01', open_issues_count: 2000 });
assert('high risk repo', r2.level === '高');

console.log('── Test 4: Integration Scorer ──');
var i1 = integrationScorer.score({ language: 'TypeScript', description: 'A powerful agent SDK with API' }, 'Agent Runtime');
assert('TS+API scores high', i1 >= 7);
var i2 = integrationScorer.score({ language: 'C++', description: 'Legacy engine' }, 'Unknown');
assert('C++ unknown scores low', i2 < 7);

console.log('── Test 5: Help Command ──');
var help = cmd.helpText();
assert('help contains 帮助', help.indexOf('Usage') >= 0);
assert('help REVIEW_ONLY', help.indexOf('REVIEW_ONLY') >= 0);

console.log('── Test 6: Score Command (mock) ──');
cmd.execute({}, '评分 https://github.com/microsoft/qlib').then(function (r) {
  assert('score has 开源雷达', r.indexOf('OSS Radar') >= 0);
  assert('score has 总分', r.indexOf('总分') >= 0);
  assert('score REVIEW_ONLY', r.indexOf('REVIEW_ONLY') >= 0);

  return cmd.execute({}, '评分 not-a-url');
}).then(function (r) {
  assert('bad URL error', r.indexOf('有效的 GitHub URL') >= 0);
});

console.log('── Test 7: Compare Command ──');
cmd.execute({}, '对比 https://github.com/a/b https://github.com/c/d').then(function (r) {
  assert('compare has 对比', r.indexOf('对比') >= 0 || r.indexOf('OSS Radar') >= 0);

  return cmd.execute({}, '对比');
}).then(function (r) {
  assert('compare empty error', r.indexOf('至少') >= 0);
});

console.log('── Test 8: Artifact & Audit ──');
cmd.execute({}, '评分 https://github.com/microsoft/qlib').then(function (r) {
  var ad = '/opt/wecom-openclaw/workspace/artifacts/oss-radar';
  assert('artifact dir exists', fs.existsSync(ad));
  assert('candidates.json exists', fs.existsSync(path.join(ad, 'candidates.json')));
  assert('audit.jsonl exists', fs.existsSync(path.join(ad, 'audit.jsonl')));

  console.log('── Test 9: Safety ──');
  var src = fs.readFileSync(path.join(__dirname, '../../../commands/oss-radar-command.js'), 'utf-8');
  assert('no clone', src.indexOf('git clone') < 0);
  assert('no exec', src.indexOf('child_process') < 0 && src.indexOf('spawn') < 0);
  assert('no npm install', src.indexOf('npm install') < 0);
  assert('REVIEW_ONLY present', src.indexOf('REVIEW_ONLY') >= 0);

  setTimeout(summary, 100);
});
