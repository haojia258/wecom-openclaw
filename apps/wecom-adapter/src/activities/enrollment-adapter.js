// P56 Enrollment Adapter — MOCK/STUB only, no real 抖店 API calls
function execute(plan, activity) {
  // Simulation delay
  var result = {
    mockOnly: true,
    planId: plan.planId,
    activity: plan.activity,
    skus: plan.skus || [],
    status: 'EXECUTED_MOCK',
    enrolledAt: new Date().toISOString(),
    mockSessionId: 'mock-sess-' + Date.now().toString(36),
    warning: '⚠️ MOCK execution only. No real enrollment was performed. Set AUTO_ENROLL_EXECUTE=true and REVIEW_ONLY=false for real execution.',
    auditEvent: 'execution_mocked'
  };
  return result;
}

module.exports = { execute: execute };
