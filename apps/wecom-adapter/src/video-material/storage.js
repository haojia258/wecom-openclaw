'use strict';

// P14.1 Video Material Engine — Storage Layer
const fs = require('fs');
const path = require('path');

var PLANS_DIR = path.resolve(__dirname, '../../storage/video-material/plans');

function ensureStorage() {
  if (!fs.existsSync(PLANS_DIR)) {
    fs.mkdirSync(PLANS_DIR, { recursive: true });
  }
}

function savePlan(plan) {
  ensureStorage();
  var filePath = path.join(PLANS_DIR, plan.planId + '.json');
  fs.writeFileSync(filePath, JSON.stringify(plan, null, 2), 'utf-8');
  return filePath;
}

function loadPlan(planId) {
  ensureStorage();
  var filePath = path.join(PLANS_DIR, planId + '.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function listPlanIds() {
  ensureStorage();
  return fs.readdirSync(PLANS_DIR)
    .filter(function (f) { return f.endsWith('.json'); })
    .map(function (f) { return f.replace('.json', ''); });
}

function loadAll() {
  ensureStorage();
  var plans = {};
  listPlanIds().forEach(function (id) {
    var p = loadPlan(id);
    if (p) plans[id] = p;
  });
  return plans;
}

function deletePlan(planId) {
  ensureStorage();
  var filePath = path.join(PLANS_DIR, planId + '.json');
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

function clearAll() {
  ensureStorage();
  listPlanIds().forEach(function (id) { deletePlan(id); });
}

module.exports = {
  ensureStorage: ensureStorage,
  savePlan: savePlan,
  loadPlan: loadPlan,
  listPlanIds: listPlanIds,
  loadAll: loadAll,
  deletePlan: deletePlan,
  clearAll: clearAll,
  PLANS_DIR: PLANS_DIR
};
