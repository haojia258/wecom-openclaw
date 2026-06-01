'use strict';
// P0 — GitHub API client (read-only, no clone)
var https = require('https');

function getToken() { return process.env.GITHUB_TOKEN || ''; }

function ghGet(path) {
  return new Promise(function (resolve, reject) {
    var opts = {
      hostname: 'api.github.com',
      path: path,
      headers: { 'User-Agent': 'OpenClaw-OSS-Radar', 'Accept': 'application/vnd.github+json' }
    };
    var token = getToken();
    if (token) opts.headers['Authorization'] = 'token ' + token;

    https.get(opts, function (res) {
      var body = '';
      res.on('data', function (d) { body += d; });
      res.on('end', function () {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Parse error')); }
      });
    }).on('error', reject);
  });
}

function getRepo(owner, repo) {
  return ghGet('/repos/' + owner + '/' + repo);
}

function getReadme(owner, repo) {
  return ghGet('/repos/' + owner + '/' + repo + '/readme');
}

function searchRepos(query, page) {
  return ghGet('/search/repositories?q=' + encodeURIComponent(query) + '&per_page=5&page=' + (page || 1));
}

function parseUrl(url) {
  var m = (url || '').match(/github\.com\/([^\/]+)\/([^\/\s#?]+)/);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
}

module.exports = { getRepo: getRepo, getReadme: getReadme, searchRepos: searchRepos, parseUrl: parseUrl };
