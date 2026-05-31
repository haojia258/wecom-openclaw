'use strict';

/**
 * artifact-workspace.js — Unified artifact workspace manager
 *
 * Reads from existing artifact-store and provides overview/search.
 */

var path = require('path');
var fs = require('fs');

var BASE_DIR = (function () {
  // try project-relative path first
  var p = path.join(__dirname, '..', '..', '..', 'storage', 'orchestrator', 'artifacts');
  if (fs.existsSync(p)) return p;
  // fallback: absolute server path
  p = '/opt/wecom-openclaw/apps/wecom-adapter/storage/orchestrator/artifacts';
  if (fs.existsSync(p)) return p;
  return p;
})();

function setBaseDir(dir) { BASE_DIR = dir; }

function listTasks() {
  if (!fs.existsSync(BASE_DIR)) return [];
  return fs.readdirSync(BASE_DIR).filter(function (d) {
    return d.startsWith('task-') && fs.statSync(path.join(BASE_DIR, d)).isDirectory();
  });
}

function listArtifacts(taskId) {
  var dir = path.join(BASE_DIR, taskId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (f) {
    return f.endsWith('.md') || f.endsWith('.txt');
  });
}

function readArtifact(taskId, filename) {
  var fp = path.join(BASE_DIR, taskId, filename);
  if (!fs.existsSync(fp)) return null;
  return {
    filename: filename,
    size: fs.statSync(fp).size,
    content: fs.readFileSync(fp, 'utf-8')
  };
}

function getWorkspaceSummary() {
  var tasks = listTasks();
  var totalFiles = 0;
  var totalSize = 0;
  var types = {};

  tasks.forEach(function (taskId) {
    var artifacts = listArtifacts(taskId);
    totalFiles += artifacts.length;
    artifacts.forEach(function (a) {
      var stat = fs.statSync(path.join(BASE_DIR, taskId, a));
      totalSize += stat.size;
      var ext = path.extname(a);
      types[ext] = (types[ext] || 0) + 1;
    });
  });

  return {
    tasks: tasks.length,
    files: totalFiles,
    sizeBytes: totalSize,
    sizeKB: (totalSize / 1024).toFixed(1),
    types: types
  };
}

function searchArtifacts(keyword) {
  var results = [];
  var tasks = listTasks();
  tasks.forEach(function (taskId) {
    var artifacts = listArtifacts(taskId);
    artifacts.forEach(function (a) {
      var content = readArtifact(taskId, a);
      if (content && content.content.toLowerCase().indexOf(keyword.toLowerCase()) !== -1) {
        results.push({
          taskId: taskId,
          filename: a,
          size: content.size,
          snippet: content.content.substring(0, 200)
        });
      }
    });
    if (taskId.indexOf(keyword) !== -1) {
      artifacts.forEach(function (a) {
        if (!results.find(function (r) { return r.taskId === taskId && r.filename === a; })) {
          results.push({ taskId: taskId, filename: a });
        }
      });
    }
  });
  return results;
}

function formatSummary() {
  var s = getWorkspaceSummary();
  var lines = ['# Artifact Workspace', '', '| Metric | Value |', '|--------|-------|'];
  lines.push('| Tasks | ' + s.tasks + ' |');
  lines.push('| Files | ' + s.files + ' |');
  lines.push('| Size | ' + s.sizeKB + ' KB |');
  if (Object.keys(s.types).length > 0) {
    lines.push('');
    lines.push('## By Type');
    Object.keys(s.types).forEach(function (t) { lines.push('- ' + t + ': ' + s.types[t] + ' files'); });
  }
  return lines.join('\n');
}

function formatTaskList() {
  var tasks = listTasks();
  if (tasks.length === 0) return '# Artifact Workspace\n\nNo tasks found.';
  var lines = ['# Artifact Tasks', '', '| Task ID | Files |', '|---------|-------|'];
  tasks.forEach(function (t) {
    var files = listArtifacts(t);
    lines.push('| ' + t + ' | ' + files.length + ' |');
  });
  return lines.join('\n');
}

function formatTaskArtifacts(taskId) {
  var artifacts = listArtifacts(taskId);
  if (artifacts.length === 0) return 'No artifacts for ' + taskId;
  var lines = ['# ' + taskId, ''];
  artifacts.forEach(function (a) {
    var content = readArtifact(taskId, a);
    var size = content ? (content.size / 1024).toFixed(1) + ' KB' : '?';
    lines.push('## ' + a + ' (' + size + ')');
    lines.push('');
    if (content) {
      lines.push(content.content.substring(0, 800));
      if (content.content.length > 800) lines.push('...(truncated)');
    }
    lines.push('');
  });
  return lines.join('\n');
}

module.exports = {
  listTasks: listTasks,
  listArtifacts: listArtifacts,
  readArtifact: readArtifact,
  getWorkspaceSummary: getWorkspaceSummary,
  searchArtifacts: searchArtifacts,
  formatSummary: formatSummary,
  formatTaskList: formatTaskList,
  formatTaskArtifacts: formatTaskArtifacts,
  setBaseDir: setBaseDir
};
