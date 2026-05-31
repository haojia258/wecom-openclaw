'use strict';

/**
 * score.js — OSS project scoring engine
 *
 * Formula: weighted log-scale score from stars, forks, issues, activity.
 */

var WEIGHTS = { star: 40, fork: 20, issue: 20, update: 20 };

function log2(x) { return Math.log(Math.max(x, 0.01)) / Math.LN2; }

function daysSince(dateStr) {
  if (!dateStr) return 365;
  var diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, diff / (1000 * 60 * 60 * 24));
}

/**
 * @param {object} repo — GitHub repo API response
 * @returns {{ score: number, breakdown: object }}
 */
function scoreRepo(repo) {
  var stars = repo.stargazers_count || repo.stars || 0;
  var forks = repo.forks_count || repo.forks || 0;
  var openIssues = repo.open_issues_count || repo.open_issues || 0;
  var totalIssues = (openIssues || 0) + (repo.closed_issues_count || 0) || 1;
  var openRatio = openIssues / totalIssues;
  var ds = daysSince(repo.updated_at || repo.pushed_at || repo.updatedAt);

  var starPart = WEIGHTS.star * log2(stars + 1) / 10;
  var forkPart = WEIGHTS.fork * log2(forks + 1) / 8;
  var issuePart = WEIGHTS.issue * (1 / (openRatio + 1));
  var updatePart = WEIGHTS.update * (1 / (ds / 30 + 1));

  var score = Math.round(Math.min(starPart + forkPart + issuePart + updatePart, 100));

  return {
    score: score,
    level: score >= 70 ? 'A' : score >= 50 ? 'B' : score >= 30 ? 'C' : 'D',
    breakdown: {
      stars: Math.round(starPart),
      forks: Math.round(forkPart),
      issues: Math.round(issuePart),
      activity: Math.round(updatePart)
    }
  };
}

module.exports = { scoreRepo: scoreRepo, WEIGHTS: WEIGHTS };
