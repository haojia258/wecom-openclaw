'use strict';

/**
 * search.js — GitHub keyword search
 */

const github = require('./github-client.js');
const scoring = require('./score.js');

/**
 * @param {string} query — search keyword
 * @param {string} [token]
 * @returns {Promise<object>} search results with scores
 */
async function searchProjects(query, token) {
  var result = await github.searchRepos(query, token);
  if (!result.items || result.items.length === 0) {
    return { query: query, count: 0, results: [] };
  }

  var scored = result.items.map(function (repo) {
    var s = scoring.scoreRepo(repo);
    return {
      name: repo.full_name,
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      language: repo.language || 'unknown',
      description: (repo.description || '').substring(0, 120),
      url: repo.html_url,
      score: s.score,
      level: s.level,
      breakdown: s.breakdown
    };
  });

  return {
    query: query,
    count: scored.length,
    total: result.total_count || 0,
    results: scored
  };
}

module.exports = { searchProjects: searchProjects };
