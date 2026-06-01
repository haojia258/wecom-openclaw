// P51 Compass Audit — P48 unified audit gate integration
var path = require('path');
var fullAuditGate = null;
try { fullAuditGate = require(path.join(__dirname, '..', 'governance', 'full-audit-gate')); } catch (e) {}

function logEvent(eventType, data) {
  var event = {
    event_type: eventType,
    user_id: data.userId || 'system',
    task_id: data.importId || null,
    status: data.status || 'info',
    metadata: { type: data.dataType, message: data.message, source: 'compass' }
  };
  if (fullAuditGate) fullAuditGate.audit(event);
  return event;
}

function logImportRequested(data) { return logEvent('compass_import_requested', data); }
function logValidateDone(data) { return logEvent('compass_validate_done', data); }
function logImportDone(data) { return logEvent('compass_import_done', data); }
function logImportFailed(data) { return logEvent('compass_import_failed', data); }
function logMappingUpdated(data) { return logEvent('compass_mapping_updated', data); }
function logExportHistory(data) { return logEvent('compass_export_history_viewed', data); }

module.exports = { logImportRequested: logImportRequested, logValidateDone: logValidateDone, logImportDone: logImportDone,
  logImportFailed: logImportFailed, logMappingUpdated: logMappingUpdated, logExportHistory: logExportHistory };
