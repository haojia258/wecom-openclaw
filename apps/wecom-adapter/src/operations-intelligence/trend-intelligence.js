'use strict';

/**
 * Trend Intelligence Module
 * Analyzes system metrics trends (restarts, memory, response time)
 */

function analyzeTrends(metricsData, options) {
  options = options || {};
  var windowSize = options.windowSize || 10;

  // Handle empty input
  if (!metricsData || !Array.isArray(metricsData) || metricsData.length === 0) {
    return _emptyResult();
  }

  // Filter valid data points
  var validData = metricsData.filter(function(point) {
    return point &&
           point.timestamp &&
           typeof point.restarts === 'number' &&
           typeof point.memory === 'number' &&
           typeof point.responseTime === 'number';
  });

  if (validData.length === 0) {
    return _emptyResult();
  }

  // Calculate trends
  var restartTrend = _calculateTrend(validData.map(function(d) { return d.restarts; }));
  var memoryTrend = _calculateTrend(validData.map(function(d) { return d.memory; }));
  var responseTimeTrend = _calculateTrend(validData.map(function(d) { return d.responseTime; }));

  // Detect anomalies
  var anomalies = _detectAnomalies(validData);

  // Generate predictions
  var predictions = _generatePredictions(validData);

  return {
    restartTrend: restartTrend,
    memoryTrend: memoryTrend,
    responseTimeTrend: responseTimeTrend,
    predictions: predictions,
    anomalies: anomalies
  };
}

function _calculateTrend(values) {
  if (values.length < 2) {
    return 'stable';
  }

  // Simple linear regression
  var n = values.length;
  var sumX = 0;
  var sumY = 0;
  var sumXY = 0;
  var sumX2 = 0;

  for (var i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // Normalize slope by average value to get relative trend
  var avg = sumY / n;
  var normalizedSlope = avg !== 0 ? slope / avg : slope;

  // Threshold for trend detection
  if (normalizedSlope > 0.05) {
    return 'increasing';
  } else if (normalizedSlope < -0.05) {
    return 'decreasing';
  } else {
    return 'stable';
  }
}

function _detectAnomalies(data) {
  var anomalies = [];

  if (data.length < 3) {
    return anomalies;
  }

  // Check restarts, memory, responseTime for anomalies
  var metrics = ['restarts', 'memory', 'responseTime'];

  metrics.forEach(function(metric) {
    var values = data
      .map(function(d) { return d[metric]; })
      .filter(function(v) { return typeof v === 'number'; });

    if (values.length < 3) return;

    // Calculate mean and standard deviation
    var mean = values.reduce(function(sum, v) { return sum + v; }, 0) / values.length;
    var variance = values.reduce(function(sum, v) { return sum + Math.pow(v - mean, 2); }, 0) / values.length;
    var stdDev = Math.sqrt(variance);

    // Detect anomalies (3-sigma rule)
    values.forEach(function(value, index) {
      var deviation = Math.abs(value - mean) / (stdDev || 1);

      if (deviation > 3) {
        anomalies.push({
          metric: metric,
          timestamp: data[index].timestamp || 'unknown',
          value: value,
          deviation: deviation
        });
      }
    });
  });

  return anomalies;
}

function _generatePredictions(data) {
  if (data.length < 2) {
    return {
      nextRestartExpected: null,
      memoryWillExceedThreshold: false,
      recommendedActions: []
    };
  }

  // Predict next restart based on restart trend
  var restartData = data.filter(function(d) { return d.restarts > 0; });
  var nextRestartExpected = null;

  if (restartData.length >= 2) {
    // Simple prediction: average time between restarts
    var timestamps = restartData.map(function(d) { return new Date(d.timestamp).getTime(); });
    timestamps.sort(function(a, b) { return a - b; });

    var intervals = [];
    for (var i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    var avgInterval = intervals.reduce(function(sum, v) { return sum + v; }, 0) / intervals.length;
    var lastRestart = timestamps[timestamps.length - 1];
    nextRestartExpected = new Date(lastRestart + avgInterval).toISOString();
  }

  // Check if memory will exceed threshold
  var memoryValues = data.map(function(d) { return d.memory; });
  var latestMemory = memoryValues[memoryValues.length - 1];
  var memoryTrend = _calculateTrend(memoryValues);
  var memoryWillExceedThreshold = false;

  if (memoryTrend === 'increasing' && latestMemory > 500) {
    memoryWillExceedThreshold = true;
  }

  // Generate recommended actions
  var recommendedActions = [];

  if (memoryWillExceedThreshold) {
    recommendedActions.push('Consider restarting process to free memory');
  }

  if (data[data.length - 1].restarts > 5) {
    recommendedActions.push('Investigate frequent restarts');
  }

  if (data[data.length - 1].responseTime > 1000) {
    recommendedActions.push('Optimize response time');
  }

  return {
    nextRestartExpected: nextRestartExpected,
    memoryWillExceedThreshold: memoryWillExceedThreshold,
    recommendedActions: recommendedActions
  };
}

function _emptyResult() {
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

// For testing
function _reset() {
  // No internal state to reset
}

module.exports = {
  analyzeTrends: analyzeTrends,
  _reset: _reset
};
