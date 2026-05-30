'use strict';

/**
 * oss-radar.js — /开源雷达 command handler
 *
 * Sub-commands:
 *   /开源雷达 <query>            — search and score
 *   /开源雷达 对比 a b           — compare projects
 *   /开源雷达 搜索 <keyword>     — search only
 *   /开源雷达 报告 <taskId>      — view report
 */

const path = require('path');
const fs = require('fs');
const search = require('../skills/oss-radar/search.js');
const compare = require('../skills/oss-radar/compare.js');
const report = require('../skills/oss-radar/report.js');
const { getArtifactDir } = require('../orchestrator/artifact-store');

var desc = '开源雷达: GitHub项目评分/对比/搜索';

function getToken() {
  return process.env.GITHUB_TOKEN || '';
}

/**
 * @param {object} ctx
 * @param {string} args
 * @returns {string}
 */
async function execute(ctx, args) {
  args = (args || '').trim();
  if (!args) {
    return [
      '# OSS Radar',
      '',
      'Usage:',
      '  /开源雷达 <project>        score a project',
      '  /开源雷达 对比 a b          compare projects',
      '  /开源雷达 搜索 <keyword>    search GitHub',
    ].join('\n');
  }

  var parts = args.split(/\s+/);
  var sub = parts[0];
  var rest = parts.slice(1).join(' ');

  if (sub === '对比' || sub === 'compare') {
    return handleCompare(rest);
  }
  if (sub === '搜索' || sub === 'search') {
    return handleSearch(rest);
  }
  // Default: score
  return handleScore(args);
}

async function handleScore(query) {
  try {
    var result = await search.searchProjects(query, getToken());
    if (result.count === 0) {
      return 'OSS Radar: project "' + query + '" not found on GitHub.';
    }
    var top = result.results[0];
    var bd = top.breakdown || {};
    return [
      '# ' + top.name + ' (Score: ' + top.score + ' Level: ' + top.level + ')',
      '',
      'Stars: ' + top.stars + ' | Forks: ' + top.forks,
      'Language: ' + (top.language || '-'),
      '',
      'Breakdown: stars=' + (bd.stars || 0) +
        ' forks=' + (bd.forks || 0) +
        ' issues=' + (bd.issues || 0) +
        ' activity=' + (bd.activity || 0),
      '',
      top.url || '',
    ].join('\n');
  } catch (e) {
    return 'OSS Radar error: ' + e.message;
  }
}

async function handleCompare(args) {
  var repos = args.split(/\s+/).filter(Boolean);
  if (repos.length < 2) {
    return 'Please provide at least 2 projects. Example: /开源雷达 对比 langgraph crewai';
  }
  try {
    var result = await compare.compareRepos(repos, getToken());
    var lines = ['# OSS Radar Compare', ''];
    if (result.results.length === 0) {
      lines.push('No results found.');
      return lines.join('\n');
    }
    lines.push('| Rank | Project | Stars | Forks | Score | Level |');
    lines.push('|------|---------|-------|-------|-------|-------|');
    result.results.forEach(function (r, i) {
      lines.push('| ' + (i + 1) + ' | ' + (r.name || '-') + ' | ' +
        (r.stars || 0) + ' | ' + (r.forks || 0) + ' | ' +
        (r.score || 0) + ' | ' + (r.level || 'D') + ' |');
    });
    return lines.join('\n');
  } catch (e) {
    return 'OSS Radar compare error: ' + e.message;
  }
}

async function handleSearch(query) {
  try {
    var result = await search.searchProjects(query, getToken());
    if (result.count === 0) {
      return 'OSS Radar: no results for "' + query + '"';
    }
    var lines = ['# OSS Radar Search: ' + query, ''];
    result.results.slice(0, 5).forEach(function (r, i) {
      lines.push((i + 1) + '. ' + r.name +
        ' (Stars: ' + r.stars + ', Score: ' + r.score + ')');
    });
    return lines.join('\n');
  } catch (e) {
    return 'OSS Radar search error: ' + e.message;
  }
}

module.exports = { execute: execute, desc: desc };
