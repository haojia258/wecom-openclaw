// P48 Risk Classifier — determines risk level for events and actions
// Levels: INFO, WARN, HIGH, CRITICAL

var DANGEROUS_ACTIONS = {
  deploy:            'CRITICAL',
  merge:             'CRITICAL',
  rollback:          'CRITICAL',
  env_modify:        'CRITICAL',
  nginx_modify:      'CRITICAL',
  price_update:      'HIGH',
  shipment_execute:  'HIGH',
  ads_execute:       'HIGH',
  product_publish:   'HIGH',
  pm2_config_modify: 'CRITICAL',
  delete_asset:      'WARN',
  delete_task:       'WARN',
  delete_approval:   'CRITICAL',
  delete_audit_log:  'CRITICAL'
};

var EVENT_LEVELS = {
  login_success:     'INFO',
  login_failed:      'WARN',
  locked:            'WARN',
  logout:            'INFO',
  code_requested:    'INFO',
  deployment_plan:   'INFO',
  deployment_approved:'INFO',
  deployment_dispatched:'INFO',
  deployment_completed:'INFO',
  deployment_failed: 'HIGH',
  dispatch_created:  'INFO',
  dispatch_executed: 'INFO',
  dispatch_failed:   'WARN',
  worker_received:   'INFO',
  worker_started:    'INFO',
  worker_completed:  'INFO',
  worker_failed:     'HIGH',
  approval_created:  'INFO',
  approval_approved: 'INFO',
  approval_rejected: 'WARN',
  governance_alert:  'HIGH'
};

function classifyRisk(actionOrEvent) {
  if (DANGEROUS_ACTIONS[actionOrEvent]) return DANGEROUS_ACTIONS[actionOrEvent];
  if (EVENT_LEVELS[actionOrEvent]) return EVENT_LEVELS[actionOrEvent];
  return 'INFO';
}

function isDangerous(action) {
  return DANGEROUS_ACTIONS.hasOwnProperty(action);
}

function getRiskLevel(action) {
  return DANGEROUS_ACTIONS[action] || 'INFO';
}

module.exports = { classifyRisk: classifyRisk, isDangerous: isDangerous, getRiskLevel: getRiskLevel, DANGEROUS_ACTIONS: DANGEROUS_ACTIONS, EVENT_LEVELS: EVENT_LEVELS };
