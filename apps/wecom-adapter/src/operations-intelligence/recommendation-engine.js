'use strict';

/**
 * Recommendation Engine Module
 * Generates operational recommendations based on incident and trend analysis
 */

var MAX_RECOMMENDATIONS = 10;

function generateRecommendations(incidentSummary, trendSummary, options) {
  options = options || {};
  var maxRecommendations = options.maxRecommendations || MAX_RECOMMENDATIONS;

  // Handle empty input
  if (!incidentSummary && !trendSummary) {
    return {
      recommendations: [],
      summary: {
        criticalCount: 0,
        warningCount: 0,
        infoCount: 0
      }
    };
  }

  var recommendations = [];

  // Rule 1: High incident count
  if (incidentSummary && incidentSummary.incidentCount > 10) {
    recommendations.push({
      severity: 'critical',
      category: 'stability',
      reason: 'Incident count (' + incidentSummary.incidentCount + ') exceeds threshold (10)',
      suggestion: 'Investigate root cause of frequent incidents'
    });
  }

  // Rule 2: Critical incidents present
  if (incidentSummary && incidentSummary.incidentsBySeverity) {
    var criticalCount = incidentSummary.incidentsBySeverity['critical'] || 0;
    if (criticalCount > 0) {
      recommendations.push({
        severity: 'critical',
        category: 'stability',
        reason: 'Found ' + criticalCount + ' critical incident(s)',
        suggestion: 'Immediate attention required for critical incidents'
      });
    }
  }

  // Rule 3: Increasing incident trend
  if (incidentSummary && incidentSummary.trend === 'increasing') {
    recommendations.push({
      severity: 'warning',
      category: 'stability',
      reason: 'Incident trend is increasing',
      suggestion: 'Review recent changes and consider rollback'
    });
  }

  // Rule 4: Increasing restart trend
  if (trendSummary && trendSummary.restartTrend === 'increasing') {
    recommendations.push({
      severity: 'warning',
      category: 'stability',
      reason: 'Restart trend is increasing',
      suggestion: 'Check for memory leaks or unhandled exceptions'
    });
  }

  // Rule 5: Increasing memory trend
  if (trendSummary && trendSummary.memoryTrend === 'increasing') {
    recommendations.push({
      severity: 'warning',
      category: 'performance',
      reason: 'Memory usage trend is increasing',
      suggestion: 'Profile memory usage and check for leaks'
    });
  }

  // Rule 6: Increasing response time trend
  if (trendSummary && trendSummary.responseTimeTrend === 'increasing') {
    recommendations.push({
      severity: 'warning',
      category: 'performance',
      reason: 'Response time trend is increasing',
      suggestion: 'Optimize slow queries or add caching'
    });
  }

  // Rule 7: Memory will exceed threshold
  if (trendSummary && trendSummary.predictions && trendSummary.predictions.memoryWillExceedThreshold) {
    recommendations.push({
      severity: 'critical',
      category: 'performance',
      reason: 'Predicted memory threshold exceeded',
      suggestion: trendSummary.predictions.recommendedActions.join('; ')
    });
  }

  // Rule 8: Anomalies detected
  if (trendSummary && trendSummary.anomalies && trendSummary.anomalies.length > 0) {
    recommendations.push({
      severity: 'warning',
      category: 'stability',
      reason: 'Detected ' + trendSummary.anomalies.length + ' anomaly(ies) in metrics',
      suggestion: 'Review anomaly details and investigate root cause'
    });
  }

  // Rule 9: Low mean time between incidents
  if (incidentSummary && incidentSummary.meanTimeBetweenIncidents > 0 && incidentSummary.meanTimeBetweenIncidents < 3600000) {
    recommendations.push({
      severity: 'warning',
      category: 'stability',
      reason: 'Mean time between incidents is less than 1 hour',
      suggestion: 'Consider implementing circuit breaker pattern'
    });
  }

  // Rule 10: No incidents (positive)
  if (incidentSummary && incidentSummary.incidentCount === 0) {
    recommendations.push({
      severity: 'info',
      category: 'maintenance',
      reason: 'No incidents detected in current window',
      suggestion: 'System is stable, continue monitoring'
    });
  }

  // Deduplicate by reason
  var seen = {};
  recommendations = recommendations.filter(function(rec) {
    if (seen[rec.reason]) {
      return false;
    }
    seen[rec.reason] = true;
    return true;
  });

  // Sort by severity: critical > warning > info
  var severityOrder = { 'critical': 0, 'warning': 1, 'info': 2 };
  recommendations.sort(function(a, b) {
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  // Limit to maxRecommendations
  recommendations = recommendations.slice(0, maxRecommendations);

  // Summary
  var criticalCount = 0;
  var warningCount = 0;
  var infoCount = 0;

  recommendations.forEach(function(rec) {
    if (rec.severity === 'critical') criticalCount++;
    else if (rec.severity === 'warning') warningCount++;
    else if (rec.severity === 'info') infoCount++;
  });

  return {
    recommendations: recommendations,
    summary: {
      criticalCount: criticalCount,
      warningCount: warningCount,
      infoCount: infoCount
    }
  };
}

// For testing
function _reset() {
  // No internal state to reset
}

module.exports = {
  generateRecommendations: generateRecommendations,
  _reset: _reset
};
