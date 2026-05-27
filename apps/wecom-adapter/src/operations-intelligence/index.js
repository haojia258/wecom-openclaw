'use strict';

/**
 * Operations Intelligence Module
 * Barrel export for all intelligence modules
 */

var IncidentIntelligence = require('./incident-intelligence');
var TrendIntelligence = require('./trend-intelligence');
var RecommendationEngine = require('./recommendation-engine');
var DailyOpsSummary = require('./daily-ops-summary');
var IntelligenceRuntime = require('./intelligence-runtime');

module.exports = {
  // Individual modules
  IncidentIntelligence: IncidentIntelligence,
  TrendIntelligence: TrendIntelligence,
  RecommendationEngine: RecommendationEngine,
  DailyOpsSummary: DailyOpsSummary,
  IntelligenceRuntime: IntelligenceRuntime,

  // Convenience methods
  analyzeIncidents: IncidentIntelligence.analyzeIncidents,
  analyzeTrends: TrendIntelligence.analyzeTrends,
  generateRecommendations: RecommendationEngine.generateRecommendations,
  generateDailySummary: DailyOpsSummary.generateDailySummary,
  generateSnapshot: IntelligenceRuntime.generateSnapshot,

  // Reset all modules (for testing)
  _resetAll: function() {
    IncidentIntelligence._reset();
    TrendIntelligence._reset();
    RecommendationEngine._reset();
    DailyOpsSummary._reset();
    IntelligenceRuntime._reset();
  }
};
