// P48 Audit Sink — writes audit events to jsonl files
var fs = require('fs');
var path = require('path');
var secretRedactor = require('./secret-redactor');
var riskClassifier = require('./risk-classifier');

var AUDIT_DIR = path.join(__dirname, '..', '..', 'logs', 'audit', 'full-audit-gate');

// Map event types to log files
var EVENT_TO_FILE = {
  login_success:     'login.jsonl',
  login_failed:      'login.jsonl',
  code_requested:    'login.jsonl',
  locked:            'login.jsonl',
  logout:            'login.jsonl',
  deployment_plan:   'deployment.jsonl',
  deployment_approved:'deployment.jsonl',
  deployment_dispatched:'deployment.jsonl',
  deployment_completed:'deployment.jsonl',
  deployment_failed: 'deployment.jsonl',
  dispatch_created:  'dispatch.jsonl',
  dispatch_executed: 'dispatch.jsonl',
  dispatch_failed:   'dispatch.jsonl',
  approval_created:  'approval.jsonl',
  approval_approved: 'approval.jsonl',
  approval_rejected: 'approval.jsonl',
  worker_received:   'worker.jsonl',
  worker_started:    'worker.jsonl',
  worker_completed:  'worker.jsonl',
  worker_failed:     'worker.jsonl'
};

var counter = 0;

function generateEventId() {
  counter++;
  return 'audit-' + Date.now().toString(36) + '-' + counter.toString(36);
}

function sink(event) {
  var record = {
    event_id: event.event_id || generateEventId(),
    event_type: event.event_type || 'unknown',
    timestamp: event.timestamp || new Date().toISOString(),
    user_id: event.user_id || 'system',
    session_id: event.session_id || null,
    node_id: event.node_id || null,
    task_id: event.task_id || null,
    resource: event.resource || null,
    action: event.action || null,
    status: event.status || 'info',
    risk_level: event.risk_level || riskClassifier.classifyRisk(event.event_type),
    approval_id: event.approval_id || null,
    artifact_id: event.artifact_id || null,
    source_node: event.source_node || null,
    target_node: event.target_node || null,
    metadata: secretRedactor.redactMetadata(event.metadata || {})
  };

  // Determine log file
  var fileName = EVENT_TO_FILE[event.event_type] || 'governance.jsonl';
  var filePath = path.join(AUDIT_DIR, fileName);

  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
  return record;
}

// Convenience: sink a dangerous action event
function sinkDangerous(event) {
  event.event_type = event.event_type || 'dangerous_action_blocked';
  event.risk_level = riskClassifier.getRiskLevel(event.action);
  var fileName = 'dangerous-action.jsonl';
  var filePath = path.join(AUDIT_DIR, fileName);

  var record = {
    event_id: generateEventId(),
    event_type: event.event_type,
    timestamp: new Date().toISOString(),
    user_id: event.user_id || 'system',
    session_id: event.session_id || null,
    resource: event.resource || event.action,
    action: event.action,
    status: event.status || 'blocked',
    risk_level: event.risk_level,
    approval_id: event.approval_id || null,
    node_id: event.node_id || null,
    metadata: secretRedactor.redactMetadata(event.metadata || {})
  };

  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
  return record;
}

module.exports = { sink: sink, sinkDangerous: sinkDangerous, AUDIT_DIR: AUDIT_DIR };
