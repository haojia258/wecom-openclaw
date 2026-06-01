// P50.1 Asset Audit — unified asset audit logging + P48 integration
var metadataDB = require('./asset-metadata-db');
var path = require('path');

// Try loading P48 full-audit-gate for unified audit
var fullAuditGate = null;
try { fullAuditGate = require(path.join(__dirname, '..', 'governance', 'full-audit-gate')); } catch (e) {}

function logImport(assetId, userId, details) {
  var entry = { asset_id: assetId, action: 'import', user_id: userId, details: details || '', risk_level: 'INFO' };
  metadataDB.insertAuditLog(entry);
  if (fullAuditGate) fullAuditGate.audit({ event_type: 'asset_imported', task_id: assetId, user_id: userId, status: 'success', metadata: entry });
  return entry;
}

function logDelete(assetId, userId, reason) {
  var entry = { asset_id: assetId, action: 'delete', user_id: userId, details: reason || '', risk_level: 'WARN' };
  metadataDB.insertAuditLog(entry);
  if (fullAuditGate) fullAuditGate.audit({ event_type: 'asset_deleted', task_id: assetId, user_id: userId, status: 'success', risk_level: 'WARN', metadata: entry });
  return entry;
}

function logProcess(assetId, userId, action) {
  var entry = { asset_id: assetId, action: action, user_id: userId, details: '', risk_level: 'INFO' };
  metadataDB.insertAuditLog(entry);
  return entry;
}

function logExport(assetId, userId, format) {
  var entry = { asset_id: assetId || 'batch', action: 'export', user_id: userId, details: 'format: ' + (format || 'json'), risk_level: 'INFO' };
  metadataDB.insertAuditLog(entry);
  return entry;
}

function getLogs(assetId) {
  return metadataDB.getAuditLogs(assetId);
}

module.exports = { logImport: logImport, logDelete: logDelete, logProcess: logProcess, logExport: logExport, getLogs: getLogs };
