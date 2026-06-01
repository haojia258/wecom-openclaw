// P55 Activity Approval Action — approve/reject with audit, NO execution
var fs = require('fs'); var path = require('path');
var STORE_DIR = path.join(__dirname, '..', '..', 'storage', 'activities');

function loadPlans() { try { return JSON.parse(fs.readFileSync(path.join(STORE_DIR, 'enrollment-plans.json'), 'utf8')); } catch (e) { return []; } }
function savePlans(d) { fs.writeFileSync(path.join(STORE_DIR, 'enrollment-plans.json'), JSON.stringify(d, null, 2), 'utf8'); }
function loadHistory() { try { return JSON.parse(fs.readFileSync(path.join(STORE_DIR, 'history.json'), 'utf8')); } catch (e) { return []; } }
function saveHistory(d) { fs.writeFileSync(path.join(STORE_DIR, 'history.json'), JSON.stringify(d, null, 2), 'utf8'); }

function writeAudit(eventType, data) {
  var h = loadHistory();
  h.unshift({ eventType: eventType, planId: data.planId, beforeStatus: data.beforeStatus, afterStatus: data.afterStatus, operator: data.operator, reason: data.reason || '', createdAt: new Date().toISOString() });
  saveHistory(h);
  return h[0];
}

function approve(planId, operator) {
  if (!planId) return { error: 'Missing planId' };
  var plans = loadPlans();
  var plan = plans.find(function (p) { return p.planId === planId; });
  if (!plan) return { error: 'Plan not found: ' + planId };
  if (plan.status !== 'pending_approval') return { error: 'Plan not pending_approval. Current status: ' + plan.status };

  var before = plan.status;
  plan.status = 'approved';
  plan.approvedAt = new Date().toISOString();
  plan.approvedBy = operator || 'system-reviewer';
  plan.blocked = true;
  plan.executionStatus = 'NOT_EXECUTED';
  savePlans(plans);

  var audit = writeAudit('approval_approved', { planId: planId, beforeStatus: before, afterStatus: 'approved', operator: operator || 'system-reviewer', reason: 'Approved by ' + (operator || 'system-reviewer') });

  return {
    approved: true, planId: planId, status: 'approved', blocked: true, executionStatus: 'NOT_EXECUTED',
    message: '✅ 审批通过。\n⚠️ 注意：审批通过 ≠ 执行报名。\n报名仍被阻断 (AUTO_ENROLL_EXECUTE=false)。\n实际报名需额外人工触发。',
    audit: audit
  };
}

function reject(planId, reason, operator) {
  if (!planId) return { error: 'Missing planId' };
  var plans = loadPlans();
  var plan = plans.find(function (p) { return p.planId === planId; });
  if (!plan) return { error: 'Plan not found: ' + planId };
  if (plan.status !== 'pending_approval') return { error: 'Plan not pending_approval. Current status: ' + plan.status };

  var before = plan.status;
  plan.status = 'rejected';
  plan.rejectedAt = new Date().toISOString();
  plan.rejectedReason = reason || 'No reason provided';
  plan.executionStatus = 'REJECTED_NOT_EXECUTED';
  savePlans(plans);

  var audit = writeAudit('approval_rejected', { planId: planId, beforeStatus: before, afterStatus: 'rejected', operator: operator || 'system-reviewer', reason: plan.rejectedReason });

  return {
    rejected: true, planId: planId, status: 'rejected', reason: plan.rejectedReason, executionStatus: 'REJECTED_NOT_EXECUTED',
    message: '❌ 审批拒绝。\n原因: ' + plan.rejectedReason + '\n不会执行报名。',
    audit: audit
  };
}

module.exports = { approve: approve, reject: reject, loadPlans: loadPlans, loadHistory: loadHistory };
