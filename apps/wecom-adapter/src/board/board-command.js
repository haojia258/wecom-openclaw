var dash = require('./board-dashboard');
function handle(c) { if ((c || '').toLowerCase().indexOf('board') >= 0 || (c || '').indexOf('董事会') >= 0) return dash.render(); return { error: 'Try: /Board 状态' }; }
module.exports = { handle: handle };
