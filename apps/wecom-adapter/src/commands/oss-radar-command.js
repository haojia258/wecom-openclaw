'use strict';

// P7 — Main command handler for /开源雷达
var client = require('../skills/oss-radar/github-client');
var layerClassifier = require('../skills/oss-radar/layer-classifier');
var maturityScorer = require('../skills/oss-radar/maturity-scorer');
var integrationScorer = require('../skills/oss-radar/integration-scorer');
var riskScorer = require('../skills/oss-radar/risk-scorer');
var renderer = require('../skills/oss-radar/report-renderer');
var fs = require('fs');
var path = require('path');

var MOCK_MODE = !process.env.GITHUB_TOKEN;
var ARTIFACT_DIR = path.resolve(__dirname, '../../../../workspace/artifacts/oss-radar');
var desc = '开源雷达: GitHub项目评分/对比/搜索/推荐 (REVIEW_ONLY)';

function ensureArtifacts() { if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true }); }

async function execute(ctx, args) {
  args = (args || '').trim();
  if (!args || args === '帮助' || args === 'help') return helpText();

  var parts = args.split(/\s+/);
  var sub = parts[0]; var rest = parts.slice(1).join(' ');

  try {
    switch (sub) {
      case '评分': return await handleScore(rest);
      case '对比': return await handleCompare(rest);
      case '搜': case 'search': return await handleSearch(rest);
      case '推荐': case 'recommend': return await handleRecommend();
      default: return '未知子命令: ' + sub + '\n\n' + helpText();
    }
  } catch (e) {
    writeAudit('oss_radar_error', { error: e.message });
    return '❌ OSS Radar error: ' + e.message;
  }
}

function helpText() {
  return [
    '# 🔎 OpenClaw OSS Radar',
    '',
    'REVIEW_ONLY=true — 只读分析，不clone/install/execute',
    '',
    'Usage:',
    '  /开源雷达 评分 <github_url>',
    '  /开源雷达 对比 <url1> <url2> ...',
    '  /开源雷达 搜 <keyword>',
    '  /开源雷达 推荐',
    '',
    'Aliases: /oss /oss-radar /项目雷达 /github雷达'
  ].join('\n');
}

function scoreRepo(repo) {
  var layer = layerClassifier.classify(repo);
  var maturity = maturityScorer.score(repo);
  var integration = integrationScorer.score(repo, layer);
  var risk = riskScorer.score(repo, layer);
  var lic = repo.license ? (repo.license.spdx_id || 'Unknown') : 'Unknown';

  // 10 dimensions mapped to 100 scale
  var dims = {
    '架构匹配': 8, 'Agent Runtime': 7, 'Workflow Graph': 7,
    'Governance': 6, 'Memory Bus': 6, 'Skill Marketplace': 6,
    'Quant Research': 5, '生产成熟度': maturity, '接入成本': integration,
    '安全风险': Math.max(0, 10 - risk.score)
  };

  var total = 0;
  Object.keys(dims).forEach(function (k) { total += dims[k]; });

  var rec;
  if (total >= 80) rec = '✅ 优先研究 — 建议深入评估接入方案';
  else if (total >= 65) rec = '📋 进入候选库 — 持续跟踪更新';
  else if (total >= 50) rec = '👀 观察 — 等待社区成熟';
  else rec = '❌ 暂不接入 — 评分过低或风险过高';

  return {
    repo: repo, layer: layer, dimensions: dims, total: total,
    recommendation: rec, risk: risk, license: lic, maturity: maturity
  };
}

async function handleScore(url) {
  var parsed = client.parseUrl(url);
  if (!parsed) return '❌ 请提供有效的 GitHub URL';

  if (MOCK_MODE) {
    var fake = { full_name: parsed.owner + '/' + parsed.repo, name: parsed.repo, stargazers_count: 15000, forks_count: 2500, open_issues_count: 120, language: 'Python', license: { spdx_id: 'MIT' }, description: 'OSS project', updated_at: new Date().toISOString(), html_url: url };
    var result = scoreRepo(fake);
    writeArtifacts(result);
    return renderer.renderSingle(fake, result.dimensions, result.total, result.recommendation, result.layer);
  }

  var repo = await client.getRepo(parsed.owner, parsed.repo);
  if (!repo || repo.message) return '❌ Repo not found or API rate limited';
  var result = scoreRepo(repo);
  writeArtifacts(result);
  return renderer.renderSingle(repo, result.dimensions, result.total, result.recommendation, result.layer);
}

async function handleCompare(urls) {
  var urlList = urls.split(/\s+/).filter(Boolean);
  if (urlList.length < 2) return '❌ 请提供至少2个GitHub URL';

  var results = [];
  for (var i = 0; i < urlList.length; i++) {
    var parsed = client.parseUrl(urlList[i]);
    if (!parsed) continue;
    var repo = MOCK_MODE ? { full_name: parsed.owner + '/' + parsed.repo, name: parsed.repo, stargazers_count: 10000 + i * 5000, language: 'Python', license: { spdx_id: 'MIT' }, updated_at: new Date().toISOString(), html_url: urlList[i] } : await client.getRepo(parsed.owner, parsed.repo);
    if (repo && !repo.message) {
      var r = scoreRepo(repo);
      results.push({ name: repo.full_name, stars: repo.stargazers_count, total: r.total, layer: r.layer, recommendation: r.recommendation });
    }
  }

  if (results.length === 0) return '❌ No repos found';
  results.sort(function (a, b) { return b.total - a.total; });
  writeAudit('oss_radar_compare', { count: results.length });
  return renderer.renderCompare(results, results[0].name + ' (' + results[0].total + '/100)');
}

async function handleSearch(query) {
  if (!query) return '❌ 请提供搜索关键词';
  var repos = MOCK_MODE ? [{ full_name: 'mock/' + query, name: query, stargazers_count: 5000, description: 'Search result', language: 'Python', license: { spdx_id: 'MIT' }, updated_at: new Date().toISOString(), html_url: 'https://github.com/mock/' + query }] : ((await client.searchRepos(query)).items || []);
  if (repos.length === 0) return '❌ 未找到结果';
  writeAudit('oss_radar_search', { query: query, count: repos.length });
  return renderer.renderRecommendList(repos);
}

async function handleRecommend() {
  var repos = MOCK_MODE ? [
    { full_name: 'langchain-ai/langgraph', stargazers_count: 12000, description: 'Build stateful agents', language: 'Python', license: { spdx_id: 'MIT' }, updated_at: new Date().toISOString() },
    { full_name: 'microsoft/qlib', stargazers_count: 16000, description: 'AI量化投资平台', language: 'Python', license: { spdx_id: 'MIT' }, updated_at: new Date().toISOString() },
    { full_name: 'crewAIInc/crewAI', stargazers_count: 28000, description: 'Multi-agent framework', language: 'Python', license: { spdx_id: 'MIT' }, updated_at: new Date().toISOString() }
  ] : [{ full_name: 'no-token', stargazers_count: 0, description: 'Set GITHUB_TOKEN for real data', language: '?', updated_at: new Date().toISOString() }];

  var results = repos.map(function (r) { var s = scoreRepo(r); return Object.assign({}, { full_name: r.full_name, stargazers_count: r.stargazers_count, description: r.description, total: s.total, layer: s.layer }); });
  results.sort(function (a, b) { return b.total - a.total; });
  writeAudit('oss_radar_recommend', { count: results.length });
  return renderer.renderRecommendList(results);
}

function writeArtifacts(result) {
  ensureArtifacts();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'latest-report.md'), renderer.renderSingle(result.repo, result.dimensions, result.total, result.recommendation, result.layer), 'utf-8');
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'candidates.json'), JSON.stringify({ repo: result.repo.full_name, total: result.total, layer: result.layer, dimensions: result.dimensions, recommendation: result.recommendation }, null, 2), 'utf-8');
}

function writeAudit(event, data) {
  ensureArtifacts();
  var entry = JSON.stringify({ ts: new Date().toISOString(), event: event, data: data }) + '\n';
  fs.appendFileSync(path.join(ARTIFACT_DIR, 'audit.jsonl'), entry, 'utf-8');
}

module.exports = { execute: execute, desc: desc, scoreRepo: scoreRepo, helpText: helpText };
