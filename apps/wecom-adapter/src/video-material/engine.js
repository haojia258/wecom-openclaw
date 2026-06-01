'use strict';

// P14.1 Video Material Engine — Core Engine
const storage = require('./storage');
const segmentBuilder = require('./segment-builder');

var _plans = {};
var _loaded = false;

var VALID_STATUSES = ['draft', 'review', 'approved', 'rejected', 'archived'];
var VALID_PLATFORMS = ['douyin', 'kuaishou', 'bilibili', 'wechat', 'xiaohongshu', 'general'];
var DEFAULT_DURATION = 30;

function init() {
  _plans = storage.loadAll();
  _loaded = true;
  return { count: Object.keys(_plans).length };
}

function createVideoPlan(opts) {
  if (!_loaded) init();
  if (!opts.productId) throw new Error('productId is required');
  if (!opts.goal) throw new Error('goal is required');

  var planId = 'vp-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
  var plan = {
    planId: planId,
    productId: opts.productId,
    goal: opts.goal,
    platform: opts.platform || 'douyin',
    duration: opts.duration || DEFAULT_DURATION,
    taskType: opts.taskType || 'video',
    status: 'draft',
    segments: opts.segments || segmentBuilder.buildDefaultSegments({ goal: opts.goal, duration: opts.duration || DEFAULT_DURATION }),
    assets: opts.assets || [],
    scriptId: null,
    reviewRequired: true,
    requiresHumanApproval: true,
    reviewOnly: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  _plans[planId] = plan;
  storage.savePlan(plan);
  return plan;
}

function addSegment(planId, segment) {
  if (!_loaded) init();
  var plan = _plans[planId];
  if (!plan) throw new Error('Plan not found: ' + planId);

  segmentBuilder.validateSegment(segment);
  plan.segments.push(segment);
  plan.updatedAt = new Date().toISOString();
  storage.savePlan(plan);
  return segment;
}

function updatePlanStatus(planId, status) {
  if (!_loaded) init();
  var plan = _plans[planId];
  if (!plan) throw new Error('Plan not found: ' + planId);
  if (VALID_STATUSES.indexOf(status) < 0) throw new Error('Invalid status: ' + status);

  plan.status = status;
  plan.updatedAt = new Date().toISOString();
  storage.savePlan(plan);
  return plan;
}

function attachAsset(planId, asset) {
  if (!_loaded) init();
  var plan = _plans[planId];
  if (!plan) throw new Error('Plan not found: ' + planId);

  plan.assets.push(typeof asset === 'string' ? asset : (asset.id || asset.name || JSON.stringify(asset)));
  plan.updatedAt = new Date().toISOString();
  storage.savePlan(plan);
  return plan;
}

function getPlan(planId) {
  if (!_loaded) init();
  return _plans[planId] || null;
}

function listPlans(filter) {
  if (!_loaded) init();
  var all = Object.values(_plans);
  if (filter) {
    if (filter.status) all = all.filter(function (p) { return p.status === filter.status; });
    if (filter.platform) all = all.filter(function (p) { return p.platform === filter.platform; });
  }
  return all;
}

function validatePlan(plan) {
  var errors = [];
  if (!plan.planId) errors.push('Missing planId');
  if (!plan.productId) errors.push('Missing productId');
  if (!plan.goal) errors.push('Missing goal');
  if (!plan.platform || VALID_PLATFORMS.indexOf(plan.platform) < 0) errors.push('Invalid platform: ' + plan.platform);
  if (!plan.duration || plan.duration <= 0) errors.push('Invalid duration: ' + plan.duration);
  if (plan.reviewRequired !== true) errors.push('reviewRequired must be true');
  if (plan.reviewOnly !== true) errors.push('reviewOnly must be true');
  return { valid: errors.length === 0, errors: errors };
}

function estimateDuration(segments) {
  return segmentBuilder.estimateSegmentDuration(segments);
}

function stats() {
  if (!_loaded) init();
  var all = Object.values(_plans);
  var byStatus = {};
  all.forEach(function (p) { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });
  return { total: all.length, byStatus: byStatus };
}

function _reset() {
  _plans = {};
  _loaded = false;
  storage.clearAll();
}

module.exports = {
  init: init,
  createVideoPlan: createVideoPlan,
  addSegment: addSegment,
  updatePlanStatus: updatePlanStatus,
  attachAsset: attachAsset,
  getPlan: getPlan,
  listPlans: listPlans,
  validatePlan: validatePlan,
  estimateDuration: estimateDuration,
  stats: stats,
  _reset: _reset,
  VALID_STATUSES: VALID_STATUSES,
  VALID_PLATFORMS: VALID_PLATFORMS
};
