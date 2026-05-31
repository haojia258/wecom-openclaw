'use strict';

const fs = require('fs');
const path = require('path');

var DECISIONS_DIR = path.resolve(__dirname, '../../storage/marketing');

function ensureStorage() {
  if (!fs.existsSync(DECISIONS_DIR)) {
    fs.mkdirSync(DECISIONS_DIR, { recursive: true });
  }
}

function saveDecision(decision) {
  ensureStorage();
  var filePath = path.join(DECISIONS_DIR, decision.decisionId + '.json');
  fs.writeFileSync(filePath, JSON.stringify(decision, null, 2), 'utf-8');
  return filePath;
}

function loadDecision(decisionId) {
  ensureStorage();
  var filePath = path.join(DECISIONS_DIR, decisionId + '.json');
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch (e) { return null; }
}

function listDecisionIds() {
  ensureStorage();
  return fs.readdirSync(DECISIONS_DIR)
    .filter(function (f) { return f.endsWith('.json'); })
    .map(function (f) { return f.replace('.json', ''); });
}

function loadAll() {
  ensureStorage();
  var all = {};
  listDecisionIds().forEach(function (id) {
    var d = loadDecision(id);
    if (d) all[id] = d;
  });
  return all;
}

function clearAll() {
  ensureStorage();
  listDecisionIds().forEach(function (id) {
    fs.unlinkSync(path.join(DECISIONS_DIR, id + '.json'));
  });
}

module.exports = {
  ensureStorage: ensureStorage,
  saveDecision: saveDecision,
  loadDecision: loadDecision,
  listDecisionIds: listDecisionIds,
  loadAll: loadAll,
  clearAll: clearAll
};
