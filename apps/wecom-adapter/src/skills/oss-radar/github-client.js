'use strict';

/**
 * github-client.js — GitHub API client (zero npm deps)
 *
 * Uses Node.js built-in https module. No octokit, no fetch, no axios.
 */

const https = require('https');

var GITHUB_HOST = 'api.github.com';
var USER_AGENT = 'oss-radar-skill/1.0';
var TIMEOUT_MS = 15000;

function setHost(host) { GITHUB_HOST = host; }

function apiGet(path, token) {
  return new Promise(function (resolve, reject) {
    var options = {
      hostname: GITHUB_HOST,
      path: path,
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: TIMEOUT_MS
    };

    if (token) {
      options.headers['Authorization'] = 'token ' + token;
    }

    var req = https.get(options, function (res) {
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('JSON parse error: ' + e.message));
          }
        } else if (res.statusCode === 403 && data.indexOf('rate limit') !== -1) {
          reject(new Error('GitHub API rate limit exceeded. Try again later.'));
        } else if (res.statusCode === 404) {
          reject(new Error('Repository not found (404)'));
        } else {
          reject(new Error('GitHub API error: HTTP ' + res.statusCode));
        }
      });
    });

    req.on('error', function (e) { reject(new Error('GitHub API request failed: ' + e.message)); });
    req.on('timeout', function () { req.destroy(); reject(new Error('GitHub API timeout')); });
  });
}

function searchRepos(query, token) {
  var path = '/search/repositories?q=' + encodeURIComponent(query) + '&sort=stars&order=desc&per_page=10';
  return apiGet(path, token);
}

function getRepo(owner, repo, token) {
  var path = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
  return apiGet(path, token);
}

module.exports = {
  apiGet: apiGet,
  searchRepos: searchRepos,
  getRepo: getRepo,
  setHost: setHost
};
