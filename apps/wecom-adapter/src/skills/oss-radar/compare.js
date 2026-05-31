'use strict';

/**
 * compare.js — Multi-project comparison
 */

const github = require('./github-client.js');
const scoring = require('./score.js');

/**
 * @param {string[]} repos — array of "owner/repo" or just search terms
 * @param {string} [token]
 * @returns {Promise<object>} comparison result
 */
async function compareRepos(repos, token) {
  var results = [];
  for (var i = 0; i < repos.length; i++) {
    var parts = repos[i].trim().split('/');
    try {
      var repo;
      if (parts.length === 2) {
        repo = await github.getRepo(parts[0], parts[1], token);
      } else {
        var search = await github.searchRepos(repos[i], token);
        if (search.items && search.items.length > 0) {
          repo = search.items[0];
        } else {
          results.push({ name: repos[i], error: 'not found' });
          continue;
        }
      }
      var scored = scoring.scoreRepo(repo);
      results.push({
        name: repo.full_name || repos[i],
        stars: repo.stargazers_count || 0,
        forks: repo.forks_count || 0,
        language: repo.language || 'unknown',
        score: scored.score,
        level: scored.level,
        breakdown: scored.breakdown
      });
    } catch (e) {
      results.push({ name: repos[i], error: e.message });
    }
  }

  results.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
  return { compared: results.length, results: results };
}

module.exports = { compareRepos: compareRepos };
