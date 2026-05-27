'use strict';

/**
 * Intelligence Runtime Module
 * Orchestrates all operations intelligence modules
 */

var IncidentIntelligence = require('./incident-intelligence');
var TrendIntelligence = require('./trend-intelligence');
var RecommendationEngine = require('./recommendation-engine');
var DailyOpsSummary = require('./daily-ops-summary');

var RUNTIME_VERSION = '1.0.0';

/**
 * Generate intelligence snapshot
 * @param {Object} params - Input parameters
 * @param {string} params.auditLogPath - Path to audit log file
 * @param {Array} params.metricsData - Metrics data array
 * @param {Object} options - Options for each module
 * @returns {Object} Intelligence snapshot
 */
function generateSnapshot(params, options) {
  options = options || {};

  var result = {
    incidentSummary: null,
    trendSummary: null,
    recommendations: null,
    dailySummaryMarkdown: null,
    generatedAt: new Date().toISOString(),
    runtimeVersion: RUNTIME_VERSION
  };

  try {
    // Step 1: Incident Intelligence
    if (params.auditLogPath) {
      try {
        result.incidentSummary = IncidentIntelligence.analyzeIncidents(
          params.auditLogPath,
          options.incidentOptions || {}
        );
      } catch (e) {
        // Module error shouldn't break entire snapshot
        result.incidentSummary = _emptyIncidentResult();
      }
    }

    // Step 2: Trend Intelligence
    if (params.metricsData && Array.isArray(params.metricsData)) {
      try {
        result.trendSummary = TrendIntelligence.analyzeTrends(
          params.metricsData,
          options.trendOptions || {}
        );
      } catch (e) {
        result.trendSummary = _emptyTrendResult();
      }
    }

    // Step 3: Recommendation Engine
    try {
      result.recommendations = RecommendationEngine.generateRecommendations(
        result.incidentSummary,
        result.trendSummary,
        options.recommendationOptions || {}
      );
    } catch (e) {
      result.recommendations = _emptyRecommendationResult();
    }

    // Step 4: Daily Ops Summary
    try {
      var summaryResult = DailyOpsSummary.generateDailySummary(
        result.incidentSummary,
        result.trendSummary,
        result.recommendations,
        options.summaryOptions || {}
      );
      result.dailySummaryMarkdown = summaryResult.markdown;
    } catch (e) {
      result.dailySummaryMarkdown = '# 运维日报\n\n暂无数据\n';
    }

  } catch (e) {
    // Top-level error handling - return partial result
    // Don't throw, just return what we have
  }

  return result;
}

/**
 * Validate input parameters (for testing)
 */
function validateInput(params) {
  var errors = [];

  if (params.auditLogPath && typeof params.auditLogPath !== 'string') {
    errors.push('auditLogPath must be a string');
  }

  if (params.metricsData && !Array.isArray(params.metricsData)) {
    errors.push('metricsData must be an array');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

function _emptyIncidentResult() {
  return {
    incidentCount: 0,
    incidentsByType: {},
    incidentsBySeverity: {},
    topIncidents: [],
    meanTimeBetweenIncidents: 0,
    trend: 'stable'
  };
}

function _emptyTrendResult() {
  return {
    restartTrend: 'stable',
    memoryTrend: 'stable',
    responseTimeTrend: 'stable',
    predictions: {
      nextRestartExpected: null,
      memoryWillExceedThreshold: false,
      recommendedActions: []
    },
    anomalies: []
  };
}

function _emptyRecommendationResult() {
  return {
    recommendations: [],
    summary: {
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0
    }
  };
}

// For testing
function _reset() {
  // No internal state to reset
}

module.exports = {
  generateSnapshot: generateSnapshot,
  validateInput: validateInput,
  _reset: _reset
};
