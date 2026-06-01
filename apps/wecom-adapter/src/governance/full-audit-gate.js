// P48 Full Audit Gate — unified audit and safety gate for OpenClaw Enterprise OS
// Covers: Web Console, System Center, Dispatch Center, Runtime Monitor,
//         Deployment Center, WeCom Login, Task Queue, Worker Runtime,
//         Node Dispatch, Approval Queue

var auditSink = require('./audit-sink');
var dangerousActionPolicy = require('./dangerous-action-policy');
var approvalEnforcer = require('./approval-enforcer');
var riskClassifier = require('./risk-classifier');
var secretRedactor = require('./secret-redactor');
var auditSearch = require('./audit-search');
var auditExport = require('./audit-export');

// ═══════ Main Gate API ═══════

// Gate any action through the unified audit pipeline
function gate(action, context, approvalStatus, approvalId) {
  // Step 1: Check if dangerous
  var intercept = dangerousActionPolicy.intercept(action, context);

  // Step 2: If dangerous, enforce approval
  if (intercept.blocked) {
    var enforcement = dangerousActionPolicy.canProceed(action, approvalStatus, approvalId);
    return {
      allowed: enforcement.allowed,
      reason: enforcement.reason,
      action: action,
      riskLevel: intercept.riskLevel,
      auditLogged: true,
      requiresApproval: true
    };
  }

  return { allowed: true, action: action, auditLogged: true };
}

// Audit an event (non-dangerous actions)
function audit(event) {
  return auditSink.sink(event);
}

// Audit a dangerous action (always blocked, forces approval)
function auditDangerous(event) {
  return auditSink.sinkDangerous(event);
}

// Audit login events
function auditLogin(event) {
  event.event_type = event.event_type || 'login_' + event.status;
  return auditSink.sink(event);
}

// Audit deployment events
function auditDeployment(event) {
  event.event_type = event.event_type || 'deployment_' + event.status;
  return auditSink.sink(event);
}

// Audit dispatch events
function auditDispatch(event) {
  event.event_type = event.event_type || 'dispatch_' + event.status;
  event.node_id = event.node_id || event.target_node;
  return auditSink.sink(event);
}

// Audit worker events
function auditWorker(event) {
  event.event_type = event.event_type || 'worker_' + event.status;
  return auditSink.sink(event);
}

// Audit approval events
function auditApproval(event) {
  event.event_type = event.event_type || 'approval_' + event.status;
  return auditSink.sink(event);
}

// Search audit logs
function search(options) {
  return auditSearch.search(options);
}

// Export audit logs
function exportLogs(format, options) {
  if (format === 'csv') return auditExport.exportCSV(options);
  return auditExport.exportJSON(options);
}

// Compliance checks
function redact(data) {
  return secretRedactor.redactObject(data);
}

module.exports = {
  gate: gate,
  audit: audit,
  auditDangerous: auditDangerous,
  auditLogin: auditLogin,
  auditDeployment: auditDeployment,
  auditDispatch: auditDispatch,
  auditWorker: auditWorker,
  auditApproval: auditApproval,
  search: search,
  exportLogs: exportLogs,
  redact: redact,
  approvalEnforcer: approvalEnforcer,
  riskClassifier: riskClassifier,
  dangerousActionPolicy: dangerousActionPolicy
};
