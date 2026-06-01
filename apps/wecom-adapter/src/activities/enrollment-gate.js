// P56 Enrollment Gate — all safety checks before real execution
var AUTO_ENROLL_EXECUTE = false;
var REVIEW_ONLY = true;

function check(plan, activity) {
  var gates = [];

  // Gate 1: plan status must be approved
  gates.push({ gate: 'status_approved', passed: plan.status === 'approved', detail: 'Plan status: ' + plan.status });

  // Gate 2: executionStatus must be NOT_EXECUTED
  gates.push({ gate: 'not_already_executed', passed: plan.executionStatus === 'NOT_EXECUTED', detail: 'Execution status: ' + (plan.executionStatus || 'N/A') });

  // Gate 3: AUTO_ENROLL_EXECUTE must be true
  gates.push({ gate: 'auto_enroll_enabled', passed: AUTO_ENROLL_EXECUTE, detail: 'AUTO_ENROLL_EXECUTE=' + AUTO_ENROLL_EXECUTE });

  // Gate 4: REVIEW_ONLY must be false (or override)
  gates.push({ gate: 'review_only_off', passed: !REVIEW_ONLY, detail: 'REVIEW_ONLY=' + REVIEW_ONLY });

  // Gate 5: plan not expired (default 7 days)
  if (plan.approvedAt) {
    var age = Date.now() - new Date(plan.approvedAt).getTime();
    gates.push({ gate: 'not_expired', passed: age < 7 * 24 * 60 * 60 * 1000, detail: 'Approved ' + Math.floor(age / 3600000) + 'h ago, max 168h' });
  }

  // Gate 6: has SKUs
  gates.push({ gate: 'has_skus', passed: plan.skus && plan.skus.length > 0, detail: 'SKUs: ' + (plan.skus || []).length });

  var allPassed = gates.every(function (g) { return g.passed; });
  var blocking = gates.filter(function (g) { return !g.passed; });

  return { allPassed: allPassed, gates: gates, blocking: blocking, canExecute: (plan.status === 'approved' && plan.executionStatus === 'NOT_EXECUTED'), autoBlocked: !AUTO_ENROLL_EXECUTE || REVIEW_ONLY };
}

function setConfig(opt) { if (opt.AUTO_ENROLL_EXECUTE !== undefined) AUTO_ENROLL_EXECUTE = opt.AUTO_ENROLL_EXECUTE; if (opt.REVIEW_ONLY !== undefined) REVIEW_ONLY = opt.REVIEW_ONLY; }
function getConfig() { return { AUTO_ENROLL_EXECUTE: AUTO_ENROLL_EXECUTE, REVIEW_ONLY: REVIEW_ONLY }; }

module.exports = { check: check, setConfig: setConfig, getConfig: getConfig };
