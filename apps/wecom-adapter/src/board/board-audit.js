var path = require('path'); var gate = null; try { gate = require(path.join(__dirname, '..', 'governance', 'full-audit-gate')); } catch (e) {}
module.exports = { logBoardView: function (d) { var r = { event_type: 'board_viewed', user_id: d && d.userId || 'system' }; if (gate) gate.audit(r); return r; } };
