'use strict';

var engine = require('./engine');
var sg = require('./script-generator');
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

sg._cleanup();
engine._reset();

console.log('── Test 1: Generate Script ──');
var plan = engine.createVideoPlan({ productId: 'prod-002', goal: 'boost_sales' });
var script = sg.generateScript({ planId: plan.planId, productInfo: { name: 'TestProduct', painPoint: '价格高' }, style: 'short_video', tone: 'direct_sales', offer: '限时5折' });

assert('scriptId exists', !!script.scriptId && script.scriptId.startsWith('vs-'));
assert('planId bound', script.planId === plan.planId);
assert('hook non-empty', script.hook.length > 10);
assert('cta non-empty', script.cta.length > 5);
assert('scenes is array', Array.isArray(script.scenes) && script.scenes.length >= 3);
assert('captions is array', Array.isArray(script.captions));
assert('voiceover non-empty', script.voiceover.length > 10);
assert('duration matches', script.duration === 30);
assert('style default', script.style === 'short_video');
assert('tone default', script.tone === 'direct_sales');
assert('reviewRequired=true', script.reviewRequired === true);
assert('title contains product', script.title.indexOf('TestProduct') >= 0);
assert('createdAt exists', !!script.createdAt);
assert('updatedAt exists', !!script.updatedAt);

console.log('\n── Test 2: Persistence ──');
var loaded = sg.getScript(script.scriptId);
assert('getScript loads from disk', !!loaded && loaded.scriptId === script.scriptId);

console.log('\n── Test 3: Attach Script to Plan ──');
var attached = sg.attachScriptToPlan(plan.planId, script);
assert('attachScriptToPlan returns plan', !!attached);
assert('plan.scriptId updated', plan.scriptId === script.scriptId);
assert('hook segment updated', plan.segments[0].content === script.hook);
assert('cta segment updated', plan.segments[plan.segments.length - 1].content === script.cta);

console.log('\n── Test 4: Validate ──');
var valOk = sg.validateScript(script);
assert('valid script passes', valOk.valid === true);

console.log('\n── Test 5: Hook & CTA ──');
var hook = sg.generateHook({ name: 'MyProduct', painPoint: '慢' }, '效率提升');
assert('generateHook returns string', typeof hook === 'string' && hook.length > 10);
var cta = sg.generateCTA({ name: 'MyProduct' }, '优惠');
assert('generateCTA returns string', typeof cta === 'string' && cta.length > 5);

console.log('\n── Test 6: Caption-to-Scene Alignment ──');
assert('captions match scenes count', script.captions.length === script.scenes.length);

console.log('\n── Test 7: Error Handling ──');
var threw = false;
try { sg.generateScript({}); } catch (e) { threw = true; }
assert('missing planId throws', threw);

var threw2 = false;
try { sg.generateScript({ planId: 'x', productInfo: null }); } catch (e) { threw2 = true; }
assert('missing productInfo throws', threw2);

console.log('\n── Test 8: REVIEW_ONLY ──');
assert('script reviewOnly=true', script.reviewOnly === true);
assert('no real video generated', typeof script.videoUrl === 'undefined');

summary();
