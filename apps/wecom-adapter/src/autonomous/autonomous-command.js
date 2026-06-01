// P54 Autonomous Command
var scheduler = require('./loop-scheduler'); var ctx = require('./daily-context-builder'); var planner = require('./operations-planner'); var risk = require('./risk-checker'); var approval = require('./approval-task-generator'); var review = require('./review-generator'); var tomorrow = require('./tomorrow-plan');
function handle(cmd) {
  var n = (cmd || '').toLowerCase().replace(/^\//, '').replace(/\s+/g, ' ').trim();
  if (n.indexOf('自治公司 状态') >= 0 || n.indexOf('总控 自治状态') >= 0) return { phase: scheduler.getCurrentPhase(), schedule: scheduler.getSchedule(), context: ctx.build() };
  if (n.indexOf('自治公司 今日计划') >= 0) return planner.generate();
  if (n.indexOf('自治公司 风险') >= 0) return risk.check();
  if (n.indexOf('自治公司 审批') >= 0) return approval.generate();
  if (n.indexOf('自治公司 复盘') >= 0 || n.indexOf('董事会 运营复盘') >= 0) return review.generate();
  if (n.indexOf('自治公司 明日建议') >= 0) return tomorrow.generate();
  return { error: 'Unknown. Try: 自治状态 / 今日计划 / 风险 / 审批 / 复盘 / 明日建议' };
}
module.exports = { handle: handle };
