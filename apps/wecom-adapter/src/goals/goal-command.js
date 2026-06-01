var reg = require('./goal-registry'); var planner = require('./goal-planner');
function handle(cmd) { var n = (cmd || '').toLowerCase().replace(/^\//, '').trim(); if (n.indexOf('目标') >= 0 && n.indexOf('列表') >= 0) return reg.getAll(); if (n.indexOf('目标') >= 0) return planner.decompose(reg.getAll()[0] || {}); return { error: 'Try: /目标 列表' }; }
module.exports = { handle: handle };
