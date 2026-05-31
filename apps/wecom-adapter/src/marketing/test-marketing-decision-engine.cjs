'use strict';

var engine = require('./decision-engine');
var storage = require('./storage');

var passed = 0, failed = 0;
var RECOMMENDATIONS = engine.RECOMMENDATIONS;
var RISK_LEVELS = engine.RISK_LEVELS;
function assert(desc, cond, detail) {
  if (cond) { passed++; console.log('  ✅ ' + desc); }
  else { failed++; console.log('  ❌ ' + desc + (detail ? ' — ' + detail : '')); }
}
function summary() {
  console.log('\n' + '='.repeat(40));
  console.log('  Total: ' + (passed + failed) + ' | Passed: ' + passed + ' | Failed: ' + failed);
  if (failed > 0) process.exit(1);
}

engine._reset();

console.log('── Test 1: analyzeROI ──');
var roi1 = engine.analyzeROI({ spend: 10000, revenue: 30000 });
assert('ROI score 95 (200%+)', roi1.score === 95 && roi1.label === 'excellent');
assert('ROI has roas', roi1.roas === 3);
assert('ROI has roiPct', roi1.roiPct === 200);

var roi2 = engine.analyzeROI({ spend: 10000, revenue: 5000 });
assert('ROI loss score 10', roi2.score === 10 && roi2.label === 'loss');

var roi3 = engine.analyzeROI({ spend: 10000, revenue: 0 });
assert('ROI zero revenue score', roi3.score <= 35);

console.log('── Test 2: analyzeCTR ──');
var ctr1 = engine.analyzeCTR({ impressions: 10000, clicks: 600 });
assert('CTR 6% excellent', ctr1.score === 95 && ctr1.label === 'excellent');

var ctr2 = engine.analyzeCTR({ impressions: 10000, clicks: 50 });
assert('CTR 0.5% below_avg', ctr2.score <= 35 && ctr2.label === 'below_avg');

var ctr3 = engine.analyzeCTR({ impressions: 10000, clicks: 200 });
assert('CTR 2% good', ctr3.score === 75 && ctr3.label === 'good');

console.log('── Test 3: analyzeConversion ──');
var conv1 = engine.analyzeConversion({ clicks: 1000, conversions: 150, spend: 10000 });
assert('Conversion 15% excellent', conv1.score === 95 && conv1.label === 'excellent');

var conv2 = engine.analyzeConversion({ clicks: 1000, conversions: 10, spend: 10000 });
assert('Conversion 1% poor', conv2.score <= 35);
assert('conv has ratePct', typeof conv2.ratePct === 'number');
assert('conv has cpa', typeof conv2.cpa === 'number');

console.log('── Test 4: Risk Assessment ──');
var risk1 = engine.calculateRiskLevel({ spend: 5000, impressions: 1000 }, { score: 95 }, { score: 75 }, { score: 65 });
assert('Low risk when all good', risk1.level === 'low');

var risk2 = engine.calculateRiskLevel({ spend: 5000, impressions: 1000 }, { score: 10 }, { score: 15 }, { score: 15 });
assert('High risk when all poor', risk2.level === 'high');

var risk3 = engine.calculateRiskLevel({ spend: 5000, impressions: 0 }, { score: 95 }, { score: 95 }, { score: 95 });
assert('No data risk factor', risk3.factors.join('').indexOf('impression') >= 0);

console.log('── Test 5: Recommendation ──');
var rec1 = engine.generateRecommendation({ score: 95 }, { score: 95 }, { score: 95 }, { level: 'low' });
assert('Strong recommend when excellent', rec1.level === 'strong_recommend');

var rec2 = engine.generateRecommendation({ score: 15 }, { score: 15 }, { score: 15 }, { level: 'high' });
assert('Pause when all poor', rec2.level === 'pause');

var rec3 = engine.generateRecommendation({ score: 65 }, { score: 35 }, { score: 65 }, { level: 'medium' });
assert('Watch when mixed', rec3.level === 'watch');

console.log('── Test 6: analyzeCampaign ──');
var dec = engine.analyzeCampaign({ campaignId: 'camp-001', spend: 10000, revenue: 35000, impressions: 50000, clicks: 2000, conversions: 150 });
assert('decisionId exists', !!dec.decisionId && dec.decisionId.startsWith('md-'));
assert('reviewRequired=true', dec.reviewRequired === true);
assert('reviewOnly=true', dec.reviewOnly === true);
assert('requiresHumanApproval=true', dec.requiresHumanApproval === true);
assert('has roiScore', dec.roiScore > 50);
assert('has ctrScore', dec.ctrScore > 0);
assert('has riskLevel', dec.riskLevel.length > 0);
assert('has recommendation', RECOMMENDATIONS.indexOf(dec.recommendation) >= 0);
assert('createdAt exists', !!dec.createdAt);

console.log('── Test 7: Persistence ──');
var loaded = storage.loadDecision(dec.decisionId);
assert('loadDecision returns decision', !!loaded && loaded.decisionId === dec.decisionId);

console.log('── Test 8: List & Stats ──');
var list = engine.listDecisions();
assert('listDecisions returns array', list.length >= 1);
var st = engine.stats();
assert('stats has total', st.total >= 1);

console.log('── Test 9: Error ──');
var threw = false;
try { engine.analyzeCampaign({}); } catch (e) { threw = true; }
assert('missing campaignId throws', threw);

summary();
