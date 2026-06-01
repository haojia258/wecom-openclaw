var path = require('path'); var gate = null; try { gate = require(path.join(__dirname, '..', 'governance', 'full-audit-gate')); } catch (e) {}
module.exports = { logGoalCreated: function (d) { var r = { event_type: 'goal_created', metadata: d }; if (gate) gate.audit(r); return r; } };
