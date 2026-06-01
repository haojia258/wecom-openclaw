// P52 Console Audit — P48 integration
var path = require('path');
var fullAuditGate = null;
try { fullAuditGate = require(path.join(__dirname, '..', 'governance', 'full-audit-gate')); } catch (e) {}
function log(eventType, data) {
  var e = { event_type: eventType, user_id: data.userId || 'system', task_id: data.planId || null, status: data.status || 'info', risk_level: data.riskLevel || 'INFO', metadata: { action: data.action, product: data.productId, message: data.message } };
  if (fullAuditGate) fullAuditGate.audit(e); return e;
}
module.exports = { log: log, logPlanCreated: function (d) { return log('doudian_plan_created', d); }, logPlanApproved: function (d) { return log('doudian_plan_approved', d); }, logScreenshot: function (d) { return log('doudian_screenshot', d); }, logLogin: function (d) { return log('doudian_login', d); } };
