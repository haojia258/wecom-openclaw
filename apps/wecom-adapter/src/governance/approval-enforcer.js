// P48 Approval Enforcer — blocks execution without approved status
// Logic: if requiresApproval → must be 'approved' → allow dispatch → else blocked

var auditSink = require('./audit-sink');

function enforce(approvalStatus, action, metadata) {
  // Only 'approved' passes through
  if (approvalStatus === 'approved') {
    return { allowed: true, reason: 'approval_verified', status: approvalStatus };
  }

  // 'pending' — not yet reviewed
  if (approvalStatus === 'pending' || !approvalStatus) {
    auditSink.sink({
      event_type: 'approval_created',
      action: action,
      status: 'pending',
      metadata: metadata || {}
    });
    return { allowed: false, reason: 'approval_required', status: approvalStatus || 'pending' };
  }

  // 'rejected' or 'expired' — blocked
  if (approvalStatus === 'rejected') {
    auditSink.sink({
      event_type: 'approval_rejected',
      action: action,
      status: 'rejected',
      metadata: metadata || {}
    });
    return { allowed: false, reason: 'approval_rejected', status: 'rejected' };
  }

  // 'dispatched' — already executed
  if (approvalStatus === 'dispatched') {
    return { allowed: true, reason: 'already_dispatched', status: 'dispatched' };
  }

  // Any other status → blocked
  auditSink.sink({
    event_type: 'approval_rejected',
    action: action,
    status: 'blocked',
    metadata: { reason: 'unknown_approval_status' }
  });
  return { allowed: false, reason: 'blocked', status: 'blocked' };
}

// Quick check: does this action require approval?
var ACTIONS_REQUIRING_APPROVAL = [
  'deploy', 'merge', 'rollback', 'env_modify', 'nginx_modify',
  'price_update', 'shipment_execute', 'ads_execute', 'product_publish',
  'pm2_config_modify', 'delete_asset', 'delete_task', 'delete_approval', 'delete_audit_log'
];

function requiresApproval(action) {
  return ACTIONS_REQUIRING_APPROVAL.indexOf(action) !== -1;
}

module.exports = { enforce: enforce, requiresApproval: requiresApproval, ACTIONS_REQUIRING_APPROVAL: ACTIONS_REQUIRING_APPROVAL };
