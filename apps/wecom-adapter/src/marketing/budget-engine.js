'use strict';

// P15.2 Budget / ROI Recommendation Engine
var engine = require('./decision-engine');

var BUDGET_ACTIONS = ['increase_budget', 'keep_budget', 'reduce_budget', 'pause_campaign'];

/**
 * Recommend budget adjustment based on ROI analysis
 */
function recommendBudget(campaignData) {
  var roi = engine.analyzeROI(campaignData);
  var ctr = engine.analyzeCTR(campaignData);
  var conv = engine.analyzeConversion(campaignData);
  var currentBudget = campaignData.budget || campaignData.spend || 0;
  var campaignId = campaignData.campaignId || 'camp-unknown';

  var expectedROI = calculateExpectedROI(roi, ctr, conv);
  var breakEven = calculateBreakEven(campaignData);
  var predictedBudget = predictBudget(currentBudget, roi);

  var action, reason;
  if (roi.score >= 80 && ctr.score >= 60) {
    action = 'increase_budget';
    reason = 'ROI excellent (≥80), CTR good (≥60). 建议增加 20% 预算。';
  } else if (roi.score >= 60 && ctr.score >= 40) {
    action = 'keep_budget';
    reason = 'ROI acceptable (≥60), maintaining current budget.';
  } else if (roi.score >= 30 || ctr.score >= 30) {
    action = 'reduce_budget';
    reason = 'ROI below optimal, 建议减少 30% 预算并优化定向。';
  } else {
    action = 'pause_campaign';
    reason = 'ROI too low, 建议暂停投放并重新规划素材。';
  }

  var budgetId = 'mb-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);

  return {
    budgetId: budgetId,
    campaignId: campaignId,
    currentBudget: currentBudget,
    recommendedBudget: predictedBudget,
    expectedROI: Math.round(expectedROI * 100) / 100,
    breakEvenPoint: Math.round(breakEven * 100) / 100,
    action: action,
    reason: reason,
    reviewRequired: true,
    reviewOnly: true,
    requiresHumanApproval: true,
    createdAt: new Date().toISOString()
  };
}

/**
 * Calculate expected ROI from component scores
 */
function calculateExpectedROI(roi, ctr, conv) {
  var roiWeight = 0.5;
  var ctrWeight = 0.3;
  var convWeight = 0.2;

  var roiScore = roi ? roi.score / 100 : 0;
  var ctrScore = ctr ? ctr.score / 100 : 0;
  var convScore = conv ? conv.score / 100 : 0;

  return (roiScore * roiWeight + ctrScore * ctrWeight + convScore * convWeight) * 100;
}

/**
 * Calculate break-even point (spend needed to reach profitability)
 */
function calculateBreakEven(data) {
  var revenue = data.revenue || 0;
  var spend = data.spend || 0;
  var conversions = data.conversions || 0;
  var costPerConversion = conversions > 0 ? spend / conversions : spend;

  // Break-even: spend = revenue per conversion
  var avgRevenuePerConv = conversions > 0 ? revenue / conversions : 0;
  if (avgRevenuePerConv <= 0) return spend * 2;
  return Math.round(costPerConversion / avgRevenuePerConv * spend);
}

/**
 * Predict recommended budget
 */
function predictBudget(currentBudget, roi) {
  if (!roi) return currentBudget;

  if (roi.score >= 80) return Math.round(currentBudget * 1.20);  // +20%
  if (roi.score >= 60) return currentBudget;                      // keep
  if (roi.score >= 30) return Math.round(currentBudget * 0.70);  // -30%
  return Math.round(currentBudget * 0.10);                        // ~10% for monitoring
}

/**
 * Simulate budget scenarios
 */
function simulateBudgetScenarios(data) {
  var current = data.budget || data.spend || 10000;
  var multipliers = { pessimistic: 0.5, conservative: 0.8, current: 1.0, optimistic: 1.2, aggressive: 1.5 };

  var scenarios = [];
  Object.keys(multipliers).forEach(function (label) {
    var budget = Math.round(current * multipliers[label]);
    var simData = Object.assign({}, data, { budget: budget, spend: budget });
    var roi = engine.analyzeROI(simData);
    scenarios.push({
      scenario: label,
      budget: budget,
      multiplier: multipliers[label],
      roiPct: roi.roiPct,
      roiScore: roi.score,
      roiLabel: roi.label
    });
  });

  return {
    campaignId: data.campaignId || 'camp-unknown',
    currentBudget: current,
    scenarios: scenarios,
    reviewOnly: true
  };
}

module.exports = {
  recommendBudget: recommendBudget,
  calculateExpectedROI: calculateExpectedROI,
  calculateBreakEven: calculateBreakEven,
  predictBudget: predictBudget,
  simulateBudgetScenarios: simulateBudgetScenarios,
  BUDGET_ACTIONS: BUDGET_ACTIONS
};
