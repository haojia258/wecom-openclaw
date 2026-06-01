var store = require('./activity-store');
function createPlan(activity, skus) {
  if (!activity) return { error: 'No activity provided' };
  var plan = { planId: 'enr-' + Date.now().toString(36), activity: activity.name || 'Unknown', activityId: activity.id, skus: skus || activity.products || [], status: 'pending_approval', riskLevel: 'HIGH', action: 'activity_enroll', approvalRequired: true, createdAt: new Date().toISOString(), message: 'Enrollment plan created. Requires P48 approval. Will NOT auto-enroll.' };
  store.saveEnrollmentPlan(plan); return plan;
}
function getPlans() { return store.getEnrollmentPlans(); }
module.exports = { createPlan: createPlan, getPlans: getPlans };
