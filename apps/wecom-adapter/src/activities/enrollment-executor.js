// P56 Enrollment Executor — orchestrates preview → confirm → execute flow
var fs = require('fs'); var path = require('path');
var gate = require('./enrollment-gate');
var adapter = require('./enrollment-adapter');
var store = require('./activity-store');
var STORE_DIR = path.join(__dirname, '..', '..', 'storage', 'activities');

function loadPlans() { try { return JSON.parse(fs.readFileSync(path.join(STORE_DIR, 'enrollment-plans.json'), 'utf8')); } catch (e) { return []; } }
function savePlans(d) { fs.writeFileSync(path.join(STORE_DIR, 'enrollment-plans.json'), JSON.stringify(d, null, 2), 'utf8'); }
function loadHistory() { try { return JSON.parse(fs.readFileSync(path.join(STORE_DIR, 'history.json'), 'utf8')); } catch (e) { return []; } }
function saveHistory(d) { fs.writeFileSync(path.join(STORE_DIR, 'history.json'), JSON.stringify(d, null, 2), 'utf8'); }
function writeAudit(ev, data) { var h = loadHistory(); h.unshift({ eventType: ev, planId: data.planId, detail: data, createdAt: new Date().toISOString() }); saveHistory(h); return h[0]; }

function preview(planId) {
  if (!planId) return { error: 'Missing planId' };
  var plans = loadPlans();
  var plan = plans.find(function (p) { return p.planId === planId; });
  if (!plan) return { error: 'Plan not found: ' + planId };
  if (plan.status !== 'approved') return { error: 'Plan must be approved. Current: ' + plan.status + '. Use /审批 活动通过 first.' };

  var activity = store.getById(plan.activityId);
  var g = gate.check(plan, activity);
  writeAudit('execution_requested', { planId: planId, action: 'preview', gates: g });

  return {
    ready: g.canExecute,
    blocked: g.autoBlocked || !g.canExecute,
    preview: true,
    planId: planId,
    plan: plan,
    gates: g,
    message: (g.autoBlocked || !g.canExecute)
      ? '⛔ 执行被阻断。\n\n' + g.blocking.map(function (b) { return '• ' + b.gate + ': ' + b.detail; }).join('\n') + '\n\n需要满足所有条件才能执行。'
      : '✅ 执行预览通过。\n\n请发送 /活动 执行确认 ' + planId + ' CONFIRM 确认执行。',
    requiresConfirm: g.canExecute
  };
}

function confirm(planId, token) {
  if (!planId) return { error: 'Missing planId' };
  if (token !== 'CONFIRM') return { error: 'Missing CONFIRM token. Usage: /活动 执行确认 <planId> CONFIRM' };

  var plans = loadPlans();
  var plan = plans.find(function (p) { return p.planId === planId; });
  if (!plan) return { error: 'Plan not found: ' + planId };
  if (plan.status !== 'approved') return { error: 'Plan must be approved. Current: ' + plan.status };
  if (plan.executionStatus && plan.executionStatus !== 'NOT_EXECUTED') return { error: 'Plan already executed. Status: ' + plan.executionStatus };

  var activity = store.getById(plan.activityId);
  var g = gate.check(plan, activity);

  if (!g.allPassed) {
    writeAudit('execution_blocked', { planId: planId, gates: g, blockedBy: g.blocking });
    return {
      executed: false, blocked: true, planId: planId,
      message: '⛔ 执行被阻断。\n\n' + g.blocking.map(function (b) { return '• ' + b.gate + ': ' + b.detail; }).join('\n'),
      gates: g
    };
  }

  // Execute through mock adapter
  var result = adapter.execute(plan, activity);
  plan.executionStatus = result.status;
  plan.executedAt = result.enrolledAt;
  plan.planStatus = plan.status;
  savePlans(plans);

  writeAudit('execution_mocked', { planId: planId, adapterResult: result });

  return {
    executed: true, planId: planId, status: result.status, mock: result.mockOnly,
    message: '✅ MOCK 执行成功\n\n计划ID: ' + planId + '\n状态: ' + result.status + '\n会话: ' + result.mockSessionId + '\n\n' + result.warning,
    result: result
  };
}

module.exports = { preview: preview, confirm: confirm, gateConfig: gate.getConfig };
