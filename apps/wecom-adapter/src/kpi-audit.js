var path = require('path'); var gate = null; try { gate = require(path.join(__dirname, '..', 'governance', 'full-audit-gate')); } catch (e) {}
function log(e, d) { var r = { event_type: e, user_id: d && d.userId || 'system', status: 'info', risk_level: 'INFO', metadata: d || {} }; if (gate) gate.audit(r); return r; }
module.exports = { logSnapshot: function (d) { return log('kpi_snapshot', d); }, logAnomaly: function (d) { return log('kpi_anomaly', d); } };
