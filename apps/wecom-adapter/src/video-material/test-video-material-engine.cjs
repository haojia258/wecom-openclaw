'use strict';

var engine = require('./engine');
var storage = require('./storage');
var segBuilder = require('./segment-builder');
var fs = require('fs');
var path = require('path');

var passed = 0, failed = 0;
function assert(desc, cond, detail) {
  if (cond) { passed++; console.log('  ✅ ' + desc); }
  else { failed++; console.log('  ❌ ' + desc + (detail ? ' — ' + detail : '')); }
}
function summary() {
  console.log('\n' + '='.repeat(40));
  console.log('  Total: ' + (passed + failed) + ' | Passed: ' + passed + ' | Failed: ' + failed);
  if (failed > 0) process.exit(1);
}

// Cleanup
engine._reset();

console.log('── Test 1: Create Plan ──');
var plan = engine.createVideoPlan({ productId: 'prod-001', goal: 'promote_new_product' });
assert('planId exists', !!plan.planId && plan.planId.startsWith('vp-'));
assert('default status=draft', plan.status === 'draft');
assert('reviewRequired=true', plan.reviewRequired === true);
assert('reviewOnly=true', plan.reviewOnly === true);
assert('productId set', plan.productId === 'prod-001');
assert('goal set', plan.goal === 'promote_new_product');
assert('platform default douyin', plan.platform === 'douyin');
assert('duration default 30', plan.duration === 30);
assert('segments default 6', plan.segments.length === 6);
assert('assets default empty', Array.isArray(plan.assets) && plan.assets.length === 0);
assert('scriptId null', plan.scriptId === null);
assert('createdAt exists', !!plan.createdAt);
assert('updatedAt exists', !!plan.updatedAt);

console.log('\n── Test 2: Segment Operations ──');
var seg = { type: 'product_demo', name: 'Custom Demo', duration: 10, content: 'demo content' };
var added = engine.addSegment(plan.planId, seg);
assert('addSegment returns segment', !!added);
assert('segments count increased', plan.segments.length === 7);

var dur = engine.estimateDuration(plan.segments);
assert('estimateDuration returns number', typeof dur === 'number' && dur > 0);

console.log('\n── Test 3: Status Management ──');
var beforeUpdate = plan.updatedAt;
var updated = engine.updatePlanStatus(plan.planId, 'review');
assert('status updated to review', updated.status === 'review');
assert('updatedAt changed', updated.updatedAt !== beforeUpdate);

var threw = false;
try { engine.updatePlanStatus(plan.planId, 'invalid_status'); } catch (e) { threw = true; }
assert('invalid status rejected', threw);

console.log('\n── Test 4: Asset Attachment ──');
var withAsset = engine.attachAsset(plan.planId, 'asset-001');
assert('attachAsset returns plan', !!withAsset);
assert('assets includes new asset', plan.assets.indexOf('asset-001') >= 0);

console.log('\n── Test 5: Read & List ──');
var read = engine.getPlan(plan.planId);
assert('getPlan returns plan', !!read && read.planId === plan.planId);
assert('getPlan non-exist returns null', engine.getPlan('non-existent') === null);

var list = engine.listPlans();
assert('listPlans returns array', list.length >= 1);

console.log('\n── Test 6: Persistence ──');
storage.ensureStorage();
var saved = storage.loadPlan(plan.planId);
assert('storage loadPlan works', !!saved && saved.planId === plan.planId);

var ids = storage.listPlanIds();
assert('storage listPlanIds works', ids.indexOf(plan.planId) >= 0);

console.log('\n── Test 7: Validate ──');
var valOk = engine.validatePlan(plan);
assert('valid plan passes', valOk.valid === true);

var badPlan = { productId: '', goal: '' };
var valBad = engine.validatePlan(badPlan);
assert('invalid plan fails', valBad.valid === false);

console.log('\n── Test 8: Delete & Cleanup ──');
var deleted = storage.deletePlan(plan.planId);
assert('storage deletePlan returns true', deleted === true);
assert('plan removed after delete', storage.loadPlan(plan.planId) === null);

summary();
