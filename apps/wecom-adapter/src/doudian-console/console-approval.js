// P52 Console Approval — P48 dangerous action enforcement
var path = require('path');
var dangerousPolicy = null;
try { dangerousPolicy = require(path.join(__dirname, '..', 'governance', 'dangerous-action-policy')); } catch (e) {}
var DANGEROUS_ACTIONS = ['product_publish', 'price_update', 'shipment_execute', 'ads_execute'];

function check(action, context) {
  if (DANGEROUS_ACTIONS.indexOf(action) === -1) return { allowed: true };
  if (dangerousPolicy) {
    var r = dangerousPolicy.intercept(action, context);
    if (r.blocked) return { allowed: false, reason: 'dangerous_action_requires_approval', action: action, riskLevel: r.riskLevel, requiresApproval: true, message: 'ACTION BLOCKED: "' + action + '" must go through approval → audit → execute.' };
  }
  return { allowed: false, reason: 'dangerous_action_requires_approval', action: action, requiresApproval: true, message: 'REVIEW_ONLY — all dangerous console actions require P48 approval before dispatch.' };
}

module.exports = { check: check, DANGEROUS_ACTIONS: DANGEROUS_ACTIONS };
