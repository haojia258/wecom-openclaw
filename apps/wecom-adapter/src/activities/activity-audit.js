// P53 Activity Audit — P48 integration
var path = require('path');
var fullAuditGate = null;
try { fullAuditGate = require(path.join(__dirname, '..', 'governance', 'full-audit-gate')); } catch (e) {}
function log(eventType, data) {
  var e = { event_type: eventType, user_id: data.userId || 'system', task_id: data.activityId || null, status: data.status || 'info', risk_level: data.riskLevel || 'INFO', metadata: { activity: data.activity, action: data.action } };
  if (fullAuditGate) fullAuditGate.audit(e); return e;
}
module.exports = { logImport: function (d) { return log('activity_imported', d); }, logProfit: function (d) { return log('activity_profit_calculated', d); }, logEnrollPlan: function (d) { return log('activity_enrollment_planned', d); }, logReview: function (d) { return log('activity_reviewed', d); } };
