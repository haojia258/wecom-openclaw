'use strict';

// P15.1 Marketing Decision Engine
const storage = require('./storage');

var _decisions = {};
var _loaded = false;

var RECOMMENDATIONS = ['strong_recommend', 'recommend', 'watch', 'pause'];
var RISK_LEVELS = ['low', 'medium', 'high'];

function init() {
  _decisions = storage.loadAll();
  _loaded = true;
  return { count: Object.keys(_decisions).length };
}

/**
 * Full campaign analysis
 */
function analyzeCampaign(data) {
  if (!data || !data.campaignId) throw new Error('campaignId is required');

  var roi = analyzeROI(data);
  var ctr = analyzeCTR(data);
  var conv = analyzeConversion(data);
  var risk = calculateRiskLevel(data, roi, ctr, conv);
  var rec = generateRecommendation(roi, ctr, conv, risk);

  var decisionId = 'md-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
  var decision = {
    decisionId: decisionId,
    campaignId: data.campaignId,
    roiScore: roi.score,
    roiLabel: roi.label,
    roiDetail: roi.detail,
    ctrScore: ctr.score,
    ctrLabel: ctr.label,
    conversionScore: conv.score,
    conversionLabel: conv.label,
    riskLevel: risk.level,
    riskScore: risk.score,
    riskFactors: risk.factors,
    recommendation: rec.level,
    recommendationReason: rec.reason,
    suggestion: rec.suggestion,
    reviewRequired: true,
    reviewOnly: true,
    requiresHumanApproval: true,
    createdAt: new Date().toISOString()
  };

  _decisions[decisionId] = decision;
  storage.saveDecision(decision);
  return decision;
}

/**
 * ROI Analysis: revenue vs spend
 */
function analyzeROI(data) {
  var spend = data.spend || 0;
  var revenue = data.revenue || 0;
  var roas = spend > 0 ? revenue / spend : 0;
  var roi = spend > 0 ? ((revenue - spend) / spend) * 100 : 0;

  var score, label, detail;

  if (roi >= 200)      { score = 95; label = 'excellent'; detail = 'ROI >= 200%, outstanding'; }
  else if (roi >= 100) { score = 80; label = 'good';      detail = 'ROI >= 100%, profitable'; }
  else if (roi >= 50)  { score = 60; label = 'moderate';  detail = 'ROI >= 50%, moderate'; }
  else if (roi >= 0)   { score = 35; label = 'breakeven'; detail = 'ROI near breakeven'; }
  else                { score = 10; label = 'loss';       detail = 'ROI negative, losing money'; }

  return {
    score: score,
    label: label,
    detail: detail,
    roas: Math.round(roas * 100) / 100,
    roiPct: Math.round(roi * 100) / 100,
    spend: spend,
    revenue: revenue
  };
}

/**
 * CTR Analysis: clicks / impressions
 */
function analyzeCTR(data) {
  var impressions = data.impressions || 0;
  var clicks = data.clicks || 0;
  var ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

  var score, label;
  if (ctr >= 5)       { score = 95; label = 'excellent'; }
  else if (ctr >= 2)  { score = 75; label = 'good'; }
  else if (ctr >= 1)  { score = 55; label = 'average'; }
  else if (ctr >= 0.5){ score = 35; label = 'below_avg'; }
  else               { score = 15; label = 'poor'; }

  return {
    score: score,
    label: label,
    ctrPct: Math.round(ctr * 100) / 100,
    impressions: impressions,
    clicks: clicks
  };
}

/**
 * Conversion Analysis: conversions / clicks
 */
function analyzeConversion(data) {
  var clicks = data.clicks || 0;
  var conversions = data.conversions || 0;
  var rate = clicks > 0 ? (conversions / clicks) * 100 : 0;
  var cpa = conversions > 0 ? (data.spend || 0) / conversions : 0;

  var score, label;
  if (rate >= 10)     { score = 95; label = 'excellent'; }
  else if (rate >= 5) { score = 75; label = 'good'; }
  else if (rate >= 2) { score = 55; label = 'average'; }
  else if (rate >= 1) { score = 35; label = 'below_avg'; }
  else               { score = 15; label = 'poor'; }

  return {
    score: score,
    label: label,
    ratePct: Math.round(rate * 100) / 100,
    cpa: Math.round(cpa * 100) / 100,
    conversions: conversions
  };
}

/**
 * Risk Level Assessment
 */
function calculateRiskLevel(data, roi, ctr, conv) {
  var factors = [];
  var riskScore = 0;

  // ROI risk
  if (roi && roi.score < 40) { factors.push('ROI too low (' + roi.roiPct + '%)'); riskScore += 30; }
  // CTR risk
  if (ctr && ctr.score < 40) { factors.push('CTR below threshold (' + ctr.ctrPct + '%)'); riskScore += 20; }
  // Conversion risk
  if (conv && conv.score < 40) { factors.push('Low conversion rate (' + conv.ratePct + '%)'); riskScore += 20; }
  // Budget risk
  if (data.spend > 100000) { factors.push('High spend (' + data.spend + ')'); riskScore += 15; }
  // No data risk
  if (!data.impressions || data.impressions === 0) { factors.push('No impression data'); riskScore += 10; }

  var level;
  if (riskScore >= 60) level = 'high';
  else if (riskScore >= 30) level = 'medium';
  else level = 'low';

  if (factors.length === 0) factors.push('No significant risk factors');

  return { level: level, score: Math.min(riskScore, 100), factors: factors };
}

/**
 * Generate marketing recommendation
 */
function generateRecommendation(roi, ctr, conv, risk) {
  var roiOk = roi && roi.score >= 60;
  var ctrOk = ctr && ctr.score >= 60;
  var convOk = conv && conv.score >= 60;
  var riskLow = risk && risk.level === 'low';

  if (roiOk && ctrOk && convOk && riskLow) {
    return { level: 'strong_recommend', reason: 'All metrics excellent', suggestion: '建议扩大投放预算' };
  }
  if (roiOk && ctrOk) {
    return { level: 'recommend', reason: 'Key metrics positive', suggestion: '建议保持预算并优化转化' };
  }
  if (!roiOk && !ctrOk && !convOk) {
    return { level: 'pause', reason: 'All metrics below threshold', suggestion: '建议暂停投放，优化素材和定向' };
  }
  if (risk && risk.level === 'high') {
    return { level: 'pause', reason: 'High risk level', suggestion: '建议暂停投放，排查风险因素' };
  }

  return { level: 'watch', reason: 'Mixed performance', suggestion: '建议观察并优化个别指标' };
}

function getDecision(decisionId) {
  if (!_loaded) init();
  return _decisions[decisionId] || null;
}

function listDecisions() {
  if (!_loaded) init();
  return Object.values(_decisions);
}

function stats() {
  if (!_loaded) init();
  var all = Object.values(_decisions);
  var byRisk = {}, byRec = {};
  all.forEach(function (d) {
    byRisk[d.riskLevel] = (byRisk[d.riskLevel] || 0) + 1;
    byRec[d.recommendation] = (byRec[d.recommendation] || 0) + 1;
  });
  return { total: all.length, byRisk: byRisk, byRecommendation: byRec };
}

function _reset() {
  _decisions = {};
  _loaded = false;
  storage.clearAll();
}

module.exports = {
  init: init,
  analyzeCampaign: analyzeCampaign,
  analyzeROI: analyzeROI,
  analyzeCTR: analyzeCTR,
  analyzeConversion: analyzeConversion,
  calculateRiskLevel: calculateRiskLevel,
  generateRecommendation: generateRecommendation,
  getDecision: getDecision,
  listDecisions: listDecisions,
  stats: stats,
  _reset: _reset,
  RECOMMENDATIONS: RECOMMENDATIONS,
  RISK_LEVELS: RISK_LEVELS
};
