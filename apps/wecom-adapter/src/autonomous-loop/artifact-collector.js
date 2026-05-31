'use strict';

// P17 Artifact Collector — collects data and simulates artifact generation
var MOCK_GMV_DATA = { today: 158000, yesterday: 142000, weekAvg: 135000, trend: 'up' };
var MOCK_ORDER_DATA = { total: 320, completed: 285, pending: 25, refunded: 10 };
var MOCK_PROFIT_DATA = { revenue: 158000, cost: 95000, profit: 63000, margin: 39.9 };
var MOCK_ROI_DATA = { roas: 2.8, roiPct: 180, spend: 22000, revenue: 61600 };
var MOCK_CTR_DATA = { impressions: 85000, clicks: 3400, ctrPct: 4.0 };
var MOCK_CONVERSION_DATA = { conversions: 285, rate: 8.4 };
var MOCK_CAMPAIGN_DATA = { active: 3, profit: 18500, signupCount: 45 };
var MOCK_INVENTORY = { total: 12, lowStock: 2, outOfStock: 0 };

/**
 * Collect all operational data for the day
 */
function collectAllData() {
  return {
    collectedAt: new Date().toISOString(),
    gmv: MOCK_GMV_DATA,
    orders: MOCK_ORDER_DATA,
    profit: MOCK_PROFIT_DATA,
    roi: MOCK_ROI_DATA,
    ctr: MOCK_CTR_DATA,
    conversion: MOCK_CONVERSION_DATA,
    campaign: MOCK_CAMPAIGN_DATA,
    inventory: MOCK_INVENTORY,
    source: 'mock',
    reviewOnly: true
  };
}

/**
 * Collect (simulate) artifacts for scheduled tasks
 */
function collectArtifacts(tasks) {
  var artifacts = [];
  var categories = {
    analysis: { count: 0, files: ['analysis-report.md', 'data-summary.json'] },
    risk: { count: 0, files: ['risk-assessment.md', 'risk-scores.json'] },
    roi: { count: 0, files: ['roi-breakdown.json', 'roi-trend.png'] },
    strategy: { count: 0, files: ['strategy-recommendation.md', 'action-plan.json'] },
    video: { count: 0, files: ['video-plan.json', 'script-draft.json'] },
    development: { count: 0, files: ['patch-diff.txt', 'test-results.json'] },
    validation: { count: 0, files: ['validation-report.md'] },
    audit: { count: 0, files: ['audit-log.md', 'audit-scores.json'] },
    artifact: { count: 0, files: ['artifact-list.json', 'file-checksums.json'] },
    smoke_test: { count: 0, files: ['health-check.json'] }
  };

  tasks.forEach(function (t) {
    var cat = categories[t.type];
    if (cat) {
      cat.count++;
      cat.files.forEach(function (fn) {
        artifacts.push({
          artifactId: 'art-' + t.taskId + '-' + fn.replace('.', '-'),
          taskId: t.taskId,
          fileName: fn,
          type: t.type,
          agent: t.agent ? t.agent.agentId : 'unknown',
          reviewRequired: true,
          reviewOnly: true,
          createdAt: new Date().toISOString()
        });
      });
    }
  });

  return {
    artifactCount: artifacts.length,
    byCategory: categories,
    artifacts: artifacts.slice(0, 30),
    reviewOnly: true
  };
}

module.exports = {
  collectAllData: collectAllData,
  collectArtifacts: collectArtifacts,
  MOCK_GMV_DATA: MOCK_GMV_DATA,
  MOCK_ORDER_DATA: MOCK_ORDER_DATA,
  MOCK_PROFIT_DATA: MOCK_PROFIT_DATA,
  MOCK_ROI_DATA: MOCK_ROI_DATA,
  MOCK_CTR_DATA: MOCK_CTR_DATA
};
