// P57 Mock Provider — safe stub, no real API calls
function execute(plan, activity) {
  return { mockOnly: true, planId: plan.planId, activity: plan.activity, status: 'EXECUTED_MOCK', enrolledAt: new Date().toISOString(), mockSessionId: 'mock-sess-' + Date.now().toString(36), warning: '⚠️ MOCK. Set AUTO_ENROLL_EXECUTE=true + REVIEW_ONLY=false for real execution.' };
}
module.exports = { execute: execute, type: 'mock', name: 'MockProvider' };
