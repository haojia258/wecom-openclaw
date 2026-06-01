var agg = require('./kpi-aggregator'); var db = require('./kpi-metrics-db'); var audit = require('./kpi-audit');
module.exports = { getMetrics: agg.aggregate, getHistory: db.getHistory, audit: audit };
