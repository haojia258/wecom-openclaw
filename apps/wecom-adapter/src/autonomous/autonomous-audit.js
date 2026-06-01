// P54 Autonomous Audit — P48 integration
var path = require('path');
var fullAuditGate = null;
try { fullAuditGate = require(path.join(__dirname, '..', 'governance', 'full-audit-gate')); } catch (e) {}
function log(eventType, data) {
  var e = { event_type: eventType, user_id: data.userId || 'system', status: data.status || 'info', risk_level: data.riskLevel || 'INFO', metadata: { phase: data.phase, details: data.details } };
  if (fullAuditGate) fullAuditGate.audit(e); return e;
}
module.exports = { logLoopStart: function (d) { return log('autonomous_loop_started', d); }, logPlanGen: function (d) { return log('autonomous_plan_generated', d); }, logRiskCheck: function (d) { return log('autonomous_risk_checked', d); }, logReview: function (d) { return log('autonomous_review_completed', d); }, logTomorrow: function (d) { return log('autonomous_tomorrow_planned', d); } };
