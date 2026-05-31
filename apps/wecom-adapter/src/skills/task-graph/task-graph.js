'use strict';

/**
 * task-graph.js — Task dependency graph engine
 */

var path = require('path');
var fs = require('fs');

var GRAPH_PATH = path.join(__dirname, '..', '..', '..', '..', 'storage', 'task-graph', 'task-graph.json');

var _cache = null;
var _cacheTime = 0;

function getPath() { return GRAPH_PATH; }
function setPath(p) { GRAPH_PATH = p; _cache = null; }

function load() {
  var now = Date.now();
  if (_cache && (now - _cacheTime) < 30000) return _cache;
  _cache = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8'));
  _cacheTime = now;
  return _cache;
}

function getTask(id) {
  var g = load();
  return g.tasks[id] || null;
}

function listTasks() {
  var g = load();
  return Object.keys(g.tasks).map(function (id) {
    var t = g.tasks[id];
    return { id: t.id, name: t.name, status: t.status, dependsOn: t.dependsOn, children: t.children };
  });
}

function getDependencies(id) {
  var t = getTask(id);
  if (!t) return null;
  var g = load();
  return (t.dependsOn || []).map(function (depId) {
    var dep = g.tasks[depId];
    return dep ? { id: dep.id, name: dep.name, status: dep.status } : { id: depId, name: 'unknown' };
  });
}

function getChildren(id) {
  var t = getTask(id);
  if (!t) return null;
  var g = load();
  return (t.children || []).map(function (childId) {
    var child = g.tasks[childId];
    return child ? { id: child.id, name: child.name, status: child.status } : { id: childId, name: 'unknown' };
  });
}

function getBlockers(id) {
  var t = getTask(id);
  if (!t) return [];
  // blockedBy is direct, plus dependencies not yet completed
  var result = (t.blockedBy || []).slice();
  (t.dependsOn || []).forEach(function (depId) {
    var dep = getTask(depId);
    if (dep && dep.status !== 'completed' && dep.status !== 'closed') {
      if (result.indexOf(depId) === -1) result.push(depId);
    }
  });
  return result;
}

function findRoots() {
  var g = load();
  var allIds = Object.keys(g.tasks);
  var hasParent = {};
  allIds.forEach(function (id) {
    (g.tasks[id].dependsOn || []).forEach(function (d) { hasParent[id] = true; });
    (g.tasks[id].children || []).forEach(function (c) { hasParent[c] = true; });
  });
  // Roots: have NO dependsOn
  return allIds.filter(function (id) { return (g.tasks[id].dependsOn || []).length === 0; });
}

/**
 * Generate dependency tree (recursive, max depth 5)
 */
function buildTree(id, depth, visited) {
  if (depth > 5) return null;
  if (visited.indexOf(id) !== -1) return { id: id, name: id, _circular: true };
  visited = visited.concat([id]);
  var t = getTask(id);
  if (!t) return { id: id, name: 'unknown' };
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    children: (t.children || []).map(function (c) { return buildTree(c, depth + 1, visited); })
  };
}

function formatDependencyTree() {
  var roots = findRoots();
  if (roots.length === 0) return 'No tasks in graph';

  var lines = ['# Task Dependency Tree', ''];
  roots.forEach(function (rootId) {
    printNode(rootId, 0, lines, []);
  });
  return lines.join('\n');
}

function printNode(id, depth, lines, visited) {
  if (visited.indexOf(id) !== -1) {
    lines.push('  '.repeat(depth) + '- ' + id + ' (circular)');
    return;
  }
  visited = visited.concat([id]);
  var t = getTask(id);
  var name = t ? t.name : id;
  var status = t ? t.status : 'unknown';
  var icon = status === 'completed' ? 'done' : status === 'in_progress' ? '>' : '.';
  lines.push('  '.repeat(depth) + '- [' + icon + '] ' + name + ' (' + id + ')');
  if (t && t.children) {
    t.children.forEach(function (c) { printNode(c, depth + 1, lines, visited); });
  }
}

function formatDependencies(id) {
  var t = getTask(id);
  if (!t) return 'Task not found: ' + id;

  var lines = ['# ' + t.name + ' (' + id + ')', ''];
  lines.push('Status: ' + t.status);
  lines.push('Assignee: ' + (t.assignee || '-'));

  if ((t.dependsOn || []).length > 0) {
    lines.push(''); lines.push('## Depends On');
    t.dependsOn.forEach(function (d) {
      lines.push('- ' + d + ' (' + ((getTask(d) || {}).status || '?') + ')');
    });
  }

  if ((t.children || []).length > 0) {
    lines.push(''); lines.push('## Children (depended by)');
    t.children.forEach(function (c) {
      lines.push('- ' + c + ' (' + ((getTask(c) || {}).status || '?') + ')');
    });
  }

  var blockers = getBlockers(id);
  if (blockers.length > 0) {
    lines.push(''); lines.push('## Blockers');
    blockers.forEach(function (b) { lines.push('- ' + b); });
  }

  return lines.join('\n');
}

module.exports = {
  load: load,
  getTask: getTask,
  listTasks: listTasks,
  getDependencies: getDependencies,
  getChildren: getChildren,
  getBlockers: getBlockers,
  findRoots: findRoots,
  formatDependencyTree: formatDependencyTree,
  formatDependencies: formatDependencies,
  buildTree: buildTree,
  setPath: setPath,
  getPath: getPath
};
