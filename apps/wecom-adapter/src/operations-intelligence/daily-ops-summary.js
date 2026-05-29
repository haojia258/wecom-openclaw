'use strict';

/**
 * Daily Ops Summary Module
 * Generates daily operations summary report in Markdown format
 */

function generateDailySummary(incidentSummary, trendSummary, recommendations, options) {
  options = options || {};
  var date = options.date || new Date().toISOString().split('T')[0];
  var format = options.format || 'markdown';

  // Handle empty input
  var hasIncidents = incidentSummary && incidentSummary.incidentCount > 0;
  var hasTrends = trendSummary && (trendSummary.restartTrend || trendSummary.memoryTrend);
  var hasRecommendations = recommendations && recommendations.recommendations && recommendations.recommendations.length > 0;

  var markdown = '# 运维日报 (' + date + ')\n\n';

  // Stability Summary
  markdown += '## 稳定性概览\n\n';
  if (hasIncidents) {
    markdown += '- 异常总数: ' + incidentSummary.incidentCount + '\n';
    markdown += '- 严重异常: ' + (incidentSummary.incidentsBySeverity['critical'] || 0) + '\n';
    markdown += '- 异常趋势: ' + (incidentSummary.trend || 'stable') + '\n';
  } else {
    markdown += '- 无异常\n';
  }
  markdown += '\n';

  // Incident Summary
  markdown += '## 异常概览\n\n';
  if (hasIncidents) {
    markdown += '### 按类型统计\n\n';
    if (incidentSummary.incidentsByType) {
      Object.keys(incidentSummary.incidentsByType).forEach(function(type) {
        markdown += '- ' + type + ': ' + incidentSummary.incidentsByType[type] + '\n';
      });
    }
    markdown += '\n### Top 异常\n\n';
    if (incidentSummary.topIncidents && incidentSummary.topIncidents.length > 0) {
      incidentSummary.topIncidents.forEach(function(inc) {
        markdown += '- ' + inc.type + ' (' + inc.count + ' 次, 最近: ' + inc.lastOccurrence + ')\n';
      });
    }
  } else {
    markdown += '暂无异常\n';
  }
  markdown += '\n';

  // Trend Summary
  markdown += '## 趋势概览\n\n';
  if (hasTrends) {
    markdown += '- 重启趋势: ' + (trendSummary.restartTrend || 'stable') + '\n';
    markdown += '- 内存趋势: ' + (trendSummary.memoryTrend || 'stable') + '\n';
    markdown += '- 响应时间趋势: ' + (trendSummary.responseTimeTrend || 'stable') + '\n';

    if (trendSummary.anomalies && trendSummary.anomalies.length > 0) {
      markdown += '\n### 异常检测\n\n';
      trendSummary.anomalies.forEach(function(anomaly) {
        markdown += '- ' + anomaly.metric + ': ' + anomaly.value + ' (偏差: ' + anomaly.deviation.toFixed(2) + ')\n';
      });
    }
  } else {
    markdown += '暂无趋势数据\n';
  }
  markdown += '\n';

  // Recommendations
  markdown += '## 建议列表\n\n';
  if (hasRecommendations) {
    recommendations.recommendations.forEach(function(rec, index) {
      markdown += (index + 1) + '. **[' + rec.severity.toUpperCase() + ']** ' + rec.category + '\n';
      markdown += '   - 原因: ' + rec.reason + '\n';
      markdown += '   - 建议: ' + rec.suggestion + '\n\n';
    });

    markdown += '### 建议统计\n\n';
    markdown += '- Critical: ' + (recommendations.summary.criticalCount || 0) + '\n';
    markdown += '- Warning: ' + (recommendations.summary.warningCount || 0) + '\n';
    markdown += '- Info: ' + (recommendations.summary.infoCount || 0) + '\n';
  } else {
    markdown += '暂无建议\n';
  }
  markdown += '\n';

  // Risk Notes
  markdown += '## 风险提示\n\n';
  var riskCount = 0;

  if (hasIncidents && incidentSummary.incidentsBySeverity && incidentSummary.incidentsBySeverity['critical'] > 0) {
    markdown += '- ⚠️ 存在严重异常，需立即处理\n';
    riskCount++;
  }

  if (hasTrends && trendSummary.predictions && trendSummary.predictions.memoryWillExceedThreshold) {
    markdown += '- ⚠️ 预测内存将超阈值，建议优化\n';
    riskCount++;
  }

  if (hasTrends && trendSummary.restartTrend === 'increasing') {
    markdown += '- ⚠️ 重启频率增加，可能存在稳定性问题\n';
    riskCount++;
  }

  if (riskCount === 0) {
    markdown += '暂无风险\n';
  }

  // Stats
  var stats = {
    totalIncidents: hasIncidents ? incidentSummary.incidentCount : 0,
    resolvedIncidents: 0, // Would need additional data
    avgResolutionTime: 0,   // Would need additional data
    topIssue: (hasIncidents && incidentSummary.topIncidents && incidentSummary.topIncidents.length > 0)
              ? incidentSummary.topIncidents[0].type
              : 'none'
  };

  return {
    markdown: markdown,
    stats: stats
  };
}

// For testing
function _reset() {
  // No internal state to reset
}

module.exports = {
  generateDailySummary: generateDailySummary,
  _reset: _reset
};
