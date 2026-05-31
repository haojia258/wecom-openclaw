'use strict';

/**
 * task-artifact-reader.js — P15.1 Task Artifact Reader
 *
 * Lists artifact files with size and modification time.
 * REVIEW_ONLY=true
 */

var fs = require('fs');
var path = require('path');

var ARTIFACTS_ROOT = path.join(__dirname, '..', '..', 'storage', 'orchestrator', 'artifacts');

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function listArtifacts(taskId) {
  var dir = path.join(ARTIFACTS_ROOT, taskId);
  if (!fs.existsSync(dir)) return [];

  var files = [];
  try {
    var entries = fs.readdirSync(dir);
    entries.forEach(function (name) {
      try {
        var stat = fs.statSync(path.join(dir, name));
        if (stat.isFile()) {
          files.push({
            name: name,
            size: stat.size,
            sizeFormatted: formatSize(stat.size),
            modified: stat.mtime.toISOString()
          });
        }
      } catch (e) {}
    });
  } catch (e) {}

  files.sort(function (a, b) { return b.modified.localeCompare(a.modified); });
  return files;
}

function formatArtifactList(taskId) {
  var files = listArtifacts(taskId);

  if (files.length === 0) {
    return '# Artifacts: ' + taskId + '\n\nNo artifacts found.\n\nREVIEW_ONLY: true';
  }

  var lines = ['# Artifacts: ' + taskId, '', 'REVIEW_ONLY=true', ''];
  lines.push('| # | File | Size | Modified |');
  lines.push('|---|------|------|----------|');

  files.forEach(function (f, i) {
    var modified = f.modified.substring(0, 19).replace('T', ' ');
    lines.push('| ' + (i + 1) + ' | ' + f.name + ' | ' + f.sizeFormatted + ' | ' + modified + ' |');
  });

  lines.push('');
  lines.push('Total: ' + files.length + ' artifacts');
  lines.push('');
  lines.push('REVIEW_ONLY: true');

  return lines.join('\n');
}

module.exports = {
  listArtifacts: listArtifacts,
  formatArtifactList: formatArtifactList
};
