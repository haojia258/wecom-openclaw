// P54 Loop Scheduler — DAG daily cycle
var SCHEDULE = [
  { time: '00:00', phase: 'Collect', action: 'data_aggregate', description: '数据聚合: P50+P51+P52+P53' },
  { time: '06:00', phase: 'Schedule', action: 'today_plan', description: '生成今日运营计划' },
  { time: '09:00', phase: 'Execute', action: 'risk_check', description: '风险检查 + 告警' },
  { time: '10:00', phase: 'Execute', action: 'approval_gen', description: '生成审批任务' },
  { time: '22:00', phase: 'Review', action: 'daily_review', description: '晚间复盘报告' },
  { time: '23:00', phase: 'Review', action: 'tomorrow_plan', description: '生成明日优化方案' }
];
function getSchedule() { return SCHEDULE; }
function getCurrentPhase() {
  var h = new Date().getHours();
  if (h < 6) return 'Collect';
  if (h < 9) return 'Schedule';
  if (h < 22) return 'Execute';
  return 'Review';
}
module.exports = { getSchedule: getSchedule, getCurrentPhase: getCurrentPhase };
