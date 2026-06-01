'use strict';
// P3 — Maturity Scorer (stars/forks/issues/update frequency)
function score(repo) {
  var stars = repo.stargazers_count || 0;
  var forks = repo.forks_count || 0;
  var issues = repo.open_issues_count || 0;
  var daysSinceUpdate = repo.updated_at ? Math.max(0, (Date.now() - new Date(repo.updated_at).getTime()) / 86400000) : 365;
  var s = 0;

  if (stars >= 50000) s += 3; else if (stars >= 10000) s += 2.5; else if (stars >= 1000) s += 2; else if (stars >= 100) s += 1; else s += 0.3;
  if (forks >= 10000) s += 2; else if (forks >= 1000) s += 1.5; else if (forks >= 100) s += 1; else s += 0.3;
  if (issues < 50) s += 2; else if (issues < 200) s += 1.5; else if (issues < 500) s += 1; else s += 0.3;
  if (daysSinceUpdate < 7) s += 2; else if (daysSinceUpdate < 30) s += 1.5; else if (daysSinceUpdate < 90) s += 1; else s += 0.3;
  if ((repo.license && repo.license.spdx_id !== 'NOASSERTION') || repo.license) s += 1;

  return Math.min(10, Math.round(s * 10) / 10);
}

module.exports = { score: score };
