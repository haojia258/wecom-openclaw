'use strict';

/**
 * github-pr-reader.js - Read-only GitHub PR diff fetcher
 *
 * Uses GITHUB_TOKEN for auth (read-only operations).
 * No write operations (no create branch, no commit, no PR create).
 */

const https = require('https');

var GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
var REPO_OWNER = 'haojia258';
var REPO_NAME = 'wecom-openclaw';
var API_BASE = 'api.github.com';

function getHeaders() {
  var headers = {
    'User-Agent': 'wecom-openclaw-review-agent',
    'Accept': 'application/vnd.github.v3+json',
  };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = 'token ' + GITHUB_TOKEN;
  }
  return headers;
}

function githubAPI(path) {
  return new Promise(function(resolve, reject) {
    var options = {
      hostname: API_BASE,
      path: path,
      method: 'GET',
      headers: getHeaders(),
    };

    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, data: data });
          }
        } else {
          reject(new Error('GitHub API ' + res.statusCode + ': ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', function(err) { reject(err); });
    req.setTimeout(10000, function() { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function getPRInfo(prNumber) {
  return githubAPI('/repos/' + REPO_OWNER + '/' + REPO_NAME + '/pulls/' + prNumber)
    .then(function(res) {
      var pr = res.data;
      return {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        head: pr.head ? pr.head.ref : '',
        base: pr.base ? pr.base.ref : '',
        html_url: pr.html_url,
        diff_url: pr.diff_url,
        changed_files: pr.changed_files,
        additions: pr.additions,
        deletions: pr.deletions,
      };
    });
}

function getPRDiff(prNumber) {
  return new Promise(function(resolve, reject) {
    var options = {
      hostname: API_BASE,
      path: '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/pulls/' + prNumber,
      method: 'GET',
      headers: Object.assign({}, getHeaders(), { 'Accept': 'application/vnd.github.v3.diff' }),
    };

    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, diff: data });
        } else {
          reject(new Error('GitHub Diff API ' + res.statusCode));
        }
      });
    });

    req.on('error', function(err) { reject(err); });
    req.setTimeout(10000, function() { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function getPRFiles(prNumber) {
  return githubAPI('/repos/' + REPO_OWNER + '/' + REPO_NAME + '/pulls/' + prNumber + '/files?per_page=100')
    .then(function(res) {
      return res.data.map(function(f) {
        return {
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch || '',
        };
      });
    });
}

function getPROverview(prNumber) {
  return Promise.all([
    getPRInfo(prNumber).catch(function() { return null; }),
    getPRFiles(prNumber).catch(function() { return []; }),
  ]).then(function(results) {
    return { info: results[0], files: results[1] };
  });
}

module.exports = {
  getPRInfo: getPRInfo,
  getPRDiff: getPRDiff,
  getPRFiles: getPRFiles,
  getPROverview: getPROverview,
  REPO_OWNER: REPO_OWNER,
  REPO_NAME: REPO_NAME,
};
