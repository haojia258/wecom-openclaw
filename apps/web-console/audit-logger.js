// P46 Audit Logger
// Logs: login_success, login_failed, locked, logout
var fs = require('fs');
var path = require('path');

var AUDIT_DIR = path.join(__dirname, 'logs', 'audit', 'web-auth');

function getLogFile() {
  var now = new Date();
  var dateStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
  return path.join(AUDIT_DIR, 'auth-' + dateStr + '.log');
}

function logEvent(eventType, data) {
  var entry = {
    timestamp: new Date().toISOString(),
    event: eventType,
    userId: data.userId || 'unknown',
    ip: data.ip || '127.0.0.1',
    sessionToken: data.sessionToken ? data.sessionToken.substring(0, 16) + '...' : null,
    details: data.details || '',
    result: data.result || ''
  };

  var logFile = getLogFile();
  var line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(logFile, line, 'utf8');
  return entry;
}

// Convenience functions
function logLoginSuccess(userId, ip, sessionToken) {
  return logEvent('login_success', { userId: userId, ip: ip, sessionToken: sessionToken, result: 'success' });
}

function logLoginFailed(userId, ip, reason, attempts) {
  return logEvent('login_failed', { userId: userId, ip: ip, details: 'Reason: ' + reason + ', Attempts: ' + attempts, result: 'failed' });
}

function logLocked(userId, ip, until) {
  return logEvent('locked', { userId: userId, ip: ip, details: 'Locked until: ' + new Date(until).toISOString(), result: 'locked' });
}

function logLogout(userId, ip, sessionToken) {
  return logEvent('logout', { userId: userId, ip: ip, sessionToken: sessionToken, result: 'success' });
}

module.exports = { logEvent: logEvent, logLoginSuccess: logLoginSuccess, logLoginFailed: logLoginFailed, logLocked: logLocked, logLogout: logLogout };
