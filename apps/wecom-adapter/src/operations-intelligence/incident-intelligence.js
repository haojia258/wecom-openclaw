'use strict';

var fs = require('fs');
var path = require('path');

/**
 * Incident Intelligence Module
 * Analyzes incident patterns from mission-audit.jsonl
 */

function analyzeIncidents(auditLogPath, options) {
  options = options || {};

  // Default options
  var timeWindow = options.timeWindow || '24h';
  var severityFilter = options.severityFilter || null;

  // Parse time window to milliseconds
  var timeWindowMs = _parseTimeWindow(timeWindow);
  var now = new Date();
  var windowStart = new Date(now.getTime() - timeWindowMs);

  // Read and parse audit log
  var lines = [];
  try {
    if (!fs.existsSync(auditLogPath)) {
      return _emptyResult();
    }

    var content = fs.readFileSync(auditLogPath, 'utf8');
    lines = content.trim().split('\n').filter(function(line) {
      return line.trim().length > 0;
    });
  } catch (e) {
    return _emptyResult();
  }

  // Parse lines (skip malformed)
  var incidents = [];
  lines.forEach(function(line) {
    try {
      var entry = JSON.parse(line);
      // Filter by time window
      if (entry.timestamp) {
        var entryTime = new Date(entry.timestamp);
        if (entryTime < windowStart) {
          return;
        }
      }

      // Filter by severity
      if (severityFilter && entry.severity && severityFilter.indexOf(entry.severity) === -1) {
        return;
      }

      incidents.push(entry);
    } catch (e) {
      // Skip malformed lines
      return;
    }
  });

  if (incidents.length === 0) {
    return _emptyResult();
  }

  // Compute statistics
  var incidentsByType = {};
  var incidentsBySeverity = {};

  incidents.forEach(function(incident) {
    var type = incident.type || 'unknown';
    var severity = incident.severity || 'info';

    incidentsByType[type] = (incidentsByType[type] || 0) + 1;
    incidentsBySeverity[severity] = (incidentsBySeverity[severity] || 0) + 1;
  });

  // Top incidents
  var topIncidents = Object.keys(incidentsByType).map(function(type) {
    var lastOccurrence = 'unknown';
    for (var i = incidents.length - 1; i >= 0; i--) {
      if (incidents[i].type === type && incidents[i].timestamp) {
        lastOccurrence = incidents[i].timestamp;
        break;
      }
    }

    return {
      type: type,
      count: incidentsByType[type],
      lastOccurrence: lastOccurrence
    };
  }).sort(function(a, b) {
    return b.count - a.count;
  }).slice(0, 10);

  // Mean time between incidents
  var timestamps = incidents
    .map(function(inc) { return inc.timestamp ? new Date(inc.timestamp).getTime() : null; })
    .filter(function(t) { return t !== null; })
    .sort(function(a, b) { return a - b; });

  var meanTimeBetweenIncidents = 0;
  if (timestamps.length >= 2) {
    var totalTime = timestamps[timestamps.length - 1] - timestamps[0];
    var intervals = timestamps.length - 1;
    meanTimeBetweenIncidents = totalTime / intervals;
  }

  // Trend calculation
  var trend = _calculateTrend(incidents, windowStart, now);

  return {
    incidentCount: incidents.length,
    incidentsByType: incidentsByType,
    incidentsBySeverity: incidentsBySeverity,
    topIncidents: topIncidents,
    meanTimeBetweenIncidents: meanTimeBetweenIncidents,
    trend: trend
  };
}

function _parseTimeWindow(timeWindow) {
  var match = timeWindow.match(/^(\d+)([hdm])$/);
  if (!match) {
    return 24 * 60 * 60 * 1000; // Default: 24h
  }

  var value = parseInt(match[1], 10);
  var unit = match[2];

  switch (unit) {
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'm': return value * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

function _calculateTrend(incidents, windowStart, now) {
  if (incidents.length < 2) {
    return 'stable';
  }

  // Split time window in half
  var midPoint = new Date((windowStart.getTime() + now.getTime()) / 2);
  var firstHalf = 0;
  var secondHalf = 0;

  incidents.forEach(function(inc) {
    if (!inc.timestamp) return;
    var t = new Date(inc.timestamp);
    if (t < midPoint) {
      firstHalf++;
    } else {
      secondHalf++;
    }
  });

  var threshold = incidents.length * 0.2; // 20% change threshold

  if (secondHalf > firstHalf + threshold) {
    return 'increasing';
  } else if (firstHalf > secondHalf + threshold) {
    return 'decreasing';
  } else {
    return 'stable';
  }
}

function _emptyResult() {
  return {
    incidentCount: 0,
    incidentsByType: {},
    incidentsBySeverity: {},
    topIncidents: [],
    meanTimeBetweenIncidents: 0,
    trend: 'stable'
  };
}

// For testing
function _reset() {
  // No internal state to reset
}

module.exports = {
  analyzeIncidents: analyzeIncidents,
  _reset: _reset
};
