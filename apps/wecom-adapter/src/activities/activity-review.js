// P53 Activity Review
var profitEngine = require('./activity-profit-engine');
function review(activity, results) {
  return { activity: activity.name, status: activity.status, actualGMV: results && results.actualGMV ? results.actualGMV : 0, targetGMV: profitEngine.calculate(activity).estimatedGMV, roi: results && results.roi ? results.roi : 0, profit: results && results.profit ? results.profit : 0, lessons: activity.status === 'done' ? ['Review complete', 'Data saved to history'] : ['Activity still active'] };
}
module.exports = { review: review };
