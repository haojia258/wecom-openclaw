// P48 Audit Search — search audit logs by keyword, user, node, time range
var fs = require('fs');
var path = require('path');
var auditSink = require('./audit-sink');

function search(options) {
  options = options || {};
  var keyword = (options.keyword || '').toLowerCase();
  var userId = options.userId;
  var nodeId = options.nodeId;
  var startTime = options.startTime;
  var endTime = options.endTime || Date.now();
  var eventType = options.eventType;
  var limit = options.limit || 100;

  var results = [];
  var auditDir = auditSink.AUDIT_DIR;

  if (!fs.existsSync(auditDir)) return { results: [], total: 0 };

  var files = fs.readdirSync(auditDir).filter(function (f) { return f.endsWith('.jsonl'); });

  files.forEach(function (file) {
    if (results.length >= limit) return;
    try {
      var content = fs.readFileSync(path.join(auditDir, file), 'utf8');
      var lines = content.trim().split('\n');
      lines.forEach(function (line) {
        if (!line || results.length >= limit) return;
        try {
          var entry = JSON.parse(line);

          // Filters
          if (eventType && entry.event_type !== eventType) return;
          if (userId && entry.user_id !== userId) return;
          if (nodeId && entry.node_id !== nodeId) return;
          if (keyword) {
            var jsonStr = JSON.stringify(entry).toLowerCase();
            if (jsonStr.indexOf(keyword) === -1) return;
          }
          if (startTime) {
            var ts = new Date(entry.timestamp).getTime();
            if (ts < startTime) return;
          }
          var ts = new Date(entry.timestamp).getTime();
          if (ts > endTime) return;

          results.push(entry);
        } catch (e) { /* skip malformed lines */ }
      });
    } catch (e) { /* skip unreadable files */ }
  });

  // Sort by timestamp descending
  results.sort(function (a, b) {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return { results: results.slice(0, limit), total: results.length, limit: limit };
}

module.exports = { search: search };
