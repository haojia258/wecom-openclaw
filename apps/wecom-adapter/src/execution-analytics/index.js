/** index.js — P9.7.5 Execution Analytics barrel export */
'use strict';var types=require('./execution-analytics-types'),valid=require('./execution-analytics-validator'),metrics=require('./execution-metrics-aggregator'),feedback=require('./execution-feedback-engine'),runtime=require('./execution-analytics-runtime'),audit=require('./execution-analytics-audit');
module.exports={
  ANALYTICS_STATUS:types.ANALYTICS_STATUS,TREND:types.TREND,ERROR_CODES:types.ERROR_CODES,createAnalyticsReport:types.createAnalyticsReport,
  validateAnalyticsReport:valid.validateAnalyticsReport,validateScore:valid.validateScore,
  aggregateExecutionMetrics:metrics.aggregateExecutionMetrics,aggregateInvocationMetrics:metrics.aggregateInvocationMetrics,aggregateOrchestrationMetrics:metrics.aggregateOrchestrationMetrics,aggregateRiskMetrics:metrics.aggregateRiskMetrics,aggregateTrendMetrics:metrics.aggregateTrendMetrics,
  generateRecommendations:feedback.generateRecommendations,generateWarnings:feedback.generateWarnings,generateRiskFeedback:feedback.generateRiskFeedback,generateHealthFeedback:feedback.generateHealthFeedback,
  createAnalyticsReport:runtime.createAnalyticsReport,calculateExecutionHealthScore:runtime.calculateExecutionHealthScore,calculateRiskScore:runtime.calculateRiskScore,generateExecutionFeedback:runtime.generateExecutionFeedback,generateAnalyticsSnapshot:runtime.generateAnalyticsSnapshot,archiveAnalyticsReport:runtime.archiveAnalyticsReport,listAnalyticsReports:runtime.listAnalyticsReports,getAnalyticsReport:runtime.getAnalyticsReport,
  recordAnalyticsEvent:audit.recordAnalyticsEvent,listAnalyticsEvents:audit.listAnalyticsEvents,generateAnalyticsAuditSnapshot:audit.generateAnalyticsAuditSnapshot
};
