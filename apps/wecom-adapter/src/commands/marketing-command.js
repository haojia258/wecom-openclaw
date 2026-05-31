'use strict';

// P15.3 Marketing Command Center — WeCom /投流中心 command
// REVIEW_ONLY=true — no auto launch, no auto budget change, no auto ad publish

var engine, budget;
try { engine = require('../marketing/decision-engine'); } catch (e) { /* P15.1 */ }
try { budget = require('../marketing/budget-engine'); } catch (e) { /* P15.2 */ }

var desc = '投流中心: ROI分析/CTR分析/转化分析/预算建议/风险评估 (REVIEW_ONLY)';

async function execute(ctx, args) {
  args = (args || '').trim();
  if (!args || args === '帮助' || args === 'help') return showHelp();

  var parts = args.split(/\s+/);
  var sub = parts[0];
  var rest = parts.slice(1).join(' ');

  switch (sub) {
    case '分析': return handleAnalyze(rest);
    case 'ROI':
    case 'roi': return handleROI(rest);
    case '预算': return handleBudget(rest);
    case '风险': return handleRisk();
    case '报告': return handleReport();
    default: return 'Unknown: ' + sub + '\n\n' + showHelp();
  }
}

function showHelp() {
  return [
    '# Marketing Command Center',
    '',
    'REVIEW_ONLY=true — 不自动投放/不改预算/不发布广告',
    '',
    'Usage:',
    '  /投流中心 分析 <campaignId> <spend> <revenue> <impressions> <clicks> <conversions>',
    '  /投流中心 ROI',
    '  /投流中心 预算',
    '  /投流中心 风险',
    '  /投流中心 报告',
    '',
    'Aliases: /marketing /投流建议 /预算建议'
  ].join('\n');
}

function parseData(rest) {
  var nums = (rest || '').split(/\s+/).map(Number);
  return {
    campaignId: 'camp-' + Date.now().toString(36),
    spend: nums[0] || 5000,
    revenue: nums[1] || 10000,
    impressions: nums[2] || 10000,
    clicks: nums[3] || 500,
    conversions: nums[4] || 50
  };
}

function handleAnalyze(rest) {
  if (!engine) return '⚠️ P15.1 Decision Engine 未安装。';
  try {
    var data = parseData(rest);
    var dec = engine.analyzeCampaign(data);
    return formatDecision(dec);
  } catch (e) { return '❌ 分析失败: ' + e.message; }
}

function handleROI(rest) {
  if (!engine) return '⚠️ P15.1 Decision Engine 未安装。';
  var data = parseData(rest);
  var roi = engine.analyzeROI(data);
  return [
    '# ROI Analysis',
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| Score | ' + roi.score + '/100 |',
    '| Label | ' + roi.label + ' |',
    '| ROAS | ' + roi.roas + 'x |',
    '| ROI % | ' + roi.roiPct + '% |',
    '| Spend | ¥' + roi.spend.toLocaleString() + ' |',
    '| Revenue | ¥' + roi.revenue.toLocaleString() + ' |',
    '',
    roi.detail,
    '',
    'REVIEW_ONLY=true'
  ].join('\n');
}

function handleBudget(rest) {
  if (!budget) return '⚠️ P15.2 Budget Engine 未安装。';
  var data = parseData(rest);
  data.budget = data.spend;
  var rec = budget.recommendBudget(data);
  var sim = budget.simulateBudgetScenarios(data);

  var lines = [
    '# Budget Recommendation',
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| budgetId | ' + rec.budgetId + ' |',
    '| campaignId | ' + rec.campaignId + ' |',
    '| current | ¥' + rec.currentBudget.toLocaleString() + ' |',
    '| recommended | ¥' + rec.recommendedBudget.toLocaleString() + ' |',
    '| expected ROI | ' + rec.expectedROI + '% |',
    '| break-even | ¥' + rec.breakEvenPoint.toLocaleString() + ' |',
    '| action | ' + rec.action + ' |',
    '| reason | ' + rec.reason + ' |',
    '',
    '## Scenarios',
    '',
    '| Scenario | Budget | ROI% | Label |',
    '|----------|--------|------|-------|'
  ];
  sim.scenarios.forEach(function (s) {
    lines.push('| ' + s.scenario + ' | ¥' + s.budget.toLocaleString() + ' | ' + s.roiPct + '% | ' + s.roiLabel + ' |');
  });
  lines.push('');
  lines.push('REVIEW_ONLY=true — 不自动调整预算');
  return lines.join('\n');
}

function handleRisk() {
  if (!engine) return '⚠️ P15.1 Decision Engine 未安装。';
  var allDecisions = engine.listDecisions();
  if (allDecisions.length === 0) return '# Risk Assessment\n\nNo decisions yet. Run 分析 first.\n\nREVIEW_ONLY=true';

  var riskSummary = {};
  allDecisions.forEach(function (d) {
    riskSummary[d.riskLevel] = (riskSummary[d.riskLevel] || 0) + 1;
  });

  var lines = [
    '# Risk Assessment',
    '',
    '| Risk Level | Count |',
    '|------------|-------|'
  ];
  Object.keys(riskSummary).forEach(function (level) {
    lines.push('| ' + level + ' | ' + riskSummary[level] + ' |');
  });
  lines.push('');
  lines.push('REVIEW_ONLY=true — 不会自动暂停投放');
  return lines.join('\n');
}

function handleReport() {
  if (!engine) return '⚠️ P15.1 Decision Engine 未安装。';

  var allDecisions = engine.listDecisions();
  if (allDecisions.length === 0) return '# Marketing Report\n\nNo decisions yet.\n\nREVIEW_ONLY=true';

  var lines = [
    '# Marketing Report',
    '',
    'Total Decisions: ' + allDecisions.length,
    '',
    '| Campaign | ROI | CTR | Conv | Risk | Recommendation |',
    '|----------|-----|-----|------|------|----------------|'
  ];
  allDecisions.forEach(function (d) {
    lines.push('| ' + d.campaignId + ' | ' + d.roiScore + ' | ' + d.ctrScore + ' | ' + d.conversionScore + ' | ' + d.riskLevel + ' | ' + d.recommendation + ' |');
  });
  lines.push('');
  lines.push('REVIEW_ONLY=true — requires human approval');
  return lines.join('\n');
}

function formatDecision(dec) {
  return [
    '# Campaign Analysis',
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| decisionId | ' + dec.decisionId + ' |',
    '| campaignId | ' + dec.campaignId + ' |',
    '| ROI | ' + dec.roiScore + '/100 (' + dec.roiLabel + ') |',
    '| CTR | ' + dec.ctrScore + '/100 (' + dec.ctrLabel + ') |',
    '| Conversion | ' + dec.conversionScore + '/100 (' + dec.conversionLabel + ') |',
    '| Risk | ' + dec.riskLevel + ' (score: ' + dec.riskScore + ') |',
    '| Recommendation | **' + dec.recommendation + '** |',
    '| Reason | ' + dec.recommendationReason + ' |',
    '| Suggestion | ' + dec.suggestion + ' |',
    '',
    'REVIEW_ONLY=true — requiresHumanApproval=true'
  ].join('\n');
}

module.exports = { execute: execute, desc: desc };
