var planner = require('./brain-planner');
function handle(c) { var n = (c || '').toLowerCase().replace(/^\//, '').trim(); if (n.indexOf('brain') >= 0 || n.indexOf('大脑') >= 0 || n.indexOf('经营建议') >= 0) return planner.plan(); return { error: 'Try: /Brain 经营建议' }; }
module.exports = { handle: handle };
