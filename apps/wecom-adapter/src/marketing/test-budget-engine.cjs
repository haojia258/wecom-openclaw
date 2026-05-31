'use strict';

var engine = require('./decision-engine');
var budget = require('./budget-engine');

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

engine._reset();

console.log('── Test 1: recommendBudget ──');
var rec1 = budget.recommendBudget({ campaignId: 'camp-001', spend: 10000, revenue: 35000, impressions: 50000, clicks: 2000, conversions: 150, budget: 10000 });
assert('budgetId exists', !!rec1.budgetId && rec1.budgetId.startsWith('mb-'));
assert('action is increase_budget', rec1.action === 'increase_budget');
assert('recommendedBudget > current', rec1.recommendedBudget > rec1.currentBudget);
assert('expectedROI > 0', rec1.expectedROI > 0);
assert('breakEven exists', rec1.breakEvenPoint > 0);
assert('reviewRequired=true', rec1.reviewRequired === true);
assert('reviewOnly=true', rec1.reviewOnly === true);
assert('requiresHumanApproval=true', rec1.requiresHumanApproval === true);
assert('reason non-empty', rec1.reason.length > 10);
assert('createdAt exists', !!rec1.createdAt);

var rec2 = budget.recommendBudget({ campaignId: 'camp-002', spend: 10000, revenue: 5000, impressions: 10000, clicks: 100, conversions: 5, budget: 10000 });
assert('poor ROI reduces budget (CTR salvageable)', rec2.action === 'reduce_budget');

var rec3 = budget.recommendBudget({ campaignId: 'camp-003', spend: 10000, revenue: 18000, impressions: 20000, clicks: 400, conversions: 30, budget: 10000 });
assert('moderate ROI keeps budget', rec3.action === 'keep_budget');

var rec4 = budget.recommendBudget({ campaignId: 'camp-004', spend: 10000, revenue: 0, impressions: 1000, clicks: 1, conversions: 0, budget: 10000 });
assert('zero ROI + zero CTR pauses campaign', rec4.action === 'pause_campaign');

console.log('── Test 2: calculateExpectedROI ──');
var expROI = budget.calculateExpectedROI({ score: 95 }, { score: 75 }, { score: 55 });
assert('expectedROI returns number', typeof expROI === 'number' && expROI > 0 && expROI <= 100);

console.log('── Test 3: calculateBreakEven ──');
var be = budget.calculateBreakEven({ revenue: 35000, spend: 10000, conversions: 150 });
assert('breakEven returns number', typeof be === 'number' && be > 0);

var be2 = budget.calculateBreakEven({ revenue: 0, spend: 10000, conversions: 0 });
assert('breakEven handles zero revenue', be2 > 0);

console.log('── Test 4: predictBudget ──');
assert('excellent ROI increase 20%', budget.predictBudget(10000, { score: 80 }) === 12000);
assert('good ROI keep same', budget.predictBudget(10000, { score: 60 }) === 10000);
assert('moderate ROI reduce 30%', budget.predictBudget(10000, { score: 30 }) === 7000);
assert('poor ROI 10% remaining', budget.predictBudget(10000, { score: 10 }) === 1000);

console.log('── Test 5: simulateBudgetScenarios ──');
var sim = budget.simulateBudgetScenarios({ campaignId: 'camp-004', spend: 10000, revenue: 20000, impressions: 30000, clicks: 1500, conversions: 100, budget: 10000 });
assert('simulation has 5 scenarios', sim.scenarios.length === 5);
assert('simulation has campaignId', sim.campaignId === 'camp-004');
assert('scenarios have roiPct', sim.scenarios.every(function (s) { return typeof s.roiPct === 'number'; }));
assert('scenarios have labels', sim.scenarios.every(function (s) { return typeof s.roiLabel === 'string'; }));
assert('sim reviewOnly=true', sim.reviewOnly === true);

console.log('── Test 6: BUDGET_ACTIONS ──');
assert('4 budget actions', budget.BUDGET_ACTIONS.length === 4);
assert('includes pause_campaign', budget.BUDGET_ACTIONS.indexOf('pause_campaign') >= 0);

summary();
