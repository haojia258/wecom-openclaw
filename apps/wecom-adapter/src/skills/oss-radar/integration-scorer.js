'use strict';
// P4 — Integration Scorer: estimates ease of integration
function score(repo, layer) {
  var lang = (repo.language || '').toLowerCase();
  var s = 5; // baseline

  // Language bonus
  if (lang === 'javascript' || lang === 'typescript') s += 2;
  else if (lang === 'python') s += 1.5;
  else if (lang === 'go' || lang === 'rust') s += 0.5;
  else s += 0;

  // API availability
  if ((repo.description || '').toLowerCase().indexOf('api') >= 0) s += 1;
  if ((repo.description || '').toLowerCase().indexOf('sdk') >= 0) s += 1;

  // Layer-specific
  if (layer === 'Agent Runtime' || layer === 'Workflow Graph') s += 1;
  if (layer === 'Memory Bus') s += 0.5;

  return Math.min(10, Math.round(s * 10) / 10);
}

module.exports = { score: score };
