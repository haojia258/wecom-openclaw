'use strict';
// P6 — Report Renderer (WeCom markdown format)

function renderSingle(repo, dimensionScores, total, recommendation, layer) {
  var risk = dimensionScores.risk || {};
  var lines = [];
  lines.push('## 🔎 OSS Radar 评估');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push('| 项目 | ' + (repo.full_name || repo.name || 'Unknown') + ' |');
  lines.push('| 分类 | ' + layer + ' |');
  lines.push('| Stars | ' + ((repo.stargazers_count || 0).toLocaleString()) + ' |');
  lines.push('| Forks | ' + ((repo.forks_count || 0).toLocaleString()) + ' |');
  lines.push('| License | ' + (dimensionScores.license || 'Unknown') + ' |');
  lines.push('| 最近更新 | ' + (repo.updated_at ? new Date(repo.updated_at).toISOString().substring(0, 10) : '?') + ' |');
  lines.push('| URL | ' + (repo.html_url || '') + ' |');
  lines.push('');
  lines.push('### 📊 评分明细');
  lines.push('');
  lines.push('| 维度 | 分数 |');
  lines.push('|------|------|');
  Object.keys(dimensionScores).forEach(function (k) {
    var v = dimensionScores[k];
    var label = k === 'risk' ? (v.level || v.score) : (typeof v === 'object' ? v.score : v);
    lines.push('| ' + k + ' | ' + label + '/10 |');
  });
  lines.push('| **总分** | **' + total + '/100** |');
  lines.push('');
  lines.push('### 🎯 建议');
  lines.push('');
  lines.push(recommendation);
  if (risk && risk.factors && risk.factors.length > 0) {
    lines.push('');
    lines.push('⚠️ 风险: ' + risk.factors.join('; '));
  }
  lines.push('');
  lines.push('REVIEW_ONLY=true');
  return lines.join('\n');
}

function renderCompare(results, recommendation) {
  var lines = ['## 🔎 OSS Radar 对比', ''];
  lines.push('| # | 项目 | Stars | 总分 | 分类 | 建议 |');
  lines.push('|---|------|-------|------|------|------|');
  results.forEach(function (r, i) {
    lines.push('| ' + (i + 1) + ' | ' + (r.name || '?') + ' | ' + ((r.stars || 0).toLocaleString()) + ' | ' + r.total + ' | ' + (r.layer || '?') + ' | ' + (r.recommendation || '?') + ' |');
  });
  lines.push('');
  lines.push('**推荐:** ' + recommendation);
  lines.push('');
  lines.push('REVIEW_ONLY=true');
  return lines.join('\n');
}

function renderRecommendList(repos) {
  var lines = ['## 🔎 OSS Radar 推荐列表', ''];
  repos.forEach(function (r, i) {
    lines.push((i + 1) + '. **' + (r.full_name || r.name) + '** — ' + r.total + '/100 — ' + (r.layer || '?'));
    lines.push('   Stars: ' + ((r.stargazers_count || 0).toLocaleString()) + ' | ' + (r.description || '').substring(0, 60));
  });
  lines.push('');
  lines.push('REVIEW_ONLY=true');
  return lines.join('\n');
}

module.exports = { renderSingle: renderSingle, renderCompare: renderCompare, renderRecommendList: renderRecommendList };
