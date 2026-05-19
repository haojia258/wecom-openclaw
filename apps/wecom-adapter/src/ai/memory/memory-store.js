'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.resolve(process.cwd(), 'storage/ops-memory/snapshots.json');

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadSnapshots(filePath = DEFAULT_FILE) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function saveSnapshots(snapshots, filePath = DEFAULT_FILE) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(snapshots, null, 2), 'utf8');
}

function appendSnapshot(snapshot, options = {}) {
  const { filePath = DEFAULT_FILE, max = 7 } = options;
  const list = loadSnapshots(filePath);
  list.push(snapshot);
  const next = list.slice(-Math.max(1, max));
  saveSnapshots(next, filePath);
  return next;
}

module.exports = {
  DEFAULT_FILE,
  loadSnapshots,
  saveSnapshots,
  appendSnapshot,
};
