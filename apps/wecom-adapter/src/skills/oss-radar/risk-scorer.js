'use strict';
// P5 — Risk Scorer
function score(repo, layer) {
  var risks = []; var s = 0;
  var lic = (repo.license && repo.license.spdx_id) || 'Unknown';

  if (lic === 'Unknown' || lic === 'NOASSERTION') { risks.push('未知许可证'); s += 3; }
  else if (lic === 'GPL-3.0' || lic === 'AGPL-3.0') { risks.push('传染性许可证(' + lic + ')'); s += 2; }

  var daysSince = repo.updated_at ? Math.max(0, (Date.now() - new Date(repo.updated_at).getTime()) / 86400000) : 365;
  if (daysSince > 365) { risks.push('超过1年未更新'); s += 3; }
  else if (daysSince > 180) { risks.push('超过180天未更新'); s += 2; }
  else if (daysSince > 90) { risks.push('超过90天未更新'); s += 1; }

  if ((repo.open_issues_count || 0) > 1000) { risks.push('issue过多'); s += 1; }
  if ((repo.forks_count || 0) < 10 && (repo.stargazers_count || 0) > 1000) { risks.push('fork率异常低'); s += 1; }

  var level = s >= 5 ? '高' : s >= 3 ? '中' : s >= 1 ? '低' : '安全';
  return { level: level, score: s, factors: risks.length > 0 ? risks : ['无显著风险'] };
}

module.exports = { score: score };
