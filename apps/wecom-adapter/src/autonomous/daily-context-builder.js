// P54 Daily Context Builder
var aggregator = require('./data-aggregator');
function build() { return { date: new Date().toISOString().split('T')[0], data: aggregator.aggregate(), phase: require('./loop-scheduler').getCurrentPhase(), reviewOnly: true }; }
module.exports = { build: build };
