var agg = require('./kpi-aggregator');
function handle(cmd) { var n = (cmd || '').toLowerCase().replace(/^\//, '').trim(); if (n.indexOf('kpi') >= 0 || n.indexOf('指标') >= 0) return agg.aggregate(); return { error: 'Try: /KPI 状态' }; }
module.exports = { handle: handle };
