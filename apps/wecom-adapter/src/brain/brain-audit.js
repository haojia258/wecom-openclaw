var path = require('path'); var gate = null; try { gate = require(path.join(__dirname, '..', 'governance', 'full-audit-gate')); } catch (e) {}
module.exports = { logBrainPlan: function (d) { var r = { event_type: 'brain_plan_generated', metadata: d }; if (gate) gate.audit(r); return r; } };
