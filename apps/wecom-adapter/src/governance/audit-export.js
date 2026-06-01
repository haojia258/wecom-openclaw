// P48 Audit Export — export audit logs in JSON or CSV format
var auditSearch = require('./audit-search');

function exportJSON(options) {
  var result = auditSearch.search(options);
  return JSON.stringify(result.results, null, 2);
}

function exportCSV(options) {
  var result = auditSearch.search(options);
  if (result.results.length === 0) return '';

  var headers = [
    'event_id', 'event_type', 'timestamp', 'user_id', 'session_id',
    'node_id', 'task_id', 'resource', 'action', 'status',
    'risk_level', 'approval_id', 'artifact_id', 'source_node', 'target_node'
  ];

  var csv = headers.join(',') + '\n';
  result.results.forEach(function (entry) {
    var row = headers.map(function (h) {
      var val = entry[h] || '';
      if (typeof val === 'string' && (val.indexOf(',') !== -1 || val.indexOf('"') !== -1)) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    });
    csv += row.join(',') + '\n';
  });

  return csv;
}

module.exports = { exportJSON: exportJSON, exportCSV: exportCSV };
