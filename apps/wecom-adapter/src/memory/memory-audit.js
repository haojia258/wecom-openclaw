var path = require('path'); var gate = null; try { gate = require(path.join(__dirname, '..', 'governance', 'full-audit-gate')); } catch (e) {}
module.exports = { logStore: function (d) { var r = { event_type: 'memory_stored', metadata: d }; if (gate) gate.audit(r); return r; } };
