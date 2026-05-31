'use strict';

/**
 * oss-radar.js — /开源雷达 command handler v0.1
 *
 * REVIEW_ONLY=true — no deploy, no config changes.
 *
 * Mock-enabled: when USE_MOCK=true (default for v0.1), uses built-in
 * curated data instead of GitHub API.
 *
 * Commands (registered in command-center.js):
 *   /开源雷达 <query>              — search, score, risk, recommend
 *   /oss-radar <query>             — alias
 *   /oss <query>                   — alias
 *   /开源 <query>                  — alias
 *   /开源雷达 对比 a b             — compare projects
 *   /开源雷达 搜索 <kw>            — search only
 */

const path = require('path');
const fs = require('fs');

// REVIEW_ONLY: mock-first in v0.1
var USE_MOCK = process.env.USE_MOCK !== 'false';

var desc = '开源雷达: GitHub项目评分/对比/搜索 (REVIEW_ONLY)';

// ═══════════════════════════════════════════
// Mock Data (v0.1)
// ═══════════════════════════════════════════

var MOCK_REPOS = {
  'langchain': {
    full_name: 'langchain-ai/langchain',
    name: 'langchain',
    stargazers_count: 102000,
    forks_count: 17000,
    open_issues_count: 280,
    language: 'Python',
    license: { spdx_id: 'MIT' },
    description: 'Build context-aware reasoning applications with LangChain',
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    html_url: 'https://github.com/langchain-ai/langchain'
  },
  'crewai': {
    full_name: 'crewAIInc/crewAI',
    name: 'crewAI',
    stargazers_count: 28000,
    forks_count: 3800,
    open_issues_count: 120,
    language: 'Python',
    license: { spdx_id: 'MIT' },
    description: 'Framework for orchestrating role-playing AI agents',
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    html_url: 'https://github.com/crewAIInc/crewAI'
  },
  'react': {
    full_name: 'facebook/react',
    name: 'react',
    stargazers_count: 232000,
    forks_count: 48000,
    open_issues_count: 890,
    language: 'JavaScript',
    license: { spdx_id: 'MIT' },
    description: 'A declarative library for building user interfaces',
    updated_at: new Date(Date.now() - 0.5 * 86400000).toISOString(),
    html_url: 'https://github.com/facebook/react'
  },
  'autogpt': {
    full_name: 'Significant-Gravitas/AutoGPT',
    name: 'AutoGPT',
    stargazers_count: 172000,
    forks_count: 46000,
    open_issues_count: 420,
    language: 'Python',
    license: { spdx_id: 'MIT' },
    description: 'Autonomous AI agent framework for task automation',
    updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    html_url: 'https://github.com/Significant-Gravitas/AutoGPT'
  },
  'tensorflow': {
    full_name: 'tensorflow/tensorflow',
    name: 'tensorflow',
    stargazers_count: 188000,
    forks_count: 75000,
    open_issues_count: 2100,
    language: 'C++',
    license: { spdx_id: 'Apache-2.0' },
    description: 'An open source machine learning framework',
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    html_url: 'https://github.com/tensorflow/tensorflow'
  }
};

// ═══════════════════════════════════════════
// Scoring Engine
// ═══════════════════════════════════════════

var WEIGHTS = { star: 40, fork: 20, issue: 20, update: 20 };

function log2(x) { return Math.log(Math.max(x, 0.01)) / Math.LN2; }

function daysSince(dateStr) {
  if (!dateStr) return 365;
  var diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, diff / 86400000);
}

function scoreRepo(repo) {
  var stars = repo.stargazers_count || repo.stars || 0;
  var forks = repo.forks_count || repo.forks || 0;
  var openIssues = repo.open_issues_count || repo.open_issues || 0;
  var ds = daysSince(repo.updated_at || repo.pushed_at);

  var starScore = Math.min(log2(stars + 1) * 4, 40);
  var forkScore = Math.min(log2(forks + 1) * 3, 20);
  var issuePenalty = openIssues > 500 ? 15 : openIssues > 100 ? 5 : 0;
  var issueScore = Math.max(0, 20 - issuePenalty);
  var activityBonus = ds < 7 ? 20 : ds < 30 ? 10 : ds < 90 ? 5 : 0;

  // Normalize sub-scores to 0-100 scale, then apply weights
  var starScoreNorm = (starScore / 40) * 100;
  var forkScoreNorm = (forkScore / 20) * 100;
  var issueScoreNorm = (issueScore / 20) * 100;
  var activityNorm = (activityBonus / 20) * 100;

  var total = Math.round(
    starScoreNorm * WEIGHTS.star / 100 +
    forkScoreNorm * WEIGHTS.fork / 100 +
    issueScoreNorm * WEIGHTS.issue / 100 +
    activityNorm * WEIGHTS.update / 100
  );

  return {
    score: Math.min(total, 100),
    breakdown: {
      stars: Math.round(starScore),
      forks: Math.round(forkScore),
      issues: Math.round(issueScore),
      activity: Math.round(activityBonus)
    }
  };
}

function scoreLevel(total) {
  if (total >= 80) return 'A';
  if (total >= 60) return 'B';
  if (total >= 40) return 'C';
  return 'D';
}

// ═══════════════════════════════════════════
// Risk Assessment (v0.1)
// ═══════════════════════════════════════════

function assessRisk(repo, scoreObj) {
  var risks = [];
  var riskScore = 0;

  // Activity staleness
  var ds = daysSince(repo.updated_at || repo.pushed_at);
  if (ds > 180) { risks.push('不活跃(超过180天)'); riskScore += 30; }
  else if (ds > 90) { risks.push('活跃度低'); riskScore += 15; }

  // License risk
  var lic = (repo.license && repo.license.spdx_id) || 'Unknown';
  if (lic === 'Unknown' || lic === 'NOASSERTION') { risks.push('未知许可证'); riskScore += 20; }
  else if (lic === 'GPL-3.0' || lic === 'AGPL-3.0') { risks.push('传染性许可证(' + lic + ')'); riskScore += 10; }

  // Issue risk
  var issues = repo.open_issues_count || 0;
  if (issues > 1000) { risks.push('开放issue过多(' + issues + ')'); riskScore += 15; }
  else if (issues > 500) { risks.push('issue较多(' + issues + ')'); riskScore += 8; }

  // Score risk
  if (scoreObj.score < 40) { risks.push('评分较低'); riskScore += 10; }

  var level;
  if (riskScore >= 50) level = '高风险';
  else if (riskScore >= 25) level = '中风险';
  else if (riskScore >= 10) level = '低风险';
  else level = '安全';

  return { level: level, score: riskScore, factors: risks.length === 0 ? ['无明显风险'] : risks };
}

// ═══════════════════════════════════════════
// Recommendation Engine (v0.1)
// ═══════════════════════════════════════════

function recommend(score, risk) {
  if (score >= 70 && risk.score < 25) return '推荐复用';
  if (score >= 50 && risk.score < 50) return '谨慎评估';
  return '不建议引入';
}

// ═══════════════════════════════════════════
// Mock Search
// ═══════════════════════════════════════════

function mockSearch(query) {
  var q = (query || '').toLowerCase();
  var results = [];

  Object.keys(MOCK_REPOS).forEach(function (key) {
    var repo = MOCK_REPOS[key];
    var matchName = repo.name.toLowerCase().includes(q);
    var matchDesc = (repo.description || '').toLowerCase().includes(q);
    var matchLang = (repo.language || '').toLowerCase().includes(q);
    if (matchName || matchDesc || matchLang) {
      var s = scoreRepo(repo);
      var risk = assessRisk(repo, s);
      results.push({
        name: repo.full_name,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language || 'unknown',
        description: (repo.description || '').substring(0, 120),
        url: repo.html_url,
        license: (repo.license && repo.license.spdx_id) || 'Unknown',
        updated_at: repo.updated_at,
        score: s.score,
        level: scoreLevel(s.score),
        breakdown: s.breakdown,
        risk: risk,
        recommendation: recommend(s.score, risk)
      });
    }
  });

  results.sort(function (a, b) { return b.score - a.score; });
  return { query: query, count: results.length, results: results, source: 'mock' };
}

// ═══════════════════════════════════════════
// Real Search (fallback)
// ═══════════════════════════════════════════

function getToken() {
  return process.env.GITHUB_TOKEN || '';
}

var search, compare, report;
try { search = require('../skills/oss-radar/search.js'); } catch (e) {}
try { compare = require('../skills/oss-radar/compare.js'); } catch (e) {}
try { report = require('../skills/oss-radar/report.js'); } catch (e) {}

async function realSearch(query) {
  if (!search) throw new Error('search module not available');
  var result = await search.searchProjects(query, getToken());
  if (!result || !result.results) return { query: query, count: 0, results: [], source: 'github' };
  result.results.forEach(function (r) {
    r.risk = assessRisk(r, scoreRepo(r));
    r.recommendation = recommend(r.score, r.risk);
  });
  result.source = 'github';
  return result;
}

// ═══════════════════════════════════════════
// Execute
// ═══════════════════════════════════════════

/**
 * @param {object} ctx
 * @param {string} args
 * @returns {string}
 */
async function execute(ctx, args) {
  args = (args || '').trim();

  if (!args) {
    return [
      '# OSS Radar v0.1',
      '',
      'Mode: ' + (USE_MOCK ? 'Mock (v0.1)' : 'GitHub API'),
      'Review-Only: true',
      '',
      'Usage:',
      '  /开源雷达 <project>          search & score & risk & recommend',
      '  /开源雷达 对比 a b            compare projects',
      '  /开源雷达 搜索 <kw>           search only',
      '',
      'Aliases: /oss-radar, /oss, /开源',
    ].join('\n');
  }

  var parts = args.split(/\s+/);
  var sub = parts[0];
  var rest = parts.slice(1).join(' ');

  if (sub === '对比' || sub === 'compare') return handleCompare(rest);
  if (sub === '搜索' || sub === 'search') return handleSearch(rest);

  return handleScore(args);
}

async function handleScore(query) {
  try {
    var result = USE_MOCK ? mockSearch(query) : await realSearch(query);

    if (result.count === 0) {
      return '# OSS Radar: "' + query + '"\n\nNo results found.\nSource: ' + result.source;
    }

    var top = result.results[0];
    var bd = top.breakdown || {};
    var risk = top.risk || {};
    var lic = top.license || 'Unknown';
    var updated = top.updated_at ? new Date(top.updated_at).toISOString().substring(0, 10) : '?';

    var lines = [];
    lines.push('# ' + top.name);
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('|-------|-------|');
    lines.push('| Score | ' + top.score + ' / 100 (' + top.level + ')' + ' |');
    lines.push('| Stars | ' + top.stars.toLocaleString() + ' |');
    lines.push('| Forks | ' + top.forks.toLocaleString() + ' |');
    lines.push('| Language | ' + (top.language || '-') + ' |');
    lines.push('| License | ' + lic + ' |');
    lines.push('| Updated | ' + updated + ' |');
    lines.push('| URL | ' + (top.url || '-') + ' |');
    lines.push('');
    lines.push('## Score Breakdown');
    lines.push('');
    lines.push('| Dimension | Score |');
    lines.push('|-----------|-------|');
    lines.push('| Stars | ' + (bd.stars || 0) + ' |');
    lines.push('| Forks | ' + (bd.forks || 0) + ' |');
    lines.push('| Issues | ' + (bd.issues || 0) + ' |');
    lines.push('| Activity | ' + (bd.activity || 0) + ' |');
    lines.push('');
    lines.push('## Risk Assessment');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('|-------|-------|');
    lines.push('| Risk Level | ' + risk.level + ' |');
    lines.push('| Risk Score | ' + risk.score + ' |');
    if (risk.factors && risk.factors.length > 0) {
      risk.factors.forEach(function (f) { lines.push('| Factor | ' + f + ' |'); });
    }
    lines.push('');
    lines.push('## Recommendation');
    lines.push('');
    lines.push('**' + top.recommendation + '**');
    lines.push('');
    lines.push('Source: ' + result.source);
    lines.push('Review-Only: true');

    return lines.join('\n');
  } catch (e) {
    return 'OSS Radar error: ' + e.message;
  }
}

async function handleCompare(args) {
  var queryParts = args.split(/\s+/).filter(Boolean);
  if (queryParts.length < 2) {
    return 'Please provide at least 2 projects. Example: /开源雷达 对比 langchain crewai';
  }
  try {
    var results = [];
    for (var i = 0; i < queryParts.length; i++) {
      var r = USE_MOCK ? mockSearch(queryParts[i]) : await realSearch(queryParts[i]);
      if (r.count > 0) results.push(r.results[0]);
    }

    if (results.length === 0) return '# OSS Radar Compare\n\nNo results found.';

    var lines = ['# OSS Radar Compare', ''];
    lines.push('| # | Project | Stars | Score | Risk | Recommendation |');
    lines.push('|---|---------|-------|-------|------|----------------|');
    results.forEach(function (r, i) {
      lines.push('| ' + (i + 1) + ' | ' + (r.name || '-') + ' | ' +
        (r.stars || 0).toLocaleString() + ' | ' + (r.score || 0) + ' | ' +
        (r.risk ? r.risk.level : '-') + ' | ' + (r.recommendation || '-') + ' |');
    });

    var best = results[0];
    lines.push('');
    lines.push('**Recommendation: ' + best.recommendation + '** (' + best.name + ')');
    lines.push('');
    lines.push('Source: ' + (USE_MOCK ? 'mock' : 'github'));
    lines.push('Review-Only: true');

    return lines.join('\n');
  } catch (e) {
    return 'OSS Radar compare error: ' + e.message;
  }
}

async function handleSearch(query) {
  try {
    var result = USE_MOCK ? mockSearch(query) : await realSearch(query);
    if (result.count === 0) return '# OSS Radar Search: ' + query + '\n\nNo results.';

    var lines = ['# OSS Radar Search: ' + query, ''];
    result.results.slice(0, 5).forEach(function (r, i) {
      lines.push((i + 1) + '. ' + r.name +
        ' (' + r.stars.toLocaleString() + ' stars, Score: ' + r.score +
        ', Risk: ' + (r.risk ? r.risk.level : '-') +
        ', ' + (r.recommendation || '-') + ')');
    });
    lines.push('');
    lines.push('Source: ' + result.source);
    lines.push('Review-Only: true');
    return lines.join('\n');
  } catch (e) {
    return 'OSS Radar search error: ' + e.message;
  }
}

module.exports = { execute: execute, desc: desc };
